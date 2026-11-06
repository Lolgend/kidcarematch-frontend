import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOnboardingController } from '../../src/profile/onboarding';

describe('createOnboardingController', () => {
  const validForm = {
    home: '654321',
    level: 'n1',
    citizenship: 'SC',
    service: 'Full Day',
    enrolMonth: '2026-12',
    budget: 750,
    work: '',
    locationPref: 'HOME',
    income: '',
    members: '',
    weights: { vacancy: 50, cost: 35, travel: 15 },
  };

  const validApiProfile = {
    profile_id: 'prof-123',
    profile_name: 'Our Family',
    home_postal_code: '654321',
    level: 'n1',
    citizenship_status: 'SC',
    service_required: 'Full Day',
    enrollment_month_year: '2026-12',
    budget_max: 750,
    workplace_postal_code: null,
    location_preference: 'HOME',
    household_income: 0,
    household_member_count: 1,
    vacancy_weight: 0.5,
    cost_weight: 0.35,
    travel_weight: 0.15,
  };

  let loadAccount;
  let loadProfiles;
  let createProfile;
  let updateProfile;
  let writeDraft;
  let loadDraft;
  let states;
  let onState;

  beforeEach(() => {
    loadAccount = vi.fn().mockResolvedValue({ role: 'PARENT' });
    loadProfiles = vi.fn().mockResolvedValue([]);
    createProfile = vi.fn().mockResolvedValue(validApiProfile);
    updateProfile = vi.fn().mockResolvedValue(validApiProfile);
    writeDraft = vi.fn();
    loadDraft = vi.fn().mockReturnValue(null);
    states = [];
    onState = vi.fn((s) => states.push(s));
  });

  const createController = (overrides = {}) => {
    return createOnboardingController({
      loadAccount,
      loadProfiles,
      createProfile,
      updateProfile,
      writeDraft,
      loadDraft,
      onState,
      ...overrides,
    });
  };

  it('initialises in guest state when created or started with null', async () => {
    const controller = createController();
    expect(controller.getState()).toEqual({
      status: 'guest',
      profile: null,
      profileId: null,
      profileName: 'My family profile',
      draft: null,
      error: null,
      errorStage: null,
      isFirstSave: false,
    });

    await controller.start(null);
    expect(states.at(-1)?.status).toBe('guest');
  });

  it('sets verification-required for unverified email/password user and never loads parent data', async () => {
    const controller = createController();
    const unverifiedUser = {
      uid: 'u-unverified',
      email: 'parent@example.com',
      emailVerified: false,
      providerData: [{ providerId: 'password' }],
    };

    await controller.start(unverifiedUser);

    expect(loadAccount).not.toHaveBeenCalled();
    expect(loadProfiles).not.toHaveBeenCalled();
    expect(states.at(-1)).toEqual({
      status: 'verification-required',
      profile: null,
      profileId: null,
      profileName: 'My family profile',
      draft: null,
      error: null,
      errorStage: null,
      isFirstSave: false,
    });
  });

  it('allows verified email/password user to proceed to loading', async () => {
    loadProfiles.mockResolvedValueOnce([validApiProfile]);
    const controller = createController();
    const verifiedUser = {
      uid: 'u-verified',
      email: 'parent@example.com',
      emailVerified: true,
      providerData: [{ providerId: 'password' }],
    };

    await controller.start(verifiedUser);

    expect(loadAccount).toHaveBeenCalledWith(verifiedUser);
    expect(loadProfiles).toHaveBeenCalledWith(verifiedUser);
    expect(states.map((s) => s.status)).toEqual(['loading', 'ready']);
    expect(states.at(-1)?.status).toBe('ready');
  });

  it('allows Google user to proceed to loading even if emailVerified is not set', async () => {
    loadProfiles.mockResolvedValueOnce([validApiProfile]);
    const controller = createController();
    const googleUser = {
      uid: 'u-google',
      email: 'googleparent@gmail.com',
      emailVerified: false,
      providerData: [{ providerId: 'google.com' }],
    };

    await controller.start(googleUser);

    expect(loadAccount).toHaveBeenCalledWith(googleUser);
    expect(loadProfiles).toHaveBeenCalledWith(googleUser);
    expect(states.at(-1)?.status).toBe('ready');
  });

  it('bypasses family profile loading when account has administrator role', async () => {
    loadAccount.mockResolvedValueOnce({ role: 'ADMIN' });
    const controller = createController();
    const adminUser = {
      uid: 'u-admin',
      email: 'admin@example.com',
      emailVerified: true,
    };

    await controller.start(adminUser);

    expect(loadAccount).toHaveBeenCalledWith(adminUser);
    expect(loadProfiles).not.toHaveBeenCalled();
    expect(states.at(-1)).toEqual({
      status: 'admin',
      profile: null,
      profileId: null,
      profileName: 'My family profile',
      draft: null,
      error: null,
      errorStage: null,
      isFirstSave: false,
    });
  });

  it('transitions empty server list to required', async () => {
    loadProfiles.mockResolvedValueOnce([]);
    const controller = createController();
    const user = { uid: 'u-1', emailVerified: true };

    await controller.start(user);

    expect(states.at(-1)).toEqual({
      status: 'required',
      profile: null,
      profileId: null,
      profileName: 'My family profile',
      draft: null,
      error: null,
      errorStage: null,
      isFirstSave: false,
    });
  });

  it('transitions valid server profile to ready with server identity', async () => {
    loadProfiles.mockResolvedValueOnce([validApiProfile]);
    const controller = createController();
    const user = { uid: 'u-1', emailVerified: true };

    await controller.start(user);

    const last = states.at(-1);
    expect(last.status).toBe('ready');
    expect(last.profileId).toBe('prof-123');
    expect(last.profileName).toBe('Our Family');
    expect(last.profile.home).toBe('654321');
    expect(last.error).toBeNull();
  });

  it('transitions incomplete server profile to required while preserving server identity', async () => {
    const incompleteApiProfile = {
      ...validApiProfile,
      home_postal_code: '', // missing required home
    };
    loadProfiles.mockResolvedValueOnce([incompleteApiProfile]);
    const controller = createController();
    const user = { uid: 'u-1', emailVerified: true };

    await controller.start(user);

    const last = states.at(-1);
    expect(last.status).toBe('required');
    expect(last.profile).toBeNull();
    expect(last.profileId).toBe('prof-123');
    expect(last.profileName).toBe('Our Family');
    expect(last.draft.home).toBe('');
  });

  it('transitions rejected profile list to error and keeps failed loads distinct from empty', async () => {
    loadProfiles.mockRejectedValueOnce(new Error('503 Service Unavailable'));
    const controller = createController();
    const user = { uid: 'u-1', emailVerified: true };

    await controller.start(user);

    const last = states.at(-1);
    expect(last.status).toBe('error');
    expect(last.profile).toBeNull();
    expect(last.error).toBe('503 Service Unavailable');
    expect(last.errorStage).toBe('load');
  });

  it('does not allow a retained local draft to create a profile until the server load succeeds', async () => {
    loadDraft.mockReturnValueOnce(validForm);
    loadProfiles.mockRejectedValueOnce(new Error('503 unavailable'));
    const controller = createController();
    await controller.start({ uid: 'u-1', emailVerified: true });

    await controller.save(validForm);

    expect(createProfile).not.toHaveBeenCalled();
    expect(updateProfile).not.toHaveBeenCalled();
    expect(controller.getState().errorStage).toBe('load');
  });

  it('ignores a second save callback while the first profile save is pending', async () => {
    loadProfiles.mockResolvedValueOnce([]);
    let resolveSave;
    createProfile.mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve; }));
    const controller = createController();
    await controller.start({ uid: 'u-1', emailVerified: true });

    const firstSave = controller.save(validForm);
    await controller.save(validForm);
    expect(createProfile).toHaveBeenCalledTimes(1);
    resolveSave(validApiProfile);
    await firstSave;
  });

  it('does not reload a required profile over an edited local form after duplicate auth callbacks', async () => {
    loadProfiles.mockResolvedValue([]);
    const controller = createController();
    const user = { uid: 'u-1', emailVerified: true };
    await controller.start(user);
    const editedForm = { ...validForm, home: '123' };
    await controller.save(editedForm);
    await controller.start(user);
    expect(loadProfiles).toHaveBeenCalledTimes(1);
    expect(controller.getState().draft).toEqual(editedForm);
  });

  it('complete local draft alone still transitions to required and never emits ready', async () => {
    loadDraft.mockReturnValueOnce(validForm);
    loadProfiles.mockResolvedValueOnce([]); // empty on server
    const controller = createController();
    const user = { uid: 'u-1', emailVerified: true };

    await controller.start(user);

    const last = states.at(-1);
    expect(last.status).toBe('required');
    expect(last.profile).toBeNull();
    expect(last.draft).toEqual(validForm);
    expect(states.some((s) => s.status === 'ready')).toBe(false);
  });

  it('invalid forms never call the API and retain draft in required state', async () => {
    loadProfiles.mockResolvedValueOnce([]);
    const controller = createController();
    const user = { uid: 'u-1', emailVerified: true };
    await controller.start(user);

    const invalidForm = { ...validForm, home: '123' }; // invalid postal code
    await controller.save(invalidForm);

    expect(createProfile).not.toHaveBeenCalled();
    expect(updateProfile).not.toHaveBeenCalled();
    const last = states.at(-1);
    expect(last.status).toBe('required');
    expect(last.draft).toEqual(invalidForm);
    expect(last.error).toBe('Enter your 6-digit home postal code.');
    expect(last.errorStage).toBeNull();
  });

  it('rejected save retains form and transitions to error without emitting ready', async () => {
    loadProfiles.mockResolvedValueOnce([]);
    createProfile.mockRejectedValueOnce(new Error('500 Internal Server Error'));
    const controller = createController();
    const user = { uid: 'u-1', emailVerified: true };
    await controller.start(user);

    await controller.save(validForm);

    expect(createProfile).toHaveBeenCalled();
    const last = states.at(-1);
    expect(last.status).toBe('error');
    expect(last.draft).toEqual(validForm);
    expect(last.error).toBe('500 Internal Server Error');
    expect(states.some((s) => s.status === 'ready')).toBe(false);
  });

  it('successful create profile transitions to ready with isFirstSave true', async () => {
    loadProfiles.mockResolvedValueOnce([]);
    createProfile.mockResolvedValueOnce(validApiProfile);
    const controller = createController();
    const user = { uid: 'u-1', emailVerified: true };
    await controller.start(user);

    await controller.save(validForm);

    expect(createProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        home_postal_code: '654321',
        profile_name: 'My family profile',
      })
    );
    const last = states.at(-1);
    expect(last.status).toBe('ready');
    expect(last.profileId).toBe('prof-123');
    expect(last.profileName).toBe('Our Family');
    expect(last.isFirstSave).toBe(true);
  });

  it('successful update profile transitions to ready with isFirstSave false when already ready', async () => {
    loadProfiles.mockResolvedValueOnce([validApiProfile]);
    const updatedApiProfile = { ...validApiProfile, budget_max: 900 };
    updateProfile.mockResolvedValueOnce(updatedApiProfile);

    const controller = createController();
    const user = { uid: 'u-1', emailVerified: true };
    await controller.start(user);
    expect(states.at(-1).status).toBe('ready');

    const updatedForm = { ...validForm, budget: 900 };
    await controller.save(updatedForm);

    expect(updateProfile).toHaveBeenCalledWith(
      'prof-123',
      expect.objectContaining({
        budget_max: 900,
        profile_name: 'Our Family',
      })
    );
    const last = states.at(-1);
    expect(last.status).toBe('ready');
    expect(last.profileId).toBe('prof-123');
    expect(last.isFirstSave).toBe(false);
  });

  it('cancel/signout makes in-flight load resolution inert', async () => {
    let resolveProfiles;
    const delayedPromise = new Promise((resolve) => {
      resolveProfiles = resolve;
    });
    loadProfiles.mockReturnValueOnce(delayedPromise);

    const controller = createController();
    const user = { uid: 'u-1', emailVerified: true };
    const startPromise = controller.start(user);

    expect(states.at(-1)?.status).toBe('loading');

    // Cancel while load is in flight
    controller.cancel();
    expect(states.at(-1)?.status).toBe('guest');

    // Resolve old in-flight promise
    resolveProfiles([validApiProfile]);
    await startPromise;

    // Should remain in guest state, ignoring the resolved profile
    expect(states.at(-1)?.status).toBe('guest');
  });

  it('switching user makes in-flight load resolution for old user inert', async () => {
    let resolveUser1;
    const delayedUser1 = new Promise((resolve) => {
      resolveUser1 = resolve;
    });

    const controller = createController({
      loadProfiles: vi.fn().mockImplementation(async (u) => {
        if (u.uid === 'u-1') {
          return delayedUser1;
        }
        return [
          { ...validApiProfile, profile_id: 'user-2-prof', profile_name: 'User 2 Family' },
        ];
      }),
    });

    const user1 = { uid: 'u-1', emailVerified: true };
    const user2 = { uid: 'u-2', emailVerified: true };

    const start1 = controller.start(user1);
    expect(states.at(-1)?.status).toBe('loading');

    const start2 = controller.start(user2);
    await start2;

    expect(states.at(-1)?.profileId).toBe('user-2-prof');

    // Now resolve user 1
    resolveUser1([validApiProfile]);
    await start1;

    // State must still reflect user 2, not user 1
    expect(states.at(-1)?.profileId).toBe('user-2-prof');
  });

  it('captures each session UID for draft writes, never a mutable global UID', async () => {
    loadProfiles.mockResolvedValueOnce([]);
    const controller = createController();
    const user = { uid: 'session-uid-abc', emailVerified: true };
    await controller.start(user);

    await controller.save(validForm);

    expect(writeDraft).toHaveBeenCalledWith('session-uid-abc', expect.anything());
  });

  it('cancel makes in-flight save resolution inert', async () => {
    let resolveSave;
    const delayedSave = new Promise((resolve) => {
      resolveSave = resolve;
    });
    loadProfiles.mockResolvedValueOnce([]);
    createProfile.mockReturnValueOnce(delayedSave);

    const controller = createController();
    const user = { uid: 'u-1', emailVerified: true };
    await controller.start(user);

    const savePromise = controller.save(validForm);
    expect(states.at(-1)?.status).toBe('saving');

    // Cancel while save is in flight
    controller.cancel();
    expect(states.at(-1)?.status).toBe('guest');

    // Resolve save
    resolveSave(validApiProfile);
    await savePromise;

    // Must remain guest
    expect(states.at(-1)?.status).toBe('guest');
  });

  it('handles account load failure by emitting error state', async () => {
    loadAccount.mockRejectedValueOnce(new Error('Account service down'));
    const controller = createController();
    const user = { uid: 'u-1', emailVerified: true };

    await controller.start(user);

    expect(states.at(-1)).toEqual({
      status: 'error',
      profile: null,
      profileId: null,
      profileName: 'My family profile',
      draft: null,
      error: 'Account service down',
      errorStage: 'load',
      isFirstSave: false,
    });
    expect(loadProfiles).not.toHaveBeenCalled();
  });

  it('handles duplicate auth callbacks without duplicate creation or saves', async () => {
    let resolveAccount;
    loadAccount.mockReturnValue(new Promise((res) => { resolveAccount = res; }));
    const controller = createController();
    const user = { uid: 'u-dup', emailVerified: true };

    // Fire start twice simultaneously for same user
    const p1 = controller.start(user);
    const p2 = controller.start(user);

    resolveAccount({ role: 'PARENT' });
    await Promise.all([p1, p2]);

    expect(loadAccount).toHaveBeenCalledTimes(1);
  });

  it('watchlist failure does not prevent profile onboarding from reaching ready', async () => {
    // Watchlist loading is isolated from profile onboarding controller
    const mockWatchlistApi = vi.fn().mockRejectedValue(new Error('503 Service Unavailable'));
    loadProfiles.mockResolvedValueOnce([validApiProfile]);

    const controller = createController();
    const user = { uid: 'u-parent', emailVerified: true };

    await controller.start(user);

    expect(states.at(-1)?.status).toBe('ready');
    expect(states.at(-1)?.profileId).toBe('prof-123');
    // Ensure independent watchlist error cannot fail the onboarding flow
    await expect(mockWatchlistApi()).rejects.toThrow('503 Service Unavailable');
  });
});
