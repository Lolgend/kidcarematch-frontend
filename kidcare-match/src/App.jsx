import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LayoutDashboard, Search, Heart, GitCompareArrows, UserRound,
  Bell, SlidersHorizontal, MapPin, Baby, Wallet,
  ChevronRight, Menu, X, Check, Sparkles,
  ArrowUpRight, BookOpen, LogOut, Filter, CircleHelp
} from 'lucide-react';

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged,
  signOut,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';

import { auth } from './firebase';
import AdminDashboard from './admin/AdminDashboard';
import {
  getCentres, getCentreById, getCentreByCode, getCentreSummary,
  getMyProfile, createMyProfile, getMyWatchlist, createWatchlist, deleteWatchlist,
  getCentreReviews
} from './api';
import './styles.css';

function mapCentre(centre = {}) {
  const vacancyStatus =
    centre.current_vacancy_status ??
    centre.vacancy_status ??
    (Array.isArray(centre.vacancies) ? (centre.vacancies.length ? 'Available' : 'Unknown') : null);

  return {
    ...centre,

    id: centre.centre_id ?? centre.id ?? centre.centre_code,
    centre_code: centre.centre_code ?? '',

    name: centre.centre_name ?? centre.name ?? 'Unnamed preschool',

    // Defaults so filtering never calls string methods on undefined.
    area: centre.area ?? centre.planning_area ?? centre.region ?? '',
    care_type: centre.care_type ?? centre.service_model ?? '',

    address: centre.address ?? '',
    postal: centre.postal ?? '',
    contact: centre.contact ?? '',
    email: centre.email ?? '',
    website_url: centre.website_url ?? '',

    spark_certified: centre.spark_certified ?? null,
    gov_subsidy: centre.gov_subsidy ?? null,
    transport_provided: centre.transport_provided ?? null,

    extended_operating_hours: centre.extended_operating_hours ?? null,
    weekday_full_day_hours: centre.weekday_full_day_hours ?? '',
    saturday_hours: centre.saturday_hours ?? '',

    current_vacancy_status: vacancyStatus,
    vacancy: vacancyStatus ?? 'Unknown',

    fee: centre.monthly_fee ?? centre.fee ?? null
  };
}

const LEVEL_LABELS = {
  infant: 'Infant', pg: 'Playgroup', n1: 'Nursery 1', n2: 'Nursery 2',
  k1: 'Kindergarten 1', k2: 'Kindergarten 2', student_care: 'Student care'
};
const levelLabel = (level) => LEVEL_LABELS[level] ?? String(level ?? '');
const money = (value) => `$${Number(value).toFixed(2)}`;
const monthYear = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-SG', { month: 'short', year: 'numeric' });
};

// Some records store the website without a scheme (e.g. "www.e-bridge.edu.sg"),
// which a browser would treat as a relative link. Add https:// when it is missing.
const websiteHref = (url) => {
  const value = String(url ?? '').trim();
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
};

const CITIZENSHIP_LABELS = { SC: 'Singapore citizen', SPR: 'Permanent resident', OTHERS: 'Other' };

// Best vacancy score for the chosen level, from the centre's vacancy records.
function vacancyInfo(vacancies, level) {
  let score = 0;
  let label = 'No open vacancy listed';
  (vacancies || [])
    .filter((record) => record.level_type === level)
    .forEach((record) => {
      const status = String(record.vacancy_status || '').toLowerCase();
      const value =
        status.includes('immediate') ? 100 :
        status.includes('available') && !status.includes('not') ? 80 :
        status.includes('wait') ? 30 : 0;
      if (value > score) {
        score = value;
        label = `${record.vacancy_status} (${monthYear(record.enrollment_month_year)})`;
      }
    });
  return { score, label };
}

// Lowest listed monthly fee (before subsidy) for the chosen level and citizen type.
function feeFor(services, level, citizenship) {
  const fees = (services || [])
    .filter((item) => item.level === level && item.citizenship_type === citizenship)
    .map((item) => Number(item.fee))
    .filter(Number.isFinite);
  return fees.length ? Math.min(...fees) : null;
}

// The backend has no travel-time data, so closeness is based on postal codes:
// same 2-digit postal sector = nearby, same first digit = same broad region.
function locationFit(postal, anchors) {
  const places = anchors.filter(Boolean);
  if (!postal || !places.length) return { score: 0, label: 'Location unknown' };
  if (places.some((a) => a.slice(0, 2) === postal.slice(0, 2))) {
    return { score: 100, label: 'Same postal sector as you' };
  }
  if (places.some((a) => a[0] === postal[0])) return { score: 50, label: 'Same region' };
  return { score: 0, label: 'Further away' };
}

const nav = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Find my matches', icon: Sparkles },
  { label: 'Preschool directory', icon: Search },
  { label: 'Compare centres', icon: GitCompareArrows },
  { label: 'My watchlist', icon: Heart },
  { label: 'Family profile', icon: UserRound },
  { label: 'Admin dashboard', icon: SlidersHorizontal }
];

function App() {
  const [centres, setCentres] = useState([]);
  const [centresLoading, setCentresLoading] = useState(true);
  const [centresError, setCentresError] = useState('');
  const [centreSummary, setCentreSummary] = useState(null);
  const [watchlistEntries, setWatchlistEntries] = useState([]);
  // Saved centres that aren't in the currently loaded list are fetched by id and cached here.
  const [fetchedCentres, setFetchedCentres] = useState({});
  const requestedIds = useRef(new Set());
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailReviews, setDetailReviews] = useState([]);
  const [pageOffset, setPageOffset] = useState(0);
  const [totalCentres, setTotalCentres] = useState(0);
  const [currentUser, setCurrentUser] = useState(null);
  const [page, setPage] = useState('Overview');

  // Hooks must live inside the component (this was at module level before).
  const [compareSelectedIds, setCompareSelectedIds] = useState([]);

  const [saved, setSaved] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('kidcare-watchlist') || '[]');
    } catch {
      return [];
    }
  });

  const [query, setQuery] = useState('');
  const [area, setArea] = useState('All areas');
  // The API can only filter by "has an open vacancy for this level", so that is the filter we offer.
  const [level, setLevel] = useState('');
  const [compareDetails, setCompareDetails] = useState({});
  const [budget, setBudget] = useState(750);
  const [matchForm, setMatchForm] = useState({ level: 'n1', citizenship: 'SC', home: '', work: '' });
  const [matchRun, setMatchRun] = useState(null); // the inputs the current results were fetched for
  const [matchCandidates, setMatchCandidates] = useState([]);
  const [matchStatus, setMatchStatus] = useState('idle'); // idle | loading | done | error
  const [matchMessage, setMatchMessage] = useState('');
  const matchDetailCache = useRef(new Map());
  const [weights, setWeights] = useState({ vacancy: 40, cost: 30, travel: 30 });
  // Controls the explanation panel for the three match-fit scores.
  const [showMatchHelp, setShowMatchHelp] = useState(false);
  const [reviewCentreId, setReviewCentreId] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [localReviews, setLocalReviews] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('kidcare-local-reviews') || '[]');
    } catch {
      return [];
    }
  });
  const [toast, setToast] = useState('');
  const [profileSaved, setProfileSaved] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedCentre, setSelectedCentre] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [adminTab, setAdminTab] = useState('Users');
  const [users] = useState([]);
  const [reviews] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function loadCentres() {
      try {
        setCentresLoading(true);
        setCentresError('');
        const params = { limit: 100, offset: pageOffset };
        if (query.trim()) params.query = query.trim();
        if (area !== 'All areas') {
          params.query = [params.query, area].filter(Boolean).join(' ');
        }
        if (level) params.level = level;
        const data = await getCentres(params);
        const items = Array.isArray(data) ? data : data?.items;
        if (!Array.isArray(items)) {
          throw new Error('Unexpected centres response: expected an array or an { items } object.');
        }
        if (!cancelled) {
          setCentres(items.map(mapCentre));
          setTotalCentres(Number(data?.total ?? items.length));
        }
      } catch (error) {
        if (!cancelled) setCentresError(error.message || 'Could not load preschool centres.');
      } finally {
        if (!cancelled) setCentresLoading(false);
      }
    }
    loadCentres();
    return () => { cancelled = true; };
  }, [query, area, level, pageOffset]);

  useEffect(() => {
    getCentreSummary()
      .then(setCentreSummary)
      .catch((error) => console.warn('Centre summary unavailable:', error.message));
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
    console.log(
  "Firebase authentication state:",
  user ? user.email : "No user signed in"
);

setCurrentUser(user);

      if (!user) {
        setWatchlistEntries([]);
        return;
      }

      try {
        try {
          await getMyProfile();
        } catch (profileError) {
          if (String(profileError.message).includes('404')) {
            await createMyProfile(user.displayName || user.email?.split('@')[0] || 'Parent');
          } else {
            throw profileError;
          }
        }

        const watchlist = await getMyWatchlist();
        const entries = Array.isArray(watchlist)
          ? watchlist
          : (watchlist?.items || watchlist?.entries || []);
        setWatchlistEntries(entries);

        // Keep browser-saved favourites even if the backend watchlist fails.
        setSaved((currentSaved) => {
          const backendIds = entries.map((entry) => Number(entry.centre_id)).filter(Number.isFinite);
          const localIds = currentSaved.map(Number).filter(Number.isFinite);
          const merged = [...new Set([...localIds, ...backendIds])];

          try {
            localStorage.setItem('kidcare-watchlist', JSON.stringify(merged));
          } catch (error) {
            console.warn('Could not save watchlist locally:', error);
          }

          return merged;
        });
      } catch (error) {
        console.warn('Backend profile/watchlist sync:', error.message);
      }
    });

    return unsubscribe;
  }, []);

  const notify = (message) => {
    setToast(message);
    setTimeout(() => setToast(''), 2600);
  };

  const openCentreDetails = async (centre) => {
    setSelectedCentre(centre);
    setDetailLoading(true);
    setDetailReviews([]);
    try {
      const [detail, reviewData] = await Promise.all([
        getCentreById(centre.id),
        getCentreReviews(centre.id)
      ]);
      setSelectedCentre(mapCentre({ ...centre, ...detail }));
      setDetailReviews(reviewData?.items || []);
    } catch (error) {
      notify(`Could not load full centre details: ${error.message}`);
    } finally {
      setDetailLoading(false);
    }
  };

  const openPage = (nextPage) => {
    setPage(nextPage);
    setMobileOpen(false);
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get('email') || '').trim();
    const password = String(data.get('password') || '');
    const name = String(data.get('name') || '').trim();
    const confirmPassword = String(data.get('confirmPassword') || '');

    try {
      if (authMode === 'register') {
        if (password !== confirmPassword) {
          notify('Passwords do not match.');
          return;
        }

        const result = await createUserWithEmailAndPassword(auth, email, password);

        if (name) {
          await updateProfile(result.user, { displayName: name });
        }

        await sendEmailVerification(result.user);
        try {
          await createMyProfile(name || result.user.displayName || email.split('@')[0]);
        } catch (apiError) {
          console.warn('Backend profile registration:', apiError.message);
        }
        await signOut(auth);

        notify('Account created. Please verify your email.');
      } else if (authMode === 'login') {
        const result = await signInWithEmailAndPassword(auth, email, password);

        if (!result.user.emailVerified) {
          await sendEmailVerification(result.user);
          await signOut(auth);
          notify('Please verify your email before signing in.');
          return;
        }

        notify('Welcome back!');
      } else if (authMode === 'forgot') {
        await sendPasswordResetEmail(auth, email);
        notify('Password reset email sent.');
        return;
      }

      setAuthMode(authMode === 'register' ? 'login' : '');
    } catch (error) {
      const messages = {
        'auth/email-already-in-use': 'This email is already registered.',
        'auth/invalid-email': 'Please enter a valid email.',
        'auth/invalid-credential': 'Incorrect email or password.',
        'auth/weak-password': 'Please choose a stronger password.',
        'auth/too-many-requests': 'Too many attempts. Try again later.',
        'auth/network-request-failed': 'Check your internet connection.'
      };

      notify(messages[error.code] || error.message);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      setAuthMode('');
      notify('Successfully signed in with Google!');
    } catch (error) {
      notify(error.message);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setAuthMode('login');
      setPage('Overview');
      notify('You have signed out.');
    } catch (error) {
      notify(error.message);
    }
  };

  const isSaved = (id) => saved.some((item) => Number(item) === Number(id));

  const toggleSaved = async (id) => {
    const centreId = Number(id);
    const wasSaved = isSaved(centreId);

    const updatedSaved = wasSaved
      ? saved.filter((item) => Number(item) !== centreId)
      : [...saved, centreId];

    setSaved(updatedSaved);

    // Save favourites in this browser.
    try {
      localStorage.setItem('kidcare-watchlist', JSON.stringify(updatedSaved));
    } catch (error) {
      console.warn('Could not save watchlist locally:', error);
    }

    // Removing from the watchlist also removes it from the comparison.
    if (wasSaved) {
      setCompareSelectedIds((items) => items.filter((item) => item !== String(centreId)));
    }

    notify(wasSaved ? 'Removed from watchlist' : 'Saved to watchlist!');

    // Sync with the backend when signed in; the local copy above stays as the fallback.
    if (!currentUser) return;
    try {
      if (wasSaved) {
        const existing = watchlistEntries.find((entry) => Number(entry.centre_id) === centreId);
        if (existing) {
          await deleteWatchlist(existing.watchlist_id);
          setWatchlistEntries((items) =>
            items.filter((entry) => entry.watchlist_id !== existing.watchlist_id)
          );
        }
      } else {
        const created = await createWatchlist({ centre_id: centreId });
        if (created) setWatchlistEntries((items) => [...items, created]);
      }
    } catch (error) {
      console.warn('Watchlist backend sync failed:', error.message);
      notify(`Saved on this device only: ${error.message}`);
    }
  };

  const updateWeight = (key, value) => {
    const next = { ...weights, [key]: Number(value) };
    const others = Object.keys(next).filter((item) => item !== key);
    const remaining = 100 - next[key];
    const total = next[others[0]] + next[others[1]];

    next[others[0]] = total
      ? Math.round(remaining * next[others[0]] / total)
      : Math.round(remaining / 2);

    next[others[1]] = remaining - next[others[0]];
    setWeights(next);
  };

  const filtered = useMemo(() => {
    return centres.filter((centre) => {
      const searchText =
        `${centre.name} ${centre.area} ${centre.address} ${centre.postal}`.toLowerCase();

      const matchesSearch = !query.trim() || searchText.includes(query.trim().toLowerCase());

      const matchesArea =
        area === 'All areas' || (centre.area || '').toLowerCase() === area.toLowerCase();

      return matchesSearch && matchesArea;
    });
  }, [centres, query, area]);

  // Rank the fetched candidates. Sliders re-rank instantly; no refetch is needed.
  const ranked = useMemo(() => {
    if (!matchRun) return [];
    const anchors = [matchRun.home, matchRun.work];

    return matchCandidates
      .map(({ centre, detail }) => {
        const fee = feeFor(detail.services, matchRun.level, matchRun.citizenship);
        if (fee == null) return null; // no listed fee for this level/citizen type: can't score cost

        const vacancyResult = vacancyInfo(detail.vacancies, matchRun.level);
        const place = locationFit(centre.postal, anchors);
        const transport = Boolean(detail.transport_provided);

        const vacancyFit = vacancyResult.score;
        const costFit = fee <= budget ? 100 : Math.max(0, Math.round((budget / fee) * 100));
        const travelFit = transport ? 100 : place.score;

        const score = Math.round(
          (vacancyFit * weights.vacancy + costFit * weights.cost + travelFit * weights.travel) / 100
        );

        return {
          ...centre,
          ...detail,
          id: centre.id,
          name: centre.name,
          fee,
          vf: vacancyFit,
          cf: costFit,
          tf: travelFit,
          score,
          vacancyLabel: vacancyResult.label,
          locationLabel: transport ? 'Centre provides transport' : place.label
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
  }, [matchCandidates, matchRun, budget, weights]);

  const runMatching = async () => {
    const home = matchForm.home.trim();
    const work = matchForm.work.trim();
    if (!/^\d{6}$/.test(home)) {
      notify('Enter your 6-digit home postal code.');
      return;
    }
    if (work && !/^\d{6}$/.test(work)) {
      notify('Workplace postal code must be 6 digits.');
      return;
    }

    setMatchStatus('loading');
    setMatchMessage('Finding centres with open vacancies near you…');
    setMatchCandidates([]);

    try {
      const loadCentresFor = async (prefixes) => {
        const pages = await Promise.all(
          prefixes.map((prefix) =>
            getCentres({ level: matchForm.level, postal_prefix: prefix, limit: 100 })
          )
        );
        const byId = new Map();
        pages.forEach((page) => {
          const items = Array.isArray(page) ? page : page?.items || [];
          items.forEach((item) => byId.set(item.centre_id, item));
        });
        return [...byId.values()];
      };

      const sectors = [...new Set([home.slice(0, 2), work && work.slice(0, 2)].filter(Boolean))];
      let list = await loadCentresFor(sectors);
      let widened = false;

      if (list.length < 5) {
        const regions = [...new Set([home[0], work && work[0]].filter(Boolean))];
        list = await loadCentresFor(regions);
        widened = true;
      }

      // Load each centre's full profile (fees, vacancies, transport), a few at a time.
      const cache = matchDetailCache.current;
      const candidates = [];
      for (let i = 0; i < list.length; i += 8) {
        setMatchMessage(`Checking fees and vacancies… ${Math.min(i + 8, list.length)} of ${list.length}`);
        const batch = list.slice(i, i + 8);
        const results = await Promise.all(
          batch.map(async (item) => {
            try {
              if (!cache.has(item.centre_id)) cache.set(item.centre_id, await getCentreById(item.centre_id));
              return { centre: mapCentre(item), detail: cache.get(item.centre_id) };
            } catch (error) {
              console.warn(`Skipped centre ${item.centre_id}:`, error.message);
              return null;
            }
          })
        );
        candidates.push(...results.filter(Boolean));
      }

      setMatchRun({ level: matchForm.level, citizenship: matchForm.citizenship, home, work });
      setMatchCandidates(candidates);
      setMatchStatus('done');
      const withFee = candidates.filter(
        ({ detail }) => feeFor(detail.services, matchForm.level, matchForm.citizenship) != null
      ).length;
      const noFee = candidates.length - withFee;
      setMatchMessage(
        `${withFee} centre(s) with an open ${levelLabel(matchForm.level)} vacancy ` +
        (widened ? 'in your wider region' : 'in your postal sector') +
        (noFee ? ` (${noFee} more not ranked: no fee listed for this level and citizenship).` : '.')
      );
    } catch (error) {
      setMatchStatus('error');
      setMatchMessage(error.message || 'Could not load matches.');
    }
  };

  // One lookup of every centre we know about (loaded list + backend watchlist).
  const centreLookup = useMemo(() => {
    const map = new Map(centres.map((centre) => [String(centre.id), centre]));

    watchlistEntries.forEach((entry) => {
      const centre = mapCentre(entry.centre ?? entry);
      const id = entry.centre_id ?? centre.id;
      if (id != null && !map.has(String(id))) {
        map.set(String(id), { ...centre, id });
      }
    });

    Object.entries(fetchedCentres).forEach(([id, centre]) => {
      if (!map.has(id)) map.set(id, centre);
    });

    return map;
  }, [centres, watchlistEntries, fetchedCentres]);

  // Make sure every saved centre can be shown, even if it isn't on the current page/search.
  useEffect(() => {
    const missing = saved
      .map(String)
      .filter((id) => !centreLookup.has(id) && !requestedIds.current.has(id));

    missing.forEach((id) => {
      requestedIds.current.add(id);
      getCentreById(id)
        .then((detail) => {
          if (!detail) return;
          setFetchedCentres((current) => ({ ...current, [id]: mapCentre({ ...detail, id }) }));
        })
        .catch((error) => {
          requestedIds.current.delete(id); // allow a retry on the next change
          console.warn(`Could not load saved centre ${id}:`, error.message);
        });
    });
  }, [saved, centreLookup]);

  const watchlistCentres = useMemo(
    () => saved.map((id) => centreLookup.get(String(id))).filter(Boolean),
    [saved, centreLookup]
  );

  // The Compare page only offers centres from the user's watchlist.
  const compareOptions = watchlistCentres;

  // Centres the user ticked for comparison (max 3).
  const compareCentres = useMemo(
    () => compareSelectedIds.map((id) => centreLookup.get(String(id))).filter(Boolean).slice(0, 3),
    [compareSelectedIds, centreLookup]
  );

  // Fetch the full profile (transport, fees, vacancies) of each selected centre.
  useEffect(() => {
    compareCentres.forEach((centre) => {
      const key = String(centre.id);
      if (compareDetails[key]) return;
      setCompareDetails((current) => (current[key] ? current : { ...current, [key]: { loading: true } }));

      const request = centre.centre_code ? getCentreByCode(centre.centre_code) : getCentreById(centre.id);
      request
        .then((detail) => setCompareDetails((current) => ({ ...current, [key]: { data: detail } })))
        .catch((error) => setCompareDetails((current) => ({ ...current, [key]: { error: error.message } })));
    });
  }, [compareCentres]);

  const resetFilters = () => {
    setQuery('');
    setArea('All areas');
    setLevel('');
  };

  const yesNo = (value) => (value == null ? 'Not provided' : value ? 'Yes' : 'No');

  const submitLocalReview = (event) => {
    event.preventDefault();
    if (!reviewCentreId) {
      notify('Please select a preschool.');
      return;
    }
    if (!reviewComment.trim()) {
      notify('Please write a comment before submitting.');
      return;
    }

    const centre = centreLookup.get(String(reviewCentreId)) || centres.find(
      (item) => String(item.id) === String(reviewCentreId)
    );
    const review = {
      id: `${Date.now()}-${reviewCentreId}`,
      centre_id: reviewCentreId,
      centre_name: centre?.name || 'Preschool',
      rating: Number(reviewRating),
      comment: reviewComment.trim(),
      author: currentUser?.displayName || currentUser?.email || 'Parent',
      created_at: new Date().toISOString()
    };
    const updated = [review, ...localReviews];
    setLocalReviews(updated);
    try {
      localStorage.setItem('kidcare-local-reviews', JSON.stringify(updated));
    } catch (error) {
      console.warn('Could not save review on this device:', error);
    }
    setReviewComment('');
    setReviewRating(5);
    notify('Your review has been saved on this device.');
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Baby size={24} /></div>
          <div>
            <b>KidCare Match</b>
            <span>SINGAPORE</span>
          </div>
          <button className="mobile-close" onClick={() => setMobileOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="side-label">YOUR SPACE</div>

        <nav>
          {nav.filter((item) => item.label !== 'Admin dashboard' || currentUser?.email?.toLowerCase() === 'swetalakshita@gmail.com').map((item) => (
            <button
              key={item.label}
              className={`nav-item ${page === item.label ? 'active' : ''}`}
              onClick={() => openPage(item.label)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.label === 'My watchlist' && <em>{saved.length}</em>}
            </button>
          ))}
        </nav>

        <div className="side-help">
          <div className="help-icon"><CircleHelp size={19} /></div>
          <b>Need a little help?</b>
          <p>We're here to make your preschool search easier.</p>
          <button onClick={() => notify('Help centre coming soon')}>
            Visit help centre <ChevronRight size={14} />
          </button>
        </div>

        <div className="profile-mini">
          <div className="avatar">
            {(currentUser?.displayName || currentUser?.email || 'U').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <b>{currentUser?.displayName || 'Parent account'}</b>
            <span>{currentUser?.email || 'Not signed in'}</span>
          </div>
          <button
            title={currentUser ? 'Sign out' : 'Sign in'}
            onClick={() => (currentUser ? handleSignOut() : setAuthMode('login'))}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)}>
            <Menu />
          </button>
          <div className="breadcrumb">
            Home <ChevronRight size={14} /> <b>{page}</b>
          </div>
          <div className="top-actions">
            <span className="today-label">Your family's next big step starts here</span>
            <button
              className="icon-btn"
              onClick={() => notify('You’re all caught up!')}
              aria-label="Notifications"
            >
              <Bell size={19} /><i />
            </button>
            <button
              className="avatar small avatar-button"
              title="Sign in / register"
              onClick={() => setAuthMode('login')}
            >
              {(currentUser?.displayName || currentUser?.email || 'U').slice(0, 2).toUpperCase()}
            </button>
          </div>
        </header>

        <div className="content">
          {authMode && (
            <div className="auth-overlay">
              <form className="auth-card" onSubmit={handleAuthSubmit}>
                <div className="brand-mark auth-mark"><Baby size={25} /></div>
                <div className="eyebrow">KIDCARE MATCH SG</div>

                <h1>
                  {authMode === 'register'
                    ? 'Create your account'
                    : authMode === 'forgot'
                      ? 'Reset your password'
                      : 'Welcome back'}
                </h1>

                <p>
                  {authMode === 'register'
                    ? 'Sign up to save centres and get personalised matches.'
                    : authMode === 'forgot'
                      ? 'Enter your email to request a password reset.'
                      : 'Sign in to bookmark preschools and view your family matches.'}
                </p>

                {authMode === 'register' && (
                  <label>
                    Full name
                    <input name="name" required placeholder="Your name" />
                  </label>
                )}

                <label>
                  Email address
                  <input name="email" type="email" required placeholder="you@example.com" />
                </label>

                {authMode !== 'forgot' && (
                  <label>
                    Password
                    <input
                      name="password"
                      type="password"
                      minLength={8}
                      required
                      placeholder="At least 8 characters"
                    />
                  </label>
                )}

                {authMode === 'register' && (
                  <label>
                    Confirm password
                    <input
                      name="confirmPassword"
                      type="password"
                      minLength={8}
                      required
                      placeholder="Re-enter password"
                    />
                  </label>
                )}

                <button className="primary-btn full" type="submit">
                  {authMode === 'register'
                    ? 'Create account'
                    : authMode === 'forgot'
                      ? 'Send reset link'
                      : 'Sign in'}
                  <ChevronRight size={16} />
                </button>

                {authMode !== 'forgot' && (
                  <button className="secondary-btn full" type="button" onClick={handleGoogleSignIn}>
                    Continue with Google
                  </button>
                )}

                <div className="auth-links">
                  {authMode === 'login' ? (
                    <>
                      <button type="button" onClick={() => setAuthMode('register')}>
                        Don't have an account? Sign up
                      </button>
                      <button type="button" onClick={() => setAuthMode('forgot')}>
                        Forgot password?
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setAuthMode('login')}>
                      Back to sign in
                    </button>
                  )}
                </div>

                <button type="button" className="text-btn" onClick={() => setAuthMode('')}>
                  Close
                </button>
              </form>
            </div>
          )}

          {page === 'Overview' && (
            <>
              <section className="welcome-row">
                <div>
                  <div className="eyebrow">
                    <Sparkles size={14} /> YOUR PRESCHOOL JOURNEY
                  </div>
                  <h1>Find a little place<br />for <span>big beginnings.</span></h1>
                  <p className="lead">
                    A preschool that fits your child, your budget, and your everyday journey.
                  </p>
                  <button className="primary-btn" onClick={() => openPage('Find my matches')}>
                    Find my matches <ArrowUpRight size={17} />
                  </button>
                </div>
                <div className="hero-art">
                  <div className="sun" />
                  <div className="hero-leaf leaf-one">✦</div>
                  <div className="hero-blob"><Baby size={86} strokeWidth={1.2} /></div>
                  <div className="floating-note">
                    <span className="note-icon"><Heart size={16} /></span>
                    <div><b>Made for your family</b><small>Your priorities, your match</small></div>
                  </div>
                  <div className="hero-caption">A happy start, made simpler.</div>
                </div>
              </section>

              <section className="stat-grid">
                <Stat
                  icon={Search}
                  label="Centres to explore"
                  value={String(centreSummary?.total_centres ?? totalCentres ?? centres.length)}
                  detail="Loaded from centre API"
                  tone="mint"
                />
                <Stat
                  icon={Heart}
                  label="On your watchlist"
                  value={String(saved.length).padStart(2, '0')}
                  detail="Centres you're tracking"
                  tone="rose"
                />
                <Stat
                  icon={Sparkles}
                  label="SPARK certified"
                  value={String(centreSummary?.spark_certified_count ?? '—')}
                  detail="Reported by backend"
                  tone="lavender"
                />
              </section>

              <section className="section-head">
                <div>
                  <h2>A lovely place to start</h2>
                  <p>Preschool listings will appear here when data is available.</p>
                </div>
                <button className="text-btn" onClick={() => openPage('Preschool directory')}>
                  Explore directory <ChevronRight size={16} />
                </button>
              </section>

              {centresLoading ? (
                <Empty title="Loading preschool centres" text="Retrieving centre data from the backend." />
              ) : centresError ? (
                <Empty title="Centre data unavailable" text={centresError} />
              ) : (
                <div className="centre-grid">
                  {centres.slice(0, 6).map((centre) => (
                    <article className="panel centre-card" key={centre.id}>
                      <h3>{centre.name}</h3>
                      <p>{centre.address || 'Address not provided'}</p>
                      <button className="secondary-btn" onClick={() => openCentreDetails(centre)}>
                        View details
                      </button>
                    </article>
                  ))}
                </div>
              )}

              <section className="bottom-banner">
                <div className="banner-icon"><BookOpen size={23} /></div>
                <div>
                  <b>Your family's needs are unique.</b>
                  <p>Set your child's details, budget and commute priorities.</p>
                </div>
                <button className="secondary-btn" onClick={() => openPage('Family profile')}>
                  Set up family profile <ChevronRight size={16} />
                </button>
              </section>
            </>
          )}

          {page === 'Preschool directory' && (
            <>
              <PageTitle
                eyebrow="EXPLORE YOUR OPTIONS"
                title="Preschool directory"
                subtitle="Discover centres across Singapore and find the details that matter to your family."
              />

              <div className="search-bar">
                <Search size={19} />
                <input
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPageOffset(0); }}
                  placeholder="Search preschool name or location..."
                />
                <span>{filtered.length} centres</span>
              </div>

              <div className="filters">
                <div className="filter-title"><Filter size={16} /> Filters</div>
                <select value={area} onChange={(e) => { setArea(e.target.value); setPageOffset(0); }}>
                  <option>All areas</option>
                  {[...new Set(centres.map((centre) => centre.area).filter(Boolean))]
                    .sort()
                    .map((item) => <option key={item}>{item}</option>)}
                </select>
                <select
                  value={level}
                  onChange={(e) => { setLevel(e.target.value); setPageOffset(0); }}
                  title="Show only centres with an open vacancy for this level"
                >
                  <option value="">Any level (vacancy)</option>
                  {Object.entries(LEVEL_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label} – open vacancy</option>
                  ))}
                </select>
                <button className="reset-btn" onClick={() => { resetFilters(); setPageOffset(0); }}>
                  Reset
                </button>
              </div>

              {centresLoading ? (
                <Empty title="Loading preschool centres" text="Retrieving current centre records from the backend." />
              ) : centresError ? (
                <Empty title="Could not load preschool data" text={centresError} action={() => setPageOffset(0)} />
              ) : filtered.length === 0 ? (
                <Empty title="No centres found" text="Try a different search or reset your filters." action={resetFilters} />
              ) : (
                <div className="centre-grid">
                  {filtered.map((centre) => (
                    <article className="panel centre-card" key={centre.id}>
                      <div className="centre-card-top">
                        <span className="eyebrow">{centre.centre_code || 'PRESCHOOL'}</span>
                        <button
                          className="icon-btn"
                          aria-label={isSaved(centre.id) ? 'Remove from watchlist' : 'Save to watchlist'}
                          title={isSaved(centre.id) ? 'Remove from watchlist' : 'Save to watchlist'}
                          onClick={() => toggleSaved(centre.id)}
                        >
                          <Heart
                            size={18}
                            fill={isSaved(centre.id) ? '#e63946' : 'none'}
                            color={isSaved(centre.id) ? '#e63946' : '#9ca3af'}
                          />
                        </button>
                      </div>
                      <h3>{centre.name}</h3>
                      <p>
                        <MapPin size={14} /> {centre.address || 'Address not provided'}
                        {centre.postal ? `, ${centre.postal}` : ''}
                      </p>
                      <div className="centre-tags">
                        {centre.spark_certified && <span>SPARK certified</span>}
                        {centre.gov_subsidy && <span>Government subsidy</span>}
                        {centre.transport_provided && <span>Transport</span>}
                      </div>
                      <button className="primary-btn full" onClick={() => openCentreDetails(centre)}>
                        View details <ChevronRight size={16} />
                      </button>
                    </article>
                  ))}
                </div>
              )}

              {!centresLoading && totalCentres > 100 && (
                <div className="pagination">
                  <button
                    className="secondary-btn"
                    disabled={pageOffset === 0}
                    onClick={() => setPageOffset(Math.max(0, pageOffset - 100))}
                  >
                    Previous
                  </button>
                  <span>
                    {pageOffset + 1}–{Math.min(pageOffset + 100, totalCentres)} of {totalCentres}
                  </span>
                  <button
                    className="secondary-btn"
                    disabled={pageOffset + 100 >= totalCentres}
                    onClick={() => setPageOffset(pageOffset + 100)}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}

          {page === 'Find my matches' && (
            <>
              <PageTitle
                eyebrow="PERSONALISED PRESCHOOL MATCHING"
                title="Your family's kind of fit"
                subtitle="Tell us what you need. We rank centres with an open vacancy using real fees, vacancies and transport."
              />

              <div className="matching-layout">
                <section className="panel preference-panel">
                  <div className="panel-heading">
                    <div className="panel-icon"><SlidersHorizontal size={19} /></div>
                    <div><h3>Your preferences</h3><p>Then press Find my matches.</p></div>
                  </div>

                  <label className="field-label">Child's level
                    <select
                      value={matchForm.level}
                      onChange={(e) => setMatchForm({ ...matchForm, level: e.target.value })}
                    >
                      {Object.entries(LEVEL_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="field-label">Citizenship (for fees)
                    <select
                      value={matchForm.citizenship}
                      onChange={(e) => setMatchForm({ ...matchForm, citizenship: e.target.value })}
                    >
                      {Object.entries(CITIZENSHIP_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="field-label">Home postal code
                    <input
                      value={matchForm.home}
                      maxLength={6}
                      inputMode="numeric"
                      placeholder="6 digits"
                      onChange={(e) => setMatchForm({ ...matchForm, home: e.target.value.replace(/\D/g, '') })}
                    />
                  </label>

                  <label className="field-label">Workplace postal code (optional)
                    <input
                      value={matchForm.work}
                      maxLength={6}
                      inputMode="numeric"
                      placeholder="6 digits"
                      onChange={(e) => setMatchForm({ ...matchForm, work: e.target.value.replace(/\D/g, '') })}
                    />
                  </label>

                  <label className="field-label">Monthly budget <strong>${budget}</strong></label>
                  <input
                    className="range" type="range" min="100" max="2500" step="10"
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                  />
                  <div className="range-labels"><span>$100</span><span>$2,500</span></div>

                  <div className="weight-title">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h4 style={{ margin: 0 }}>What matters most?</h4>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Explain vacancy, cost and travel fit"
                        title="What do the three fit scores mean?"
                        aria-expanded={showMatchHelp}
                        onClick={() => setShowMatchHelp((visible) => !visible)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 24,
                          height: 24,
                          padding: 0,
                          borderRadius: '50%',
                          border: '1px solid #cbd5e1',
                          background: showMatchHelp ? '#eef2ff' : '#ffffff',
                          color: '#475569',
                          cursor: 'pointer'
                        }}
                      >
                        <CircleHelp size={15} />
                      </button>
                    </div>
                    <span>Must total 100%</span>
                  </div>

                  {showMatchHelp && (
                    <div
                      className="panel"
                      role="region"
                      aria-label="Explanation of match fit scores"
                      style={{
                        padding: 18,
                        marginBottom: 18,
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                        <h3 style={{ margin: 0 }}>What do the three fit scores mean?</h3>
                        <button
                          type="button"
                          className="text-btn"
                          onClick={() => setShowMatchHelp(false)}
                          aria-label="Close fit score explanation"
                        >
                          Close <X size={15} />
                        </button>
                      </div>
                      <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
                        <div>
                          <strong>Vacancy fit</strong>
                          <p style={{ margin: '4px 0 0' }}>
                            Measures the centre's listed vacancy status for your child's selected level.
                            Immediate vacancies score 100%, available vacancies 80%, waitlist status 30%,
                            and other or unlisted statuses 0%.
                          </p>
                        </div>
                        <div>
                          <strong>Cost fit</strong>
                          <p style={{ margin: '4px 0 0' }}>
                            Compares the centre's monthly fee before subsidy with your selected budget.
                            A fee at or below your budget scores 100%; a higher fee receives a lower score.
                          </p>
                        </div>
                        <div>
                          <strong>Travel fit</strong>
                          <p style={{ margin: '4px 0 0' }}>
                            Estimates proximity using postal codes, not actual travel time. The same
                            2-digit postal sector scores 100%, the same first postal digit (broader region)
                            scores 50%, and a different region scores 0%. Centres that provide transport
                            receive 100%.
                          </p>
                        </div>
                      </div>
                      <p className="fine-print" style={{ marginBottom: 0, marginTop: 14 }}>
                        Your priority weights determine how much each score contributes to the overall
                        match percentage. The three weights always add up to 100%.
                      </p>
                    </div>
                  )}

                  {[
                    ['vacancy', 'Vacancy fit'],
                    ['cost', 'Cost fit'],
                    ['travel', 'Travel fit']
                  ].map(([key, label]) => (
                    <div className="weight-row" key={key}>
                      <span>{label}</span>
                      <input
                        type="range" min="0" max="100" step="5"
                        value={weights[key]}
                        onChange={(e) => updateWeight(key, e.target.value)}
                      />
                      <b>{weights[key]}%</b>
                    </div>
                  ))}

                  <div className="weight-total">
                    <Check size={15} />
                    Total priority weight: {Object.values(weights).reduce((a, b) => a + b, 0)}%
                  </div>

                  <button
                    className="primary-btn full"
                    onClick={runMatching}
                    disabled={matchStatus === 'loading'}
                  >
                    {matchStatus === 'loading' ? 'Finding matches…' : 'Find my matches'} <Sparkles size={16} />
                  </button>
                  <p className="fine-print">
                    Travel fit uses postal codes (same postal sector or region), not travel time, and counts
                    as full marks if the centre provides transport. Fees are before subsidy.
                  </p>
                </section>

                <section className="results-panel">
                  <div className="results-top">
                    <div>
                      <div className="eyebrow">YOUR SHORTLIST</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                        <h2 style={{ margin: 0 }}>Top matches for your family</h2>
                      </div>
                      <p>{matchMessage || 'Ranked using your selected priorities'}</p>
                    </div>
                    <span className="result-count">{Math.min(ranked.length, 10)} of {ranked.length} results</span>
                  </div>

                  {matchStatus === 'idle' && (
                    <Empty
                      title="Ready when you are"
                      text="Choose your child's level, enter your home postal code and press Find my matches."
                    />
                  )}
                  {matchStatus === 'loading' && (
                    <Empty title="Working on it" text={matchMessage} />
                  )}
                  {matchStatus === 'error' && (
                    <Empty title="Could not load matches" text={matchMessage} />
                  )}
                  {matchStatus === 'done' && ranked.length === 0 && (
                    <Empty
                      title="No centres to rank"
                      text="No nearby centre has an open vacancy and a listed fee for this level and citizenship. Try another level or a different postal code."
                    />
                  )}

                  {matchStatus === 'done' && ranked.slice(0, 10).map((centre, index) => (
                    <article className="panel centre-card" key={centre.id} style={{ marginBottom: 16 }}>
                      <div className="centre-card-top">
                        <span className="eyebrow">#{index + 1} · {centre.score}% match</span>
                        <button
                          className="icon-btn"
                          aria-label={isSaved(centre.id) ? 'Remove from watchlist' : 'Save to watchlist'}
                          onClick={() => toggleSaved(centre.id)}
                        >
                          <Heart
                            size={18}
                            fill={isSaved(centre.id) ? '#e63946' : 'none'}
                            color={isSaved(centre.id) ? '#e63946' : '#9ca3af'}
                          />
                        </button>
                      </div>

                      <h3>{centre.name}</h3>
                      <p><MapPin size={14} /> {centre.address || 'Address not provided'}</p>

                      <p>
                        <strong>{money(centre.fee)}</strong> / month ({levelLabel(matchRun.level)},{' '}
                        {matchRun.citizenship}, before subsidy)<br />
                        Vacancy: {centre.vacancyLabel}<br />
                        Travel: {centre.locationLabel}
                      </p>

                      <p className="fine-print">
                        Vacancy {centre.vf}% · Cost {centre.cf}% · Travel {centre.tf}%
                      </p>

                      <div className="centre-tags">
                        {centre.spark_certified && <span>SPARK certified</span>}
                        {centre.gov_subsidy && <span>Government subsidy</span>}
                        {centre.transport_provided && <span>Transport</span>}
                      </div>

                      <button className="secondary-btn" onClick={() => openCentreDetails(centre)}>
                        View details
                      </button>
                    </article>
                  ))}
                </section>
              </div>
            </>
          )}

          {page === 'My watchlist' && (
            <>
              <PageTitle
                eyebrow="YOUR FAVOURITES"
                title="Your watchlist"
                subtitle={`${saved.length} saved ${saved.length === 1 ? 'centre' : 'centres'}. All your saved centres appear here.`}
              />

              {saved.length > 0 && watchlistCentres.length < saved.length && (
                <p className="fine-print">
                  Loading {saved.length - watchlistCentres.length} more saved centre(s)…
                </p>
              )}

              {saved.length === 0 ? (
                <Empty
                  title="Your watchlist is empty"
                  text="Save a centre from the directory to track it here."
                  action={() => openPage('Preschool directory')}
                />
              ) : (
                <div className="centre-grid">
                  {watchlistCentres.map((centre) => (
                    <article className="panel centre-card" key={centre.id}>
                      <div className="centre-card-top">
                        <span className="eyebrow">{centre.centre_code || 'PRESCHOOL'}</span>
                        <Heart size={18} fill="currentColor" />
                      </div>

                      <h3>{centre.name}</h3>
                      <p>{centre.address || 'Address not provided'}</p>

                      <button className="secondary-btn" onClick={() => openCentreDetails(centre)}>
                        View details
                      </button>

                      <button
                        className="secondary-btn"
                        onClick={() => {
                          const id = String(centre.id);

                          if (compareSelectedIds.includes(id)) {
                            setCompareSelectedIds((items) => items.filter((item) => item !== id));
                            notify('Centre removed from comparison.');
                            return;
                          }

                          if (compareSelectedIds.length >= 3) {
                            notify('You can compare a maximum of 3 centres.');
                            return;
                          }

                          setCompareSelectedIds((items) => [...items, id]);
                          notify('Centre added to comparison.');
                        }}
                      >
                        {compareSelectedIds.includes(String(centre.id))
                          ? 'Selected for comparison'
                          : 'Add to comparison'}
                      </button>

                      <button className="text-btn" onClick={() => toggleSaved(centre.id)}>
                        Remove from watchlist
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}

          {page === 'Compare centres' && (
            <>
              <PageTitle
                eyebrow="SIDE-BY-SIDE VIEW"
                title="Compare centres"
                subtitle="Pick up to 3 centres from your watchlist to compare side by side."
              />

              <section className="panel" style={{ padding: 20, marginBottom: 24 }}>
                <div className="results-top">
                  <div>
                    <h2>1. Choose from your watchlist</h2>
                    <p>{compareSelectedIds.length} of 3 centres selected</p>
                  </div>

                  <button
                    className="text-btn"
                    onClick={() => setCompareSelectedIds([])}
                    disabled={compareSelectedIds.length === 0}
                  >
                    Clear selection
                  </button>
                </div>

                {compareOptions.length === 0 ? (
                  <Empty
                    title="Your watchlist is empty"
                    text="Save centres to your watchlist first, then choose up to 3 of them here to compare."
                    action={() => openPage('Preschool directory')}
                  />
                ) : (
                  <div className="form-grid">
                    {compareOptions.map((centre) => {
                      const id = String(centre.id);
                      const checked = compareSelectedIds.includes(id);

                      return (
                        <label
                          key={id}
                          className="panel"
                          style={{
                            display: 'flex',
                            gap: 12,
                            alignItems: 'flex-start',
                            padding: 14,
                            cursor: 'pointer'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              if (checked) {
                                setCompareSelectedIds((items) => items.filter((item) => item !== id));
                              } else if (compareSelectedIds.length < 3) {
                                setCompareSelectedIds((items) => [...items, id]);
                              } else {
                                notify('You can compare a maximum of 3 centres.');
                              }
                            }}
                          />

                          <span>
                            <strong>{centre.name}</strong>
                            <br />
                            <small>{centre.address || 'Address not provided'}</small>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </section>

              <section>
                <div className="results-top">
                  <div>
                    <h2>2. Compare side by side</h2>
                    <p>Select at least 2 centres above to compare their details.</p>
                  </div>
                </div>

                {compareCentres.length === 0 ? (
                  <Empty
                    title="Choose your centres"
                    text="Select one or more centres above. Their details will appear here."
                  />
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${compareCentres.length}, minmax(240px, 1fr))`,
                      gap: 16,
                      overflowX: 'auto',
                      alignItems: 'start'
                    }}
                  >
                    {compareCentres.map((listCentre) => {
                      const entry = compareDetails[String(listCentre.id)] || {};
                      const detail = entry.data;
                      const centre = detail ? { ...listCentre, ...detail, id: listCentre.id, name: listCentre.name } : listCentre;
                      const services = detail?.services ?? [];
                      const vacancies = detail?.vacancies ?? [];
                      const fees = services.map((item) => Number(item.fee)).filter(Number.isFinite);
                      return (
                      <article className="panel" key={centre.id} style={{ padding: 20 }}>
                        <h3>{centre.name}</h3>
                        <p>{centre.address || 'Address not provided'}</p>

                        <hr />

                        <p><strong>Centre code</strong><br />{centre.centre_code || 'Not provided'}</p>
                        <p><strong>Contact</strong><br />{centre.contact || 'Not provided'}</p>
                        <p><strong>Email</strong><br />{centre.email || 'Not provided'}</p>
                        <p>
                          <strong>Website</strong><br />
                          {centre.website_url ? (
                            <a href={websiteHref(centre.website_url)} target="_blank" rel="noreferrer">
                              Visit website
                            </a>
                          ) : 'Not provided'}
                        </p>
                        <p><strong>SPARK certified</strong><br />{yesNo(centre.spark_certified)}</p>
                        <p><strong>Government subsidy</strong><br />{yesNo(centre.gov_subsidy)}</p>
                        <p>
                          <strong>Transport provided</strong><br />
                          {entry.loading ? 'Loading…' : yesNo(centre.transport_provided)}
                        </p>
                        <p>
                          <strong>Extended hours</strong><br />
                          {yesNo(centre.extended_operating_hours)}
                        </p>
                        <p><strong>Weekday hours</strong><br />{centre.weekday_full_day_hours || 'Not provided'}</p>
                        <p><strong>Saturday hours</strong><br />{centre.saturday_hours || 'Not provided'}</p>
                        <p>
                          <strong>Monthly fees</strong><br />
                          {entry.loading
                            ? 'Loading…'
                            : fees.length
                              ? `${money(Math.min(...fees))}${Math.min(...fees) === Math.max(...fees) ? '' : ` – ${money(Math.max(...fees))}`}`
                              : 'Fee data unavailable'}
                        </p>
                        {services.length > 0 && (
                          <div style={{ maxHeight: 160, overflowY: 'auto', fontSize: 13, marginBottom: 12 }}>
                            {services.map((item) => (
                              <div key={item.service_id ?? `${item.level}-${item.citizenship_type}-${item.type_of_service}`}>
                                {levelLabel(item.level)} · {item.citizenship_type} · {money(item.fee)}
                              </div>
                            ))}
                          </div>
                        )}
                        <p>
                          <strong>Vacancies</strong><br />
                          {entry.loading ? 'Loading…' : vacancies.length ? '' : 'None listed'}
                        </p>
                        {vacancies.length > 0 && (
                          <div style={{ maxHeight: 160, overflowY: 'auto', fontSize: 13, marginBottom: 12 }}>
                            {vacancies.map((item, index) => (
                              <div key={item.record_id ?? index}>
                                {levelLabel(item.level_type)} · {monthYear(item.enrollment_month_year)} · {item.vacancy_status}
                              </div>
                            ))}
                          </div>
                        )}
                        {entry.error && <p className="fine-print">Could not load full details: {entry.error}</p>}

                        <button className="secondary-btn" onClick={() => openCentreDetails(centre)}>
                          View full details
                        </button>

                        <button
                          className="text-btn"
                          onClick={() =>
                            setCompareSelectedIds((items) =>
                              items.filter((id) => id !== String(centre.id))
                            )
                          }
                        >
                          Remove from comparison
                        </button>
                      </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}

          {page === 'Family profile' && (
            <>
              <PageTitle
                eyebrow="YOUR FAMILY, YOUR PRIORITIES"
                title="Family preference profile"
                subtitle="Enter your preferences to help find suitable childcare options."
              />

              <form
                className="profile-form panel"
                onSubmit={(event) => {
                  event.preventDefault();
                  setProfileSaved(true);
                  notify('Profile saved in this demo session.');
                }}
              >
                <div className="form-section">
                  <h3><Baby size={19} /> Child information</h3>
                  <div className="form-grid">
                    <label>Child's age
                      <select defaultValue="2 years">
                        <option>Under 18 months</option>
                        <option>18 months</option>
                        <option>2 years</option>
                        <option>3 years</option>
                        <option>4 years</option>
                        <option>5 years</option>
                      </select>
                    </label>
                    <label>Required care type
                      <select defaultValue="Childcare">
                        <option>Infant Care</option>
                        <option>Childcare</option>
                      </select>
                    </label>
                    <label>Desired enrolment month
                      <input type="month" defaultValue="2027-01" />
                    </label>
                  </div>
                </div>

                <div className="form-section">
                  <h3><MapPin size={19} /> Location & transport</h3>
                  <div className="form-grid">
                    <label>Home postal code
                      <input pattern="[0-9]{6}" maxLength="6" placeholder="6-digit postal code" />
                    </label>
                    <label>Workplace postal code
                      <input pattern="[0-9]{6}" maxLength="6" placeholder="6-digit postal code" />
                    </label>
                    <label>Transport mode
                      <select>
                        <option>Public transport</option>
                        <option>Driving</option>
                        <option>Walking</option>
                      </select>
                    </label>
                    <label>Preferred commute (minutes)
                      <input type="number" min="1" defaultValue="30" />
                    </label>
                    <label>Maximum commute (minutes)
                      <input type="number" min="1" defaultValue="60" />
                    </label>
                  </div>
                </div>

                <div className="form-section">
                  <h3><Wallet size={19} /> Budget & priorities</h3>
                  <div className="form-grid">
                    <label>Preferred monthly budget (SGD)
                      <input type="number" min="1" defaultValue="750" />
                    </label>
                    <label>Subsidy eligibility
                      <select>
                        <option>Prefer not to say</option>
                        <option>Eligible</option>
                        <option>Not eligible</option>
                        <option>Unsure</option>
                      </select>
                    </label>
                  </div>

                  {[
                    ['vacancy', 'Vacancy fit'],
                    ['cost', 'Cost fit'],
                    ['travel', 'Travel fit']
                  ].map(([key, label]) => (
                    <div className="weight-row" key={key}>
                      <span>{label}</span>
                      <input
                        type="range" min="0" max="100" step="5"
                        value={weights[key]}
                        onChange={(e) => updateWeight(key, e.target.value)}
                      />
                      <b>{weights[key]}%</b>
                    </div>
                  ))}
                </div>

                <div className="form-footer">
                  <span className="fine-print">This form currently saves to this session only.</span>
                  <button type="submit" className="primary-btn">
                    {profileSaved ? 'Saved' : 'Save profile'} <Check size={16} />
                  </button>
                </div>
              </form>
            </>
          )}

          {page === 'Admin dashboard' && (
            currentUser?.email?.toLowerCase() === 'swetalakshita@gmail.com'
              ? <AdminDashboard />
              : <section className="panel"><h2>Administrator access required</h2><p>Sign in with the authorised administrator account to access this area.</p><button className="primary-btn" onClick={() => { setPage('Overview'); setAuthMode('login'); }}>Sign in</button></section>
          )}
          <section className="panel" style={{ padding: 24, margin: "30px auto 28px", maxWidth: 900, textAlign: "center" }}>
            <div className="eyebrow">SHARE YOUR EXPERIENCE</div>
            <h2 style={{ marginTop: 6 }}>Parent reviews</h2>
            <p>Help other families learn from your preschool experience.</p>

            <form onSubmit={submitLocalReview} style={{ display: 'grid', gap: 14, maxWidth: 600, margin: "0 auto", textAlign: "left" }}>
              <label className="field-label">Choose a preschool
                <select value={reviewCentreId} onChange={(event) => setReviewCentreId(event.target.value)} required>
                  <option value="">Select a preschool</option>
                  {[...centreLookup.values()].sort((a, b) => a.name.localeCompare(b.name)).map((centre) => (
                    <option key={centre.id} value={String(centre.id)}>{centre.name}</option>
                  ))}
                </select>
              </label>

              <label className="field-label">Your rating
                <select value={reviewRating} onChange={(event) => setReviewRating(Number(event.target.value))}>
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <option key={rating} value={rating}>{'★'.repeat(rating)} ({rating}/5)</option>
                  ))}
                </select>
              </label>

              <label className="field-label">Your comment
                <textarea
                  value={reviewComment}
                  onChange={(event) => setReviewComment(event.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder="Share what you liked or what other parents should know..."
                  required
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </label>

              <button className="primary-btn" type="submit" style={{ justifySelf: "center" }}>
                Submit review <ChevronRight size={16} />
              </button>
            </form>

            <p className="fine-print" style={{ marginTop: 12 }}>
              Reviews submitted here are saved in this browser only. They are not sent to the shared database
              or shown to other parents until a backend review-submission feature is connected.
            </p>

            {localReviews.length > 0 && (
              <div style={{ margin: "24px auto 0", maxWidth: 600 }}>
                <h3>Your submitted reviews</h3>
                <div style={{ display: 'grid', gap: 12, textAlign: "left" }}>
                  {localReviews.map((review) => (
                    <article key={review.id} style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 12 }}>
                      <strong>{review.centre_name}</strong>
                      <div aria-label={`${review.rating} out of 5 stars`} style={{ color: '#d69e22', marginTop: 4 }}>
                        {'★'.repeat(Number(review.rating))}{'☆'.repeat(5 - Number(review.rating))}
                      </div>
                      <p style={{ margin: '6px 0' }}>{review.comment}</p>
                      <small>{review.author} · {new Date(review.created_at).toLocaleDateString('en-SG')}</small>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        <footer className="footer">
          <span>© 2026 KidCare Match SG</span>
          <span>Made with care for Singapore families <Heart size={13} /></span>
        </footer>
      </main>

      {selectedCentre && (
        <div className="modal-backdrop" onClick={() => setSelectedCentre(null)}>
          <section className="detail-modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedCentre(null)}>
              <X size={19} />
            </button>
            {detailLoading ? (
              <p>Loading centre details…</p>
            ) : (
              <>
                <h1>{selectedCentre.name}</h1>
                <p>
                  {selectedCentre.address || 'Address not provided'}{' '}
                  {selectedCentre.postal ? `(${selectedCentre.postal})` : ''}
                </p>
                <p><b>Centre code:</b> {selectedCentre.centre_code || 'Not provided'}</p>
                <p><b>Contact:</b> {selectedCentre.contact || 'Not provided'}</p>
                <p><b>Email:</b> {selectedCentre.email || 'Not provided'}</p>
                {selectedCentre.website_url && (
                  <p>
                    <a href={websiteHref(selectedCentre.website_url)} target="_blank" rel="noreferrer">
                      Visit website
                    </a>
                  </p>
                )}
                <p><b>Weekday hours:</b> {selectedCentre.weekday_full_day_hours || 'Not provided'}</p>
                <p><b>Saturday hours:</b> {selectedCentre.saturday_hours || 'Not provided'}</p>
                <p><b>Food offered:</b> {selectedCentre.food_offered || 'Not provided'}</p>
                <p><b>Second languages:</b> {selectedCentre.second_languages || 'Not provided'}</p>
                <p><b>SPARK certified:</b> {selectedCentre.spark_certified ? 'Yes' : 'No'}</p>
                <p><b>Government subsidy:</b> {selectedCentre.gov_subsidy ? 'Yes' : 'No'}</p>
                <p><b>Transport:</b> {selectedCentre.transport_provided ? 'Available' : 'Not listed'}</p>
                <p>
                  <b>Average rating:</b>{' '}
                  {selectedCentre.review_summary?.average_rating ?? 'No rating'} (
                  {selectedCentre.review_summary?.total_reviews ?? 0} reviews)
                </p>
                <h3>Recent reviews</h3>
                {detailReviews.length ? (
                  detailReviews.map((review) => (
                    <p key={review.review_id}>
                      ★ {review.rating}/5 — {review.comment || review.review_description || 'No comment'}
                    </p>
                  ))
                ) : (
                  <p>No approved reviews returned.</p>
                )}
              </>
            )}
            <button className="secondary-btn" onClick={() => setSelectedCentre(null)}>
              Close
            </button>
          </section>
        </div>
      )}

      {toast && (
        <div className="toast"><Check size={17} />{toast}</div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, detail, tone }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}><Icon size={19} /></div>
      <div>
        <span className="stat-label">{label}</span>
        <div className="stat-value">{value}</div>
        <span className="stat-detail">{detail}</span>
      </div>
    </div>
  );
}

function PageTitle({ eyebrow, title, subtitle }) {
  return (
    <section className="page-title">
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </section>
  );
}

function Empty({ title, text, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Search size={25} /></div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="primary-btn" onClick={action}>
          Browse directory <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
