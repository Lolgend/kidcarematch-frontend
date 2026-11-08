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
import MatchesCommute, { MatchCommuteSummary } from './commute/MatchesCommute.jsx';
import ComparisonCommuteTable from './commute/ComparisonCommuteTable.jsx';
import CompareIdentityStatus from './CompareIdentityStatus.jsx';
import { getProfileCommuteContextKey } from './commute/commuteSession.js';
import { resetSessionMode } from './commute/commuteSession';
import CentreLocationMap from './commute/CentreLocationMap';
import { centreDetailsPath, centreIdFromPath } from './centreDetailsRoute';
import { claimCentreReturnTab, clearCentreReturnContext, hasCentreReturnAccount, loadCentreReturnContext, normalizeCentreComparisonContext, protectCentreReturnQuery, restoreCentreReturnQuery, saveCentreReturnContext } from './centreReturnContext';
import {
  getCentres,
  matchCentres,
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
  normalizeWeights,
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

const CENTRE_ORIGIN_PAGES = new Set([
  'Overview', 'Preschool directory', 'Find my matches', 'My watchlist', 'Compare centres', 'Family profile',
]);

function permittedCentreOriginPage(context, currentUser, onboardingState, profile) {
  if (!CENTRE_ORIGIN_PAGES.has(context?.page)) return null;
  if (context.page === 'Overview') return 'Overview';
  if (!currentUser) return null;
  const ready = ['ready', 'admin'].includes(onboardingState.status) ||
    currentUser.email?.toLowerCase() === 'swetalakshita@gmail.com';
  if (!ready) return null;
  if (context.page === 'Find my matches' && !profile) return null;
  return context.page;
}

function focusCentreOriginControl(origin) {
  let attempts = 0;
  const focus = () => {
    const control = origin.focusCentreId
      ? document.querySelector(`[data-centre-id="${CSS.escape(String(origin.focusCentreId))}"]`)
      : null;
    if (control && !control.disabled) {
      control.focus();
      if (document.activeElement === control) return;
    }
    if (attempts++ < 20) window.setTimeout(focus, 50);
  };
  focus();
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

function ImportanceRatings({ ratings, onChange }) {
  return (
    <>
      {WEIGHT_KEYS.map((key) => {
        return (
          <label className="rank-row importance-row" key={key}>
            <span>{WEIGHT_LABELS[key]}</span>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={ratings[key]}
              onChange={(e) => onChange(key, Number(e.target.value))}
              aria-label={WEIGHT_LABELS[key]}
              aria-valuetext={`${ratings[key]} out of 5`}
            />
            <output>{ratings[key]}</output>
          </label>
        );
      })}
      <p className="fine-print rank-note importance-guidance">1 = least important; 5 = most important. Ratings can tie. Matching weights are proportional to each rating's share of the total.</p>
    </>
  );
}

export function App() {
  const [centres, setCentres] = useState([]);
  const [centresLoading, setCentresLoading] = useState(true);
  const [centresError, setCentresError] = useState('');
  const [guestPreviewIds, setGuestPreviewIds] = useState([]);
  const [guestPreviewStatus, setGuestPreviewStatus] = useState('loading');
  const [centreSummary, setCentreSummary] = useState(null);
  const [selectedCentre, setSelectedCentre] = useState(null);

  const [watchlistEntries, setWatchlistEntries] = useState([]);
  // Saved centres that aren't in the currently loaded list are fetched by id and cached here.
  const [fetchedCentres, setFetchedCentres] = useState({});
  const requestedIds = useRef(new Set());
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const detailRequestRef = useRef(0);
  const activeAccountIdRef = useRef(null);
  const invalidateCentreDetailRequests = () => {
    detailRequestRef.current += 1;
    setDetailLoading(false);
    setMyReviewLoading(false);
    setReviewSaving(false);
    setMyCentreReview(null);
    setMyReviewError('');
    setMyReviewKnown(false);
    myReviewBaselineRef.current = null;
    setReviewRating(5);
    setReviewComment('');
  };
  const reviewsSectionRef = useRef(null);
  const [detailReviews, setDetailReviews] = useState([]);
  const [detailReviewsLoading, setDetailReviewsLoading] = useState(false);
  const [detailReviewsError, setDetailReviewsError] = useState('');
  const [myCentreReview, setMyCentreReview] = useState(null);
  const [myReviewLoading, setMyReviewLoading] = useState(false);
  const [myReviewError, setMyReviewError] = useState('');
  const [myReviewKnown, setMyReviewKnown] = useState(false);
  const myReviewBaselineRef = useRef(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [pageOffset, setPageOffset] = useState(0);
  const [totalCentres, setTotalCentres] = useState(0);
  const [currentUser, setCurrentUser] = useState(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [page, setPage] = useState('Overview');
  const centreReturnRestoredRef = useRef(false);
  const centreReturnOriginRef = useRef(null);
  const pendingCentreOriginRestoreRef = useRef(null);
  const activeIdentityRef = useRef(undefined);
  const deliberateSignInRef = useRef(false);
  const [returnContextReady, setReturnContextReady] = useState(false);

  // Hooks must live inside the component (this was at module level before).
  const [compareSelectedIds, setCompareSelectedIdsState] = useState([]);
  const compareSelectionGenerationRef = useRef(0);
  const setCompareSelectedIds = (nextIds) => {
    compareSelectionGenerationRef.current += 1;
    setCompareSelectedIdsState(nextIds);
  };
  const [compareStep, setCompareStep] = useState('selection');
  const [compareSelectionScrollY, setCompareSelectionScrollY] = useState(0);
  const pendingComparisonScrollRef = useRef(null);
  const [compareQuery, setCompareQuery] = useState('');
  const [compareDistricts, setCompareDistricts] = useState([]);
  const [compareWatchlistOnly, setCompareWatchlistOnly] = useState(false);
  const [compareDirectoryCentres, setCompareDirectoryCentres] = useState([]);
  const [compareDirectoryStatus, setCompareDirectoryStatus] = useState('idle');
  const [compareDirectoryError, setCompareDirectoryError] = useState('');
  const [compareDirectoryReload, setCompareDirectoryReload] = useState(0);
  const [compareIdentityStatus, setCompareIdentityStatus] = useState({});
  const compareIdentityRequestsRef = useRef(new Map());
  const [compareIdentityReload, setCompareIdentityReload] = useState(0);

  const [saved, setSaved] = useState([]);

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

  useEffect(() => {
    const claim = claimCentreReturnTab();
    claim.ready.then((ready) => setReturnContextReady(ready));
    return () => claim.dispose();
  }, []);

  useEffect(() => {
    if (!authResolved || !currentUser) return;
    if (hasCentreReturnAccount(currentUser.uid)) return;
    // A sign-out or account switch must not leave another viewer's return state in this tab.
    centreReturnOriginRef.current = null;
    clearCentreReturnContext();
  }, [authResolved, currentUser?.uid]);

  const [compareDetails, setCompareDetails] = useState({});
  const [compareDetailRetries, setCompareDetailRetries] = useState({});
  const compareDetailRequestRef = useRef(0);
  const compareDetailSelectionKeyRef = useRef('');
  const compareDetailSelectionGenerationRef = useRef(0);
  const renderedCompareSelectionKey = compareSelectedIds.map(String).join('\u0000');
  if (compareDetailSelectionKeyRef.current !== renderedCompareSelectionKey) {
    compareDetailSelectionKeyRef.current = renderedCompareSelectionKey;
    compareDetailSelectionGenerationRef.current += 1;
  }
  const [budget, setBudget] = useState(750);
  const [matchForm, setMatchForm] = useState({ level: 'n1', citizenship: 'SC', home: '', work: '' });
  const [matchRun, setMatchRun] = useState(null); // the inputs the current results were fetched for
  const [restoredMatchSnapshot, setRestoredMatchSnapshot] = useState(null);
  const matchRestoreGenerationRef = useRef(0);
  const [matchCandidates, setMatchCandidates] = useState([]);
  const [matchStatus, setMatchStatus] = useState('idle'); // idle | ready | loading | done | error
  const [matchMessage, setMatchMessage] = useState('');
  const matchRequestGenerationRef = useRef(0);
  const ratingEditGenerationRef = useRef(0);
  const profileWriteQueueRef = useRef(Promise.resolve());
  const ratingSaveQueueRef = useRef({ uid: null, count: 0 });
  const [ratingSaveStatus, setRatingSaveStatus] = useState('idle'); // idle | saving | error
  const [ratingSaveMessage, setRatingSaveMessage] = useState('');
  useEffect(() => {
    if (selectedCentre || centresLoading) return;
    const origin = pendingCentreOriginRestoreRef.current;
    if (!origin) return;
    if (normalizeCentreComparisonContext(origin)) {
      pendingCentreOriginRestoreRef.current = null;
      return;
    }
    if (origin.page === 'Find my matches' && matchStatus === 'loading') return;
    const control = origin.focusCentreId
      ? document.querySelector(`[data-centre-id="${CSS.escape(String(origin.focusCentreId))}"]`)
      : null;
    if (origin.focusCentreId && !control) return;
    pendingCentreOriginRestoreRef.current = null;
    window.setTimeout(() => {
      window.scrollTo(0, Math.max(0, Number(origin.scrollY) || 0));
      focusCentreOriginControl(origin);
    }, 50);
  }, [centresLoading, matchCandidates, matchStatus, page, selectedCentre]);
  const [weights, setWeights] = useState({ ...PROFILE_DEFAULTS.weights });
  const latestWeightsRef = useRef(weights);
  latestWeightsRef.current = weights;
  const [scoreInfoOpen, setScoreInfoOpen] = useState(false);
  useEffect(() => {
    if (!scoreInfoOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setScoreInfoOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scoreInfoOpen]);
  const [toast, setToast] = useState('');
  const [profile, setProfile] = useState(null); // the saved family profile (null = not set up yet)
  const latestSavedProfileRef = useRef(profile);
  latestSavedProfileRef.current = profile;
  const [profileId, setProfileId] = useState(null);
  const [profileName, setProfileName] = useState('My family profile');
  const [profileForm, setProfileForm] = useState(() => ({ ...PROFILE_DEFAULTS, enrolMonth: nextMonthValue() }));
  const [profileSaving, setProfileSaving] = useState(false);
  const setField = (key, value) => {
    ratingEditGenerationRef.current += 1;
    setProfileForm((current) => ({ ...current, [key]: value }));
  };
  const updateProfileRating = (key, rating) => {
    ratingEditGenerationRef.current += 1;
    setProfileForm((current) => ({ ...current, weights: { ...current.weights, [key]: rating } }));
  };

  // Push the saved profile into the matching engine's inputs.
  const applyProfileToMatching = (p) => {
    matchRequestGenerationRef.current += 1;
    setMatchForm({ level: p.level, citizenship: p.citizenship, home: p.home, work: p.work || '' });
    setBudget(Number(p.budget));
    setWeights(p.weights);
    setRestoredMatchSnapshot(null);
    setMatchRun(null);
    setMatchCandidates([]);
    setMatchStatus('idle');
    setMatchMessage('');
  };

  const restoreMatchingOrigin = (origin) => {
    setRestoredMatchSnapshot(origin.matchSnapshot);
    setMatchStatus('loading');
  };

  const restoreCentreOriginState = (origin, restoredPage) => {
    setPage(restoredPage);
    setQuery(restoreCentreReturnQuery(origin, profile));
    setSelectedDistricts(Array.isArray(origin.districts) ? origin.districts : []);
    setLevel(origin.level || '');
    setPageOffset(Number(origin.pageOffset) || 0);
    const comparisonContext = normalizeCentreComparisonContext(origin);
    if (comparisonContext) {
      setCompareSelectedIds(comparisonContext.compareSelectedIds);
      setCompareStep(comparisonContext.compareStep);
      setCompareSelectionScrollY(comparisonContext.compareSelectionScrollY);
      pendingComparisonScrollRef.current = { step: comparisonContext.compareStep, scrollY: comparisonContext.compareScrollY };
      setCompareQuery(restoreCentreReturnQuery({ query: comparisonContext.compareQuery }, profile));
      setCompareDistricts(comparisonContext.compareDistricts);
      setCompareWatchlistOnly(comparisonContext.compareWatchlistOnly);
    } else if (restoredPage === 'Compare centres') {
      setCompareSelectedIds([]);
      setCompareStep('selection');
      setCompareQuery('');
      setCompareDistricts([]);
      setCompareWatchlistOnly(false);
    }
    if (restoredPage === 'Find my matches' && (Array.isArray(origin.matchSnapshot) || Array.isArray(origin.matchSnapshot?.results))) {
      restoreMatchingOrigin(origin);
    }
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

  useEffect(() => {
    if (!authResolved || !returnContextReady || centreReturnRestoredRef.current) return;
    if (deliberateSignInRef.current && !centreIdFromPath(window.location.pathname)) {
      centreReturnRestoredRef.current = true;
      return;
    }
    if (currentUser && onboardingState.status === 'loading') return;
    const historyState = window.history.state || {};
    const contextId = historyState.centreOriginId || historyState.centreComparisonContextId;
    const context = loadCentreReturnContext(currentUser?.uid || null, contextId);
    if (!context) {
      centreReturnRestoredRef.current = true;
      return;
    }
    centreReturnOriginRef.current = context;
    const restoredPage = permittedCentreOriginPage(context, currentUser, onboardingState, profile);
    if (!restoredPage) {
      setPage('Overview');
      centreReturnRestoredRef.current = true;
      return;
    }
    restoreCentreOriginState(context, restoredPage);
    centreReturnRestoredRef.current = true;
    const comparisonContext = normalizeCentreComparisonContext(context);
    const scrollY = comparisonContext?.compareScrollY ?? (Number(context.scrollY) || 0);
    if (comparisonContext) {
      pendingComparisonScrollRef.current = { step: comparisonContext.compareStep, scrollY };
    } else {
      window.requestAnimationFrame(() => window.scrollTo(0, Math.max(0, scrollY)));
    }
  }, [authResolved, currentUser?.uid, onboardingState.status, profile, returnContextReady]);

  useEffect(() => {
    if (!authResolved || !returnContextReady || page !== 'Compare centres' || selectedCentre ||
        centreIdFromPath(window.location.pathname) ||
        !permittedCentreOriginPage({ page }, currentUser, onboardingState, profile)) return undefined;
    const pendingScroll = pendingComparisonScrollRef.current;
    const restorationPending = pendingScroll?.step === compareStep;
    persistComparisonSnapshot(compareStep, restorationPending ? pendingScroll.scrollY : window.scrollY);
    let timer = null;
    const onScroll = () => {
      if (pendingComparisonScrollRef.current?.step === compareStep) return;
      if (compareStep === 'selection') setCompareSelectionScrollY(window.scrollY);
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => persistComparisonSnapshot(compareStep, window.scrollY), 120);
    };
    const onPageHide = () => {
      if (timer !== null) window.clearTimeout(timer);
      if (activeAccountIdRef.current !== (currentUser?.uid || null)) return;
      const pending = pendingComparisonScrollRef.current;
      persistComparisonSnapshot(compareStep, pending?.step === compareStep ? pending.scrollY : window.scrollY);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', onPageHide);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [authResolved, returnContextReady, page, selectedCentre, currentUser?.uid, onboardingState.status,
    profile, compareStep, compareQuery, compareDistricts, compareWatchlistOnly, compareSelectedIds, compareSelectionScrollY]);

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
        const uid = activeAccountIdRef.current;
        const write = profileWriteQueueRef.current.then(async () => {
          if (uid !== activeAccountIdRef.current) return null;
          const response = await updateFamilyProfile(id, payload);
          if (uid === activeAccountIdRef.current) {
            latestSavedProfileRef.current = fromApiProfile(response || payload, latestSavedProfileRef.current || PROFILE_DEFAULTS);
          }
          return response;
        });
        profileWriteQueueRef.current = write.catch(() => undefined);
        return await write;
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
      if (deliberateSignInRef.current) {
        deliberateSignInRef.current = false;
        if (!centreIdFromPath(window.location.pathname)) setPage('Overview');
      }
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
      deliberateSignInRef.current = false;
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
  const centreHeadingRef = useRef(null);
  const cancelledCentreHistoryPopRef = useRef(false);
  const historyEntryIndexRef = useRef(null);
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
    let cancelled = false;
    getCentres({ limit: 6, offset: 0 })
      .then((data) => {
        const items = Array.isArray(data) ? data : data?.items;
        if (!Array.isArray(items)) throw new Error('Unexpected guest preview response.');
        if (!cancelled) {
          setGuestPreviewIds(items.slice(0, 6)
            .filter((centre) => centre?.id != null || centre?.centre_id != null)
            .map((centre) => String(centre.id ?? centre.centre_id)));
          setGuestPreviewStatus('ready');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGuestPreviewIds([]);
          setGuestPreviewStatus('error');
        }
      });
    return () => { cancelled = true; };
  }, []);

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

      const nextIdentity = user?.uid || null;
      const previousIdentity = activeIdentityRef.current;
      if (previousIdentity !== nextIdentity) {
        activeIdentityRef.current = nextIdentity;
        compareSelectionGenerationRef.current += 1;
        compareIdentityRequestsRef.current.clear();
        setSaved([]);
        setCompareSelectedIds([]);
        setCompareStep('selection');
        setCompareSelectionScrollY(0);
        pendingComparisonScrollRef.current = null;
        setCompareQuery('');
        setCompareDistricts([]);
        setCompareWatchlistOnly(false);
        setCompareIdentityStatus({});
        setMatchRun(null);
        setMatchCandidates([]);
        setRestoredMatchSnapshot(null);
        matchRestoreGenerationRef.current += 1;
        matchRequestGenerationRef.current += 1;
        ratingEditGenerationRef.current += 1;
        ratingSaveQueueRef.current = { uid: nextIdentity, count: 0 };
        setRatingSaveStatus('idle');
        setRatingSaveMessage('');
        setMatchStatus('idle');
        setMatchMessage('');
        setQuery('');
        setSelectedDistricts([]);
        setLevel('');
        setPageOffset(0);
        if (previousIdentity !== undefined) {
          clearCentreReturnContext();
          centreReturnOriginRef.current = null;
          pendingCentreOriginRestoreRef.current = null;
          centreReturnRestoredRef.current = false;
          setSelectedCentre(null);
          setWatchlistEntries([]);
          setPage('Overview');
          resetSessionMode();
        }
        try { localStorage.removeItem('kidcare-watchlist'); } catch { /* storage may be disabled */ }
      }

      const nextAccountId = user?.uid == null ? null : String(user.uid);
      const accountChanged = activeAccountIdRef.current !== nextAccountId;
      activeAccountIdRef.current = nextAccountId;
      if (accountChanged) {
        detailRequestRef.current += 1;
        setDetailLoading(false);
        setDetailError('');
        setDetailReviews([]);
        setDetailReviewsLoading(false);
        setDetailReviewsError('');
        setMyCentreReview(null);
        setMyReviewLoading(false);
        setMyReviewError('');
        setMyReviewKnown(false);
        myReviewBaselineRef.current = null;
        setReviewRating(5);
        setReviewComment('');
        setReviewSaving(false);
      }

      setCurrentUser(user);
      setAuthResolved(true);

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

  const ensureHistoryEntryIndex = () => {
    const currentState = window.history.state || {};
    if (Number.isSafeInteger(currentState.centreHistoryIndex)) {
      historyEntryIndexRef.current = currentState.centreHistoryIndex;
      return currentState.centreHistoryIndex;
    }
    const index = Number.isSafeInteger(historyEntryIndexRef.current) ? historyEntryIndexRef.current : 0;
    window.history.replaceState({ ...currentState, centreHistoryIndex: index }, '', window.location.href);
    historyEntryIndexRef.current = index;
    return index;
  };

  const pushHistoryEntry = (state, path) => {
    window.history.scrollRestoration = 'manual';
    const index = ensureHistoryEntryIndex() + 1;
    window.history.pushState({ ...state, centreHistoryIndex: index }, '', path);
    historyEntryIndexRef.current = index;
    return index;
  };

  const comparisonReturnSnapshot = (step = compareStep, scrollY = window.scrollY, selectionScrollY = compareSelectionScrollY) => ({
    version: 1,
    uid: currentUser?.uid || null,
    returnPath: window.location.pathname,
    page: 'Compare centres',
    compareStep: step,
    compareQuery: protectCentreReturnQuery(compareQuery, profile),
    compareDistricts: [...compareDistricts],
    compareWatchlistOnly,
    compareSelectedIds: [...compareSelectedIds],
    compareScrollY: Math.max(0, Number(scrollY) || 0),
    compareSelectionScrollY: Math.max(0, Number(step === 'selection' ? scrollY : selectionScrollY) || 0),
  });

  const persistComparisonSnapshot = (step = compareStep, scrollY = window.scrollY) => {
    const id = saveCentreReturnContext({
      ...comparisonReturnSnapshot(step, scrollY),
      id: window.history.state?.centreComparisonContextId || undefined,
    });
    if (!id) return null;
    const state = { ...(window.history.state || {}), centreComparisonContextId: id };
    window.history.replaceState(state, '', window.location.href);
    return id;
  };

  const transitionComparisonStep = (nextStep) => {
    const currentScrollY = window.scrollY;
    const selectionScrollY = compareStep === 'selection' ? currentScrollY : compareSelectionScrollY;
    persistComparisonSnapshot(compareStep, currentScrollY);
    const targetScrollY = nextStep === 'selection' ? selectionScrollY : 0;
    const snapshot = comparisonReturnSnapshot(nextStep, targetScrollY, selectionScrollY);
    const id = saveCentreReturnContext(snapshot);
    if (id) pushHistoryEntry({ centreComparisonContextId: id }, window.location.pathname);
    compareSelectionGenerationRef.current += 1;
    setCompareSelectionScrollY(selectionScrollY);
    setCompareStep(nextStep);
    pendingComparisonScrollRef.current = { step: nextStep, scrollY: targetScrollY };
  };

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

  const loadCentreDetails = async (centre, { pushHistory = false } = {}) => {
    if (!centre?.id) return;
    const requestGeneration = ++detailRequestRef.current;
    const path = centreDetailsPath(centre.id);
    if (pushHistory && path && window.location.pathname !== path) {
      ensureHistoryEntryIndex();
      const historyOriginId = window.history.state?.centreOriginId;
      let origin = window.location.pathname.startsWith('/centres/') && historyOriginId
        ? (loadCentreReturnContext(currentUser?.uid || null, historyOriginId) || centreReturnOriginRef.current)
        : null;
      let originId = origin?.id || null;
      if (!origin && !window.location.pathname.startsWith('/centres/')) {
        origin = {
          version: 1,
          uid: currentUser?.uid || null,
          returnPath: window.location.pathname,
          page,
          query: protectCentreReturnQuery(query, profile),
          districts: selectedDistricts,
          level,
          pageOffset,
          compareSelectedIds,
          compareStep: page === 'Compare centres' ? compareStep : undefined,
          compareQuery: page === 'Compare centres' ? protectCentreReturnQuery(compareQuery, profile) : undefined,
          compareDistricts: page === 'Compare centres' ? compareDistricts : undefined,
          compareWatchlistOnly: page === 'Compare centres' ? compareWatchlistOnly : undefined,
          compareScrollY: page === 'Compare centres' ? window.scrollY : undefined,
          compareSelectionScrollY: page === 'Compare centres' ? compareSelectionScrollY : undefined,
          matchSnapshot: page === 'Find my matches' && matchRun
            ? { results: ranked, run: {
              uid: matchRun.uid,
              profileId: matchRun.profileId,
              weights: matchRun.weights,
              explanation: matchRun.explanation,
              criteriaVerified: false,
            } }
            : null,
          matchControls: page === 'Find my matches' ? { budget: Number(budget), weights: { ...weights } } : null,
          scrollY: window.scrollY,
          focusCentreId: String(centre.id),
        };
      } else if (origin) {
        origin = { ...origin, focusCentreId: String(centre.id) };
      }
      originId = origin ? (saveCentreReturnContext(origin) || origin.id || null) : null;
      origin = origin ? { ...origin, id: originId } : null;
      centreReturnOriginRef.current = origin;
      const returnPath = origin?.uid === (currentUser?.uid || null)
        ? origin.returnPath
        : '/';
      if (originId && window.location.pathname !== path) {
        window.history.replaceState({ ...(window.history.state || {}), centreOriginId: originId }, '', window.location.href);
      }
      pushHistoryEntry({ ...(window.history.state || {}), centreDetails: true, returnPath, centreOriginId: originId }, path);
    }
    setSelectedCentre(centre);
    setDetailLoading(true);
    setDetailError('');
    setDetailReviews([]);
    setDetailReviewsLoading(true);
    setDetailReviewsError('');
    setMyCentreReview(null);
    setMyReviewLoading(Boolean(currentUser));
    setMyReviewError('');
    setMyReviewKnown(false);
    myReviewBaselineRef.current = null;
    setReviewRating(5);
    setReviewComment('');
    setReviewSaving(false);
    const requestId = String(centre.id);
    const loadDetails = getCentreById(centre.id).then((detail) => {
      if (requestGeneration === detailRequestRef.current) setSelectedCentre((current) => String(current?.id) === requestId ? mapCentre({ ...centre, ...detail }) : current);
    }).catch((error) => {
      if (requestGeneration === detailRequestRef.current) setDetailError(error.message?.includes('404') ? 'Centre not found' : 'Centre details could not be loaded. Try again.');
    }).finally(() => { if (requestGeneration === detailRequestRef.current) setDetailLoading(false); });
    getCentreReviews(centre.id).then((reviewData) => {
      if (requestGeneration === detailRequestRef.current) setDetailReviews(reviewData?.items || []);
    }).catch(() => {
      if (requestGeneration === detailRequestRef.current) setDetailReviewsError('Published reviews could not be loaded.');
    }).finally(() => {
      if (requestGeneration === detailRequestRef.current) setDetailReviewsLoading(false);
    });
    const centreViewerReady = ['ready', 'admin'].includes(onboardingState.status) || currentUser?.email?.toLowerCase() === 'swetalakshita@gmail.com';
    if (currentUser && centreViewerReady) {
      loadOwnCentreReview(centre.id, requestGeneration);
    } else {
      setMyReviewLoading(false);
    }
    return loadDetails;
  };

  const loadOwnCentreReview = async (centreId, requestGeneration = detailRequestRef.current) => {
    const accountId = currentUser?.uid == null ? null : String(currentUser.uid);
    const requestIsCurrent = () => requestGeneration === detailRequestRef.current && accountId === activeAccountIdRef.current;
    setMyReviewLoading(true);
    setMyReviewError('');
    setMyReviewKnown(false);
    try {
      const mine = await getMyReview(centreId);
      if (!requestIsCurrent()) return;
      if (!mine || typeof mine !== 'object' || !mine.review_id) {
        throw new Error('Your review could not be confirmed. Retry before writing a review.');
      }
      const baseline = {
        centreId: String(centreId),
        rating: Number(mine.rating) || 5,
        comment: mine.review_description || '',
      };
      myReviewBaselineRef.current = baseline;
      setMyCentreReview(mine);
      setReviewRating(baseline.rating);
      setReviewComment(baseline.comment);
      setMyReviewKnown(true);
    } catch (error) {
      if (!requestIsCurrent()) return;
      if (error.status === 404 && error.message === '404: Review not found') {
        myReviewBaselineRef.current = { centreId: String(centreId), rating: 5, comment: '' };
        setMyCentreReview(null);
        setReviewRating(5);
        setReviewComment('');
        setMyReviewKnown(true);
      } else {
        setMyReviewError('Your review could not be loaded. Retry before writing a review.');
      }
    } finally {
      if (requestIsCurrent()) setMyReviewLoading(false);
    }
  };

  const loadCentreInformation = async (centreId) => {
    const requestGeneration = detailRequestRef.current;
    const requestId = String(centreId);
    setDetailLoading(true);
    setDetailError('');
    try {
      const detail = await getCentreById(centreId);
      if (requestGeneration === detailRequestRef.current) {
        setSelectedCentre((current) => String(current?.id) === requestId ? mapCentre({ ...current, ...detail }) : current);
      }
    } catch (error) {
      if (requestGeneration === detailRequestRef.current) setDetailError(error.message?.includes('404') ? 'Centre not found' : 'Centre details could not be loaded. Try again.');
    } finally {
      if (requestGeneration === detailRequestRef.current) setDetailLoading(false);
    }
  };

  const openCentreDetails = (centre) => {
    if (!confirmReviewDeparture()) return;
    if (!currentUser && (guestPreviewStatus !== 'ready' || !guestPreviewIds.includes(String(centre?.id)))) {
      notify(guestPreviewStatus === 'error'
        ? 'Guest preview access could not be checked. Please try again later.'
        : 'Please wait while guest preview access is checked.');
      return;
    }
    const centreViewerReady = ['ready', 'admin'].includes(onboardingState.status) || currentUser?.email?.toLowerCase() === 'swetalakshita@gmail.com';
    if (currentUser && !centreViewerReady) {
      notify('Please complete your family profile to access centre details.');
      return;
    }
    loadCentreDetails(mapCentre(centre), { pushHistory: true });
  };

  const reviewBaseline = myReviewBaselineRef.current;
  const reviewIsDirty = Boolean(
    selectedCentre?.id && currentUser && myReviewKnown && !myReviewLoading && !myReviewError &&
    reviewBaseline?.centreId === String(selectedCentre.id) &&
    (Number(reviewRating) !== reviewBaseline.rating || reviewComment !== reviewBaseline.comment)
  );
  const reviewIsDirtyRef = useRef(false);
  reviewIsDirtyRef.current = reviewIsDirty;
  const activeDetailCentreIdRef = useRef(null);
  activeDetailCentreIdRef.current = selectedCentre?.id ?? null;
  const confirmReviewDeparture = () => !reviewIsDirty || window.confirm('Discard your unsaved review changes?');

  useEffect(() => {
    const restoreFromLocation = () => {
      const centreId = centreIdFromPath(window.location.pathname);
      if (!authResolved || centresLoading || (!currentUser && guestPreviewStatus === 'loading')) return;
      if (!centreId) {
        const historyState = window.history.state || {};
        const hasComparisonReference = Boolean(historyState.centreComparisonContextId);
        const origin = returnContextReady
          ? loadCentreReturnContext(currentUser?.uid || null,
            historyState.centreOriginId || historyState.centreComparisonContextId)
          : null;
        const comparisonContext = normalizeCentreComparisonContext(origin);
        if (origin && (!hasComparisonReference || comparisonContext)) pendingCentreOriginRestoreRef.current = origin;
        setSelectedCentre(null);
        if (origin && (!hasComparisonReference || comparisonContext)) {
          centreReturnOriginRef.current = origin;
          const restoredPage = permittedCentreOriginPage(origin, currentUser, onboardingState, profile);
          if (!restoredPage) {
            setPage('Overview');
            return;
          }
          restoreCentreOriginState(origin, restoredPage);
        } else if (hasComparisonReference) {
          centreReturnOriginRef.current = null;
          pendingCentreOriginRestoreRef.current = null;
          setCompareSelectedIds([]);
          setCompareStep('selection');
          setPage('Overview');
        }
        return;
      }
      const centreViewerReady = ['ready', 'admin'].includes(onboardingState.status) || currentUser?.email?.toLowerCase() === 'swetalakshita@gmail.com';
      if (currentUser && !centreViewerReady) return;
      const permittedPreview = guestPreviewStatus === 'ready' && guestPreviewIds.includes(centreId);
      if (!currentUser && !permittedPreview) {
        setSelectedCentre({ id: centreId, name: 'Sign in to view this centre' });
        setDetailError('Please sign in to view centre details.');
        setDetailLoading(false);
        return;
      }
      loadCentreDetails(mapCentre(centres.find((centre) => String(centre.id) === centreId) || { id: centreId }));
    };
    const handlePopState = (event) => {
      const previousIndex = Number.isSafeInteger(historyEntryIndexRef.current)
        ? historyEntryIndexRef.current
        : ensureHistoryEntryIndex();
      const targetIndex = Number.isSafeInteger(event.state?.centreHistoryIndex)
        ? event.state.centreHistoryIndex
        : previousIndex - 1;
      if (cancelledCentreHistoryPopRef.current !== false) {
        if (targetIndex === cancelledCentreHistoryPopRef.current) {
          historyEntryIndexRef.current = targetIndex;
          cancelledCentreHistoryPopRef.current = false;
          return;
        }
        cancelledCentreHistoryPopRef.current = false;
      }
      const delta = targetIndex - previousIndex;
      if (reviewIsDirtyRef.current && activeDetailCentreIdRef.current != null && delta !== 0) {
        if (!window.confirm('Discard your unsaved review changes?')) {
          cancelledCentreHistoryPopRef.current = previousIndex;
          historyEntryIndexRef.current = targetIndex;
          window.history.go(-delta || 1);
          return;
        }
      }
      historyEntryIndexRef.current = targetIndex;
      if (activeDetailCentreIdRef.current != null && delta !== 0) invalidateCentreDetailRequests();
      restoreFromLocation();
    };
    window.addEventListener('popstate', handlePopState);
    if (window.location.pathname.startsWith('/centres/') && String(selectedCentre?.id) !== centreIdFromPath(window.location.pathname)) {
      ensureHistoryEntryIndex();
      restoreFromLocation();
    }
    return () => window.removeEventListener('popstate', handlePopState);
  }, [authResolved, centres, centresLoading, currentUser, guestPreviewIds, guestPreviewStatus, onboardingState, profile, returnContextReady, selectedCentre?.id]);

  const handleReviewSubmit = async (event) => {
    event.preventDefault();
    if (!currentUser) {
      setAuthMode('login');
      notify('Please sign in before submitting a review.');
      return;
    }
    if (!selectedCentre?.id || reviewSaving || !myReviewKnown || myReviewLoading || myReviewError) return;

    const requestGeneration = detailRequestRef.current;
    const accountId = currentUser?.uid == null ? null : String(currentUser.uid);
    const centreId = String(selectedCentre.id);
    const wasEditing = Boolean(myCentreReview?.review_id);
    const requestIsCurrent = () => requestGeneration === detailRequestRef.current && accountId === activeAccountIdRef.current && String(activeDetailCentreIdRef.current) === centreId;
    setReviewSaving(true);
    const payload = {
      rating: Number(reviewRating),
      review_description: reviewComment.trim() || null
    };
    try {
      const savedReview = wasEditing
        ? await updateReview(myCentreReview.review_id, payload)
        : await submitReview(selectedCentre.id, payload);
      if (!requestIsCurrent()) return;
      setMyCentreReview(savedReview);
      setMyReviewKnown(true);
      myReviewBaselineRef.current = {
        centreId,
        rating: Number(savedReview.rating) || Number(reviewRating) || 5,
        comment: savedReview.review_description ?? reviewComment,
      };
      setReviewRating(myReviewBaselineRef.current.rating);
      setReviewComment(myReviewBaselineRef.current.comment);
      notify(wasEditing ? 'Your review has been updated.' : 'Thank you for sharing your review!');
      requestAnimationFrame(() => {
        reviewsSectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        reviewsSectionRef.current?.focus({ preventScroll: true });
      });

      const [reviewResult, centreResult] = await Promise.allSettled([
        getCentreReviews(centreId),
        getCentreById(centreId),
      ]);
      if (requestIsCurrent()) {
        if (reviewResult.status === 'fulfilled') {
          setDetailReviews(reviewResult.value?.items || []);
          setDetailReviewsError('');
        } else {
          setDetailReviewsError('Published reviews could not be refreshed after saving. Retry reviews.');
        }
        if (centreResult.status === 'fulfilled') {
          setSelectedCentre((current) => String(current?.id) === centreId ? mapCentre({ ...current, ...centreResult.value }) : current);
          setDetailError('');
        } else {
          setDetailError('Centre details could not be refreshed after saving. Try again.');
        }
      }
    } catch (error) {
      if (requestIsCurrent()) {
        notify(error.message?.includes('409')
          ? 'You have already reviewed this centre. Reload your review before editing it.'
          : `Could not save your review: ${error.message}`);
      }
    } finally {
      if (requestGeneration === detailRequestRef.current && accountId === activeAccountIdRef.current) setReviewSaving(false);
    }
  };

  const isAdmin =
    onboardingState.status === 'admin' ||
    currentUser?.email?.toLowerCase() === 'swetalakshita@gmail.com';
  const isOnboardingGated =
    Boolean(currentUser) && onboardingState.status !== 'ready' && !isAdmin;

  useEffect(() => {
    if (!reviewIsDirty) return undefined;
    const protectDocumentDeparture = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectDocumentDeparture);
    return () => window.removeEventListener('beforeunload', protectDocumentDeparture);
  }, [reviewIsDirty]);

  useEffect(() => {
    if (selectedCentre && !detailLoading && !isOnboardingGated) centreHeadingRef.current?.focus();
  }, [selectedCentre?.id, detailLoading, isOnboardingGated]);

  useEffect(() => {
    if (isOnboardingGated) {
      setSelectedCentre(null);
      setScoreInfoOpen(false);
    }
  }, [isOnboardingGated]);

  const openPage = (nextPage, { reviewDepartureConfirmed = false } = {}) => {
    if (!reviewDepartureConfirmed && !confirmReviewDeparture()) return;
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

    if (selectedCentre) {
      invalidateCentreDetailRequests();
      setSelectedCentre(null);
    }
    if (nextPage === 'Compare centres') setCompareStep('selection');
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
        deliberateSignInRef.current = true;
        const result = await signInWithEmailAndPassword(auth, email, password);

        if (!result.user.emailVerified) {
          deliberateSignInRef.current = false;
          await sendEmailVerification(result.user);
          await signOut(auth);
          notify('Please verify your email before signing in.');
          return;
        }

        if (!centreIdFromPath(window.location.pathname)) setPage('Overview');
        notify('Welcome back!');
      } else if (authMode === 'forgot') {
        await sendPasswordResetEmail(auth, email);
        notify('Password reset email sent.');
        return;
      }

      setAuthMode(authMode === 'register' ? 'login' : '');
    } catch (error) {
      deliberateSignInRef.current = false;
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
      deliberateSignInRef.current = true;
      await signInWithPopup(auth, new GoogleAuthProvider());
      if (!centreIdFromPath(window.location.pathname)) setPage('Overview');
      setAuthMode('');
      notify('Successfully signed in with Google!');
    } catch (error) {
      deliberateSignInRef.current = false;
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
  // Importance changes on this page save after a short pause before matching again.
  const updateRating = (key, rating) => {
    ratingEditGenerationRef.current += 1;
    matchRequestGenerationRef.current += 1;
    setRatingSaveStatus('pending');
    setRatingSaveMessage('Your importance ratings will save before matching.');
    if (matchStatus === 'loading') {
      setMatchStatus(matchRun ? 'done' : 'ready');
      setMatchMessage(matchRun ? 'Your previous results are out of date.' : 'Your preferences changed. Saving before matching…');
    }
    setWeights((current) => ({ ...current, [key]: rating }));
    setProfileForm((current) => ({ ...current, weights: { ...current.weights, [key]: rating } }));
  };

  const filtered = useMemo(() => {
    return centres.filter((centre) => {
      const searchText =
        `${centre.name} ${centre.area} ${centre.address} ${centre.postal}`.toLowerCase();

      const matchesSearch = !query.trim() || searchText.includes(query.trim().toLowerCase());

      return matchesSearch;
    });
  }, [centres, query]);

  // The backend owns matching scores and order. Keep each result intact for centre actions.
  const ranked = matchCandidates;
  const matchExplanation = matchRun?.explanation;
  const summaryNarrative = typeof matchExplanation?.summary_narrative === 'string'
    ? matchExplanation.summary_narrative.trim()
    : '';
  const topCentreRationale = typeof matchExplanation?.top_centre_rationale === 'string'
    ? matchExplanation.top_centre_rationale.trim()
    : '';
  const candidateHighlights = Array.isArray(matchExplanation?.candidate_highlights)
    ? matchExplanation.candidate_highlights
    : [];
  const matchIsOutdated = Boolean(matchRun && (
    matchRun.uid !== (currentUser?.uid || null) ||
    matchRun.criteriaVerified === false ||
    (matchRun.profileId && matchRun.profileId !== profileId) ||
    JSON.stringify(matchRun.weights) !== JSON.stringify(weights) ||
    matchStatus === 'loading' || matchStatus === 'error'
  ));

  useEffect(() => {
    const restoredResults = Array.isArray(restoredMatchSnapshot)
      ? restoredMatchSnapshot
      : restoredMatchSnapshot?.results;
    if (page !== 'Find my matches' || matchStatus !== 'loading' || !Array.isArray(restoredResults) || !profile) return undefined;
    const generation = ++matchRestoreGenerationRef.current;
    const legacyRun = {
      uid: currentUser?.uid || null,
      profileId,
      level: profile.level,
      citizenship: profile.citizenship,
      home: profile.home,
      work: profile.work || '',
      enrolMonth: profile.enrolMonth,
      weights: null,
      explanation: null,
    };
    setMatchRun(Array.isArray(restoredMatchSnapshot) ? legacyRun : restoredMatchSnapshot.run || legacyRun);
    if (generation !== matchRestoreGenerationRef.current) return;
    setMatchCandidates(restoredResults);
    setMatchStatus('done');
    setMatchMessage('Restored your previous matches.');
    return () => { matchRestoreGenerationRef.current += 1; };
  }, [matchStatus, page, profile, profileId, currentUser?.uid, restoredMatchSnapshot]);

  const runMatching = async (savedProfile = profile) => {
    setRestoredMatchSnapshot(null);
    const savedProfileId = savedProfile?.profileId || savedProfile?.profile_id || profileId;
    if (!savedProfileId) {
      notify('Save your family profile before finding matches.');
      return;
    }
    const generation = ++matchRequestGenerationRef.current;
    const requestUid = currentUser?.uid || null;
    setMatchStatus('loading');
    setMatchMessage('Finding matches using your saved preferences…');

    try {
      const response = await matchCentres({ profile_id: savedProfileId, top_n: 10 });
      if (generation !== matchRequestGenerationRef.current || requestUid !== activeAccountIdRef.current) return;
      const results = Array.isArray(response)
        ? response
        : response?.results ?? response?.matches ?? response?.items ?? [];
      const backendResults = results.map((result) => {
        const centreData = result.centre ?? result;
        const centre = mapCentre(centreData);
        return {
          ...centre,
          ...result,
          id: result.centre_id ?? result.id ?? centre.id,
          name: result.centre_name ?? result.name ?? centre.name,
          score: result.overall_fit_score ?? result.score,
        };
      });
      setMatchRun({
        uid: requestUid,
        profileId: savedProfileId,
        level: savedProfile.level,
        citizenship: savedProfile.citizenship,
        home: savedProfile.home,
        work: savedProfile.work || '',
        enrolMonth: savedProfile.enrolMonth,
        weights: { ...savedProfile.weights },
        criteriaVerified: true,
        explanation: response?.explanation ?? null,
      });
      setMatchCandidates(backendResults);
      setMatchStatus('done');
      setMatchMessage(results.length ? 'Matches use your saved family preferences.' : 'No matches were returned for your saved preferences.');
    } catch (error) {
      if (generation !== matchRequestGenerationRef.current || requestUid !== activeAccountIdRef.current) return;
      setMatchStatus('error');
      setMatchMessage(error.message || 'Could not load matches.');
    }
  };

  const saveEditedRatings = async () => {
    if (!profile || !profileId || !currentUser) return;
    const generation = ratingEditGenerationRef.current;
    const uid = currentUser.uid || null;
    if (ratingSaveQueueRef.current.uid !== uid) ratingSaveQueueRef.current = { uid, count: 0 };
    const ratingSaveQueue = ratingSaveQueueRef.current;
    ratingSaveQueue.count += 1;
    const intendedWeights = { ...weights };
    setRatingSaveStatus('saving');
    setRatingSaveMessage('Saving your latest importance ratings…');
    setProfileForm((form) => ({ ...form, weights: intendedWeights }));
    const write = profileWriteQueueRef.current.then(async () => {
      if (uid !== activeAccountIdRef.current) return;
      const next = { ...(latestSavedProfileRef.current || profile), weights: intendedWeights };
      const payload = toApiProfile(next, profileName);
      const savedResponse = await updateFamilyProfile(profileId, payload);
      if (uid !== activeAccountIdRef.current) return;
      const savedProfile = fromApiProfile(savedResponse || payload, next);
      latestSavedProfileRef.current = savedProfile;
      return savedProfile;
    });
    profileWriteQueueRef.current = write.catch(() => undefined);
    try {
      const savedProfile = await write;
      ratingSaveQueue.count = Math.max(0, ratingSaveQueue.count - 1);
      if (!savedProfile || uid !== activeAccountIdRef.current) return;
      if (generation !== ratingEditGenerationRef.current) {
        setProfile(savedProfile);
        if (JSON.stringify(latestWeightsRef.current) === JSON.stringify(savedProfile.weights)) {
          setRatingSaveStatus('idle');
          setRatingSaveMessage('');
        }
        return;
      }
      setProfile(savedProfile);
      setProfileForm(savedProfile);
      setWeights(savedProfile.weights);
      setRatingSaveStatus('idle');
      setRatingSaveMessage('');
      await runMatching(savedProfile);
    } catch (error) {
      ratingSaveQueue.count = Math.max(0, ratingSaveQueue.count - 1);
      if (uid !== activeAccountIdRef.current || generation !== ratingEditGenerationRef.current) return;
      setRatingSaveStatus('error');
      setRatingSaveMessage(error.message || 'Your importance ratings could not be saved. Retry to use them for matching.');
    }
  };

  const retryMatching = () => {
    if (profile && JSON.stringify(weights) !== JSON.stringify(profile.weights)) return saveEditedRatings();
    return runMatching();
  };

  useEffect(() => {
    if (!profile || !currentUser) return undefined;
    if (JSON.stringify(weights) === JSON.stringify(profile.weights)) {
      if (ratingSaveStatus === 'pending' && ratingSaveQueueRef.current.uid === currentUser.uid && ratingSaveQueueRef.current.count === 0) {
        setRatingSaveStatus('idle');
        setRatingSaveMessage('');
        if (matchStatus === 'ready' || (matchStatus === 'done' && JSON.stringify(matchRun?.weights) !== JSON.stringify(profile.weights))) {
          setMatchStatus('idle');
          setMatchMessage('');
        }
      }
      return undefined;
    }
    if (ratingSaveStatus === 'saving' || ratingSaveStatus === 'error') return undefined;
    const timer = setTimeout(() => { void saveEditedRatings(); }, 800);
    return () => clearTimeout(timer);
  }, [weights, profile, currentUser, ratingSaveStatus, matchStatus, matchRun]);

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
      latestSavedProfileRef.current = controller.getState().profile || latestSavedProfileRef.current;
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

  useEffect(() => {
    const pending = pendingComparisonScrollRef.current;
    if (!pending || page !== 'Compare centres' || compareStep !== pending.step) return undefined;
    if (compareStep === 'selection') {
      if (compareDirectoryStatus === 'loading' || compareDirectoryStatus === 'idle') return undefined;
      const identitiesReady = compareSelectedIds.every((id) => centreLookup.has(String(id)) || compareIdentityStatus[String(id)] === 'error');
      if (!identitiesReady) return undefined;
    }
    let frame = 0;
    const expectedOptionCount = compareWatchlistOnly
      ? compareDirectoryCentres.filter((centre) => saved.map(String).includes(String(centre.id))).length
      : compareDirectoryCentres.length;
    const restoreWhenReady = () => {
      if (pendingComparisonScrollRef.current !== pending) return;
      const renderedOptions = document.querySelectorAll('.compare-picker .compare-option').length;
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const rowsNeedLayout = compareStep === 'selection' && expectedOptionCount > 0 &&
        (renderedOptions < expectedOptionCount || maxScroll < pending.scrollY);
      if (rowsNeedLayout) {
        frame = window.requestAnimationFrame(restoreWhenReady);
        return;
      }
      window.scrollTo(0, Math.min(Math.max(0, pending.scrollY), maxScroll));
      pendingComparisonScrollRef.current = null;
    };
    frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(restoreWhenReady);
    });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [page, compareStep, compareDirectoryStatus, compareSelectedIds, compareIdentityStatus, centreLookup,
    compareDirectoryCentres, saved, compareWatchlistOnly]);

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

  useEffect(() => {
    if (!currentUser || page !== 'Compare centres') return undefined;
    const accountId = String(currentUser.uid);
    const selectionGeneration = compareSelectionGenerationRef.current;
    const selected = compareSelectedIds.map(String);
    const active = new Set(selected);
    for (const id of compareIdentityRequestsRef.current.keys()) {
      if (!active.has(id)) compareIdentityRequestsRef.current.delete(id);
    }
    const unresolved = selected.filter((id) => !centreLookup.has(id));
    setCompareIdentityStatus((current) => Object.fromEntries(
      Object.entries(current).filter(([id]) => unresolved.includes(id))
    ));
    unresolved.forEach((id) => {
      const existing = compareIdentityRequestsRef.current.get(id);
      if (existing?.accountId === accountId && existing.selectionGeneration === selectionGeneration) return;
      const request = { accountId, selectionGeneration, token: Symbol(id) };
      compareIdentityRequestsRef.current.set(id, request);
      setCompareIdentityStatus((current) => ({ ...current, [id]: 'loading' }));
      getCentreById(id).then((detail) => {
        if (compareIdentityRequestsRef.current.get(id) !== request ||
            activeAccountIdRef.current !== accountId ||
            compareSelectionGenerationRef.current !== selectionGeneration) return;
        if (!detail) throw new Error('Centre details were empty.');
        setFetchedCentres((current) => ({ ...current, [id]: mapCentre({ ...detail, id }) }));
        setCompareIdentityStatus((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
        compareIdentityRequestsRef.current.delete(id);
      }).catch(() => {
        if (compareIdentityRequestsRef.current.get(id) !== request ||
            activeAccountIdRef.current !== accountId ||
            compareSelectionGenerationRef.current !== selectionGeneration) return;
        compareIdentityRequestsRef.current.delete(id);
        setCompareIdentityStatus((current) => ({ ...current, [id]: 'error' }));
      });
    });
    return undefined;
  }, [currentUser?.uid, page, compareSelectedIds, centreLookup, compareIdentityReload]);

  const watchlistCentres = useMemo(
    () => saved.map((id) => centreLookup.get(String(id))).filter(Boolean),
    [saved, centreLookup]
  );

  // Load the complete accessible directory for comparison. Search/filtering stays server-side,
  // and each returned page is accumulated so selections remain identifiable when hidden.
  useEffect(() => {
    if (page !== 'Compare centres') return undefined;
    let cancelled = false;
    const run = async () => {
      setCompareDirectoryStatus('loading');
      setCompareDirectoryError('');
      const term = compareQuery.trim();
      const params = { limit: 100, offset: 0 };
      if (term) {
        if (/^\d+$/.test(term)) params.postal_prefix = term;
        else params.query = term;
      }
      if (compareDistricts.length) params.district = compareDistricts;
      try {
        const first = await getCentres(params);
        const firstItems = Array.isArray(first) ? first : first?.items;
        if (!Array.isArray(firstItems)) throw new Error('Unexpected directory response.');
        const total = Number(first?.total ?? firstItems.length);
        const all = [...firstItems];
        for (let offset = 100; offset < total; offset += 100) {
          const next = await getCentres({ ...params, offset });
          const items = Array.isArray(next) ? next : next?.items;
          if (!Array.isArray(items)) throw new Error('Unexpected directory response.');
          all.push(...items);
        }
        if (!cancelled) {
          const mapped = all.map(mapCentre);
          setCompareDirectoryCentres(mapped);
          setFetchedCentres((current) => ({
            ...current,
            ...Object.fromEntries(mapped.map((centre) => [String(centre.id), centre])),
          }));
          setCompareDirectoryStatus('ready');
        }
      } catch (error) {
        if (!cancelled) {
          setCompareDirectoryError(error.message || 'Could not load centres.');
          setCompareDirectoryStatus('error');
        }
      }
    };
    run();
    return () => { cancelled = true; };
  }, [page, compareQuery, compareDistricts, compareDirectoryReload]);

  const compareOptions = useMemo(() => compareWatchlistOnly
    ? compareDirectoryCentres.filter((centre) => saved.map(String).includes(String(centre.id)))
    : compareDirectoryCentres,
  [compareDirectoryCentres, compareWatchlistOnly, saved]);

  // Centres the user ticked for comparison (max 3), independent of current search results.
  const compareCentres = useMemo(
    () => compareSelectedIds.map((id) => centreLookup.get(String(id))).filter(Boolean).slice(0, 3),
    [compareSelectedIds, centreLookup]
  );

  const retryCompareDetails = (centreId) => {
    const key = String(centreId);
    setCompareDetails((current) => ({ ...current, [key]: { error: 'Retrying centre details…' } }));
    setCompareDetailRetries((current) => ({ ...current, [key]: (current[key] || 0) + 1 }));
  };

  const removeComparedCentre = (centreId) => {
    const next = compareSelectedIds.filter((id) => String(id) !== String(centreId));
    setCompareSelectedIds(next);
    if (next.length < 2) {
      setCompareStep('selection');
      window.scrollTo(0, 0);
    }
  };

  // Fetch each selected centre independently so a failure in one column cannot block another.
  useEffect(() => {
    if (page !== 'Compare centres' || compareStep !== 'comparison') return;
    if (!authResolved || (currentUser?.uid || null) !== activeAccountIdRef.current) return;
    const accountId = activeAccountIdRef.current;
    const selectionKey = compareDetailSelectionKeyRef.current;
    const selectionGeneration = compareDetailSelectionGenerationRef.current;
    compareCentres.forEach((centre) => {
      const key = String(centre.id);
      const retry = compareDetailRetries[key] || 0;
      const previous = compareDetails[key];
      if (previous?.data && previous.accountId === accountId) return;
      if (previous?.error && previous.accountId === accountId && previous.retry === retry) return;
      if (previous?.loading && previous.accountId === accountId && previous.retry === retry && previous.selectionGeneration === selectionGeneration) return;

      const requestId = ++compareDetailRequestRef.current;
      setCompareDetails((current) => ({
        ...current,
        [key]: { loading: true, accountId, retry, selectionGeneration, requestId }
      }));

      const request = centre.centre_code ? getCentreByCode(centre.centre_code) : getCentreById(centre.id);
      request
        .then((detail) => {
          if (activeAccountIdRef.current !== accountId || compareDetailSelectionGenerationRef.current !== selectionGeneration || compareDetailSelectionKeyRef.current !== selectionKey) return;
          if (!compareSelectedIds.some((id) => String(id) === key)) return;
          setCompareDetails((current) => current[key]?.requestId === requestId
            ? { ...current, [key]: { data: detail, accountId } }
            : current);
        })
        .catch((error) => {
          if (activeAccountIdRef.current !== accountId || compareDetailSelectionGenerationRef.current !== selectionGeneration || compareDetailSelectionKeyRef.current !== selectionKey) return;
          if (!compareSelectedIds.some((id) => String(id) === key)) return;
          setCompareDetails((current) => current[key]?.requestId === requestId
            ? { ...current, [key]: { error: error?.message || 'Could not load centre details.', accountId, retry } }
            : current);
        });
    });
  }, [page, compareStep, authResolved, currentUser?.uid, compareCentres, compareSelectedIds, compareDetails, compareDetailRetries]);

  const resetFilters = () => {
    setQuery('');
    setSelectedDistricts([]);
    setLevel('');
  };

  const yesNo = (value) => (value == null ? 'Not provided' : value ? 'Yes' : 'No');

  return (
    <div className={`app-shell${selectedCentre && !isOnboardingGated ? ' centre-page-active' : ''}`}>
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
                        <h4 className="title-with-help">Importance ratings <button
                          type="button"
                          className="info-btn small"
                          aria-label="How match scores work"
                          aria-haspopup="dialog"
                          onClick={() => setScoreInfoOpen(true)}
                        >
                          <CircleHelp size={12} />
                        </button></h4><span>Rate each factor from 1 to 5</span>
                      </div>
                      <ImportanceRatings ratings={profileForm.weights} onChange={updateProfileRating} />
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
                      <button className="secondary-btn" data-centre-id={centre.id} onClick={() => openCentreDetails(centre)}>
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
                      <button className="primary-btn full" data-centre-id={centre.id} onClick={() => openCentreDetails(centre)}>
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
                subtitle="See centre recommendations based on your saved family preferences."
              />

              <div className="matching-layout">
                <section className="panel preference-panel">
                  <div className="panel-heading">
                    <div className="panel-icon"><SlidersHorizontal size={19} /></div>
                    <div><h3>Your family profile</h3><p>Details come from your profile. Adjust importance here.</p></div>
                  </div>

                  {profile ? (
                    <>
                      <dl className="profile-summary">
                        <div><dt>Child's level</dt><dd>{levelLabel(profile.level)}</dd></div>
                        <div><dt>Citizenship (for fees)</dt><dd>{CITIZENSHIP_LABELS[profile.citizenship]}</dd></div>
                        <div><dt>Home postal code</dt><dd>{profile.home}</dd></div>
                        <div><dt>Workplace postal code</dt><dd>{profile.work || 'Not set'}</dd></div>
                        <div><dt>Monthly budget</dt><dd>${budget}</dd></div>
                        <div><dt>Enrolment month</dt><dd>{profile.enrolMonth}</dd></div>
                      </dl>

                      <div className="weight-title">
                      <h4 className="title-with-help">Importance ratings <button
                      type="button"
                      className="info-btn small"
                      aria-label="How match scores work"
                      aria-haspopup="dialog"
                      onClick={() => setScoreInfoOpen(true)}
                    >
                      <CircleHelp size={12} />
                    </button></h4><span>Rate each factor from 1 to 5</span>
                      </div>
                      <ImportanceRatings ratings={weights} onChange={updateRating} />

                      <button
                        className="primary-btn full"
                        onClick={() => (JSON.stringify(weights) === JSON.stringify(profile.weights) ? runMatching() : saveEditedRatings())}
                        disabled={matchStatus === 'loading' || ratingSaveStatus === 'saving'}
                      >
                        {ratingSaveStatus === 'saving' || ratingSaveStatus === 'pending' ? 'Saving preferences…' : matchStatus === 'loading' ? 'Finding matches…' : JSON.stringify(weights) !== JSON.stringify(profile.weights) ? 'Save and find matches' : 'Refresh my matches'} <Sparkles size={16} />
                      </button>
                      <button className="secondary-btn full" style={{ marginTop: 9 }} onClick={() => openPage('Family profile')}>
                        Edit family profile
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="fine-print" style={{ fontSize: 12, marginTop: 0 }}>
                        Complete your family profile once and we will use it to find matches here.
                      </p>
                      <button className="primary-btn full" onClick={() => openPage('Family profile')}>
                        Complete your profile <ChevronRight size={16} />
                      </button>
                    </>
                  )}
                  <p className="fine-print">
                    Matching uses the saved profile. Displayed commute estimates are separate from matching travel scores.
                  </p>
                </section>

                <section className="results-panel">
                  <div className="results-top">
                    <div>
                      <div className="eyebrow">YOUR SHORTLIST</div>
                      <h2>Top matches for your family</h2>
                      <p>{matchMessage || 'Recommendations based on your saved preferences'}</p>
                    </div>
                    <span className="result-count">Showing {Math.min(ranked.length, 10)} matches</span>
                  </div>

                  {matchIsOutdated && ranked.length > 0 && <p className="notice matches-outdated" role="status">
                    <span><b>These results are out of date.</b><br />They still represent the preferences saved for the previous match run.</span>
                  </p>}
                  {ratingSaveStatus === 'error' && ranked.length > 0 && <p className="notice matches-error" role="alert">
                    <span><b>Your importance ratings were not saved.</b><br />{ratingSaveMessage}</span>
                    <button className="secondary-btn" type="button" onClick={() => saveEditedRatings()}>Retry save</button>
                  </p>}
                  {ratingSaveStatus === 'saving' && <p className="fine-print" role="status">{ratingSaveMessage}</p>}
                  {matchStatus === 'error' && ranked.length > 0 && ratingSaveStatus !== 'error' && <p className="notice matches-error" role="alert">
                    <span><b>Could not refresh matches.</b><br />{matchMessage}</span>
                    <button className="secondary-btn" type="button" onClick={retryMatching} disabled={ratingSaveStatus === 'saving'}>Retry matching</button>
                  </p>}
                  {matchStatus === 'loading' && ranked.length > 0 && <p className="fine-print" role="status">Finding updated matches… Previous results remain visible until the new run succeeds.</p>}

                  {ratingSaveStatus === 'error' && ranked.length === 0 && (
                    <Empty title="Could not save preferences" text={ratingSaveMessage} action={() => saveEditedRatings()} actionLabel="Retry save" />
                  )}
                  {matchStatus === 'idle' && ratingSaveStatus !== 'error' && (
                    <Empty
                      title="Ready when you are"
                      text="Choose your child's level, enter your home postal code and press Find my matches."
                    />
                  )}
                  {matchStatus === 'ready' && ratingSaveStatus !== 'error' && (
                    <Empty title="Saving your preferences" text="Your latest importance ratings will be saved before a fresh match request." />
                  )}
                  {matchStatus === 'loading' && ranked.length === 0 && (
                    <Empty title="Working on it" text={matchMessage} />
                  )}
                  {matchStatus === 'error' && ranked.length === 0 && ratingSaveStatus !== 'error' && (
                    <Empty title="Could not load matches" text={matchMessage} action={retryMatching} actionLabel={ratingSaveStatus === 'error' ? 'Retry save' : 'Retry matching'} />
                  )}
                  {matchStatus === 'done' && ranked.length === 0 && (
                    <Empty
                      title="No matches returned"
                      text="The matching service did not return any centres for these saved preferences."
                    />
                  )}

                  {ranked.length > 0 && summaryNarrative && (
                    <section className="match-explanation-summary" aria-labelledby="match-explanation-heading">
                      <h3 id="match-explanation-heading">Why these matches</h3>
                      <p>{summaryNarrative}</p>
                    </section>
                  )}

                  {['done', 'loading', 'error'].includes(matchStatus) && ranked.length > 0 && (
                    <MatchesCommute centres={ranked.slice(0, 10)} currentUser={currentUser} profileId={profileId}
                      profile={profile} onSignIn={() => setAuthMode('login')}>
                      {(commuteFor) => ranked.slice(0, 10).map((centre, index) => {
                        const commute = commuteFor(centre);
                        const candidateHighlightValues = [candidateHighlights[index], centre.highlight]
                          .filter((value) => typeof value === 'string' && value.trim())
                          .map((value) => value.trim());
                        const uniqueCandidateHighlights = candidateHighlightValues.filter((value, valueIndex) =>
                          candidateHighlightValues.findIndex((candidate) => candidate.toLocaleLowerCase() === value.toLocaleLowerCase()) === valueIndex
                        );
                        return <article className="panel centre-card" key={centre.id} style={{ marginBottom: 16 }}>
                          <div className="centre-card-top">
                            <span className="eyebrow">#{index + 1}{centre.score != null ? ` · ${centre.score}% match` : ''}</span>
                            <button className="icon-btn" aria-label={isSaved(centre.id) ? 'Remove from watchlist' : 'Save to watchlist'} onClick={() => toggleSaved(centre.id)}>
                              <Heart size={18} fill={isSaved(centre.id) ? '#e63946' : 'none'} color={isSaved(centre.id) ? '#e63946' : '#9ca3af'} />
                            </button>
                          </div>
                          <h3>{centre.name}</h3>
                          {index === 0 && topCentreRationale && <p className="match-explanation-detail">{topCentreRationale}</p>}
                          {uniqueCandidateHighlights.map((highlight) => <p className="match-explanation-detail" key={highlight}>{highlight}</p>)}
                          <p><MapPin size={14} /> {centre.address || 'Address not provided'}</p>
                          {(centre.fee_breakdown?.published_fee ?? centre.monthly_fee ?? centre.fee ?? centre.fee_breakdown?.monthly_fee ?? centre.fee_breakdown?.listed_monthly_fee) != null && <p>
                            Published monthly fee: <strong>{money(centre.fee_breakdown?.published_fee ?? centre.monthly_fee ?? centre.fee ?? centre.fee_breakdown?.monthly_fee ?? centre.fee_breakdown?.listed_monthly_fee)}</strong>
                          </p>}
                          {(centre.fee_breakdown?.estimated_monthly_payable_fee ?? centre.estimated_net_payable ?? centre.estimated_net_fee ?? centre.fee_breakdown?.estimated_net_payable) != null && <p>
                            Estimated monthly payable: <strong>{money(centre.fee_breakdown?.estimated_monthly_payable_fee ?? centre.estimated_net_payable ?? centre.estimated_net_fee ?? centre.fee_breakdown?.estimated_net_payable)}</strong>
                          </p>}
                          {(centre.fee_breakdown?.estimated_subsidy ?? centre.subsidy_amount ?? centre.fee_breakdown?.subsidy_amount) != null && <p>Estimated subsidy: {money(centre.fee_breakdown?.estimated_subsidy ?? centre.subsidy_amount ?? centre.fee_breakdown?.subsidy_amount)}</p>}
                          <p>Vacancy: {centre.current_vacancy_status ?? centre.vacancy_status ?? centre.vacancy?.status ?? centre.vacancy_information?.status ?? 'Not provided'}</p>
                          {centre.enrollment_month_year && <p>Vacancy month: {monthYear(centre.enrollment_month_year)}</p>}
                          {(centre.travel_breakdown?.commute_duration_mins ?? centre.travel_breakdown?.duration_mins ?? centre.travel_breakdown?.duration_minutes) != null && <p className="fine-print match-result-detail">Matching travel estimate: {centre.travel_breakdown.commute_duration_mins ?? centre.travel_breakdown.duration_mins ?? centre.travel_breakdown.duration_minutes} min{(centre.travel_breakdown.commute_distance_km ?? centre.travel_breakdown.distance_km) != null ? ` · ${centre.travel_breakdown.commute_distance_km ?? centre.travel_breakdown.distance_km} km` : ''}</p>}
                          <MatchCommuteSummary centre={centre} summary={commute.summary} error={commute.errors}
                            loading={commute.loading} workplaceConfigured={Boolean(profile?.work)} onRetry={commute.retry} />
                          <p className="fine-print match-result-detail">{[
                            ['Vacancy fit', centre.vacancy_fit_score ?? centre.component_scores?.vacancy_fit ?? centre.component_scores?.vacancy],
                            ['Cost fit', centre.cost_fit_score ?? centre.component_scores?.cost_fit ?? centre.component_scores?.cost],
                            ['Travel fit', centre.travel_fit_score ?? centre.component_scores?.travel_fit ?? centre.component_scores?.travel],
                          ].filter(([, score]) => score != null).map(([label, score]) => `${label} ${score}%`).join(' · ')}</p>
                          <div className="centre-tags">
                            {centre.spark_certified && <span>SPARK certified</span>}
                            {centre.gov_subsidy && <span>Government subsidy</span>}
                            {centre.transport_provided && <span>Transport</span>}
                          </div>
                          <button className="secondary-btn" data-centre-id={centre.id} onClick={() => openCentreDetails(centre)}>View details</button>
                        </article>;
                      })}
                    </MatchesCommute>
                  )}
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

                      <button className="secondary-btn" data-centre-id={centre.id} onClick={() => openCentreDetails(centre)}>
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
              {compareStep === 'selection' ? (
                <>
                  <PageTitle title="Choose centres" subtitle="Search the full directory, then select two or three centres to compare." />
                  <section className="panel compare-picker">
                    <label className="compare-search-label" htmlFor="compare-search">Search centres</label>
                    <input
                      id="compare-search"
                      className="compare-search"
                      type="search"
                      value={compareQuery}
                      onChange={(event) => setCompareQuery(event.target.value)}
                      placeholder="Centre name or postal code"
                    />
                    <div className="compare-area-filter">
                      <span>Area</span>
                      <DistrictMultiSelect districts={districts} selected={compareDistricts} onChange={setCompareDistricts} />
                    </div>
                    <div className="compare-picker-toolbar">
                      <label className="compare-filter">
                        <input type="checkbox" checked={compareWatchlistOnly} onChange={(event) => setCompareWatchlistOnly(event.target.checked)} />
                        <span>Watchlist only</span>
                      </label>
                      <button className="text-btn" onClick={() => setCompareSelectedIds([])} disabled={!compareSelectedIds.length}>Clear selection</button>
                    </div>
                    <div className="compare-selection-summary" aria-live="polite">
                      <div><strong>{compareSelectedIds.length} of 3 selected</strong><span>{compareCentres.map((centre) => centre.name).join(' · ') || 'Choose at least two centres.'}</span></div>
                      <button className="primary-btn" disabled={compareSelectedIds.length < 2 || compareSelectedIds.length > 3} onClick={() => transitionComparisonStep('comparison')}>Compare</button>
                    </div>
                    <CompareIdentityStatus selectedIds={compareSelectedIds} centreLookup={centreLookup}
                      statusById={compareIdentityStatus} onRetry={() => setCompareIdentityReload((value) => value + 1)} />

                    {compareDirectoryStatus === 'loading' && <p role="status" className="compare-picker-state">Loading centres…</p>}
                    {compareDirectoryStatus === 'error' && <div className="compare-picker-state" role="alert"><p>Could not load centres: {compareDirectoryError}</p><button className="secondary-btn" onClick={() => setCompareDirectoryReload((value) => value + 1)}>Try again</button></div>}
                    {compareDirectoryStatus === 'ready' && compareOptions.length === 0 && <p className="compare-picker-state">{compareWatchlistOnly ? 'No watchlist centres match. Clear Watchlist only to search the full directory.' : 'No centres found. Try another name, area or postal code.'}</p>}
                    {compareDirectoryStatus === 'ready' && compareOptions.length > 0 && (
                      <div className="compare-option-list" aria-label="Centres">
                        {compareOptions.map((centre) => {
                          const id = String(centre.id);
                          const checked = compareSelectedIds.includes(id);
                          const limitReached = !checked && compareSelectedIds.length >= 3;
                          return <label key={id} className={`compare-option${checked ? ' selected' : ''}`}>
                            <input type="checkbox" checked={checked} disabled={limitReached} aria-label={`Select ${centre.name}`} onChange={() => setCompareSelectedIds((items) => checked ? items.filter((item) => item !== id) : items.length < 3 && !items.includes(id) ? [...items, id] : items)} />
                            <span><strong>{centre.name}</strong><small>{centre.address || 'Address not provided'}{centre.postal ? ` · ${centre.postal}` : ''}</small></span>
                          </label>;
                        })}
                      </div>
                    )}
                  </section>
                </>
              ) : (
                <>
                  <PageTitle title="Compare centres" subtitle="Review the centres you selected side by side." />
                  <button className="secondary-btn compare-edit" onClick={() => transitionComparisonStep('selection')}>Edit selection</button>
                  <CompareIdentityStatus selectedIds={compareSelectedIds} centreLookup={centreLookup}
                    statusById={compareIdentityStatus} onRetry={() => setCompareIdentityReload((value) => value + 1)} />
                </>
              )}

              {compareStep === 'comparison' && <section>
                <div className="results-top">
                  <div>
                    <h2>Selected centre details</h2>
                    <p>Travel estimates and published information for your selected centres.</p>
                  </div>
                </div>

                {compareCentres.length === 0 && <Empty
                  title="Choose your centres"
                  text="Select two or more centres above. Selected centre identities are still loading or need recovery."
                />}
                <ComparisonCommuteTable
                  selectedIds={compareSelectedIds}
                  centres={compareCentres}
                  details={compareDetails}
                  profile={profile}
                  profileId={profileId}
                  currentUser={currentUser}
                  onSignIn={() => setAuthMode('login')}
                  onRetryDetails={retryCompareDetails}
                  onViewDetails={openCentreDetails}
                  onRemove={removeComparedCentre}
                />
              </section>}
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
                      <h4 className="title-with-help">Importance ratings <button
                      type="button"
                      className="info-btn small"
                      aria-label="How match scores work"
                      aria-haspopup="dialog"
                      onClick={() => setScoreInfoOpen(true)}
                    >
                      <CircleHelp size={12} />
                    </button></h4><span>Rate each factor from 1 to 5</span>
                  </div>
                  <ImportanceRatings ratings={profileForm.weights} onChange={updateProfileRating} />
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

      {scoreInfoOpen && (
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
              <p>The matching service calculates Travel fit from your saved family profile. Displayed commute modes and estimates are separate; changing them does not change the matching score.</p>
            </div>
            <div className="info-item overall">
              <h3>Overall Match Score</h3>
              <p>Ratings are independent and can tie. Each factor's share of all three ratings determines its proportional matching weight. For example, ratings of 5/5/1 give matching weights of 5/11, 5/11 and 1/11.</p>
            </div>

            <button className="primary-btn full" onClick={() => setScoreInfoOpen(false)}>Got it</button>
          </section>
        </div>
      )}

      {selectedCentre && !isOnboardingGated && (
        <main className="centre-details-page" id="centre-details-top">
          <div className="centre-details-inner">
            <a className="centre-details-return" href="/" onClick={(event) => {
              event.preventDefault();
              if (!confirmReviewDeparture()) return;
              const historyOriginId = window.history.state?.centreOriginId;
              const candidateOrigin = returnContextReady && historyOriginId
                ? (loadCentreReturnContext(currentUser?.uid || null, historyOriginId) ||
                  (centreReturnOriginRef.current?.id === historyOriginId ? centreReturnOriginRef.current : null))
                : null;
              const origin = candidateOrigin?.uid === (currentUser?.uid || null) ? candidateOrigin : null;
              const restoredPage = origin
                ? permittedCentreOriginPage(origin, currentUser, onboardingState, profile)
                : null;
              const returnPath = origin?.returnPath || '/';
              pushHistoryEntry({ centreReturn: true, ...(origin ? { centreOriginId: origin.id } : {}) }, returnPath);
              invalidateCentreDetailRequests();
              if (origin && restoredPage && centreReturnRestoredRef.current) pendingCentreOriginRestoreRef.current = origin;
              setSelectedCentre(null);
              if (origin && restoredPage && centreReturnRestoredRef.current) {
                restoreCentreOriginState(origin, restoredPage);
              } else {
                centreReturnOriginRef.current = null;
                openPage('Preschool directory', { reviewDepartureConfirmed: true });
              }
            }}>‹ Browse centres</a>
            {detailError === 'Centre not found' ? (
              <section className="centre-details-error" role="alert">
                <h1 ref={centreHeadingRef} tabIndex="-1">Centre not found</h1>
                <p>{detailError}</p>
              </section>
            ) : detailError === 'Please sign in to view centre details.' ? (
              <section className="centre-details-error" role="status">
                <h1 ref={centreHeadingRef} tabIndex="-1">Sign in to view this centre</h1>
                <p>Sign in to browse centre details outside the guest preview.</p>
                <button className="primary-btn" type="button" onClick={() => setAuthMode('login')}>Sign in</button>
              </section>
            ) : (
              <>
                {detailError && <div className="centre-details-error" role="alert">
                  <b>Centre details unavailable.</b> {detailError}
                  <button className="secondary-btn" onClick={() => loadCentreInformation(selectedCentre.id)}>Try again</button>
                </div>}
                {detailLoading && <p className="centre-details-loading" role="status">Loading centre information…</p>}
                <header className="centre-details-heading">
                  <h1 ref={centreHeadingRef} tabIndex="-1">{selectedCentre.name}</h1>
                  <p>{selectedCentre.address || 'Address not provided'} {selectedCentre.postal ? `(${selectedCentre.postal})` : ''}</p>
                  <div className="centre-details-rating">★ <strong>{selectedCentre.review_summary?.average_rating != null ? Number(selectedCentre.review_summary.average_rating).toFixed(1) : '—'}</strong><span>{selectedCentre.review_summary?.total_reviews ?? 0} reviews</span></div>
                </header>
                <div className="centre-details-grid">
                  <section className="centre-details-primary">
                    <a className="skip-centre-map" href="#centre-commute-summary" onClick={(event) => {
                      event.preventDefault();
                      const destination = document.getElementById('centre-commute-summary') || document.getElementById('centre-details-facts');
                      destination?.scrollIntoView({ block: 'start' });
                      destination?.focus();
                    }}>Skip map</a>
                    <div id="centre-details-commute">
                      <CentreCommute
                        centre={selectedCentre}
                        currentUser={currentUser}
                        profileId={profileId}
                        workplaceConfigured={profile ? Boolean(profile.work) : undefined}
                        profileLocationKey={getProfileCommuteContextKey(profile, profileId)}
                        onSignIn={() => setAuthMode('login')}
                        onEditProfile={() => openPage('Family profile')}
                      />
                    </div>
                  </section>
                  <aside className="centre-details-facts" id="centre-details-facts" tabIndex="-1">
                    <h2>Centre information</h2>
                    {selectedCentre.contact && <p><b>Phone</b><a href={`tel:${selectedCentre.contact}`}>{selectedCentre.contact}</a></p>}
                    {selectedCentre.email && <p><b>Email</b><a href={`mailto:${selectedCentre.email}`}>{selectedCentre.email}</a></p>}
                    {selectedCentre.website_url && <p><b>Website</b><a href={websiteHref(selectedCentre.website_url)} target="_blank" rel="noreferrer">Visit website <ArrowUpRight size={14} /></a></p>}
                    <p><b>Centre code</b>{selectedCentre.centre_code || 'Not provided'}</p>
                    <p><b>Weekday hours</b>{selectedCentre.weekday_full_day_hours || 'Not provided'}</p>
                    <p><b>Saturday hours</b>{selectedCentre.saturday_hours || 'Not provided'}</p>
                    <p><b>Food offered</b>{selectedCentre.food_offered || 'Not provided'}</p>
                    <p><b>Second languages</b>{selectedCentre.second_languages || 'Not provided'}</p>
                    <p><b>SPARK certified</b>{selectedCentre.spark_certified ? 'Yes' : 'No'}</p>
                    <p><b>Government subsidy</b>{selectedCentre.gov_subsidy ? 'Yes' : 'No'}</p>
                    <p><b>Transport</b>{selectedCentre.transport_provided ? 'Available' : 'Not listed'}</p>
                  </aside>
                </div>
                <section className="parent-reviews" aria-labelledby="parent-reviews-title" ref={reviewsSectionRef} tabIndex="-1">
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

                  {detailReviewsLoading ? (
                    <p role="status">Loading published reviews…</p>
                  ) : detailReviewsError ? (
                    <div className="reviews-empty-state" role="alert">
                      <b>{detailReviewsError}</b>
                      <button className="secondary-btn" type="button" onClick={() => {
                        const requestGeneration = detailRequestRef.current;
                        setDetailReviewsLoading(true);
                        setDetailReviewsError('');
                        getCentreReviews(selectedCentre.id).then((data) => {
                          if (requestGeneration === detailRequestRef.current) setDetailReviews(data?.items || []);
                        }).catch(() => {
                          if (requestGeneration === detailRequestRef.current) setDetailReviewsError('Published reviews could not be loaded.');
                        }).finally(() => {
                          if (requestGeneration === detailRequestRef.current) setDetailReviewsLoading(false);
                        });
                      }}>Retry reviews</button>
                    </div>
                  ) : detailReviews.length ? (
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
                      myReviewLoading ? <p role="status">Loading your review…</p> : myReviewError ? (
                        <div role="alert" className="reviews-empty-state">
                          <p>{myReviewError}</p>
                          <button className="secondary-btn" type="button" onClick={() => loadOwnCentreReview(selectedCentre.id)}>Retry your review</button>
                        </div>
                      ) : !myReviewKnown ? <p role="status">Confirming your review eligibility…</p> : <form className="parent-review-form" onSubmit={handleReviewSubmit}>
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
          </div>
        </main>
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

function Empty({ title, text, action, actionLabel = 'Browse directory' }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Search size={25} /></div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="primary-btn" onClick={action}>
          {actionLabel} <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}

const appRoot = document.getElementById('root');
if (appRoot) createRoot(appRoot).render(<App />);
