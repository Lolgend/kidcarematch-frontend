import { useEffect, useRef, useState } from "react";
import { getCentreCommute as defaultGetCentreCommute } from "../api";

let activeSessionUserId = null;
let activeSessionMode = "drive";

export function getSessionMode(userId = null) {
  if (!userId) {
    activeSessionUserId = null;
    activeSessionMode = "drive";
    return "drive";
  }
  if (activeSessionUserId !== userId) {
    activeSessionUserId = userId;
    activeSessionMode = "drive";
  }
  return activeSessionMode;
}

export function setSessionMode(userId, mode) {
  if (userId) {
    activeSessionUserId = userId;
    activeSessionMode = mode || "drive";
  }
}

export function resetSessionMode() {
  activeSessionUserId = null;
  activeSessionMode = "drive";
}

export const resetCommuteSessionMode = resetSessionMode;

/**
 * Commute session controller.
 * Manages mode selection, sample tracking, loading state, retry, and stale request cancellation.
 */
export function createCommuteSession({
  loadCommute = defaultGetCentreCommute,
  onState = () => {},
  initialMode = "drive",
  userId = null,
}) {
  let mode = initialMode;
  let selectedSampleKind = "single";
  let centreId = null;
  let profileId = null;
  let samplePair = null;
  let loading = false;
  let error = null;
  let data = null;

  let activeRequestId = 0;
  let activeController = null;

  function emit() {
    onState({
      mode,
      selectedSampleKind,
      centreId,
      profileId,
      samplePair,
      loading,
      error,
      data,
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
    emit();

    try {
      const response = await loadCommute(
        centreId,
        {
          profileId,
          mode,
          samplePair,
        },
        { signal: controller.signal }
      );

      if (requestId === activeRequestId) {
        data = response;
        loading = false;
        error = null;
        if (response?.sample_pair) {
          samplePair = response.sample_pair;
        }
        if (Array.isArray(response?.samples) && response.samples.length > 0) {
          const matchingSample = response.samples.find(
            (s) => s.kind === selectedSampleKind
          );
          if (!matchingSample) {
            selectedSampleKind = response.samples[0].kind;
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
          // Fresh pair retry once
          samplePair = null;
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

    getState() {
      return {
        mode,
        selectedSampleKind,
        centreId,
        profileId,
        samplePair,
        loading,
        error,
        data,
      };
    },

    async open({ centreId: newCentreId, profileId: newProfileId }) {
      centreId = newCentreId;
      profileId = newProfileId;
      await executeRequest();
    },

    async setMode(newMode) {
      if (mode === newMode) return;
      mode = newMode;
      setSessionMode(userId, newMode);
      if (centreId && profileId) {
        await executeRequest();
      } else {
        emit();
      }
    },

    selectSample(kind) {
      selectedSampleKind = kind;
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
      centreId = null;
      profileId = null;
      samplePair = null;
      loading = false;
      error = null;
      data = null;
      mode = "drive";
      resetSessionMode();
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
  userId = null,
  loadCommute = defaultGetCentreCommute,
  initialMode,
}) {
  const currentMode = initialMode || getSessionMode(userId);
  const [state, setState] = useState({
    mode: currentMode,
    selectedSampleKind: "single",
    centreId,
    profileId,
    samplePair: null,
    loading: Boolean(centreId && profileId),
    error: null,
    data: null,
  });

  const sessionRef = useRef(null);

  if (!sessionRef.current) {
    sessionRef.current = createCommuteSession({
      loadCommute,
      onState: (nextState) => {
        if (nextState.mode) {
          setSessionMode(userId, nextState.mode);
        }
        setState(nextState);
      },
      initialMode: currentMode,
      userId,
    });
  }

  useEffect(() => {
    sessionRef.current.open({ centreId, profileId });
    return () => {
      // Don't fully reset mode across centre unmounts, but abort inflight requests
      sessionRef.current.destroy();
    };
  }, [centreId, profileId]);

  return {
    ...state,
    setMode: (m) => sessionRef.current.setMode(m),
    selectSample: (k) => sessionRef.current.selectSample(k),
    retry: () => sessionRef.current.retry(),
    reset: () => sessionRef.current.reset(),
  };
}
