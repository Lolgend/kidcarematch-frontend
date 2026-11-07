// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { failClosedFetch, jsonResponse } from './support/fetch.js';

const authHarness = vi.hoisted(() => ({
  listener: null,
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  onAuthStateChanged: vi.fn(),
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
  signOut: vi.fn(),
  updateProfile: vi.fn(),
}));

import { renderApp } from './support/appHarness.js';

const completeProfile = {
  profile_id: 'family-1', profile_name: 'Our family', home_postal_code: '654321',
  level: 'n1', citizenship_status: 'SC', service_required: 'Full Day',
  enrollment_month_year: '2026-12', budget_max: 750, workplace_postal_code: null,
  location_preference: 'HOME', household_income: 0, household_member_count: 1,
  vacancy_weight: 0.5, cost_weight: 0.35, travel_weight: 0.15,
};

describe('deliberate parent sign-in navigation', () => {
  let fetchMock;
  beforeEach(() => {
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
      return Promise.reject(new Error(`Unexpected request: ${options.method || 'GET'} ${path}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    authHarness.listener = null;
    authHarness.signInWithEmailAndPassword.mockReset();
    authHarness.signInWithPopup.mockReset();
    authHarness.onAuthStateChanged.mockImplementation((_auth, callback) => {
      authHarness.listener = callback;
      callback(null);
      return vi.fn();
    });
  });

  afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  async function signInWith(method) {
    const user = { uid: 'family-1', email: 'parent@example.com', emailVerified: true, providerId: method === 'google' ? 'google.com' : 'password' };
    if (method === 'email') authHarness.signInWithEmailAndPassword.mockImplementation(async () => {
      authHarness.listener(user);
      return { user };
    });
    else authHarness.signInWithPopup.mockImplementation(async () => {
      authHarness.listener(user);
      return { user };
    });
    await renderApp();
    if (method === 'email') {
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: user.email } });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret-password' } });
      fireEvent.click(document.querySelector('form button[type="submit"]'));
    } else {
      fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    }
    await waitFor(() => expect(screen.getByText('Your family\'s next big step starts here')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Overview', { selector: 'b' })).toBeTruthy());
  }

  it('opens Overview after a successful email sign-in', async () => {
    await signInWith('email');
  });

  it('opens Overview after a successful Google sign-in', async () => {
    await signInWith('google');
  });
});
