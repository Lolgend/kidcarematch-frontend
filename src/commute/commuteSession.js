import { useEffect, useRef, useState } from "react";
import {
  getCentreCommute as defaultGetCentreCommute,
  getCommuteCapabilities as defaultGetCommuteCapabilities,
} from "../api";

let activeSessionUserId = null;
let activeSessionMode = "drive";
let activeSessionSamplePair = null;

export function getSessionMode(userId = null) {
  if (!userId) {
    activeSessionUserId = null;
    activeSessionMode = "drive";
    activeSessionSamplePair = null;
    return "drive";
  }
  if (activeSessionUserId !== userId) {
    activeSessionUserId = userId;
    activeSessionMode = "drive";
    activeSessionSamplePair = null;
  }
  return activeSessionMode;
}

export function setSessionMode(userId, mode) {
  if (userId) {
    if (activeSessionUserId !== userId) {
      activeSessionUserId = userId;
      activeSessionSamplePair = null;
    }
  }
  activeSessionMode = mode || "drive";
}

export function getSessionSamplePair(userId = null) {
  if (!userId || activeSessionUserId !== userId) {
    return null;
  }
  return activeSessionSamplePair;
}

export function setSessionSamplePair(userId, pair) {
  if (userId) {
    activeSessionUserId = userId;
  }
  activeSessionSamplePair = pair || null;
}

export function resetSessionMode() {
  activeSessionUserId = null;
  activeSessionMode = "drive";
  activeSessionSamplePair = null;
}

export const resetCommuteSessionMode = resetSessionMode;
export const resetRetainedSessionMode = resetSessionMode;
export const getRetainedSessionMode = getSessionMode;

function hasValidCapabilityDocument(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) return false;
  const hasDirectMarker = Object.prototype.hasOwnProperty.call(document, "direct_baseline_contract") &&
    (document.direct_baseline_contract === null || document.direct_baseline_contract === "direct_baseline_v1");
  const hasSamplingMarkerShape = Object.prototype.hasOwnProperty.call(document, "sampling_contract") &&
    (document.sampling_contract === null || typeof document.sampling_contract === "string");
  return hasDirectMarker && hasSamplingMarkerShape;
}

/**
 * Commute session controller.
 * Manages mode selection, sample tracking, loading state, retry, and stale request cancellation.
 */
export function createCommuteSession({
  loadCommute = defaultGetCentreCommute,
  getCapabilities = defaultGetCommuteCapabilities,
  onState = () => {},
  initialMode = activeSessionMode,
  initialSamplePair = null,
  userId = null,
  directBaselineEnabled = import.meta.env.VITE_COMMUTE_DIRECT_BASELINE_ENABLED === "true",
}) {
  let mode = initialMode;
  let selectedSample = "weekday";
  let centreId = null;
  let profileId = null;
  let locationKey = null;
  let samplePair = initialSamplePair || getSessionSamplePair(userId);
  let loading = false;
  let error = null;
  let data = null;
  let directBaselineStatus = directBaselineEnabled ? "unknown" : "disabled";
  let directBaselineError = null;
  let capabilities = null;

  let activeRequestId = 0;
  let activeController = null;

  function emit() {
    onState({
      mode,
      selectedSample,
      selectedSampleKind: selectedSample,
      centreId,
      profileId,
      locationKey,
      samplePair,
      loading,
      error,
      data,
      directBaselineStatus,
      directBaselineError,
    });
  }

  async function executeRequest(isRetry = false) {
    if (activeController) {
      activeController.abort();
      activeController = null;
    }

    if (!centreId || !profileId) {
      loading = false;
      data = null;
      error = null;
      emit();
      return;
    }

    const requestId = ++activeRequestId;
    const controller = new AbortController();
    activeController = controller;

    loading = true;
    error = null;
    directBaselineError = null;
    emit();

    try {
      let includeDirectBaseline = false;
      if (directBaselineEnabled) {
        if (!capabilities) {
          directBaselineStatus = "checking";
          emit();
          try {
            const discovered = await getCapabilities({ signal: controller.signal });
            if (requestId !== activeRequestId) return;
            const validDocument = hasValidCapabilityDocument(discovered);
            capabilities = validDocument ? discovered : { direct_baseline_contract: null };
            const marker = validDocument ? discovered.direct_baseline_contract : null;
            includeDirectBaseline = marker === "direct_baseline_v1";
            directBaselineStatus = includeDirectBaseline ? "supported" : "unsupported";
          } catch (discoveryError) {
            if (requestId !== activeRequestId || discoveryError?.name === "AbortError") return;
            if (discoveryError?.status === 404 || String(discoveryError?.message || "").startsWith("404:")) {
              capabilities = { direct_baseline_contract: null };
              directBaselineStatus = "unsupported";
            } else {
              directBaselineStatus = "error";
              directBaselineError = discoveryError;
            }
          }
        } else {
          includeDirectBaseline = !capabilities.invalid && capabilities.direct_baseline_contract === "direct_baseline_v1";
          directBaselineStatus = includeDirectBaseline ? "supported" : "unsupported";
        }
      }
      const response = await loadCommute(
        centreId,
        {
          profileId,
          mode,
          samplePair,
          ...(includeDirectBaseline ? { includeDirectBaseline: true } : {}),
        },
        { signal: controller.signal }
      );

      if (requestId === activeRequestId) {
        data = response;
        loading = false;
        error = null;
        if (response?.sample_pair) {
          samplePair = response.sample_pair;
          if (userId) {
            setSessionSamplePair(userId, response.sample_pair);
          }
        }
        if (includeDirectBaseline && response?.comparison_contract !== "direct_baseline_v1") {
          directBaselineStatus = "unsupported";
        }
        if (Array.isArray(response?.samples) && response.samples.length > 0) {
          if (response.samples.length > 1) {
            const matchingSample = response.samples.find(
              (s) => s.kind === selectedSample
            );
            if (!matchingSample) {
              selectedSample = "weekday";
            }
          } else {
            selectedSample = response.samples[0].kind || "single";
          }
        }
        emit();
      }
    } catch (err) {
      if (requestId === activeRequestId && err?.name !== "AbortError") {
        const isExpired =
          String(err?.message || "").includes("409") ||
          String(err?.message || "").includes("sample_expired");

        if (isExpired && samplePair && !isRetry) {
          // Invalidate old sample pair, clear cached comparisons, obtain fresh sample pair
          samplePair = null;
          if (userId) {
            setSessionSamplePair(userId, null);
          }
          data = null;
          await executeRequest(true);
          return;
        }

        loading = false;
        data = null;
        error = err;
        emit();
      }
    }
  }

  return {
    getMode() {
      return mode;
    },

    getSelectedSample() {
      return selectedSample;
    },

    getSamplePair() {
      return samplePair;
    },

    getState() {
      return {
        mode,
        selectedSample,
        selectedSampleKind: selectedSample,
        centreId,
        profileId,
        locationKey,
        samplePair,
        loading,
        error,
        data,
        directBaselineStatus,
        directBaselineError,
      };
    },

    async open({ centreId: newCentreId, profileId: newProfileId, locationKey: newLocationKey = null }) {
      const selectionChanged = centreId !== newCentreId || profileId !== newProfileId || locationKey !== newLocationKey;
      centreId = newCentreId;
      profileId = newProfileId;
      locationKey = newLocationKey;
      if (selectionChanged) {
        data = null;
        error = null;
      }
      await executeRequest();
    },

    async setMode(newMode) {
      if (mode === newMode) return;
      mode = newMode;
      setSessionMode(userId, newMode);
      data = null;
      error = null;
      if (centreId && profileId) {
        await executeRequest();
      } else {
        emit();
      }
    },

    selectSample(kind) {
      selectedSample = kind;
      emit();
    },

    async retry() {
      await executeRequest();
    },

    reset() {
      activeRequestId++;
      if (activeController) {
        activeController.abort();
        activeController = null;
      }
      mode = "drive";
      selectedSample = "weekday";
      samplePair = null;
      capabilities = null;
      directBaselineStatus = directBaselineEnabled ? "unknown" : "disabled";
      directBaselineError = null;
      resetSessionMode();
      centreId = null;
      profileId = null;
      locationKey = null;
      loading = false;
      error = null;
      data = null;
      emit();
    },

    destroy() {
      activeRequestId++;
      if (activeController) {
        activeController.abort();
        activeController = null;
      }
    },
  };
}

export function useCommuteSession({
  centreId,
  profileId,
  locationKey = null,
  userId = null,
  loadCommute = defaultGetCentreCommute,
  getCapabilities = defaultGetCommuteCapabilities,
  directBaselineEnabled = import.meta.env.VITE_COMMUTE_DIRECT_BASELINE_ENABLED === "true",
  initialMode,
  initialSamplePair,
}) {
  const currentMode = initialMode || getSessionMode(userId);
  const currentSamplePair = initialSamplePair || getSessionSamplePair(userId);
  const [state, setState] = useState({
    mode: currentMode,
    selectedSample: "weekday",
    selectedSampleKind: "weekday",
    centreId,
    profileId,
    locationKey,
    samplePair: currentSamplePair,
    loading: Boolean(centreId && profileId),
    error: null,
    data: null,
    directBaselineStatus: directBaselineEnabled ? "unknown" : "disabled",
    directBaselineError: null,
  });

  const sessionRef = useRef(null);
  const createSession = () => createCommuteSession({
      loadCommute,
      getCapabilities,
      directBaselineEnabled,
      onState: (nextState) => {
        if (nextState.mode) {
          setSessionMode(userId, nextState.mode);
        }
        if (nextState.samplePair) {
          setSessionSamplePair(userId, nextState.samplePair);
        }
        setState(nextState);
      },
      initialMode: currentMode,
      initialSamplePair: currentSamplePair,
      userId,
    });
  if (!sessionRef.current) sessionRef.current = { userId, session: createSession() };

  useEffect(() => {
    if (sessionRef.current.userId !== userId) {
      sessionRef.current.session.destroy();
      sessionRef.current = { userId, session: createSession() };
      setState({
        mode: getSessionMode(userId), selectedSample: 'weekday', selectedSampleKind: 'weekday',
        centreId, profileId, locationKey, samplePair: getSessionSamplePair(userId),
        loading: Boolean(centreId && profileId), error: null, data: null,
        directBaselineStatus: directBaselineEnabled ? "unknown" : "disabled", directBaselineError: null,
      });
    }
    const session = sessionRef.current.session;
    session.open({ centreId, profileId, locationKey });
    return () => {
      // Don't fully reset mode across centre unmounts, but abort inflight requests
      session.destroy();
    };
  }, [centreId, profileId, locationKey, userId]);

  const visibleState = state.centreId === centreId && state.profileId === profileId && state.locationKey === locationKey && sessionRef.current.userId === userId
    ? state
    : {
      ...state,
      mode: sessionRef.current.userId === userId ? state.mode : currentMode,
      selectedSample: sessionRef.current.userId === userId ? state.selectedSample : 'weekday',
      selectedSampleKind: sessionRef.current.userId === userId ? state.selectedSampleKind : 'weekday',
      samplePair: sessionRef.current.userId === userId ? state.samplePair : currentSamplePair,
      centreId, profileId, locationKey,
      loading: Boolean(centreId && profileId), error: null, data: null,
      directBaselineStatus: directBaselineEnabled ? "unknown" : "disabled", directBaselineError: null,
    };

  return {
    ...visibleState,
    setMode: (m) => sessionRef.current.session.setMode(m),
    selectSample: (k) => sessionRef.current.session.selectSample(k),
    retry: () => sessionRef.current.session.retry(),
    reset: () => sessionRef.current.session.reset(),
  };
}
