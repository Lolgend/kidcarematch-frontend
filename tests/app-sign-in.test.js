// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { failClosedFetch, jsonResponse } from './support/fetch.js';
import { saveCentreReturnContext } from '../src/centreReturnContext.js';

const authHarness = vi.hoisted(() => ({
  listener: null,
  initialUser: null,
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  onAuthStateChanged: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../src/firebase', () => ({ auth: { currentUser: null } }));
vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: authHarness.signInWithEmailAndPassword,
  signInWithPopup: authHarness.signInWithPopup,
  onAuthStateChanged: authHarness.onAuthStateChanged,
  GoogleAuthProvider: class GoogleAuthProvider {},
  createUserWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendEmailVerification: vi.fn(),
  signOut: authHarness.signOut,
  updateProfile: vi.fn(),
}));

import { renderApp } from './support/appHarness.js';

const completeProfile = {
  profile_id: 'family-1', profile_name: 'Our family', home_postal_code: '654321',
  level: 'n1', citizenship_status: 'SC', service_required: 'Full Day',
  enrollment_month_year: '2026-12', budget_max: 750, workplace_postal_code: null,
  location_preference: 'HOME', household_income: 0, household_member_count: 1,
  vacancy_weight: 3, cost_weight: 3, travel_weight: 3,
};

describe('deliberate parent sign-in navigation', () => {
  let fetchMock;
  beforeEach(() => {
    authHarness.initialUser = null;
    vi.stubEnv('VITE_API_URL', 'https://api.test');
    fetchMock = failClosedFetch(vi);
    fetchMock.mockImplementation(async (input, options = {}) => {
      const path = new URL(input).pathname;
      const responses = {
        '/api/v1/users/me': { role: 'PARENT' },
        '/api/v1/profile': [completeProfile],
        '/api/v1/centres': { centres: [], total: 0 },
        '/api/v1/centres/districts': [],
        '/api/v1/centres/summary': {},
        '/api/v1/watchlist/me': [],
        '/api/v1/notifications': { items: [], unread_count: 0 },
      };
      if (path in responses) return jsonResponse(vi, responses[path]);
      if (path === '/api/v1/centres/match' && options.method === 'POST') return jsonResponse(vi, { results: [] });
      fetchMock.unexpectedCalls.push([input, options]);
      return Promise.reject(new Error(`Unexpected request: ${options.method || 'GET'} ${path}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    authHarness.listener = null;
    authHarness.signInWithEmailAndPassword.mockReset();
    authHarness.signInWithPopup.mockReset();
    authHarness.signOut.mockReset();
    authHarness.signOut.mockImplementation(async () => authHarness.listener(null));
    authHarness.onAuthStateChanged.mockImplementation((_auth, callback) => {
      authHarness.listener = callback;
      callback(authHarness.initialUser);
      return vi.fn();
    });
  });

  afterEach(() => {
    expect(fetchMock.unexpectedCalls).toEqual([]);
    vi.clearAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
  });

  async function configureSignIn(method, user) {
    if (method === 'email') authHarness.signInWithEmailAndPassword.mockImplementation(async () => {
      authHarness.listener(user);
      return { user };
    });
    else authHarness.signInWithPopup.mockImplementation(async () => {
      authHarness.listener(user);
      return { user };
    });
  }

  async function submitSignIn(method, user) {
    await configureSignIn(method, user);
    if (!screen.queryByLabelText(/email/i)) fireEvent.click(screen.getByTitle('Sign in / register'));
    if (method === 'email') {
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: user.email } });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret-password' } });
      fireEvent.click(document.querySelector('form button[type="submit"]'));
    } else {
      fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    }
  }

  async function signInWith(method) {
    const user = { uid: 'family-1', email: 'parent@example.com', emailVerified: true, providerId: method === 'google' ? 'google.com' : 'password' };
    await renderApp();
    await submitSignIn(method, user);
    await waitFor(() => expect(screen.getByText('Your family\'s next big step starts here')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Overview', { selector: 'b' })).toBeTruthy());
  }

  it('opens Overview after a successful email sign-in', async () => {
    await signInWith('email');
  });

  it('opens Overview after a successful Google sign-in', async () => {
    await signInWith('google');
  });

  it('keeps required onboarding after email sign-in when no family profile exists', async () => {
    fetchMock.mockImplementation(async (input, options = {}) => {
      const path = new URL(input).pathname;
      const responses = {
        '/api/v1/users/me': { role: 'PARENT' }, '/api/v1/profile': [],
        '/api/v1/centres': { centres: [], total: 0 }, '/api/v1/centres/districts': [],
        '/api/v1/centres/summary': {}, '/api/v1/watchlist/me': [],
        '/api/v1/notifications': { items: [], unread_count: 0 },
      };
      if (path === '/api/v1/profile' && options.method === 'POST') return jsonResponse(vi, completeProfile, 201);
      if (path === '/api/v1/centres/match' && options.method === 'POST') return jsonResponse(vi, { results: [] });
      if (path in responses) return jsonResponse(vi, responses[path]);
      fetchMock.unexpectedCalls.push([input, options]);
      return Promise.reject(new Error(`Unexpected request: ${options.method || 'GET'} ${path}`));
    });
    const user = { uid: 'new-family', email: 'new@example.com', emailVerified: true, providerId: 'password' };
    await renderApp();
    await submitSignIn('email', user);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Complete your family profile' })).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/home postal code/i), { target: { value: '654321' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /save profile/i })); });
    await waitFor(() => expect(screen.getByText('Find my matches', { selector: 'b' })).toBeTruthy());
  });

  it('sends deliberate sign-in to Overview when the session restored Compare', async () => {
    const user = { uid: 'family-1', email: 'parent@example.com', emailVerified: true, providerId: 'password' };
    const contextId = saveCentreReturnContext({
      uid: user.uid, page: 'Compare centres', compareStep: 'selection', compareSelectedIds: [],
    });
    window.history.replaceState({ centreOriginId: contextId }, '', '/');
    authHarness.initialUser = user;
    await renderApp();
    await waitFor(() => expect(screen.getByText('Compare centres', { selector: 'b' })).toBeTruthy());
    await submitSignIn('email', user);
    await waitFor(() => expect(screen.getByText('Overview', { selector: 'b' })).toBeTruthy());
  });

  it('keeps a restored Compare destination on an ordinary refresh', async () => {
    const user = { uid: 'family-1', email: 'parent@example.com', emailVerified: true, providerId: 'password' };
    const contextId = saveCentreReturnContext({
      uid: user.uid, page: 'Compare centres', compareStep: 'selection', compareSelectedIds: [],
    });
    window.history.replaceState({ centreOriginId: contextId }, '', '/');
    authHarness.initialUser = user;
    const app = await renderApp();
    await waitFor(() => expect(screen.getByText('Compare centres', { selector: 'b' })).toBeTruthy());

    app.unmount();
    await renderApp();
    await waitFor(() => expect(screen.getByText('Compare centres', { selector: 'b' })).toBeTruthy());
  });

  it('clears the active account after sign-out instead of retaining its personal view', async () => {
    authHarness.initialUser = { uid: 'family-1', email: 'parent@example.com', emailVerified: true, providerId: 'password' };
    await renderApp();
    await waitFor(() => expect(screen.getByText('parent@example.com')).toBeTruthy());
    fireEvent.click(screen.getByTitle('Sign out'));
    await waitFor(() => expect(screen.getByText('Not signed in')).toBeTruthy());
    expect(screen.getByText('Overview', { selector: 'b' })).toBeTruthy();
  });

  it('clears the active account browsing page when Firebase switches identities', async () => {
    authHarness.initialUser = { uid: 'family-1', email: 'parent@example.com', emailVerified: true, providerId: 'password' };
    await renderApp();
    await waitFor(() => expect(screen.getByText('parent@example.com')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /compare centres/i }));
    await waitFor(() => expect(screen.getByText('Compare centres', { selector: 'b' })).toBeTruthy());

    await act(async () => authHarness.listener({ uid: 'family-2', email: 'other@example.com', emailVerified: true, providerId: 'password' }));
    await waitFor(() => expect(screen.getByText('other@example.com')).toBeTruthy());
    expect(screen.getByText('Overview', { selector: 'b' })).toBeTruthy();
  });
});
