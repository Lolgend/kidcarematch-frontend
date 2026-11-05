import {
  fromApiProfile,
  isProfileComplete,
  toApiProfile,
  validateFamilyProfile,
} from './familyProfile';

const DEFAULT_PROFILE_NAME = 'My family profile';

/**
 * Creates an onboarding controller that manages parent profile completion,
 * authentication eligibility, and session transitions.
 *
 * @param {object} options
 * @param {(user: object) => Promise<object>} [options.loadAccount]
 * @param {(user: object) => Promise<Array<object>>} options.loadProfiles
 * @param {(payload: object) => Promise<object>} options.createProfile
 * @param {(profileId: string|number, payload: object) => Promise<object>} options.updateProfile
 * @param {(uid: string, draft: object) => void} [options.writeDraft]
 * @param {(uid: string) => object|null} [options.loadDraft]
 * @param {(state: object) => void} options.onState
 */
export function createOnboardingController({
  loadAccount,
  loadProfiles,
  createProfile,
  updateProfile,
  writeDraft,
  loadDraft,
  onState,
}) {
  let currentSessionId = 0;
  let currentUser = null;
  let sessionUid = null;

  let state = {
    status: 'guest',
    profile: null,
    profileId: null,
    profileName: DEFAULT_PROFILE_NAME,
    draft: null,
    error: null,
    isFirstSave: false,
  };

  const emit = (nextState) => {
    state = { ...state, ...nextState };
    onState?.({ ...state });
  };

  const persistDraft = (uid, draftData) => {
    if (!uid) return;
    if (writeDraft) {
      writeDraft(uid, draftData);
      return;
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`kidcare-profile:${uid}`, JSON.stringify(draftData));
      }
    } catch {
      // ignore
    }
  };

  const readDraft = (uid) => {
    if (!uid) return null;
    if (loadDraft) {
      return loadDraft(uid);
    }
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(`kidcare-profile:${uid}`);
        return raw ? JSON.parse(raw) : null;
      }
    } catch {
      return null;
    }
    return null;
  };

  const cancel = () => {
    currentSessionId += 1;
    currentUser = null;
    sessionUid = null;
    emit({
      status: 'guest',
      profile: null,
      profileId: null,
      profileName: DEFAULT_PROFILE_NAME,
      draft: null,
      error: null,
      isFirstSave: false,
    });
  };

  const start = async (user) => {
    if (!user) {
      cancel();
      return;
    }

    // Deduplicate duplicate concurrent auth callbacks for the same user while loading or ready
    if (currentUser?.uid === user.uid && (state.status === 'loading' || state.status === 'ready')) {
      return;
    }

    const sessionId = ++currentSessionId;
    currentUser = user;
    sessionUid = user.uid;

    const isGoogle =
      user.providerId === 'google.com' ||
      (Array.isArray(user.providerData) &&
        user.providerData.some((p) => p.providerId === 'google.com'));
    const isVerified = Boolean(user.emailVerified) || isGoogle;

    if (!isVerified) {
      emit({
        status: 'verification-required',
        profile: null,
        profileId: null,
        profileName: DEFAULT_PROFILE_NAME,
        draft: null,
        error: null,
        isFirstSave: false,
      });
      return;
    }

    emit({
      status: 'loading',
      profile: null,
      profileId: null,
      profileName: DEFAULT_PROFILE_NAME,
      draft: null,
      error: null,
      isFirstSave: false,
    });

    if (loadAccount) {
      let account;
      try {
        account = await loadAccount(user);
        if (sessionId !== currentSessionId) return;
      } catch (err) {
        if (sessionId !== currentSessionId) return;
        emit({
          status: 'error',
          profile: null,
          profileId: null,
          profileName: DEFAULT_PROFILE_NAME,
          draft: null,
          error: err?.message || String(err),
          isFirstSave: false,
        });
        return;
      }

      const role = String(account?.role || '').toUpperCase();
      if (role === 'ADMIN') {
        emit({
          status: 'admin',
          profile: null,
          profileId: null,
          profileName: DEFAULT_PROFILE_NAME,
          draft: null,
          error: null,
          isFirstSave: false,
        });
        return;
      }
    }

    const draft = readDraft(sessionUid);

    let profiles;
    try {
      profiles = await loadProfiles(user);
      if (sessionId !== currentSessionId) return;
    } catch (err) {
      if (sessionId !== currentSessionId) return;
      emit({
        status: 'error',
        profile: null,
        profileId: null,
        profileName: DEFAULT_PROFILE_NAME,
        draft: draft || null,
        error: err?.message || String(err),
        isFirstSave: false,
      });
      return;
    }

    if (!Array.isArray(profiles) || profiles.length === 0) {
      // Empty server profile collection requires setup. Draft alone cannot satisfy completion.
      emit({
        status: 'required',
        profile: null,
        profileId: null,
        profileName: DEFAULT_PROFILE_NAME,
        draft: draft || null,
        error: null,
        isFirstSave: false,
      });
      return;
    }

    const serverProfile = profiles[0];
    const profileId = serverProfile?.profile_id ?? serverProfile?.id ?? null;
    const profileName = serverProfile?.profile_name ?? serverProfile?.name ?? DEFAULT_PROFILE_NAME;
    const profileObj = fromApiProfile(serverProfile, draft);

    if (isProfileComplete(profileObj)) {
      emit({
        status: 'ready',
        profile: profileObj,
        profileId,
        profileName,
        draft: null,
        error: null,
        isFirstSave: false,
      });
    } else {
      emit({
        status: 'required',
        profile: null,
        profileId,
        profileName,
        draft: profileObj,
        error: null,
        isFirstSave: false,
      });
    }
  };

  const save = async (form) => {
    if (!currentUser || !sessionUid) return;

    const saveSessionId = currentSessionId;
    const activeUid = sessionUid;

    const validationErrors = validateFamilyProfile(form);
    if (validationErrors.length > 0) {
      persistDraft(activeUid, form);
      emit({
        status: 'required',
        draft: form,
        error: validationErrors[0],
        isFirstSave: false,
      });
      return;
    }

    persistDraft(activeUid, form);
    emit({
      status: 'saving',
      draft: form,
      error: null,
      isFirstSave: false,
    });

    const payload = toApiProfile(form, state.profileName);
    let result;
    try {
      if (state.profileId) {
        result = await updateProfile(state.profileId, payload);
      } else {
        result = await createProfile(payload);
      }
      if (saveSessionId !== currentSessionId) return;
    } catch (err) {
      if (saveSessionId !== currentSessionId) return;
      emit({
        status: 'error',
        draft: form,
        error: err?.message || String(err),
        isFirstSave: false,
      });
      return;
    }

    const savedProfile = fromApiProfile(result, form);
    const resolvedProfileId =
      savedProfile.profileId || result?.profile_id || result?.id || state.profileId;
    const resolvedProfileName =
      savedProfile.profileName || result?.profile_name || result?.name || state.profileName;

    if (isProfileComplete(savedProfile)) {
      const wasFirstSave = !state.profile;
      persistDraft(activeUid, savedProfile);
      emit({
        status: 'ready',
        profile: savedProfile,
        profileId: resolvedProfileId,
        profileName: resolvedProfileName,
        draft: null,
        error: null,
        isFirstSave: wasFirstSave,
      });
    } else {
      emit({
        status: 'required',
        profile: null,
        profileId: resolvedProfileId,
        profileName: resolvedProfileName,
        draft: savedProfile,
        error: 'Saved profile is incomplete.',
        isFirstSave: false,
      });
    }
  };

  const getState = () => ({ ...state });

  return {
    start,
    save,
    cancel,
    getState,
  };
}
