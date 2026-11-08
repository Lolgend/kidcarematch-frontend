// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { failClosedFetch, jsonResponse } from './support/fetch.js';
import { saveCentreReturnContext } from '../src/centreReturnContext.js';

const authHarness = vi.hoisted(() => ({
  listener: null,
  currentUser: null,
  signInWithPopup: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

vi.mock('../src/firebase', () => ({ auth: { get currentUser() { return authHarness.currentUser; } } }));
vi.mock('firebase/auth', () => ({
  signInWithPopup: authHarness.signInWithPopup,
  onAuthStateChanged: authHarness.onAuthStateChanged,
  GoogleAuthProvider: class GoogleAuthProvider {},
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendEmailVerification: vi.fn(),
  signOut: vi.fn(),
  updateProfile: vi.fn(),
}));

import { renderApp } from './support/appHarness.js';

const makeResults = () => Array.from({ length: 12 }, (_, index) => ({
  centre_id: `match-${index + 1}`,
  centre_code: `M${index + 1}`,
  centre_name: `Backend Centre ${index + 1}`,
  postal_code: '123456',
  address: `${index + 1} Example Road`,
  overall_fit_score: index === 0 ? 21 : index === 1 ? 99 : 80 - index,
  vacancy_fit_score: 86,
  cost_fit_score: 72,
  travel_fit_score: 49,
  vacancy_status: index === 1 ? 'Not Available' : 'Waitlist',
  enrollment_month_year: '2027-01',
  fee_breakdown: index === 0 ? {
    published_fee: 1100,
    estimated_subsidy: 300,
    estimated_monthly_payable_fee: 800,
  } : null,
  travel_breakdown: { commute_duration_mins: 18, commute_distance_km: 3 },
}));

describe('importance ratings and backend matching flow', () => {
  let fetchMock;
  let profile;
  let results;
  let explanation;
  let requests;
  let needsOnboarding;

  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', 'https://api.test');
    requests = [];
    needsOnboarding = false;
    profile = {
      profile_id: 'saved-family-1', profile_name: 'Our family', home_postal_code: '654321',
      level: 'n1', citizenship_status: 'SC', service_required: 'Full Day',
      enrollment_month_year: '2027-01', budget_max: 1200, workplace_postal_code: null,
      location_preference: 'HOME', household_income: 0, household_member_count: 1,
      vacancy_weight: 3, cost_weight: 3, travel_weight: 3,
    };
    results = makeResults();
    explanation = undefined;
    fetchMock = failClosedFetch(vi);
    fetchMock.mockImplementation(async (input, options = {}) => {
      const path = new URL(input).pathname;
      const method = options.method || 'GET';
      const body = options.body ? JSON.parse(options.body) : null;
      requests.push({ path, method, body });
      if (path === '/api/v1/users/me') return jsonResponse(vi, { role: 'PARENT' });
      if (path === '/api/v1/profile' && method === 'GET') return jsonResponse(vi, needsOnboarding ? [] : [profile]);
      if (path === '/api/v1/profile' && method === 'POST') {
        profile = { ...profile, ...body };
        needsOnboarding = false;
        return jsonResponse(vi, profile);
      }
      if (path === '/api/v1/profile/saved-family-1' && method === 'PUT') {
        profile = { ...profile, ...body };
        return jsonResponse(vi, profile);
      }
      if (path === '/api/v1/centres/match' && method === 'POST') {
        return jsonResponse(vi, {
          profile_id: profile.profile_id,
          total_candidates: results.length,
          returned_count: results.length,
          results,
          ...(explanation === undefined ? {} : { explanation }),
        });
      }
      const matchedCentre = results.find((result) => path === `/api/v1/centres/${result.centre_id}`);
      if (matchedCentre) return jsonResponse(vi, matchedCentre);
      if (path === '/api/v1/centres') return jsonResponse(vi, { items: [], total: 0 });
      if (path === '/api/v1/centres/districts') return jsonResponse(vi, []);
      if (path === '/api/v1/centres/summary') return jsonResponse(vi, {});
      if (path === '/api/v1/watchlist/me') return jsonResponse(vi, []);
      if (path === '/api/v1/notifications') return jsonResponse(vi, { items: [], unread_count: 0 });
      if (path === '/api/v1/commute/capabilities') return jsonResponse(vi, {});
      if (path.endsWith('/location')) return jsonResponse(vi, {});
      if (path.endsWith('/commute')) return jsonResponse(vi, { items: [] });
      if (path.endsWith('/reviews/mine')) return jsonResponse(vi, null);
      if (path.endsWith('/reviews')) return jsonResponse(vi, { items: [], total: 0 });
      fetchMock.unexpectedCalls.push([input, options]);
      return Promise.reject(new Error(`Unexpected request: ${method} ${path}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    authHarness.currentUser = null;
    authHarness.listener = null;
    authHarness.signInWithPopup.mockReset();
    authHarness.onAuthStateChanged.mockImplementation((_auth, callback) => {
      authHarness.listener = callback;
      callback(null);
      return vi.fn();
    });
  });

  afterEach(() => {
    expect(fetchMock.unexpectedCalls).toEqual([]);
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function signIn({ waitForOverview = true } = {}) {
    const user = {
      uid: 'saved-family-1', email: 'parent@example.com', emailVerified: true,
      providerId: 'google.com', getIdToken: vi.fn().mockResolvedValue('synthetic-token'),
    };
    authHarness.currentUser = user;
    authHarness.signInWithPopup.mockImplementation(async () => {
      authHarness.listener(user);
      return { user };
    });
    await renderApp();
    if (waitForOverview) {
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /continue with google/i })); });
      await screen.findByText('Overview', { selector: 'b' });
      await waitFor(() => expect(requests.some((request) => request.path === '/api/v1/profile' && request.method === 'GET')).toBe(true));
      await openPage('Family profile');
      await screen.findByRole('slider', { name: 'Travel fit' });
    } else {
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /continue with google/i })); });
      await waitFor(() => expect(requests.some((request) => request.path === '/api/v1/profile' && request.method === 'GET')).toBe(true));
    }
  }

  async function openPage(label) {
    const nav = [...document.querySelectorAll('.nav-item')].find((button) => button.textContent.includes(label));
    expect(nav).toBeTruthy();
    fireEvent.click(nav);
  }

  async function openMatches() {
    await signIn();
    await openPage('Find my matches');
  }

  it('loads, saves, and matches with exact integer ratings; keeps backend order, score, fee, vacancy, count, and centre actions', async () => {
    results[0].highlight = 'Result-specific highlight without a top-level explanation.';
    await signIn();
    await openPage('Family profile');
    const vacancy = screen.getByRole('slider', { name: 'Vacancy fit' });
    const cost = screen.getByRole('slider', { name: 'Cost fit' });
    const travel = screen.getByRole('slider', { name: 'Travel fit' });
    expect(screen.getByText(/Displayed commute modes and estimates are separate from matching travel scores/)).toBeTruthy();
    expect([vacancy.min, vacancy.max, vacancy.step, vacancy.value]).toEqual(['1', '5', '1', '3']);
    expect([cost.value, travel.value]).toEqual(['3', '3']);

    fireEvent.change(vacancy, { target: { value: '5' } });
    fireEvent.change(cost, { target: { value: '5' } });
    fireEvent.change(travel, { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));
    await waitFor(() => expect(requests.some((request) => request.path === '/api/v1/profile/saved-family-1' && request.method === 'PUT')).toBe(true));
    const save = requests.find((request) => request.path === '/api/v1/profile/saved-family-1' && request.method === 'PUT');
    expect(save.body).toMatchObject({ vacancy_weight: 5, cost_weight: 5, travel_weight: 1 });

    await openPage('Find my matches');
    await waitFor(() => expect(screen.getByText('Showing 6 matches')).toBeTruthy());
    expect(screen.queryByRole('heading', { name: 'Fit Explanation' })).toBeNull();
    const matchRequests = requests.filter((request) => request.path === '/api/v1/centres/match');
    expect(matchRequests[0].body).toEqual({ profile_id: 'saved-family-1', top_n: 6 });
    const cards = [...document.querySelectorAll('.centre-card')];
    expect(cards).toHaveLength(6);
    expect(within(cards[0]).getByRole('heading', { name: 'Backend Centre 1' })).toBeTruthy();
    expect(within(cards[1]).getByRole('heading', { name: 'Backend Centre 2' })).toBeTruthy();
    expect(within(cards[0]).getByText(/21% match/)).toBeTruthy();
    expect(within(cards[0]).getByText('Result-specific highlight without a top-level explanation.')).toBeTruthy();
    expect(cards[0].textContent).toContain('Published monthly fee: $1100.00');
    expect(cards[0].textContent).toContain('Estimated subsidy: $300.00');
    expect(cards[0].textContent).toContain('Estimated monthly payable: $800.00');
    expect(within(cards[0]).getByText('Vacancy: Waitlist')).toBeTruthy();
    expect(cards[0].textContent).toContain('Vacancy fit 86% · Cost fit 72% · Travel fit 49%');
    expect(cards[0].textContent).toContain('Vacancy month: Jan 2027');
    expect(cards[0].textContent).toContain('Matching travel estimate: 18 min · 3 km');
    expect(screen.queryByRole('heading', { name: 'Backend Centre 7' })).toBeNull();
    const commuteCentreIds = [...new Set(requests
      .map(({ path }) => path.match(/^\/api\/v1\/centres\/(match-\d+)\/commute$/)?.[1])
      .filter(Boolean))];
    expect(commuteCentreIds).toEqual(['match-1', 'match-2', 'match-3', 'match-4', 'match-5', 'match-6']);

    fireEvent.click(within(cards[0]).getByRole('button', { name: 'View details' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Backend Centre 1' })).toBeTruthy());
  });

  it('waits for an automatic rating save before requesting updated matches and treats an empty response as success', async () => {
    await signIn();
    await openPage('Family profile');
    await screen.findByRole('slider', { name: 'Travel fit' });
    await openPage('Find my matches');
    await waitFor(() => expect(requests.some((request) => request.path === '/api/v1/centres/match')).toBe(true));
    const previousMatches = requests.filter((request) => request.path === '/api/v1/centres/match').length;
    const slider = screen.getByRole('slider', { name: 'Travel fit' });
    fireEvent.change(slider, { target: { value: '5' } });
    await waitFor(() => expect(requests.filter((request) => request.path === '/api/v1/centres/match')).toHaveLength(previousMatches + 1), { timeout: 3000 });
    const latestSaveIndex = requests.map((request) => request.path).lastIndexOf('/api/v1/profile/saved-family-1');
    const latestMatchIndex = requests.map((request) => request.path).lastIndexOf('/api/v1/centres/match');
    expect(latestSaveIndex).toBeGreaterThan(-1);
    expect(latestSaveIndex).toBeLessThan(latestMatchIndex);
    expect(requests[latestMatchIndex].body).toEqual({ profile_id: 'saved-family-1', top_n: 6 });

    results = [];
    fireEvent.click(screen.getByRole('button', { name: /refresh my matches/i }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'No matches returned' })).toBeTruthy());
    expect(screen.getByText(/did not return any centres/i)).toBeTruthy();
  });

  it('shows the actual shortlist count for fewer than six, one, and zero matches', async () => {
    results = makeResults().slice(0, 3);
    await openMatches();
    await screen.findByText('Showing 3 matches');
    expect(document.querySelectorAll('.centre-card')).toHaveLength(3);

    results = [makeResults()[0]];
    fireEvent.click(screen.getByRole('button', { name: /refresh my matches/i }));
    await screen.findByText('Showing 1 match');
    expect(document.querySelectorAll('.centre-card')).toHaveLength(1);

    results = [];
    fireEvent.click(screen.getByRole('button', { name: /refresh my matches/i }));
    await screen.findByText('Showing 0 matches');
    expect(screen.getByRole('heading', { name: 'No matches returned' })).toBeTruthy();
    expect(document.querySelectorAll('.centre-card')).toHaveLength(0);
  });

  it('clears the pending save state when an edit is reverted before the debounce expires', async () => {
    await openMatches();
    await screen.findByText('Showing 6 matches');
    const initialMatchCount = requests.filter((request) => request.path === '/api/v1/centres/match').length;
    vi.useFakeTimers();
    const slider = screen.getByRole('slider', { name: 'Travel fit' });
    fireEvent.change(slider, { target: { value: '4' } });
    expect(screen.getByRole('button', { name: /saving preferences/i })).toBeTruthy();
    fireEvent.change(slider, { target: { value: '3' } });

    await vi.advanceTimersByTimeAsync(800);
    expect(screen.getByRole('button', { name: /refresh my matches/i })).toBeTruthy();
    expect(requests.filter((request) => request.path === '/api/v1/profile/saved-family-1' && request.method === 'PUT')).toHaveLength(0);
    expect(requests.filter((request) => request.path === '/api/v1/centres/match')).toHaveLength(initialMatchCount);
  });

  it('saves a reverted rating after an earlier in-flight write settles', async () => {
    await openMatches();
    await screen.findByText('Showing 6 matches');
    const saveBodies = [];
    let releaseFirstSave;
    fetchMock.mockImplementation(async (input, options = {}) => {
      const path = new URL(input).pathname;
      const method = options.method || 'GET';
      const body = options.body ? JSON.parse(options.body) : null;
      requests.push({ path, method, body });
      if (path === '/api/v1/profile/saved-family-1' && method === 'PUT') {
        saveBodies.push(body);
        if (saveBodies.length === 1) return new Promise((resolve) => { releaseFirstSave = resolve; });
        profile = { ...profile, ...body };
        return jsonResponse(vi, profile);
      }
      if (path === '/api/v1/centres/match' && method === 'POST') return jsonResponse(vi, { profile_id: profile.profile_id, results });
      return Promise.reject(new Error(`Unexpected request: ${method} ${path}`));
    });

    vi.useFakeTimers();
    const slider = screen.getByRole('slider', { name: 'Travel fit' });
    fireEvent.change(slider, { target: { value: '4' } });
    await vi.advanceTimersByTimeAsync(800);
    expect(saveBodies.map((body) => body.travel_weight)).toEqual([4]);
    fireEvent.change(slider, { target: { value: '3' } });
    await vi.advanceTimersByTimeAsync(800);
    expect(screen.getByRole('button', { name: /saving preferences/i })).toBeTruthy();
    expect(saveBodies).toHaveLength(1);

    await act(async () => {
      releaseFirstSave(jsonResponse(vi, { ...profile, travel_weight: 4 }));
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(saveBodies).toHaveLength(2));
    expect(saveBodies.map((body) => body.travel_weight)).toEqual([4, 3]);
    await vi.waitFor(() => expect(profile.travel_weight).toBe(3));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /refresh my matches/i })).toBeTruthy());
    vi.useRealTimers();
  });

  it('clears pending progress when an older in-flight save fails after ratings revert', async () => {
    await openMatches();
    await screen.findByText('Showing 6 matches');
    let releaseSave;
    const saveBodies = [];
    fetchMock.mockImplementation((input, options = {}) => {
      const path = new URL(input).pathname;
      const method = options.method || 'GET';
      const body = options.body ? JSON.parse(options.body) : null;
      requests.push({ path, method, body });
      if (path === '/api/v1/profile/saved-family-1' && method === 'PUT') {
        saveBodies.push(body);
        return new Promise((resolve) => { releaseSave = resolve; });
      }
      if (path === '/api/v1/centres/match' && method === 'POST') return jsonResponse(vi, { profile_id: profile.profile_id, results });
      return Promise.reject(new Error(`Unexpected request: ${method} ${path}`));
    });

    vi.useFakeTimers();
    const slider = screen.getByRole('slider', { name: 'Travel fit' });
    fireEvent.change(slider, { target: { value: '4' } });
    await vi.advanceTimersByTimeAsync(800);
    expect(saveBodies.map((body) => body.travel_weight)).toEqual([4]);
    fireEvent.change(slider, { target: { value: '3' } });
    await vi.advanceTimersByTimeAsync(800);
    expect(screen.getByRole('button', { name: /saving preferences/i })).toBeTruthy();

    await act(async () => {
      releaseSave(jsonResponse(vi, { detail: 'Save unavailable' }, 503));
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: /refresh my matches/i })).toBeTruthy();
    expect(saveBodies).toHaveLength(1);
    vi.useRealTimers();
  });

  it('does not schedule another save while the current save response is slow', async () => {
    await openMatches();
    await screen.findByText('Showing 6 matches');
    const startingMatchCount = requests.filter((request) => request.path === '/api/v1/centres/match').length;
    let releaseSave;
    const saveBodies = [];
    fetchMock.mockImplementation(async (input, options = {}) => {
      const path = new URL(input).pathname;
      const method = options.method || 'GET';
      const body = options.body ? JSON.parse(options.body) : null;
      requests.push({ path, method, body });
      if (path === '/api/v1/profile/saved-family-1' && method === 'PUT') {
        saveBodies.push(body);
        return new Promise((resolve) => { releaseSave = resolve; });
      }
      if (path === '/api/v1/centres/match' && method === 'POST') return jsonResponse(vi, { profile_id: profile.profile_id, results });
      return Promise.reject(new Error(`Unexpected request: ${method} ${path}`));
    });

    vi.useFakeTimers();
    fireEvent.change(screen.getByRole('slider', { name: 'Travel fit' }), { target: { value: '4' } });
    await vi.advanceTimersByTimeAsync(800);
    expect(saveBodies).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2400);
    expect(saveBodies).toHaveLength(1);

    await act(async () => {
      releaseSave(jsonResponse(vi, { ...profile, travel_weight: 4 }));
      await Promise.resolve();
    });
    vi.useRealTimers();
    await waitFor(() => expect(requests.filter((request) => request.path === '/api/v1/centres/match')).toHaveLength(startingMatchCount + 1));
    expect(saveBodies).toHaveLength(1);
  });

  it('clears save progress when the saved rating is restored while matching is still pending', async () => {
    await openMatches();
    await screen.findByText('Showing 6 matches');
    const saveBodies = [];
    let releaseFirstMatch;
    let matchCalls = 0;
    fetchMock.mockImplementation(async (input, options = {}) => {
      const path = new URL(input).pathname;
      const method = options.method || 'GET';
      const body = options.body ? JSON.parse(options.body) : null;
      requests.push({ path, method, body });
      if (path === '/api/v1/profile/saved-family-1' && method === 'PUT') {
        saveBodies.push(body);
        profile = { ...profile, ...body };
        return jsonResponse(vi, profile);
      }
      if (path === '/api/v1/centres/match' && method === 'POST') {
        matchCalls += 1;
        if (matchCalls === 1) return new Promise((resolve) => { releaseFirstMatch = resolve; });
        return jsonResponse(vi, { profile_id: profile.profile_id, results });
      }
      return Promise.reject(new Error(`Unexpected request: ${method} ${path}`));
    });

    vi.useFakeTimers();
    const slider = screen.getByRole('slider', { name: 'Travel fit' });
    fireEvent.change(slider, { target: { value: '4' } });
    await vi.advanceTimersByTimeAsync(800);
    await vi.waitFor(() => expect(matchCalls).toBe(1));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(saveBodies).toHaveLength(1);
    fireEvent.change(slider, { target: { value: '5' } });
    fireEvent.change(slider, { target: { value: '4' } });
    expect(screen.queryByRole('button', { name: /saving preferences/i })).toBeNull();
    await vi.advanceTimersByTimeAsync(800);
    expect(matchCalls).toBe(2);
    expect(saveBodies.map((body) => body.travel_weight)).toEqual([4]);

    await act(async () => {
      releaseFirstMatch(jsonResponse(vi, { profile_id: profile.profile_id, results: [] }));
      await Promise.resolve();
    });
    vi.useRealTimers();
  });

  it('restarts an invalidated initial match when ratings return to the saved values', async () => {
    await signIn();
    let releaseInitialMatch;
    let matchRequests = 0;
    const priorImplementation = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((input, options = {}) => {
      if (new URL(input).pathname === '/api/v1/centres/match' && (options.method || 'GET') === 'POST') {
        matchRequests += 1;
        if (matchRequests === 1) return new Promise((resolve) => { releaseInitialMatch = resolve; });
      }
      return priorImplementation(input, options);
    });
    await openPage('Find my matches');
    await waitFor(() => expect(matchRequests).toBe(1));
    vi.useFakeTimers();
    const slider = screen.getByRole('slider', { name: 'Travel fit' });
    fireEvent.change(slider, { target: { value: '4' } });
    fireEvent.change(slider, { target: { value: '3' } });
    await vi.advanceTimersByTimeAsync(800);
    await vi.waitFor(() => expect(matchRequests).toBe(2));
    expect(screen.queryByRole('heading', { name: 'Saving your preferences' })).toBeNull();

    await act(async () => {
      releaseInitialMatch(jsonResponse(vi, { profile_id: profile.profile_id, results: [] }));
      await Promise.resolve();
    });
    vi.useRealTimers();
    expect(screen.queryByRole('button', { name: /saving preferences/i })).toBeNull();
  });

  it('lets a new family set independent ratings during onboarding and uses the saved profile for matches', async () => {
    needsOnboarding = true;
    window.localStorage.setItem('kidcare-profile:saved-family-1', JSON.stringify({
      home: '654321', level: 'n1', citizenship: 'SC', service: 'Full Day',
      enrolMonth: '2027-01', budget: 750, work: '', locationPref: 'HOME',
      income: '', members: '', weights: { vacancy: 50, cost: 35, travel: 15 },
    }));
    await signIn({ waitForOverview: false });
    expect(requests.some((request) => request.path === '/api/v1/profile' && request.method === 'GET')).toBe(true);
    expect(screen.getByRole('heading', { name: 'Complete your family profile' })).toBeTruthy();
    const vacancy = await screen.findByRole('slider', { name: 'Vacancy fit' });
    const cost = screen.getByRole('slider', { name: 'Cost fit' });
    const travel = screen.getByRole('slider', { name: 'Travel fit' });
    expect([vacancy.value, cost.value, travel.value]).toEqual(['3', '2', '1']);
    expect(screen.getByRole('button', { name: /save profile/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'How match scores work' }));
    expect(screen.getByRole('dialog').textContent).toContain('Displayed commute modes and estimates are separate');
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    fireEvent.change(vacancy, { target: { value: '2' } });
    fireEvent.change(cost, { target: { value: '2' } });
    fireEvent.change(travel, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));

    await waitFor(() => expect(requests.some((request) => request.path === '/api/v1/profile' && request.method === 'POST')).toBe(true));
    const create = requests.find((request) => request.path === '/api/v1/profile' && request.method === 'POST');
    expect(create.body).toMatchObject({ vacancy_weight: 2, cost_weight: 2, travel_weight: 2 });
    await waitFor(() => expect(requests.some((request) => request.path === '/api/v1/centres/match')).toBe(true));
    const match = requests.find((request) => request.path === '/api/v1/centres/match');
    expect(match.body).toEqual({ profile_id: 'saved-family-1', top_n: 6 });
    await screen.findByText('Showing 6 matches');
  });

  it('shows the backend summary, lead rationale, and aligned candidate highlights without duplicates or provider claims', async () => {
    explanation = {
      summary_narrative: '  Your saved ratings prioritize vacancy and cost.  ',
      ranking_rationale: '  Backend Centre 1 ranks first for its vacancy fit.  ',
      top_centre_rationale: 'Backend Centre 1 best fits your vacancy needs.',
      candidate_highlights: [
        'Backend Centre 1 balances vacancy and cost.',
        'Backend Centre 2 has the best travel fit.',
      ],
    };
    results[0].highlight = 'Backend Centre 1 balances vacancy and cost.';
    results[1].highlight = 'Backend Centre 2 has the best travel fit.';
    await openMatches();

    const summary = await screen.findByRole('heading', { name: 'Fit Explanation' }, { timeout: 5000 });
    expect(summary.parentElement.textContent).toContain('Your saved ratings prioritize vacancy and cost.');
    expect(summary.parentElement.textContent).toContain('Backend Centre 1 ranks first for its vacancy fit.');
    expect(summary.parentElement.textContent.indexOf('Your saved ratings prioritize vacancy and cost.'))
      .toBeLessThan(summary.parentElement.textContent.indexOf('Backend Centre 1 ranks first for its vacancy fit.'));
    expect(summary.parentElement.textContent).not.toContain('  Your saved ratings');
    expect(summary.parentElement.textContent).not.toMatch(/gemini/i);
    const cards = [...document.querySelectorAll('.centre-card')];
    expect(within(cards[0]).getByText(explanation.top_centre_rationale)).toBeTruthy();
    expect(within(cards[0]).getAllByText(explanation.candidate_highlights[0])).toHaveLength(1);
    expect(within(cards[1]).getByText(explanation.candidate_highlights[1])).toBeTruthy();
    expect(within(cards[0]).queryByText(explanation.candidate_highlights[1])).toBeNull();
  });

  it('omits each independently missing or blank explanation field', async () => {
    await openMatches();
    await screen.findByText('Showing 6 matches', {}, { timeout: 4000 });

    const cases = [
      { field: 'summary_narrative', omit: true },
      { field: 'ranking_rationale', omit: true },
      { field: 'top_centre_rationale', omit: true },
      { field: 'candidate_highlights', omit: true },
      { field: 'summary_narrative', blank: '   ' },
      { field: 'ranking_rationale', blank: '\n  ' },
      { field: 'top_centre_rationale', blank: '\n  ' },
      { field: 'candidate_highlights', blank: ['', '  '] },
    ];
    for (const scenario of cases) {
      explanation = {
        summary_narrative: 'An available summary.',
        ranking_rationale: 'An available ranking rationale.',
        top_centre_rationale: 'An available lead rationale.',
        candidate_highlights: ['First positional highlight.', 'Second positional highlight.'],
      };
      if (scenario.omit) delete explanation[scenario.field];
      else explanation[scenario.field] = scenario.blank;
      const requestCount = requests.filter((request) => request.path === '/api/v1/centres/match').length;
      fireEvent.click(screen.getByRole('button', { name: /refresh my matches/i }));
      await waitFor(() => expect(requests.filter((request) => request.path === '/api/v1/centres/match')).toHaveLength(requestCount + 1));
      await screen.findByText('Showing 6 matches', {}, { timeout: 2000 });

      if (scenario.field === 'summary_narrative') {
        expect(screen.getByRole('heading', { name: 'Fit Explanation' })).toBeTruthy();
        expect(screen.getByText('An available ranking rationale.')).toBeTruthy();
        expect(within(document.querySelectorAll('.centre-card')[0]).getByText('An available lead rationale.')).toBeTruthy();
      } else if (scenario.field === 'ranking_rationale') {
        expect(screen.getByRole('heading', { name: 'Fit Explanation' })).toBeTruthy();
        expect(screen.getByText('An available summary.')).toBeTruthy();
        expect(within(document.querySelectorAll('.centre-card')[0]).getByText('An available lead rationale.')).toBeTruthy();
      } else {
        expect(screen.getByRole('heading', { name: 'Fit Explanation' })).toBeTruthy();
      }
      const cards = [...document.querySelectorAll('.centre-card')];
      if (scenario.field === 'top_centre_rationale') {
        expect(within(cards[0]).queryByText('An available lead rationale.')).toBeNull();
      } else if (scenario.field === 'candidate_highlights') {
        expect(within(cards[0]).queryByText('First positional highlight.')).toBeNull();
        expect(within(cards[1]).queryByText('Second positional highlight.')).toBeNull();
      } else {
        expect(within(cards[0]).getByText('An available lead rationale.')).toBeTruthy();
      }
    }
  }, 20000);

  it('shows ranking-only explanations, but omits the banner when both narratives are unusable', async () => {
    explanation = {
      summary_narrative: '   ',
      ranking_rationale: ' Backend Centre 1 ranks ahead because its fit is stronger. ',
      top_centre_rationale: 'Individual centre explanation remains available.',
    };
    await openMatches();

    const heading = await screen.findByRole('heading', { name: 'Fit Explanation' }, { timeout: 5000 });
    expect(heading.parentElement.textContent).toContain('Backend Centre 1 ranks ahead because its fit is stronger.');
    expect(heading.parentElement.textContent).not.toContain('  Backend');
    expect(within(document.querySelectorAll('.centre-card')[0]).getByText('Individual centre explanation remains available.')).toBeTruthy();

    explanation = {
      summary_narrative: {},
      ranking_rationale: ['malformed'],
      top_centre_rationale: 'Individual centre explanation remains available.',
    };
    fireEvent.click(screen.getByRole('button', { name: /refresh my matches/i }));
    await waitFor(() => expect(requests.filter((request) => request.path === '/api/v1/centres/match')).toHaveLength(2));
    await screen.findByText('Showing 6 matches');
    expect(screen.queryByRole('heading', { name: 'Fit Explanation' })).toBeNull();
    expect(within(document.querySelectorAll('.centre-card')[0]).getByText('Individual centre explanation remains available.')).toBeTruthy();
  }, 15000);

  it('shows narratives for one match and suppresses the banner for zero matches', async () => {
    results = results.slice(0, 1);
    explanation = {
      summary_narrative: 'One centre fits the saved preferences.',
      ranking_rationale: 'This centre is the only match returned.',
    };
    await openMatches();

    const heading = await screen.findByRole('heading', { name: 'Fit Explanation' }, { timeout: 5000 });
    expect(heading.parentElement.textContent).toContain('One centre fits the saved preferences.');
    expect(heading.parentElement.textContent).toContain('This centre is the only match returned.');
    expect(document.querySelectorAll('.centre-card')).toHaveLength(1);

    results = [];
    explanation = {
      summary_narrative: 'No matched centres explain this empty pool.',
      ranking_rationale: 'There is no ranking to explain.',
    };
    fireEvent.click(screen.getByRole('button', { name: /refresh my matches/i }));
    await screen.findByRole('heading', { name: 'No matches returned' });
    expect(screen.queryByRole('heading', { name: 'Fit Explanation' })).toBeNull();
  }, 15000);

  it('keeps per-result and positional highlights with their cards through centre detail and return', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    Object.defineProperty(window, 'BroadcastChannel', { configurable: true, value: undefined });
    const cssTestApi = { escape: (value) => String(value) };
    vi.stubGlobal('CSS', cssTestApi);
    Object.defineProperty(window, 'CSS', { configurable: true, value: cssTestApi });
    explanation = {
      summary_narrative: 'A summary that stays with these results.',
      candidate_highlights: ['   ', 'Second centre positional highlight.'],
    };
    results[0].highlight = 'First centre result highlight.';
    results[1].highlight = 'Second centre result highlight.';
    await openMatches();

    await screen.findByText('Showing 6 matches', {}, { timeout: 4000 });
    let cards = [...document.querySelectorAll('.centre-card')];
    expect(cards).toHaveLength(6);
    expect(within(cards[0]).getByText('First centre result highlight.')).toBeTruthy();
    expect(within(cards[0]).queryByText('   ')).toBeNull();
    expect(within(cards[1]).getByText('Second centre positional highlight.')).toBeTruthy();
    expect(within(cards[1]).getByText('Second centre result highlight.')).toBeTruthy();

    fireEvent.click(within(cards[0]).getByRole('button', { name: 'View details' }));
    await screen.findByRole('heading', { level: 1, name: 'Backend Centre 1' });
    fireEvent.click(screen.getByRole('link', { name: /browse centres/i }));
    expect(await screen.findByRole('heading', { name: 'Fit Explanation' }, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByText('A summary that stays with these results.')).toBeTruthy();
    cards = [...document.querySelectorAll('.centre-card')];
    expect(cards).toHaveLength(6);
    expect(within(cards[0]).getByText('First centre result highlight.')).toBeTruthy();
    expect(within(cards[1]).getByText('Second centre positional highlight.')).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(cards[0].querySelector('[data-centre-id="match-1"]')));
  }, 15000);

it('retains edited ratings after an automatic save fails and Retry saves the latest values before matching', async () => {
    await signIn();
    await openPage('Family profile');
    await screen.findByRole('slider', { name: 'Travel fit' });
    await openPage('Find my matches');
    await screen.findByText('Showing 6 matches');
    const slider = screen.getByRole('slider', { name: 'Travel fit' });
    const originalMatchCount = requests.filter((request) => request.path === '/api/v1/centres/match').length;
    let failSave = true;
    fetchMock.mockImplementation(async (input, options = {}) => {
      const path = new URL(input).pathname;
      const method = options.method || 'GET';
      const body = options.body ? JSON.parse(options.body) : null;
      requests.push({ path, method, body });
      if (path === '/api/v1/profile/saved-family-1' && method === 'PUT') {
        if (failSave) return jsonResponse(vi, { detail: 'Save unavailable' }, 503);
        profile = { ...profile, ...body };
        return jsonResponse(vi, profile);
      }
      if (path === '/api/v1/centres/match' && method === 'POST') {
        return jsonResponse(vi, { profile_id: profile.profile_id, results });
      }
      return Promise.reject(new Error(`Unexpected request: ${method} ${path}`));
    });
    fireEvent.change(slider, { target: { value: '5' } });
    await screen.findByRole('button', { name: /retry save/i });
    expect(slider.value).toBe('5');
    expect(screen.getByText('Showing 6 matches')).toBeTruthy();
    expect(requests.filter((request) => request.path === '/api/v1/centres/match')).toHaveLength(originalMatchCount);

    failSave = false;
    fireEvent.click(screen.getByRole('button', { name: /retry save/i }));
    await waitFor(() => expect(requests.filter((request) => request.path === '/api/v1/centres/match')).toHaveLength(originalMatchCount + 1));
    const lastSave = requests.filter((request) => request.path === '/api/v1/profile/saved-family-1').at(-1);
    expect(lastSave.body.travel_weight).toBe(5);
    const latestSaveIndex = requests.findLastIndex((request) => request.path === '/api/v1/profile/saved-family-1');
    const latestMatchIndex = requests.findLastIndex((request) => request.path === '/api/v1/centres/match');
    expect(latestSaveIndex).toBeLessThan(latestMatchIndex);
  });

  it('keeps prior matches visible and marked outdated when a fresh matching request fails', async () => {
    await signIn();
    await openPage('Family profile');
    await screen.findByRole('slider', { name: 'Travel fit' });
    await openPage('Find my matches');
    await screen.findByText('Showing 6 matches');
    fetchMock.mockImplementation(async (input, options = {}) => {
      const path = new URL(input).pathname;
      const method = options.method || 'GET';
      const body = options.body ? JSON.parse(options.body) : null;
      requests.push({ path, method, body });
      if (path === '/api/v1/centres/match' && method === 'POST') throw new Error('Matching unavailable');
      return Promise.reject(new Error(`Unexpected request: ${method} ${path}`));
    });
    fireEvent.click(screen.getByRole('button', { name: /refresh my matches/i }));
    await screen.findByText(/results are out of date/i);
    expect(screen.getByRole('heading', { name: 'Backend Centre 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /retry matching/i })).toBeTruthy();
  });

  it('keeps a pending importance edit when navigating to Family profile', async () => {
    await signIn();
    await openPage('Family profile');
    await screen.findByRole('slider', { name: 'Travel fit' });
    await openPage('Find my matches');
    await screen.findByText('Showing 6 matches');
    fireEvent.change(screen.getByRole('slider', { name: 'Travel fit' }), { target: { value: '4' } });
    await openPage('Family profile');
    expect(screen.getByRole('slider', { name: 'Travel fit' }).value).toBe('4');
    await waitFor(() => expect(requests.some((request) => request.path === '/api/v1/profile/saved-family-1' && request.method === 'PUT' && request.body.travel_weight === 4)).toBe(true), { timeout: 3000 });
  });

  it('explains no-result failures and recovers to a successful empty result after save Retry', async () => {
    await signIn();
    await openPage('Family profile');
    await screen.findByRole('slider', { name: 'Travel fit' });
    let failSave = true;
    let failFirstMatch = true;
    fetchMock.mockImplementation(async (input, options = {}) => {
      const path = new URL(input).pathname;
      const method = options.method || 'GET';
      const body = options.body ? JSON.parse(options.body) : null;
      requests.push({ path, method, body });
      if (path === '/api/v1/profile/saved-family-1' && method === 'PUT') {
        if (failSave) return jsonResponse(vi, { detail: 'Save unavailable' }, 503);
        profile = { ...profile, ...body };
        return jsonResponse(vi, profile);
      }
      if (path === '/api/v1/centres/match' && method === 'POST') {
        if (failFirstMatch) {
          failFirstMatch = false;
          throw new Error('Matching unavailable');
        }
        return jsonResponse(vi, { profile_id: profile.profile_id, results: [] });
      }
      return Promise.reject(new Error(`Unexpected request: ${method} ${path}`));
    });
    await openPage('Find my matches');
    await screen.findByRole('button', { name: /retry matching/i });
    fireEvent.change(screen.getByRole('slider', { name: 'Travel fit' }), { target: { value: '5' } });
    await screen.findByRole('button', { name: /retry save/i });
    expect(screen.queryByRole('heading', { name: 'Backend Centre 1' })).toBeNull();
    failSave = false;
    fireEvent.click(screen.getByRole('button', { name: /retry save/i }));
    await screen.findByRole('heading', { name: 'No matches returned' });
    expect(screen.getByText(/did not return any centres/i)).toBeTruthy();
  });

  it('ignores a delayed earlier match response after a newer rating run completes', async () => {
    await signIn();
    await openPage('Family profile');
    await screen.findByRole('slider', { name: 'Travel fit' });
    await openPage('Find my matches');
    await screen.findByText('Showing 6 matches');
    const deferred = [];
    let matchingCalls = 0;
    fetchMock.mockImplementation(async (input, options = {}) => {
      const path = new URL(input).pathname;
      const method = options.method || 'GET';
      const body = options.body ? JSON.parse(options.body) : null;
      requests.push({ path, method, body });
      if (path === '/api/v1/profile/saved-family-1' && method === 'PUT') {
        profile = { ...profile, ...body };
        return jsonResponse(vi, profile);
      }
      if (path === '/api/v1/centres/match' && method === 'POST') {
        matchingCalls += 1;
        if (matchingCalls === 1) return new Promise((resolve) => deferred.push(resolve));
        return jsonResponse(vi, { profile_id: profile.profile_id, results: [{ ...results[0], centre_name: 'Latest Centre' }] });
      }
      return Promise.reject(new Error(`Unexpected request: ${method} ${path}`));
    });

    vi.useFakeTimers();
    fireEvent.change(screen.getByRole('slider', { name: 'Travel fit' }), { target: { value: '4' } });
    await vi.advanceTimersByTimeAsync(800);
    expect(matchingCalls).toBe(1);
    fireEvent.change(screen.getByRole('slider', { name: 'Travel fit' }), { target: { value: '2' } });
    await act(async () => {
      deferred[0](jsonResponse(vi, { profile_id: profile.profile_id, results: [{ ...results[0], centre_name: 'Stale Centre' }] }));
      await Promise.resolve();
    });
    expect(screen.getByText(/results are out of date/i)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Backend Centre 1' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Stale Centre' })).toBeNull();
    await vi.advanceTimersByTimeAsync(800);
    expect(matchingCalls).toBe(2);
    vi.useRealTimers();
    await screen.findByRole('heading', { name: 'Latest Centre' });
    expect(screen.queryByRole('heading', { name: 'Stale Centre' })).toBeNull();
    expect(screen.getByRole('slider', { name: 'Travel fit' }).value).toBe('2');
  });

  it('serializes overlapping saves so the older write cannot replace the latest rating', async () => {
    await signIn();
    await openPage('Family profile');
    await screen.findByRole('slider', { name: 'Travel fit' });
    await openPage('Find my matches');
    await screen.findByText('Showing 6 matches');
    let releaseFirstSave;
    const saveBodies = [];
    fetchMock.mockImplementation(async (input, options = {}) => {
      const path = new URL(input).pathname;
      const method = options.method || 'GET';
      const body = options.body ? JSON.parse(options.body) : null;
      requests.push({ path, method, body });
      if (path === '/api/v1/profile/saved-family-1' && method === 'PUT') {
        saveBodies.push(body);
        if (saveBodies.length === 1) return new Promise((resolve) => { releaseFirstSave = resolve; });
        profile = { ...profile, ...body };
        return jsonResponse(vi, profile);
      }
      if (path === '/api/v1/centres/match' && method === 'POST') return jsonResponse(vi, { profile_id: profile.profile_id, results });
      return Promise.reject(new Error(`Unexpected request: ${method} ${path}`));
    });
    vi.useFakeTimers();
    fireEvent.change(screen.getByRole('slider', { name: 'Travel fit' }), { target: { value: '4' } });
    await vi.advanceTimersByTimeAsync(800);
    expect(saveBodies).toHaveLength(1);
    fireEvent.change(screen.getByRole('slider', { name: 'Travel fit' }), { target: { value: '2' } });
    await vi.advanceTimersByTimeAsync(800);
    expect(saveBodies).toHaveLength(1);
    await act(async () => {
      vi.useRealTimers();
      releaseFirstSave(jsonResponse(vi, { ...profile, travel_weight: 4 }));
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(saveBodies).toHaveLength(2), { timeout: 3000 });
    expect(saveBodies[0].travel_weight).toBe(4);
    expect(saveBodies[1].travel_weight).toBe(2);
    await waitFor(() => expect(profile.travel_weight).toBe(2));
  });

  it('serializes automatic and Family profile saves so the later form values win', async () => {
    await signIn();
    await openPage('Family profile');
    await screen.findByRole('slider', { name: 'Travel fit' });
    await openPage('Find my matches');
    await screen.findByText('Showing 6 matches');
    let releaseAutomaticSave;
    const saveBodies = [];
    const initialMatchCount = requests.filter((request) => request.path === '/api/v1/centres/match').length;
    fetchMock.mockImplementation(async (input, options = {}) => {
      const path = new URL(input).pathname;
      const method = options.method || 'GET';
      const body = options.body ? JSON.parse(options.body) : null;
      requests.push({ path, method, body });
      if (path === '/api/v1/profile/saved-family-1' && method === 'PUT') {
        saveBodies.push(body);
        if (saveBodies.length === 1) return new Promise((resolve) => { releaseAutomaticSave = resolve; });
        profile = { ...profile, ...body };
        return jsonResponse(vi, profile);
      }
      if (path === '/api/v1/centres/match' && method === 'POST') return jsonResponse(vi, { profile_id: profile.profile_id, results });
      return Promise.reject(new Error(`Unexpected request: ${method} ${path}`));
    });

    vi.useFakeTimers();
    fireEvent.change(screen.getByRole('slider', { name: 'Travel fit' }), { target: { value: '4' } });
    await vi.advanceTimersByTimeAsync(800);
    expect(saveBodies).toHaveLength(1);
    await openPage('Family profile');
    fireEvent.change(screen.getByLabelText('Home postal code'), { target: { value: '111111' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Travel fit' }), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));
    expect(saveBodies).toHaveLength(1);
    await act(async () => {
      vi.useRealTimers();
      releaseAutomaticSave(jsonResponse(vi, { ...profile, travel_weight: 4 }));
      await Promise.resolve();
    });
    await waitFor(() => expect(saveBodies).toHaveLength(2));
    expect(saveBodies[0].travel_weight).toBe(4);
    expect(saveBodies[1]).toMatchObject({ home_postal_code: '111111', travel_weight: 5 });
    await screen.findByRole('button', { name: /save profile/i });
    expect(profile).toMatchObject({ home_postal_code: '111111', travel_weight: 5 });
    expect(requests.filter((request) => request.path === '/api/v1/centres/match')).toHaveLength(initialMatchCount);
  });

  it('does not dispatch a queued Family profile save after the family identity changes', async () => {
    await signIn();
    await openPage('Family profile');
    await screen.findByRole('slider', { name: 'Travel fit' });
    await openPage('Find my matches');
    await screen.findByText('Showing 6 matches');
    const priorImplementation = fetchMock.getMockImplementation();
    let releaseAutomaticSave;
    let saveCount = 0;
    fetchMock.mockImplementation((input, options = {}) => {
      const path = new URL(input).pathname;
      if (path === '/api/v1/profile/saved-family-1' && options.method === 'PUT') {
        saveCount += 1;
        if (saveCount === 1) return new Promise((resolve) => { releaseAutomaticSave = resolve; });
      }
      return priorImplementation(input, options);
    });
    vi.useFakeTimers();
    fireEvent.change(screen.getByRole('slider', { name: 'Travel fit' }), { target: { value: '4' } });
    await vi.advanceTimersByTimeAsync(800);
    expect(saveCount).toBe(1);
    await openPage('Family profile');
    fireEvent.change(screen.getByLabelText('Home postal code'), { target: { value: '111111' } });
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));
    expect(saveCount).toBe(1);
    const priorProfileGetCount = requests.filter((request) => request.path === '/api/v1/profile' && request.method === 'GET').length;
    const nextUser = {
      uid: 'another-family', email: 'other@example.com', emailVerified: true,
      providerId: 'google.com', getIdToken: vi.fn().mockResolvedValue('other-token'),
    };
    vi.useRealTimers();
    authHarness.currentUser = nextUser;
    authHarness.listener(nextUser);
    await waitFor(() => expect(requests.filter((request) => request.path === '/api/v1/profile' && request.method === 'GET').length).toBeGreaterThan(priorProfileGetCount));
    await act(async () => {
      releaseAutomaticSave(jsonResponse(vi, { ...profile, travel_weight: 4 }));
      await Promise.resolve();
    });
    await openPage('Family profile');
    await screen.findByRole('slider', { name: 'Travel fit' });
    expect(saveCount).toBe(1);
  });

  it('drops pending personal matches when the signed-in family changes', async () => {
    await signIn();
    await openPage('Family profile');
    await screen.findByRole('slider', { name: 'Travel fit' });
    await openPage('Find my matches');
    await screen.findByText('Showing 6 matches');
    const priorImplementation = fetchMock.getMockImplementation();
    const releaseMatches = [];
    let pendingMatchCount = 0;
    fetchMock.mockImplementation((input, options = {}) => {
      const path = new URL(input).pathname;
      if (path === '/api/v1/centres/match' && (options.method || 'GET') === 'POST') {
        pendingMatchCount += 1;
        return new Promise((resolve) => { releaseMatches.push(resolve); });
      }
      return priorImplementation(input, options);
    });
    fireEvent.click(screen.getByRole('button', { name: /refresh my matches/i }));
    await waitFor(() => expect(pendingMatchCount).toBe(1));
    const priorProfileGetCount = requests.filter((request) => request.path === '/api/v1/profile' && request.method === 'GET').length;
    const nextUser = {
      uid: 'another-family', email: 'other@example.com', emailVerified: true,
      providerId: 'google.com', getIdToken: vi.fn().mockResolvedValue('other-token'),
    };
    authHarness.currentUser = nextUser;
    authHarness.listener(nextUser);
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Backend Centre 1' })).toBeNull());
    await waitFor(() => expect(requests.filter((request) => request.path === '/api/v1/profile' && request.method === 'GET').length).toBeGreaterThan(priorProfileGetCount));
    await openPage('Family profile');
    await screen.findByRole('slider', { name: 'Travel fit' });
    await openPage('Find my matches');
    await waitFor(() => expect(pendingMatchCount).toBe(2));
    await act(async () => {
      releaseMatches[0](jsonResponse(vi, { profile_id: 'saved-family-1', results: [{ ...results[0], centre_name: 'Previous family result' }] }));
      await Promise.resolve();
    });
    expect(screen.getByText('Working on it')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Previous family result' })).toBeNull();
    releaseMatches[1](jsonResponse(vi, { profile_id: 'another-family', results: [{ ...results[0], centre_name: 'New family result' }] }));
    await screen.findByRole('heading', { name: 'New family result' });
  });

  it('keeps server ratings over older saved return controls without writing them back', async () => {
    profile = { ...profile, vacancy_weight: 5, cost_weight: 5, travel_weight: 5 };
    await signIn();
    await openPage('Family profile');
    await screen.findByRole('slider', { name: 'Travel fit' });
    await openPage('Find my matches');
    await screen.findByText('Showing 6 matches');
    const matchCount = requests.filter((request) => request.path === '/api/v1/centres/match').length;
    const contextId = saveCentreReturnContext({
      uid: 'saved-family-1',
      page: 'Find my matches',
      matchControls: { budget: 750, weights: { vacancy: 1, cost: 1, travel: 1 } },
      matchSnapshot: { results: [], run: { uid: 'saved-family-1', profileId: 'saved-family-1', weights: { vacancy: 1, cost: 1, travel: 1 }, explanation: null } },
    });
    window.history.replaceState({ centreOriginId: contextId }, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await waitFor(() => expect(screen.getByRole('slider', { name: 'Travel fit' }).value).toBe('5'));
    expect(screen.getByRole('slider', { name: 'Vacancy fit' }).value).toBe('5');
    expect(screen.getByRole('slider', { name: 'Cost fit' }).value).toBe('5');
    expect(requests.filter((request) => request.path === '/api/v1/profile/saved-family-1' && request.method === 'PUT')).toHaveLength(0);
    expect(requests.filter((request) => request.path === '/api/v1/centres/match')).toHaveLength(matchCount);
  });
});
