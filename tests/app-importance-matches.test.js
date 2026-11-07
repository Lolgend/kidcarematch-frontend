// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { failClosedFetch, jsonResponse } from './support/fetch.js';

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
        return jsonResponse(vi, { profile_id: profile.profile_id, total_candidates: results.length, returned_count: results.length, results });
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
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    if (waitForOverview) {
      await waitFor(() => expect(screen.getByText('Overview', { selector: 'b' })).toBeTruthy());
    } else {
      await waitFor(() => expect(requests.some((request) => request.path === '/api/v1/profile' && request.method === 'GET')).toBe(true));
    }
  }

  async function openPage(label) {
    const nav = [...document.querySelectorAll('.nav-item')].find((button) => button.textContent.includes(label));
    expect(nav).toBeTruthy();
    fireEvent.click(nav);
  }

  it('loads, saves, and matches with exact integer ratings; keeps backend order, score, fee, vacancy, count, and centre actions', async () => {
    await signIn();
    await openPage('Family profile');
    const vacancy = screen.getByRole('slider', { name: 'Vacancy fit' });
    const cost = screen.getByRole('slider', { name: 'Cost fit' });
    const travel = screen.getByRole('slider', { name: 'Travel fit' });
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
    await waitFor(() => expect(screen.getByText('Showing 10 matches')).toBeTruthy());
    const matchRequests = requests.filter((request) => request.path === '/api/v1/centres/match');
    expect(matchRequests[0].body).toEqual({ profile_id: 'saved-family-1', top_n: 10 });
    const cards = [...document.querySelectorAll('.centre-card')];
    expect(cards).toHaveLength(10);
    expect(within(cards[0]).getByRole('heading', { name: 'Backend Centre 1' })).toBeTruthy();
    expect(within(cards[1]).getByRole('heading', { name: 'Backend Centre 2' })).toBeTruthy();
    expect(within(cards[0]).getByText(/21% match/)).toBeTruthy();
    expect(cards[0].textContent).toContain('Published monthly fee: $1100.00');
    expect(cards[0].textContent).toContain('Estimated subsidy: $300.00');
    expect(cards[0].textContent).toContain('Estimated monthly payable: $800.00');
    expect(within(cards[0]).getByText('Vacancy: Waitlist')).toBeTruthy();
    expect(cards[0].textContent).toContain('Vacancy fit 86% · Cost fit 72% · Travel fit 49%');
    expect(cards[0].textContent).toContain('Vacancy month: Jan 2027');
    expect(cards[0].textContent).toContain('Matching travel estimate: 18 min · 3 km');
    expect(screen.queryByRole('heading', { name: 'Backend Centre 11' })).toBeNull();

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
    expect(requests[latestMatchIndex].body).toEqual({ profile_id: 'saved-family-1', top_n: 10 });

    results = [];
    fireEvent.click(screen.getByRole('button', { name: /refresh my matches/i }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'No matches returned' })).toBeTruthy());
    expect(screen.getByText(/did not return any centres/i)).toBeTruthy();
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
    expect(match.body).toEqual({ profile_id: 'saved-family-1', top_n: 10 });
    await screen.findByText('Showing 10 matches');
  });
});
