import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LayoutDashboard, Search, Heart, GitCompareArrows, UserRound,
  Bell, SlidersHorizontal, MapPin, Baby, Wallet, MessageCircle,
  ChevronRight, ChevronDown, Menu, X, Check, Sparkles,
  ArrowUpRight, BookOpen, LogOut, Filter, CircleHelp, Star, Send
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
import CentreCommute from './commute/CentreCommute';
import { resetSessionMode } from './commute/commuteSession';
import CentreLocationMap from './commute/CentreLocationMap';
import {
  getCentres,
  getCentreById,
  getCentreByCode,
  getCentreSummary,
  getDistricts,
  getMyProfile,
  createMyProfile,
  getMyWatchlist,
  createWatchlist,
  deleteWatchlist,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getCentreReviews,
  getMyReview,
  submitReview,
  updateReview,
  reportReview,
  getFamilyProfiles,
  createFamilyProfile,
  updateFamilyProfile
} from './api';
import {
  PROFILE_DEFAULTS,
  WEIGHT_KEYS,
  WEIGHT_LABELS,
  RANK_WEIGHTS,
  priorityOrder,
  weightsFromOrder,
  normalizeWeights,
  setRank,
  weightsFromCostShare,
  nextMonthValue,
  validateFamilyProfile,
  isProfileComplete,
  toApiProfile,
  fromApiProfile
} from './profile/familyProfile';
import { createOnboardingController } from './profile/onboarding';
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
// Mirrors the backend rule: "Available" / "Immediate ..." means a place is open now.
const isVacancyOpen = (status) => {
  const text = String(status || '').trim().toLowerCase();
  if (!text || text.includes('not') || text.includes('wait')) return false;
  return text.includes('immediate') || text.includes('available');
};
const timeAgo = (value) => {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

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
function vacancyInfo(vacancies, level, targetMonth) {
  const monthIndex = (value) => {
    const m = /^(\d{4})-(\d{2})/.exec(String(value ?? ''));
    return m ? Number(m[1]) * 12 + Number(m[2]) : null;
  };
  const target = monthIndex(targetMonth);
  let score = 0;
  let label = 'No open vacancy listed';
  (vacancies || [])
    .filter((record) => record.level_type === level)
    .forEach((record) => {
      const status = String(record.vacancy_status || '').toLowerCase();
      const base =
        status.includes('immediate') ? 100 :
        status.includes('available') && !status.includes('not') ? 80 :
        status.includes('wait') ? 30 : 0;
      // A vacancy in your preferred enrolment month scores in full; each month away costs 10%.
      const recordMonth = monthIndex(record.enrollment_month_year);
      const gap = target != null && recordMonth != null ? Math.abs(recordMonth - target) : 0;
      const value = Math.round(base * Math.max(0.5, 1 - 0.1 * gap));
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
  const sector = Number(postal.slice(0, 2));
  const gaps = places.map((a) => Math.abs(Number(a.slice(0, 2)) - sector));
  const closest = Math.min(...gaps);
  if (closest === 0) return { score: 100, label: 'Same postal sector as you' };
  if (closest === 1) return { score: 75, label: 'Next to your postal sector' };
  if (places.some((a) => a[0] === postal[0])) return { score: 50, label: 'Same region' };
  return { score: 0, label: 'Further away' };
}

const profileKey = (uid) => `kidcare-profile:${uid}`;
const LOCATION_PREF_LABELS = { HOME: 'Near home', WORKPLACE: 'Near workplace', EITHER: 'Near home or workplace' };

// Districts come from GET /api/v1/centres/districts (first 2 digits of the postal code)
// and are filtered by the backend with repeated `district` query params (multi-select).

const nav = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Find my matches', icon: Sparkles },
  { label: 'Preschool directory', icon: Search },
  { label: 'Compare centres', icon: GitCompareArrows },
  { label: 'My watchlist', icon: Heart },
  { label: 'Family profile', icon: UserRound },
  { label: 'Admin dashboard', icon: SlidersHorizontal }
];

// Multi-select postal district filter. Labels are the official general locations.
function DistrictMultiSelect({ districts, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Accept the field names used by both the current API and older API responses.
  // The option's value remains the district code, but only its location name is shown.
  const options = districts.map((d) => ({
    code: d.district ?? d.district_code ?? d.code ?? d.value,
    name: d.label ?? d.name ?? d.area ?? d.location ?? d.district_name ?? d.district ?? d.code ?? '',
  })).filter((d) => d.code && d.name);

  const toggle = (code) =>
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);

  const needle = search.trim().toLowerCase();
  const visible = options.filter((d) => d.name.toLowerCase().includes(needle));

  let summary = 'All districts';
  if (selected.length === 1) {
    const only = options.find((d) => d.code === selected[0]);
    summary = only ? only.name : 'All districts';
  } else if (selected.length > 1) {
    summary = `${selected.length} districts selected`;
  }

  return (
    <div className="district-select" ref={rootRef}>
      <button
        type="button"
        className="district-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Filter by location"
      >
        <span>{summary}</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="district-menu" role="listbox" aria-multiselectable="true">
          <input
            className="district-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search area..."
            autoFocus
          />
          <div className="district-actions">
            <button type="button" onClick={() => onChange([])} disabled={!selected.length}>Clear</button>
            <span>{selected.length} selected</span>
          </div>
          <div className="district-list">
            {!options.length && <p className="district-empty">District names are not available right now.</p>}
            {options.length > 0 && !visible.length && <p className="district-empty">No matching area.</p>}
            {visible.map((d) => (
              <label key={d.code} className="district-option">
                <input
                  type="checkbox"
                  checked={selected.includes(d.code)}
                  onChange={() => toggle(d.code)}
                />
                <span className="district-label">{d.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Vacancy alerts built in the browser --------------------------------------------
// Used automatically when the server has no /api/v1/notifications endpoint (or it fails):
// alerts are derived from GET /api/v1/watchlist/me, which already reports the current vacancy
// status of every watched cohort. Read/unread state is kept in this browser only.
const alertStoreKey = (uid) => `kidcare-alerts:${uid}`;
const loadAlertStore = (uid) => {
  try { return JSON.parse(localStorage.getItem(alertStoreKey(uid)) || '{}') || {}; } catch { return {}; }
};
const saveAlertStore = (uid, store) => {
  try { localStorage.setItem(alertStoreKey(uid), JSON.stringify(store)); } catch { /* ignore */ }
};
const isLocalAlert = (id) => String(id).startsWith('local:');

function buildLocalAlerts(uid, entries) {
  const store = loadAlertStore(uid);
  const now = new Date().toISOString();
  const watched = new Set(entries.map((e) => e.watchlist_id));
  const openIds = new Set();

  entries.forEach((e) => {
    if (!isVacancyOpen(e.current_vacancy_status)) return;
    const id = `local:${e.watchlist_id}:${String(e.current_vacancy_status).toLowerCase()}`;
    openIds.add(id);
    const record = store[id];
    if (!record) {
      store[id] = {
        watchlist_id: e.watchlist_id,
        centre_id: e.centre_id,
        centre_name: e.centre_name,
        level: e.level,
        enrollment_month_year: e.enrollment_month_year,
        vacancy_status: e.current_vacancy_status,
        created_at: now,
        read: false,
        closed: false
      };
    } else if (record.closed) {
      // The vacancy closed and has opened again: alert again.
      Object.assign(record, { created_at: now, read: false, closed: false });
    }
  });

  Object.keys(store).forEach((id) => {
    if (!watched.has(store[id].watchlist_id)) delete store[id]; // entry was removed
    else if (!openIds.has(id)) store[id].closed = true;
  });
  saveAlertStore(uid, store);

  return Object.entries(store)
    .map(([id, r]) => ({
      notification_id: id,
      watchlist_id: r.watchlist_id,
      centre_id: r.centre_id,
      centre_name: r.centre_name,
      level: r.level,
      enrollment_month_year: r.enrollment_month_year,
      vacancy_status: r.vacancy_status,
      message: `${r.centre_name} now has a vacancy for ${levelLabel(r.level)} (${monthYear(r.enrollment_month_year)}) - status: ${r.vacancy_status}.`,
      created_at: r.created_at,
      is_read: Boolean(r.read),
      still_available: openIds.has(id)
    }))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 20);
}

function markLocalAlertsRead(uid, id = null) {
  const store = loadAlertStore(uid);
  Object.keys(store).forEach((key) => { if (id === null || key === id) store[key].read = true; });
  saveAlertStore(uid, store);
}

// Dropdown list of vacancy alerts for watchlisted centres.
function NotificationPanel({ items, unread, error, onOpen, onReadAll }) {
  return (
    <div className="notif-panel" role="dialog" aria-label="Vacancy alerts">
      <div className="notif-head">
        <b>Vacancy alerts</b>
        <button type="button" onClick={onReadAll} disabled={!unread}>Mark all read</button>
      </div>
      <div className="notif-list">
        {error && (
          <p className="notif-error">
            Couldn't load vacancy alerts ({error}). Check that the backend is reachable.
          </p>
        )}
        {!items.length && !error && (
          <p className="notif-empty">
            No alerts yet. We'll tell you here as soon as a centre on your watchlist opens a
            place for the level and month you chose.
          </p>
        )}
        {items.map((n) => (
          <button
            type="button"
            key={n.notification_id}
            className={`notif-item ${n.is_read ? '' : 'unread'}`}
            onClick={() => onOpen(n)}
          >
            <span className="notif-title">{n.centre_name}</span>
            <span className="notif-text">
              {levelLabel(n.level)} · {monthYear(n.enrollment_month_year)} · {n.vacancy_status}
            </span>
            <span className="notif-meta">
              {timeAgo(n.created_at)}
              {!n.still_available && ' · no longer available'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Rank the three match factors 1-3; each rank has a preset weight (50% / 35% / 15%).
function PriorityRanking({ weights, onChange }) {
  const order = priorityOrder(weights);
  return (
    <>
      {WEIGHT_KEYS.map((key) => {
        const rank = order.indexOf(key);
        return (
          <div className="rank-row" key={key}>
            <span>{WEIGHT_LABELS[key]}</span>
            <select
              value={rank}
              onChange={(e) => onChange(key, Number(e.target.value))}
              aria-label={`${WEIGHT_LABELS[key]} priority`}
            >
              {RANK_WEIGHTS.map((_, i) => <option key={i} value={i}>Rank {i + 1}</option>)}
            </select>
            <b>{RANK_WEIGHTS[rank]}%</b>
          </div>
        );
      })}
      <p className="fine-print rank-note">Each rank can be used once. Picking a rank swaps it with the factor that had it.</p>
    </>
  );
}

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
  const [myCentreReview, setMyCentreReview] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
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
  const [notifications, setNotifications] = useState({ items: [], unread_count: 0 });
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifError, setNotifError] = useState('');
  const [watchlistLoaded, setWatchlistLoaded] = useState(false);
  const watchlistReconciled = useRef(false);
  const notifRef = useRef(null);
  const seenNotificationIds = useRef(null); // null until the first load after sign-in
  const refreshNotificationsRef = useRef(null);
  const alertsFromBrowserRef = useRef(false); // true once the server has no /notifications
  const [districts, setDistricts] = useState([]); // [{ district, label, centre_count }]
  const [selectedDistricts, setSelectedDistricts] = useState([]); // e.g. ['D01', 'D09']
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
  const [weights, setWeights] = useState({ vacancy: 50, cost: 35, travel: 15 });
  const [scoreInfoOpen, setScoreInfoOpen] = useState(false);
  useEffect(() => {
    if (!scoreInfoOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setScoreInfoOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scoreInfoOpen]);
  const [toast, setToast] = useState('');
  const [profile, setProfile] = useState(null); // the saved family profile (null = not set up yet)
  const [profileId, setProfileId] = useState(null);
  const [profileName, setProfileName] = useState('My family profile');
  const [profileForm, setProfileForm] = useState(() => ({ ...PROFILE_DEFAULTS, enrolMonth: nextMonthValue() }));
  const [profileSaving, setProfileSaving] = useState(false);
  const setField = (key, value) => setProfileForm((current) => ({ ...current, [key]: value }));
  const updateProfileRank = (key, rank) =>
    setProfileForm((current) => ({ ...current, weights: setRank(current.weights, key, rank) }));

  // Push the saved profile into the matching engine's inputs.
  const applyProfileToMatching = (p) => {
    setMatchForm({ level: p.level, citizenship: p.citizenship, home: p.home, work: p.work || '' });
    setBudget(Number(p.budget));
    setWeights(p.weights);
    setMatchRun(null);
    setMatchCandidates([]);
    setMatchStatus('idle');
    setMatchMessage('');
  };

  const [onboardingState, setOnboardingState] = useState(() => ({
    status: 'guest',
    profile: null,
    profileId: null,
    profileName: 'My family profile',
    draft: null,
    error: null,
    isFirstSave: false,
  }));

  const controller = useMemo(() => {
    return createOnboardingController({
      loadAccount: async (user) => {
        try {
          return await getMyProfile();
        } catch (profileError) {
          if (String(profileError.message).includes('404')) {
            return await createMyProfile(user.displayName || user.email?.split('@')[0] || 'Parent');
          }
          throw profileError;
        }
      },
      loadProfiles: async () => {
        return await getFamilyProfiles();
      },
      createProfile: async (payload) => {
        return await createFamilyProfile(payload);
      },
      updateProfile: async (id, payload) => {
        return await updateFamilyProfile(id, payload);
      },
      onState: (nextState) => {
        setOnboardingState(nextState);
      },
    });
  }, []);

  useEffect(() => {
    if (onboardingState.status === 'ready') {
      const p = onboardingState.profile;
      setProfile(p);
      setProfileId(onboardingState.profileId);
      setProfileName(onboardingState.profileName);
      setProfileForm(p);
      applyProfileToMatching(p);
      if (onboardingState.isFirstSave) {
        setPage('Find my matches');
        notify('Family profile completed! Here are your matches.');
      }
    } else if (onboardingState.status === 'loading') {
      setProfile(null);
      setProfileId(null);
      setProfileName('My family profile');
      setProfileForm({ ...PROFILE_DEFAULTS, enrolMonth: nextMonthValue() });
    } else if (onboardingState.status === 'required') {
      setProfile(null);
      setProfileId(onboardingState.profileId);
      setProfileName(onboardingState.profileName);
      if (onboardingState.draft) {
        setProfileForm({
          ...PROFILE_DEFAULTS,
          ...onboardingState.draft,
          enrolMonth: onboardingState.draft.enrolMonth || nextMonthValue(),
          weights: normalizeWeights(onboardingState.draft.weights),
        });
      } else {
        setProfileForm({ ...PROFILE_DEFAULTS, enrolMonth: nextMonthValue() });
      }
    } else if (onboardingState.status === 'guest') {
      setProfile(null);
      setProfileId(null);
      setProfileName('My family profile');
      setProfileForm({ ...PROFILE_DEFAULTS, enrolMonth: nextMonthValue() });
    }
  }, [onboardingState]);
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
        if (selectedDistricts.length) params.district = selectedDistricts;
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
  }, [query, selectedDistricts, level, pageOffset]);

  useEffect(() => {
    getDistricts()
      .then((list) => setDistricts(Array.isArray(list) ? list : (list?.items ?? list?.data ?? [])))
      .catch((error) => console.warn('Districts unavailable:', error.message));
  }, []);

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
        controller.cancel();
        resetSessionMode();
        setWatchlistEntries([]);
        setPage('Overview');
        return;
      }

      const isGoogle =
        user.providerId === 'google.com' ||
        (Array.isArray(user.providerData) &&
          user.providerData.some((p) => p.providerId === 'google.com'));
      const isVerified = Boolean(user.emailVerified) || isGoogle;

      if (!isVerified) {
        controller.start(user);
        return;
      }

      setAuthMode('');
      controller.start(user);
    });

    return () => {
      unsubscribe();
      controller.cancel();
    };
  }, [controller]);

  useEffect(() => {
    if (!currentUser) return undefined;
    const isGoogle =
      currentUser.providerId === 'google.com' ||
      (Array.isArray(currentUser.providerData) &&
        currentUser.providerData.some((p) => p.providerId === 'google.com'));
    const isVerified = Boolean(currentUser.emailVerified) || isGoogle;
    if (!isVerified) return undefined;

    let cancelled = false;
    async function syncWatchlist() {
      try {
        const watchlist = await getMyWatchlist();
        if (cancelled) return;
        const entries = Array.isArray(watchlist)
          ? watchlist
          : (watchlist?.items || watchlist?.entries || []);
        setWatchlistEntries(entries);
        setWatchlistLoaded(true);

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
        console.warn('Backend watchlist sync:', error.message);
      }
    }
    syncWatchlist();
    return () => { cancelled = true; };
  }, [currentUser]);

  const toastTimer = useRef(null);
  const notify = (message, ms = 2600) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), ms);
  };

  const refreshNotifications = async () => {
    try {
      if (!currentUser) return null;
      let data;
      if (!alertsFromBrowserRef.current) {
        try {
          data = await getNotifications({ limit: 20 });
        } catch (serverError) {
          console.warn('Server notifications unavailable, using watchlist data:', serverError.message);
          alertsFromBrowserRef.current = true;
        }
      }
      if (alertsFromBrowserRef.current) {
        const wl = await getMyWatchlist();
        const entries = Array.isArray(wl) ? wl : (wl?.items || []);
        const built = buildLocalAlerts(currentUser.uid, entries);
        data = { items: built, unread_count: built.filter((n) => !n.is_read).length };
      }
      const items = data?.items || [];
      const unread = data?.unread_count || 0;
      setNotifications({ items, unread_count: unread });
      setNotifError('');

      const seen = seenNotificationIds.current;
      if (seen === null) {
        if (unread > 0) {
          notify(`You have ${unread} vacancy alert${unread === 1 ? '' : 's'} on your watchlist!`, 5000);
        }
      } else {
        const fresh = items.filter((n) => !n.is_read && !seen.has(n.notification_id));
        if (fresh.length === 1) notify(fresh[0].message, 6000);
        else if (fresh.length > 1) notify(`${fresh.length} new vacancy alerts on your watchlist!`, 6000);
      }
      seenNotificationIds.current = new Set(items.map((n) => n.notification_id));
      return items;
    } catch (error) {
      console.warn('Notifications unavailable:', error.message);
      setNotifError(error.message || 'Could not load alerts');
      return null;
    }
  };
  refreshNotificationsRef.current = refreshNotifications;

  // Centres hearted before the backend watchlist existed (or while it was unreachable) only
  // live in this browser, so they never produce vacancy alerts. Subscribe them once.
  useEffect(() => {
    if (!currentUser || !watchlistLoaded || !profile || watchlistReconciled.current) return;
    watchlistReconciled.current = true;
    const backendIds = new Set(watchlistEntries.map((e) => Number(e.centre_id)));
    const missing = saved.map(Number).filter((id) => Number.isFinite(id) && !backendIds.has(id));
    if (!missing.length) return;
    (async () => {
      const month = String(profile.enrolMonth || nextMonthValue()).slice(0, 7);
      for (const centreId of missing) {
        try {
          await createWatchlist({
            centre_id: centreId,
            level: profile.level,
            enrollment_month_year: `${month}-01T00:00:00Z`
          });
        } catch (error) {
          console.warn('Could not subscribe saved centre', centreId, error.message);
        }
      }
      try {
        const refreshed = await getMyWatchlist();
        setWatchlistEntries(Array.isArray(refreshed) ? refreshed : (refreshed?.items || []));
      } catch { /* ignore */ }
      refreshNotificationsRef.current?.();
    })();
  }, [currentUser, watchlistLoaded, profile, watchlistEntries, saved]);

  // Poll for vacancy alerts while signed in (also when the tab becomes visible again).
  useEffect(() => {
    if (!currentUser) {
      seenNotificationIds.current = null;
      setNotifications({ items: [], unread_count: 0 });
      setNotifError('');
      setNotifOpen(false);
      watchlistReconciled.current = false;
      alertsFromBrowserRef.current = false;
      setWatchlistLoaded(false);
      return undefined;
    }
    refreshNotificationsRef.current?.();
    const timer = setInterval(() => refreshNotificationsRef.current?.(), 60000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshNotificationsRef.current?.();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [currentUser]);

  useEffect(() => {
    if (!notifOpen) return undefined;
    const onDown = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setNotifOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [notifOpen]);

  const openCentreDetails = async (centre) => {
    setSelectedCentre(centre);
    setDetailLoading(true);
    setDetailReviews([]);
    setMyCentreReview(null);
    setReviewRating(5);
    setReviewComment('');
    try {
      const reviewMineRequest = currentUser
        ? getMyReview(centre.id).catch(() => null)
        : Promise.resolve(null);
      const [detail, reviewData, mine] = await Promise.all([
        getCentreById(centre.id),
        getCentreReviews(centre.id),
        reviewMineRequest
      ]);
      setSelectedCentre(mapCentre({ ...centre, ...detail }));
      setDetailReviews(reviewData?.items || []);
      setMyCentreReview(mine);
      if (mine) {
        setReviewRating(Number(mine.rating) || 5);
        setReviewComment(mine.review_description || '');
      }
    } catch (error) {
      notify(`Could not load full centre details: ${error.message}`);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleReviewSubmit = async (event) => {
    event.preventDefault();
    if (!currentUser) {
      setAuthMode('login');
      notify('Please sign in before submitting a review.');
      return;
    }
    if (!selectedCentre?.id || reviewSaving) return;

    setReviewSaving(true);
    const payload = {
      rating: Number(reviewRating),
      review_description: reviewComment.trim() || null
    };
    try {
      const savedReview = myCentreReview?.review_id
        ? await updateReview(myCentreReview.review_id, payload)
        : await submitReview(selectedCentre.id, payload);
      setMyCentreReview(savedReview);
      const [reviewData, detail] = await Promise.all([
        getCentreReviews(selectedCentre.id),
        getCentreById(selectedCentre.id)
      ]);
      setDetailReviews(reviewData?.items || []);
      setSelectedCentre(mapCentre({ ...selectedCentre, ...detail }));
      notify(myCentreReview ? 'Your review has been updated.' : 'Thank you for sharing your review!');
    } catch (error) {
      notify(error.message?.includes('409')
        ? 'You have already reviewed this centre. Reopen the details to edit your review.'
        : `Could not save your review: ${error.message}`);
    } finally {
      setReviewSaving(false);
    }
  };

  const isAdmin =
    onboardingState.status === 'admin' ||
    currentUser?.email?.toLowerCase() === 'swetalakshita@gmail.com';
  const isOnboardingGated =
    Boolean(currentUser) && onboardingState.status !== 'ready' && !isAdmin;

  useEffect(() => {
    if (isOnboardingGated) {
      setSelectedCentre(null);
      setScoreInfoOpen(false);
    }
  }, [isOnboardingGated]);

  const openPage = (nextPage) => {
    if (isOnboardingGated) {
      notify('Please complete your family profile to access this feature.');
      setMobileOpen(false);
      return;
    }

    if (
      ['Preschool directory', 'My watchlist', 'Family profile', 'Find my matches'].includes(nextPage) &&
      !currentUser
    ) {
      setAuthMode('login');
      notify('Please sign in to access this feature.');
      setMobileOpen(false);
      return;
    }

    if (nextPage === 'Find my matches' && !profile) {
      setPage('Family profile');
      notify('Finish your family profile first. Matches are built from it.');
      setMobileOpen(false);
      return;
    }

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
        await signOut(auth);

        notify('Account created. Please verify your email before signing in.');
        setAuthMode('login');
        return;
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
      controller.cancel();
      resetSessionMode();
      await signOut(auth);
      setAuthMode('login');
      setPage('Overview');
      notify('You have signed out.');
    } catch (error) {
      notify(error.message);
    }
  };

  const handleBellClick = () => {
    if (!currentUser) {
      notify('Sign in to see vacancy alerts for your watchlist.');
      return;
    }
    setNotifOpen((open) => !open);
    refreshNotificationsRef.current?.();
  };

  const openNotification = async (n) => {
    setNotifOpen(false);
    openPage('My watchlist');
    if (n.is_read) return;
    setNotifications((prev) => ({
      items: prev.items.map((x) => (x.notification_id === n.notification_id ? { ...x, is_read: true } : x)),
      unread_count: Math.max(0, prev.unread_count - 1),
    }));
    if (isLocalAlert(n.notification_id)) {
      markLocalAlertsRead(currentUser?.uid, n.notification_id);
      return;
    }
    try { await markNotificationRead(n.notification_id); } catch (error) { console.warn(error.message); }
  };

  const readAllNotifications = async () => {
    setNotifications((prev) => ({ items: prev.items.map((x) => ({ ...x, is_read: true })), unread_count: 0 }));
    if (alertsFromBrowserRef.current) {
      markLocalAlertsRead(currentUser?.uid);
      return;
    }
    try { await markAllNotificationsRead(); } catch (error) { console.warn(error.message); }
  };

  const isSaved = (id) => saved.some((item) => Number(item) === Number(id));

  const toggleSaved = async (id) => {
  // Require sign-in before changing the watchlist.
  if (!currentUser) {
    setAuthMode('login');
    notify('Please sign in to add centres to your watchlist.');
    return;
  }

  const centreId = Number(id);
  const wasSaved = isSaved(centreId);

  const updatedSaved = wasSaved
    ? saved.filter((item) => Number(item) !== centreId)
    : [...saved, centreId];

  // Update local state.
  setSaved(updatedSaved);

  // Save to browser storage.
  try {
    localStorage.setItem(
      'kidcare-watchlist',
      JSON.stringify(updatedSaved)
    );
  } catch (error) {
    console.warn('Could not save watchlist locally:', error);
  }

  // Remove from comparison when a centre is unsaved.
  if (wasSaved) {
    setCompareSelectedIds((items) =>
      items.filter((item) => item !== String(centreId))
    );
  }

  notify(
    wasSaved ? 'Removed from watchlist' : 'Saved to watchlist!'
  );

  // Synchronise with the backend.
  try {
    if (wasSaved) {
      const existing = watchlistEntries.find(
        (entry) => Number(entry.centre_id) === centreId
      );

      if (existing) {
        await deleteWatchlist(existing.watchlist_id);

        setWatchlistEntries((items) =>
          items.filter(
            (entry) =>
              entry.watchlist_id !== existing.watchlist_id
          )
        );
      }
    } else {
      // The backend subscribes per centre + level + enrolment month, so send all three
      // (taken from the family profile, falling back to the level just matched).
      const level = profile?.level || matchRun?.level || 'n1';
      const month = String(profile?.enrolMonth || nextMonthValue()).slice(0, 7);
      const created = await createWatchlist({
        centre_id: centreId,
        level,
        enrollment_month_year: `${month}-01T00:00:00Z`
      });

      if (created) {
        setWatchlistEntries((items) => [...items, created]);
        // If this cohort already has a vacancy the backend raises an alert right away.
        await refreshNotificationsRef.current?.();
        // Reload entries so each one carries its current vacancy status, and tell the parent
        // exactly which level and month is being watched when nothing is open yet.
        try {
          const refreshed = await getMyWatchlist();
          const items = Array.isArray(refreshed) ? refreshed : (refreshed?.items || []);
          setWatchlistEntries(items);
          const entry = items.find((e) => e.watchlist_id === created.watchlist_id);
          if (entry && !isVacancyOpen(entry.current_vacancy_status)) {
            notify(
              `Watching ${levelLabel(entry.level)} · ${monthYear(entry.enrollment_month_year)} ` +
              `(${entry.current_vacancy_status || 'no vacancy data'}). We'll alert you when it opens.`,
              5000
            );
          }
        } catch { /* the alert itself does not depend on this */ }
      }
    }
  } catch (error) {
    // 409 means this centre is already on the backend watchlist, so nothing is wrong.
    if (String(error.message).startsWith('409')) {
      try {
        const refreshed = await getMyWatchlist();
        setWatchlistEntries(Array.isArray(refreshed) ? refreshed : (refreshed?.items || []));
      } catch { /* ignore */ }
      return;
    }
    console.warn(
      'Watchlist backend sync failed:',
      error.message
    );

    notify(`Watchlist sync failed: ${error.message}`);
  }
};
  // Priorities can be tweaked right on the matches page; results re-rank instantly
  // and the change is saved back to the family profile.
  const updateRank = (key, rank) => setWeights((current) => setRank(current, key, rank));

  useEffect(() => {
    if (!profile || !currentUser) return undefined;
    if (JSON.stringify(weights) === JSON.stringify(profile.weights)) return undefined;
    const timer = setTimeout(async () => {
      const next = { ...profile, weights };
      setProfile(next);
      setProfileForm((form) => ({ ...form, weights }));
      try { localStorage.setItem(profileKey(currentUser.uid), JSON.stringify(next)); } catch { /* ignore */ }
      if (profileId) {
        try { await updateFamilyProfile(profileId, toApiProfile(next, profileName)); }
        catch (error) { console.warn('Priority sync:', error.message); }
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [weights, profile, profileId, profileName, currentUser]);

  const filtered = useMemo(() => {
    return centres.filter((centre) => {
      const searchText =
        `${centre.name} ${centre.area} ${centre.address} ${centre.postal}`.toLowerCase();

      const matchesSearch = !query.trim() || searchText.includes(query.trim().toLowerCase());

      return matchesSearch;
    });
  }, [centres, query]);

  // Rank the fetched candidates. Sliders re-rank instantly; no refetch is needed.
  const ranked = useMemo(() => {
    if (!matchRun) return [];
    const anchors = [matchRun.home, matchRun.work];

    return matchCandidates
      .map(({ centre, detail }) => {
        const fee = feeFor(detail.services, matchRun.level, matchRun.citizenship);
        if (fee == null) return null; // no listed fee for this level/citizen type: can't score cost

        const vacancyResult = vacancyInfo(detail.vacancies, matchRun.level, matchRun.enrolMonth);
        const place = locationFit(centre.postal, anchors);
        const transport = Boolean(detail.transport_provided);

        const vacancyFit = vacancyResult.score;
        // Within budget: 100 down to 70 as the fee approaches the budget. Over budget: falls from 70.
        const costFit = fee <= budget
          ? Math.round(100 - 30 * (fee / budget))
          : Math.max(0, Math.round(70 * (budget / fee)));
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
      // Ties (common when a priority is set to 0%) are broken by overall balance, then cheaper fee,
      // so moving the sliders visibly reshuffles the list.
      .sort((a, b) =>
        b.score - a.score ||
        (b.vf + b.cf + b.tf) - (a.vf + a.cf + a.tf) ||
        a.fee - b.fee
      );
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
      let nearby = false;

      if (list.length < 15) {
        // Too few in the exact sectors: also look at the neighbouring sectors.
        const neighbours = new Set();
        sectors.forEach((sector) => {
          [Number(sector) - 1, Number(sector) + 1]
            .filter((n) => n >= 1 && n <= 82)
            .forEach((n) => neighbours.add(String(n).padStart(2, '0')));
        });
        sectors.forEach((sector) => neighbours.delete(sector));
        if (neighbours.size) {
          const extra = await loadCentresFor([...neighbours]);
          const known = new Set(list.map((item) => item.centre_id));
          list = [...list, ...extra.filter((item) => !known.has(item.centre_id))];
          nearby = true;
        }
      }

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

      setMatchRun({ level: matchForm.level, citizenship: matchForm.citizenship, home, work, enrolMonth: profile?.enrolMonth });
      setMatchCandidates(candidates);
      setMatchStatus('done');
      const withFee = candidates.filter(
        ({ detail }) => feeFor(detail.services, matchForm.level, matchForm.citizenship) != null
      ).length;
      const noFee = candidates.length - withFee;
      setMatchMessage(
        `${withFee} centre(s) with an open ${levelLabel(matchForm.level)} vacancy ` +
        (widened ? 'in your wider region' : nearby ? 'in and next to your postal sector' : 'in your postal sector') +
        (noFee ? ` (${noFee} more not ranked: no fee listed for this level and citizenship).` : '.')
      );
    } catch (error) {
      setMatchStatus('error');
      setMatchMessage(error.message || 'Could not load matches.');
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    if (!currentUser) {
      setAuthMode('login');
      notify('Please sign in to save your profile.');
      return;
    }
    if (controller.getState().status === 'saving') return;
    setProfileSaving(true);
    try {
      await controller.save(profileForm);
    } finally {
      setProfileSaving(false);
    }
  };

  // Matches run automatically from the saved profile.
  useEffect(() => {
    if (page === 'Find my matches' && profile && matchStatus === 'idle') runMatching();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, profile, matchStatus]);

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
    setSelectedDistricts([]);
    setLevel('');
  };

  const yesNo = (value) => (value == null ? 'Not provided' : value ? 'Yes' : 'No');

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
          {nav.filter((item) => item.label !== 'Admin dashboard' || isAdmin).map((item) => (
            <button
              key={item.label}
              className={`nav-item ${page === item.label ? 'active' : ''}`}
              onClick={() => openPage(item.label)}
              disabled={isOnboardingGated}
              style={isOnboardingGated ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
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
            Home <ChevronRight size={14} /> <b>{isOnboardingGated ? 'Onboarding' : page}</b>
          </div>
          <div className="top-actions">
            <span className="today-label">Your family's next big step starts here</span>
            <div className="notif-wrap" ref={notifRef}>
              <button
                className="icon-btn"
                onClick={handleBellClick}
                aria-label={notifications.unread_count ? `Notifications, ${notifications.unread_count} unread` : 'Notifications'}
                aria-expanded={notifOpen}
              >
                <Bell size={19} />
                {notifications.unread_count > 0 && (
                  <span className="notif-badge">{notifications.unread_count > 9 ? '9+' : notifications.unread_count}</span>
                )}
              </button>
              {notifOpen && (
                <NotificationPanel
                  items={notifications.items}
                  unread={notifications.unread_count}
                  error={notifError}
                  onOpen={openNotification}
                  onReadAll={readAllNotifications}
                />
              )}
            </div>
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

          {isOnboardingGated ? (
            <section className="onboarding-flow">
              {onboardingState.status === 'verification-required' && (
                <div className="panel onboarding-panel">
                  <div className="eyebrow"><Baby size={16} /> EMAIL VERIFICATION REQUIRED</div>
                  <h2>Verify your email address</h2>
                  <p className="lead">
                    We sent a verification link to <strong>{currentUser?.email}</strong>.
                    Please click the link in your email to verify your account, then sign in again.
                  </p>
                  <div className="onboarding-actions">
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={async () => {
                        try {
                          await sendEmailVerification(currentUser);
                          notify('Verification email sent! Check your inbox.');
                        } catch (err) {
                          notify(err.message);
                        }
                      }}
                    >
                      Resend verification email
                    </button>
                    <button type="button" className="secondary-btn" onClick={handleSignOut}>
                      <LogOut size={15} /> Sign out
                    </button>
                  </div>
                </div>
              )}

              {onboardingState.status === 'loading' && (
                <div className="panel onboarding-panel">
                  <div className="eyebrow"><Sparkles size={16} /> ONE MOMENT</div>
                  <h2>Loading your profile…</h2>
                  <p className="lead">Checking your family preferences and account details.</p>
                  <div className="onboarding-actions">
                    <button type="button" className="secondary-btn" onClick={handleSignOut}>
                      <LogOut size={15} /> Sign out
                    </button>
                  </div>
                </div>
              )}

              {onboardingState.status === 'error' && onboardingState.errorStage === 'load' && (
                <div className="panel onboarding-panel error-panel">
                  <div className="eyebrow"><CircleHelp size={16} /> COULD NOT LOAD PROFILE</div>
                  <h2>Unable to load family profile</h2>
                  <p className="lead">{onboardingState.error || 'A service error occurred while retrieving your profile.'}</p>
                  <div className="onboarding-actions">
                    <button type="button" className="primary-btn" onClick={() => controller.start(currentUser)}>
                      Try again
                    </button>
                    <button type="button" className="secondary-btn" onClick={handleSignOut}>
                      <LogOut size={15} /> Sign out
                    </button>
                  </div>
                </div>
              )}

              {(onboardingState.status === 'required' || onboardingState.status === 'saving' || (onboardingState.status === 'error' && onboardingState.errorStage === 'save')) && (
                <>
                  <PageTitle
                    eyebrow="REQUIRED FAMILY PROFILE SETUP"
                    title="Complete your family profile"
                    subtitle="Tell us once about your child, location and budget before entering KidCare Match. Matches and commute estimates are built from this profile."
                  />

                  {onboardingState.error && (
                    <div className="error-banner" role="alert">
                      <b>Could not save profile:</b> {onboardingState.error}
                      <span>Please check your details and try saving again.</span>
                    </div>
                  )}

                  <form className="profile-form panel" onSubmit={saveProfile}>
                    <div className="form-section">
                      <h3><Baby size={19} /> Child information</h3>
                      <div className="form-grid">
                        <label>Child's level
                          <select value={profileForm.level} onChange={(e) => setField('level', e.target.value)}>
                            {Object.entries(LEVEL_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                        </label>
                        <label>Citizenship (for fees)
                          <select value={profileForm.citizenship} onChange={(e) => setField('citizenship', e.target.value)}>
                            {Object.entries(CITIZENSHIP_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                        </label>
                        <label>Required care type
                          <select value={profileForm.service} onChange={(e) => setField('service', e.target.value)}>
                            <option>Full Day</option>
                            <option>Half Day</option>
                          </select>
                        </label>
                        <label>Desired enrolment month
                          <input type="month" value={profileForm.enrolMonth} onChange={(e) => setField('enrolMonth', e.target.value)} />
                        </label>
                      </div>
                    </div>

                    <div className="form-section">
                      <h3><MapPin size={19} /> Location</h3>
                      <div className="form-grid">
                        <label>Home postal code
                          <input
                            value={profileForm.home} maxLength={6} inputMode="numeric"
                            placeholder="6-digit postal code"
                            onChange={(e) => setField('home', e.target.value.replace(/\D/g, ''))}
                          />
                        </label>
                        <label>Workplace postal code (optional)
                          <input
                            value={profileForm.work} maxLength={6} inputMode="numeric"
                            placeholder="6-digit postal code"
                            onChange={(e) => setField('work', e.target.value.replace(/\D/g, ''))}
                          />
                        </label>
                        <label>Preferred location
                          <select value={profileForm.locationPref} onChange={(e) => setField('locationPref', e.target.value)}>
                            {Object.entries(LOCATION_PREF_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>

                    <div className="form-section">
                      <h3><Wallet size={19} /> Budget & priorities</h3>
                      <div className="form-grid">
                        <label>Monthly budget (SGD)
                          <input
                            type="number" min="1" value={profileForm.budget}
                            onChange={(e) => setField('budget', e.target.value)}
                          />
                        </label>
                        <label>Household members (optional)
                          <input
                            type="number" min="1" value={profileForm.members}
                            onChange={(e) => setField('members', e.target.value)}
                          />
                        </label>
                        <label>Gross monthly household income, SGD (optional)
                          <input
                            type="number" min="0" value={profileForm.income}
                            onChange={(e) => setField('income', e.target.value)}
                          />
                        </label>
                      </div>

                      <div className="weight-title">
                        <h4 className="title-with-help">What matters most? <button
                          type="button"
                          className="info-btn small"
                          aria-label="How match scores work"
                          aria-haspopup="dialog"
                          onClick={() => setScoreInfoOpen(true)}
                        >
                          <CircleHelp size={12} />
                        </button></h4><span>Rank 1 = 50% · 2 = 35% · 3 = 15%</span>
                      </div>
                      <PriorityRanking weights={profileForm.weights} onChange={updateProfileRank} />
                    </div>

                    <div className="form-footer">
                      <span className="fine-print">
                        Saved to your account and confirmed by the server before proceeding.
                      </span>
                      <div className="form-footer-buttons">
                        <button type="button" className="secondary-btn" onClick={handleSignOut}>
                          <LogOut size={15} /> Sign out
                        </button>
                        <button type="submit" className="primary-btn" disabled={onboardingState.status === 'saving'}>
                          {onboardingState.status === 'saving' ? 'Saving…' : 'Save profile'} <Check size={16} />
                        </button>
                      </div>
                    </div>
                  </form>
                </>
              )}
            </section>
          ) : (
            <>
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
                <DistrictMultiSelect
                  districts={districts}
                  selected={selectedDistricts}
                  onChange={(next) => { setSelectedDistricts(next); setPageOffset(0); }}
                />
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
                    <div><h3>Your family profile</h3><p>Details come from your profile. Adjust priorities here.</p></div>
                  </div>

                  {profile ? (
                    <>
                      <dl className="profile-summary">
                        <div><dt>Child's level</dt><dd>{levelLabel(profile.level)}</dd></div>
                        <div><dt>Citizenship (for fees)</dt><dd>{CITIZENSHIP_LABELS[profile.citizenship]}</dd></div>
                        <div><dt>Home postal code</dt><dd>{profile.home}</dd></div>
                        <div><dt>Workplace postal code</dt><dd>{profile.work || 'Not set'}</dd></div>
                        <div><dt>Monthly budget</dt><dd>${profile.budget}</dd></div>
                        <div><dt>Enrolment month</dt><dd>{profile.enrolMonth}</dd></div>
                      </dl>

                      <div className="weight-title">
                        <h4 className="title-with-help">What matters most? <button
                      type="button"
                      className="info-btn small"
                      aria-label="How match scores work"
                      aria-haspopup="dialog"
                      onClick={() => setScoreInfoOpen(true)}
                    >
                      <CircleHelp size={12} />
                    </button></h4><span>Rank 1 = 50% · 2 = 35% · 3 = 15%</span>
                      </div>
                      <PriorityRanking weights={weights} onChange={updateRank} />

                      <button
                        className="primary-btn full"
                        onClick={runMatching}
                        disabled={matchStatus === 'loading'}
                      >
                        {matchStatus === 'loading' ? 'Finding matches…' : 'Refresh my matches'} <Sparkles size={16} />
                      </button>
                      <button className="secondary-btn full" style={{ marginTop: 9 }} onClick={() => openPage('Family profile')}>
                        Edit family profile
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="fine-print" style={{ fontSize: 12, marginTop: 0 }}>
                        Complete your family profile once and we will use it to rank centres here.
                      </p>
                      <button className="primary-btn full" onClick={() => openPage('Family profile')}>
                        Complete your profile <ChevronRight size={16} />
                      </button>
                    </>
                  )}
                  <p className="fine-print">
                    Travel fit uses postal codes (same postal sector or region), not travel time, and counts
                    as full marks if the centre provides transport. Fees are before subsidy.
                  </p>
                </section>

                <section className="results-panel">
                  <div className="results-top">
                    <div>
                      <div className="eyebrow">YOUR SHORTLIST</div>
                      <h2>Top matches for your family</h2>
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

                      {watchlistEntries
                        .filter((e) => Number(e.centre_id) === Number(centre.id))
                        .map((e) => (
                          isVacancyOpen(e.current_vacancy_status)
                            ? (
                              <p className="vacancy-open" key={e.watchlist_id}>
                                <Check size={13} /> Vacancy open · {levelLabel(e.level)} · {monthYear(e.enrollment_month_year)}
                              </p>
                            ) : (
                              <p className="vacancy-watching" key={e.watchlist_id}>
                                Watching {levelLabel(e.level)} · {monthYear(e.enrollment_month_year)}
                                {' '}({e.current_vacancy_status || 'no vacancy data'})
                              </p>
                            )
                        ))}

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

              {!profile && (
                <div className="notice">
                  <Sparkles size={18} />
                  <div>
                    <b>Let's finish setting up your profile</b>
                    <p>Tell us once about your child, location and budget. We use it to find your matches, so there is nothing else to fill in.</p>
                  </div>
                </div>
              )}

              <form className="profile-form panel" onSubmit={saveProfile}>
                <div className="form-section">
                  <h3><Baby size={19} /> Child information</h3>
                  <div className="form-grid">
                    <label>Child's level
                      <select value={profileForm.level} onChange={(e) => setField('level', e.target.value)}>
                        {Object.entries(LEVEL_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                    <label>Citizenship (for fees)
                      <select value={profileForm.citizenship} onChange={(e) => setField('citizenship', e.target.value)}>
                        {Object.entries(CITIZENSHIP_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                    <label>Required care type
                      <select value={profileForm.service} onChange={(e) => setField('service', e.target.value)}>
                        <option>Full Day</option>
                        <option>Half Day</option>
                      </select>
                    </label>
                    <label>Desired enrolment month
                      <input type="month" value={profileForm.enrolMonth} onChange={(e) => setField('enrolMonth', e.target.value)} />
                    </label>
                  </div>
                </div>

                <div className="form-section">
                  <h3><MapPin size={19} /> Location</h3>
                  <div className="form-grid">
                    <label>Home postal code
                      <input
                        value={profileForm.home} maxLength={6} inputMode="numeric"
                        placeholder="6-digit postal code"
                        onChange={(e) => setField('home', e.target.value.replace(/\D/g, ''))}
                      />
                    </label>
                    <label>Workplace postal code (optional)
                      <input
                        value={profileForm.work} maxLength={6} inputMode="numeric"
                        placeholder="6-digit postal code"
                        onChange={(e) => setField('work', e.target.value.replace(/\D/g, ''))}
                      />
                    </label>
                    <label>Preferred location
                      <select value={profileForm.locationPref} onChange={(e) => setField('locationPref', e.target.value)}>
                        {Object.entries(LOCATION_PREF_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="form-section">
                  <h3><Wallet size={19} /> Budget & priorities</h3>
                  <div className="form-grid">
                    <label>Monthly budget (SGD)
                      <input
                        type="number" min="1" value={profileForm.budget}
                        onChange={(e) => setField('budget', e.target.value)}
                      />
                    </label>
                    <label>Household members (optional)
                      <input
                        type="number" min="1" value={profileForm.members}
                        onChange={(e) => setField('members', e.target.value)}
                      />
                    </label>
                    <label>Gross monthly household income, SGD (optional)
                      <input
                        type="number" min="0" value={profileForm.income}
                        onChange={(e) => setField('income', e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="weight-title">
                    <h4 className="title-with-help">What matters most? <button
                      type="button"
                      className="info-btn small"
                      aria-label="How match scores work"
                      aria-haspopup="dialog"
                      onClick={() => setScoreInfoOpen(true)}
                    >
                      <CircleHelp size={12} />
                    </button></h4><span>Rank 1 = 50% · 2 = 35% · 3 = 15%</span>
                  </div>
                  <PriorityRanking weights={profileForm.weights} onChange={updateProfileRank} />
                </div>

                <div className="form-footer">
                  <span className="fine-print">
                    Saved to your account and used by Find my matches. Travel is scored from postal codes, not commute time.
                  </span>
                  <button type="submit" className="primary-btn" disabled={profileSaving || onboardingState.status === 'saving'}>
                    {profileSaving || onboardingState.status === 'saving' ? 'Saving…' : 'Save profile'} <Check size={16} />
                  </button>
                </div>
              </form>
            </>
          )}

          {page === 'Admin dashboard' && (
            isAdmin
              ? <AdminDashboard />
              : <section className="panel"><h2>Administrator access required</h2><p>Sign in with the authorised administrator account to access this area.</p><button className="primary-btn" onClick={() => { setPage('Overview'); setAuthMode('login'); }}>Sign in</button></section>
          )}
            </>
          )}
        </div>

        <footer className="footer">
          <span>© 2026 KidCare Match SG</span>
          <span>Made with care for Singapore families <Heart size={13} /></span>
        </footer>
      </main>

      {scoreInfoOpen && !isOnboardingGated && (
        <div className="modal-backdrop" onClick={() => setScoreInfoOpen(false)}>
          <section
            className="info-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="score-info-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button className="modal-close" aria-label="Close" onClick={() => setScoreInfoOpen(false)}>
              <X size={19} />
            </button>
            <div className="eyebrow">HOW IT WORKS</div>
            <h2 id="score-info-title">How your match score is calculated</h2>

            <div className="info-item">
              <h3>1. Vacancy Fit</h3>
              <p>Measures how well a centre's reported vacancies match your child's required care programme and preferred enrolment month.</p>
              <p className="info-note">A higher score means a better vacancy match, not guaranteed admission.</p>
            </div>
            <div className="info-item">
              <h3>2. Cost Fit</h3>
              <p>Compares the estimated monthly childcare fee, after applicable subsidies where available, with your preferred budget. Centres within your budget receive a higher score, while centres exceeding your budget receive a lower score.</p>
            </div>
            <div className="info-item">
              <h3>3. Travel Fit</h3>
              <p>Measures how convenient a childcare centre is based on your home location, workplace location and preferred transport mode. Centres with shorter estimated commute times and less additional travel receive higher scores.</p>
            </div>
            <div className="info-item overall">
              <h3>Overall Match Score</h3>
              <p>Your overall match score combines Vacancy Fit, Cost Fit and Travel Fit based on how you rank them: your rank 1 counts for 50%, rank 2 for 35% and rank 3 for 15%.</p>
            </div>

            <button className="primary-btn full" onClick={() => setScoreInfoOpen(false)}>Got it</button>
          </section>
        </div>
      )}

      {selectedCentre && !isOnboardingGated && (
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
                <CentreCommute
                  centre={selectedCentre}
                  currentUser={currentUser}
                  profileId={profileId}
                  profileLocationKey={`${profile?.home || ''}:${profile?.work || ''}`}
                  onSignIn={() => setAuthMode('login')}
                  onEditProfile={() => {
                    setSelectedCentre(null);
                    openPage('Family profile');
                  }}
                />
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
                <section className="parent-reviews" aria-labelledby="parent-reviews-title">
                  <div className="parent-reviews-heading">
                    <div>
                      <span className="review-eyebrow">PARENT VOICES</span>
                      <h3 id="parent-reviews-title">What parents are saying</h3>
                    </div>
                    <div className="review-summary-card">
                      <strong>{selectedCentre.review_summary?.average_rating != null
                        ? Number(selectedCentre.review_summary.average_rating).toFixed(1)
                        : '—'}</strong>
                      <span className="review-summary-stars" aria-label={`${selectedCentre.review_summary?.average_rating ?? 0} out of 5 stars`}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star key={star} size={14} fill={star <= Math.round(Number(selectedCentre.review_summary?.average_rating || 0)) ? 'currentColor' : 'none'} />
                        ))}
                      </span>
                      <small>{selectedCentre.review_summary?.total_reviews ?? 0} reviews</small>
                    </div>
                  </div>

                  {detailReviews.length ? (
                    <div className="parent-review-list">
                      {detailReviews.map((review) => (
                        <article className="parent-review-card" key={review.review_id}>
                          <div className="parent-review-avatar" aria-hidden="true">P</div>
                          <div className="parent-review-body">
                            <div className="parent-review-meta">
                              <div>
                                <b>Parent</b>
                                <small>{review.created_at ? new Date(review.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Community review'}</small>
                              </div>
                              <div className="parent-review-stars" aria-label={`${review.rating} out of 5 stars`}>
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <Star key={star} size={15} fill={star <= Number(review.rating) ? 'currentColor' : 'none'} />
                                ))}
                              </div>
                            </div>
                            <p>{review.comment || review.review_description || 'Parent shared a rating without a written comment.'}</p>
                            

                          </div>
                        </article>
                      ))}


                    </div>
                  ) : (
                    <div className="reviews-empty-state">
                      <div className="reviews-empty-icon"><Star size={20} /></div>
                      <b>Be the first to share your experience</b>
                      <p>No parent reviews have been published for this centre yet.</p>
                    </div>
                  )}

                  <div className="write-review-panel">
                    <div className="write-review-heading">
                      <div>
                        <h4>{myCentreReview ? 'Update your review' : 'Share your experience'}</h4>
                        <p>Your feedback can help another family make a confident choice.</p>
                      </div>
                      <MessageCircleIcon />
                    </div>
                    {currentUser ? (
                      <form className="parent-review-form" onSubmit={handleReviewSubmit}>
                        <label>How would you rate this preschool?</label>
                        <div className="rating-picker" role="radiogroup" aria-label="Choose a rating from one to five stars">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              className={star <= reviewRating ? 'rating-star selected' : 'rating-star'}
                              aria-label={`${star} star${star === 1 ? '' : 's'}`}
                              aria-pressed={reviewRating === star}
                              onClick={() => setReviewRating(star)}
                            >
                              <Star size={27} fill={star <= reviewRating ? 'currentColor' : 'none'} />
                            </button>
                          ))}
                          <span>{reviewRating} out of 5</span>
                        </div>
                        <label htmlFor="parent-review-comment">Your review <span>(optional)</span></label>
                        <textarea
                          id="parent-review-comment"
                          value={reviewComment}
                          onChange={(event) => setReviewComment(event.target.value)}
                          maxLength={1000}
                          placeholder="What did you like about the teachers, facilities or your child's experience?"
                        />
                        <div className="review-form-footer">
                          <small>{reviewComment.length}/1000 characters · One review per centre per parent</small>
                          <button className="primary-btn" type="submit" disabled={reviewSaving}>
                            <Send size={14} /> {reviewSaving ? 'Submitting…' : myCentreReview ? 'Update review' : 'Submit review'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="review-signin-prompt">
                        <p>Sign in to share a rating and review for this preschool.</p>
                        <button className="primary-btn" type="button" onClick={() => setAuthMode('login')}>Sign in to review</button>
                      </div>
                    )}
                  </div>
                </section>
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

function MessageCircleIcon() { return <MessageCircle size={20} aria-hidden="true" />; }

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
