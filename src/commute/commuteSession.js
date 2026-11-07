import { useEffect, useRef, useState } from "react";
import {
  getCentreCommute as defaultGetCentreCommute,
  getCommuteCapabilities as defaultGetCommuteCapabilities,
} from "../api";
import { isEndpointAuthorizationError, isUsableRouteLeg } from "./commuteContract.js";

const SELECTED_SAMPLING_CONTRACT = "weekday_0800_wed_thu_fri_v1";
const SELECTED_SAMPLING_ENABLED = import.meta.env?.VITE_COMMUTE_SELECTED_SAMPLING_ENABLED === "true";

let activeSessionUserId = null;
let activeSessionMode = "drive";
let activeSessionSamplePair = null;
let activeSelectedSamplingCycle = null;

function singaporeParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit",
    weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
}

function isZonedTimestamp(value) {
  return typeof value === "string" && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value));
}

function sameSelectedEvaluationContext(previous, current) {
  const oldSample = previous?.samples?.[0];
  const newSample = current?.samples?.[0];
  return String(previous?.centre_id) === String(current?.centre_id) &&
    String(previous?.profile_id) === String(current?.profile_id) && previous?.mode === current?.mode &&
    previous?.evaluation?.profile_revision === current?.evaluation?.profile_revision &&
    previous?.evaluation?.anchor_revision === current?.evaluation?.anchor_revision &&
    previous?.sampling?.cycle_id === current?.sampling?.cycle_id &&
    previous?.sampling?.selected_index === current?.sampling?.selected_index &&
    previous?.sampling?.cycle_expires_at === current?.sampling?.cycle_expires_at &&
    oldSample?.conditions?.conditions_id === newSample?.conditions?.conditions_id &&
    oldSample?.conditions?.provider_options_id === newSample?.conditions?.provider_options_id &&
    oldSample?.conditions?.initial_departure_at === newSample?.conditions?.initial_departure_at;
}

function retainSameConditionRoutes(previous, current) {
  if (!sameSelectedEvaluationContext(previous, current)) return current;
  const oldSample = previous.samples[0];
  const newSample = current.samples[0];
  const previousLegs = new Map((oldSample.legs || []).map((leg) => [`${leg.from_anchor}:${leg.to_anchor}`, leg]));
  const currentKeys = new Set((newSample.legs || []).map((leg) => `${leg.from_anchor}:${leg.to_anchor}`));
  const legs = (newSample.legs || []).map((leg) => {
    if (isUsableRouteLeg(leg)) return leg;
    const old = previousLegs.get(`${leg.from_anchor}:${leg.to_anchor}`);
    return isUsableRouteLeg(old) ? old : leg;
  });
  for (const [key, leg] of previousLegs) {
    if (!currentKeys.has(key) && isUsableRouteLeg(leg)) legs.push(leg);
  }

  const currentViaComplete = newSample.via_status === "available" &&
    Number.isFinite(newSample.totals?.duration_seconds) && Number.isFinite(newSample.totals?.distance_meters) &&
    legs.length === (newSample.legs || []).length && legs.every(isUsableRouteLeg);
  const baselineConfirmed = current?.comparison_contract === "direct_baseline_v1" &&
    previous?.comparison_contract === "direct_baseline_v1";
  const currentDirectComplete = baselineConfirmed && newSample.direct_route?.status === "available" &&
    newSample.direct_route.legs?.length === 1 && newSample.direct_route.legs.every(isUsableRouteLeg) &&
    Number.isFinite(newSample.direct_route.totals?.duration_seconds) &&
    Number.isFinite(newSample.direct_route.totals?.distance_meters);
  const oldDirectComplete = baselineConfirmed && oldSample.direct_route?.status === "available" &&
    oldSample.direct_route.legs?.length === 1 && oldSample.direct_route.legs.every(isUsableRouteLeg) &&
    Number.isFinite(oldSample.direct_route.totals?.duration_seconds) &&
    Number.isFinite(oldSample.direct_route.totals?.distance_meters);
  const directRoute = currentDirectComplete ? newSample.direct_route :
    oldDirectComplete ? oldSample.direct_route : newSample.direct_route;
  const comparisonIsCurrentAndComplete = currentViaComplete && currentDirectComplete &&
    newSample.comparison?.status === "available" && Array.isArray(newSample.comparison.reasons) &&
    newSample.comparison.reasons.length === 0 && newSample.comparison.certification;
  const comparison = comparisonIsCurrentAndComplete
    ? newSample.comparison
    : newSample.comparison
      ? { ...newSample.comparison, status: "unavailable", certification: null }
      : newSample.comparison;
  const mergedSample = {
    ...newSample,
    legs,
    via_status: currentViaComplete ? newSample.via_status : legs.some(isUsableRouteLeg) ? "partial" : newSample.via_status,
    totals: currentViaComplete ? newSample.totals : null,
    ...(baselineConfirmed && directRoute ? { direct_route: directRoute } : {}),
    ...(comparison ? { comparison } : {}),
  };
  return { ...current, samples: [mergedSample] };
}

function nextPrimaryWednesday(now) {
  const parts = singaporeParts(now);
  if (!parts) return NaN;
  const weekdayIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday];
  let daysUntil = (3 - weekdayIndex + 7) % 7;
  if (daysUntil === 0 && (Number(parts.hour) > 8 || (Number(parts.hour) === 8 && Number(parts.minute) >= 0))) daysUntil = 7;
  // Singapore is fixed at UTC+08:00; 08:00 SGT is midnight UTC.
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + daysUntil, 0, 0, 0);
}

export function getSessionMode(userId = null) {
  if (!userId) {
    activeSessionUserId = null;
    activeSessionMode = "drive";
    activeSessionSamplePair = null;
    activeSelectedSamplingCycle = null;
    return "drive";
  }
  if (activeSessionUserId !== userId) {
    activeSessionUserId = userId;
    activeSessionMode = "drive";
    activeSessionSamplePair = null;
    activeSelectedSamplingCycle = null;
  }
  return activeSessionMode;
}

export function setSessionMode(userId, mode) {
  if (userId) {
    if (activeSessionUserId !== userId) {
      activeSessionUserId = userId;
      activeSessionSamplePair = null;
      activeSelectedSamplingCycle = null;
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
  activeSelectedSamplingCycle = null;
}

export const resetCommuteSessionMode = resetSessionMode;
export const resetRetainedSessionMode = resetSessionMode;
export const getRetainedSessionMode = getSessionMode;

function hasValidCapabilityDocument(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) return false;
  const hasDirectMarker = Object.prototype.hasOwnProperty.call(document, "direct_baseline_contract") &&
    (document.direct_baseline_contract === null || typeof document.direct_baseline_contract === "string");
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
  selectedSamplingEnabled = SELECTED_SAMPLING_ENABLED,
  comparisonCentreIds = null,
  now = () => new Date(),
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
  let setData = {};
  let setErrors = {};
  let sampling = null;
  let directBaselineStatus = directBaselineEnabled ? "unknown" : "disabled";
  let directBaselineError = null;
  let capabilities = null;

  let activeRequestId = 0;
  let activeController = null;
  let expiryTimer = null;

  function clearExpiryTimer() {
    if (expiryTimer !== null) {
      clearTimeout(expiryTimer);
      expiryTimer = null;
    }
  }

  function scheduleCycleExpiry(cycleKey, cycleId, cycleExpiresAt, autoRefresh) {
    clearExpiryTimer();
    const expiryTime = Date.parse(cycleExpiresAt);
    if (!Number.isFinite(expiryTime)) return;
    expiryTimer = setTimeout(() => {
      expiryTimer = null;
      const active = activeSelectedSamplingCycle;
      if (!active || active.key !== cycleKey || active.cycleId !== cycleId) return;
      if (expiryTime > now().getTime()) {
        scheduleCycleExpiry(cycleKey, cycleId, cycleExpiresAt, autoRefresh);
        return;
      }
      activeSelectedSamplingCycle = null;
      data = null;
      setData = {};
      sampling = null;
      error = autoRefresh ? null : new Error("Selected weekday cycle expired. Retry for a new estimate.");
      loading = autoRefresh;
      emit();
      if (autoRefresh) void executeRequest();
    }, Math.max(0, expiryTime - now().getTime()));
  }

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
      setData,
      setErrors,
      sampling,
      directBaselineStatus,
      directBaselineError,
    });
  }

  async function executeRequest(isRetry = false, newSamplingAttempt = false) {
    if (newSamplingAttempt) {
      clearExpiryTimer();
      data = null;
      setData = {};
      setErrors = {};
      sampling = null;
    }
    if (activeController) {
      activeController.abort();
      activeController = null;
    }

    if (!centreId || !profileId) {
      loading = false;
      data = null;
      setData = {};
      setErrors = {};
      sampling = null;
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

    if (selectedSamplingEnabled && mode === "pt") {
      await executeSelectedSampling(requestId, controller, newSamplingAttempt);
      return;
    }

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
      const requestIds = [...new Map((comparisonCentreIds || [centreId]).map((id) => [String(id), id])).values()];
      if (!requestIds.some((id) => String(id) === String(centreId))) requestIds.unshift(centreId);
      const requestOptions = {
        profileId,
        mode,
        samplePair,
        ...(includeDirectBaseline ? { includeDirectBaseline: true } : {}),
      };
      const evaluations = await Promise.all(requestIds.map(async (id) => {
        try {
          return { id, response: await loadCommute(id, requestOptions, { signal: controller.signal }) };
        } catch (requestError) {
          return { id, error: requestError };
        }
      }));
      if (requestId !== activeRequestId || controller.signal.aborted) return;
      const response = evaluations.find(({ id }) => String(id) === String(centreId))?.response;
      const failed = evaluations.find(({ id, error: requestError }) => String(id) === String(centreId) && requestError)?.error;
      const endpointAuthFailure = evaluations.find(({ error: requestError }) => isEndpointAuthorizationError(requestError))?.error;
      if (endpointAuthFailure && requestIds.length > 1) {
        data = null;
        setData = {};
        setErrors = {};
        loading = false;
        error = endpointAuthFailure;
        emit();
        return;
      }
      if (failed && requestIds.length === 1) throw failed;
      const nextSetData = Object.fromEntries(evaluations.filter(({ response: item }) => item).map(({ id, response: item }) => [id, item]));

      if (requestId === activeRequestId) {
        setErrors = Object.fromEntries(evaluations.filter(({ error: requestError }) => requestError).map(({ id, error: requestError }) => [String(id), requestError]));
        data = response || null;
        setData = nextSetData;
        sampling = null;
        loading = false;
        error = failed || null;
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
        if (isEndpointAuthorizationError(err)) {
          clearExpiryTimer();
          activeSelectedSamplingCycle = null;
          data = null;
          setData = {};
          sampling = null;
        }
        error = err;
        emit();
      }
    }
  }

  function validSelectedResponse(response, index, cycleId, expectedCentreId, referenceNow) {
    const meta = response?.sampling;
    const allowed = meta?.allowed_samples;
    const sample = response?.samples?.[0];
    const sampledTime = isZonedTimestamp(sample?.sampled_at) && Date.parse(sample.sampled_at);
    const selectedDeparture = isZonedTimestamp(allowed?.[index]?.departure_at) && Date.parse(allowed[index].departure_at);
    const primary = allowed?.[0] && singaporeParts(allowed[0].departure_at);
    const datesAreValid = Array.isArray(allowed) && allowed.length === 3 && allowed.every((item, i) => {
      const parts = item && singaporeParts(item.departure_at);
      return item?.sample_index === i && typeof item.conditions_id === "string" && item.conditions_id.length > 0 &&
        isZonedTimestamp(item.departure_at) &&
        parts?.hour === "08" && parts?.minute === "00" &&
        parts?.weekday === ["Wed", "Thu", "Fri"][i] &&
        (!i || Date.parse(item.departure_at) - Date.parse(allowed[i - 1].departure_at) === 86400000);
    });
    return response?.sampling_contract === SELECTED_SAMPLING_CONTRACT &&
      response?.sample_pair === null &&
      String(response?.centre_id) === String(expectedCentreId) &&
      String(response?.profile_id) === String(profileId) &&
      response?.mode === mode &&
      Array.isArray(response?.samples) && response.samples.length === 1 &&
      sample?.kind === "weekday" &&
      typeof sample?.conditions?.conditions_id === "string" &&
      sample.conditions.timing_basis === "scheduled_departure" &&
      isZonedTimestamp(sample.conditions.initial_departure_at) && Date.parse(sample.conditions.initial_departure_at) === selectedDeparture &&
      Number.isFinite(sampledTime) && sampledTime === selectedDeparture &&
      typeof sample.conditions.provider_options_id === "string" && sample.conditions.provider_options_id.length > 0 &&
      typeof response?.evaluation?.evaluation_id === "string" && response.evaluation.evaluation_id.length > 0 &&
      typeof response?.evaluation?.evaluated_at === "string" &&
      /(?:Z|[+-]\d{2}:\d{2})$/i.test(response.evaluation.evaluated_at) &&
      Number.isFinite(Date.parse(response.evaluation.evaluated_at)) &&
      typeof response?.evaluation?.profile_revision === "string" && response.evaluation.profile_revision.length > 0 &&
      typeof response?.evaluation?.anchor_revision === "string" && response.evaluation.anchor_revision.length > 0 &&
      meta?.policy === SELECTED_SAMPLING_CONTRACT &&
      typeof meta.cycle_id === "string" && meta.cycle_id.length > 0 &&
      (!cycleId || meta.cycle_id === cycleId) &&
      meta.selected_index === index &&
      isZonedTimestamp(meta.cycle_expires_at) &&
      datesAreValid && primary?.weekday === "Wed" && primary.hour === "08" && primary.minute === "00" &&
      Date.parse(allowed[0].departure_at) === nextPrimaryWednesday(referenceNow) &&
      Date.parse(meta.cycle_expires_at) === Date.parse(allowed[0].departure_at) &&
      allowed[index].conditions_id === sample.conditions.conditions_id;
  }

  function validErrorSamplingMetadata(meta, index, cycleId, referenceNow) {
    const allowed = meta?.allowed_samples;
    return meta?.policy === SELECTED_SAMPLING_CONTRACT &&
      typeof meta.cycle_id === "string" && meta.cycle_id.length > 0 &&
      (!cycleId || meta.cycle_id === cycleId) && meta.selected_index === index &&
      typeof meta.cycle_expires_at === "string" && Number.isFinite(Date.parse(meta.cycle_expires_at)) &&
      Array.isArray(allowed) && allowed.length === 3 && allowed.every((item, i) => {
        const parts = item && singaporeParts(item.departure_at);
        return item?.sample_index === i && typeof item.conditions_id === "string" && item.conditions_id.length > 0 &&
          isZonedTimestamp(item.departure_at) &&
          parts?.weekday === ["Wed", "Thu", "Fri"][i] && parts.hour === "08" && parts.minute === "00" &&
          (!i || Date.parse(item.departure_at) - Date.parse(allowed[i - 1].departure_at) === 86400000);
      }) && Date.parse(allowed[0].departure_at) === nextPrimaryWednesday(referenceNow) &&
      Date.parse(meta.cycle_expires_at) === Date.parse(allowed[0].departure_at);
  }

  function hasClassifiedNoItinerary(errorOrResponse, includeDirectBaseline = false) {
    if (errorOrResponse?.failureClass === "sample_dependent" && errorOrResponse?.code === "no_itinerary") return true;
    const sample = errorOrResponse?.samples?.[0];
    const reasons = [
      ...(Array.isArray(sample?.reasons) ? sample.reasons : []),
      ...(Array.isArray(sample?.legs) ? sample.legs.flatMap((leg) => Array.isArray(leg?.reasons) ? leg.reasons : []) : []),
    ];
    if (includeDirectBaseline) {
      reasons.push(...(Array.isArray(sample?.direct_route?.reasons) ? sample.direct_route.reasons : []));
      reasons.push(...(Array.isArray(sample?.direct_route?.legs)
        ? sample.direct_route.legs.flatMap((leg) => Array.isArray(leg?.reasons) ? leg.reasons : [])
        : []));
    }
    return reasons.some((reason) => reason?.code === "no_itinerary" && reason?.failure_class === "sample_dependent");
  }

  function hasNonSampleDependentComponentFailure(errorOrResponse, includeDirectBaseline = false) {
    const samples = Array.isArray(errorOrResponse?.samples) ? errorOrResponse.samples : [];
    const reasons = samples.flatMap((sample) => [
      ...(Array.isArray(sample?.reasons) ? sample.reasons : []),
      ...(Array.isArray(sample?.legs) ? sample.legs.flatMap((leg) => Array.isArray(leg?.reasons) ? leg.reasons : []) : []),
      ...(includeDirectBaseline && Array.isArray(sample?.direct_route?.reasons) ? sample.direct_route.reasons : []),
      ...(includeDirectBaseline && Array.isArray(sample?.direct_route?.legs)
        ? sample.direct_route.legs.flatMap((leg) => Array.isArray(leg?.reasons) ? leg.reasons : [])
        : []),
    ]);
    if (errorOrResponse?.status === 401 || errorOrResponse?.status === 403 ||
        errorOrResponse?.status >= 500 || errorOrResponse?.failureClass === "authentication" ||
        errorOrResponse?.failureClass === "service") {
      return true;
    }
    const knownReasons = new Set([
      "no_itinerary", "direct_unavailable", "via_centre_incomplete",
      "home_unresolved", "centre_unresolved", "workplace_unresolved", "workplace_not_configured",
      "timing_unverified", "conditions_mismatch", "provider_timeout", "provider_unavailable",
      "provider_auth_failed", "evaluation_budget_exhausted", "invalid_provider_payload", "geometry_unavailable",
    ]);
    return reasons.some((reason) => !knownReasons.has(reason?.code) ||
      reason?.failure_class === "authentication" || reason?.failure_class === "service");
  }

  async function executeSelectedSampling(requestId, controller, isRetry = false) {
    let discoveryError = null;
    if (!capabilities) {
      try {
        const discovered = await getCapabilities({ signal: controller.signal });
        if (requestId !== activeRequestId) return;
        capabilities = hasValidCapabilityDocument(discovered)
          ? discovered
          : { invalid: true };
      } catch (err) {
        if (requestId !== activeRequestId || err?.name === "AbortError") return;
        if (err?.status === 404 || String(err?.message || "").startsWith("404:")) {
          capabilities = { direct_baseline_contract: null, sampling_contract: null };
        } else {
          discoveryError = err;
        }
      }
    }

    if (requestId !== activeRequestId) return;
    if (discoveryError) {
      loading = false;
      data = null;
      setData = {};
      error = discoveryError;
      if (directBaselineEnabled) {
        directBaselineStatus = "error";
        directBaselineError = discoveryError;
      }
      emit();
      return;
    }

    const validCapabilities = hasValidCapabilityDocument(capabilities);
    if (!validCapabilities || capabilities.sampling_contract !== SELECTED_SAMPLING_CONTRACT) {
      // Unknown or malformed discovery is unsupported; retain legacy pair behavior.
      selectedSamplingEnabled = false;
      if (directBaselineEnabled) {
        const supported = validCapabilities && capabilities.direct_baseline_contract === "direct_baseline_v1";
        directBaselineStatus = supported ? "supported" : "unsupported";
      }
      await executeRequest();
      return;
    }

    const includeDirectBaseline = directBaselineEnabled &&
      capabilities.direct_baseline_contract === "direct_baseline_v1";
    if (directBaselineEnabled) directBaselineStatus = includeDirectBaseline ? "supported" : "unsupported";

    if (isRetry) activeSelectedSamplingCycle = null;
    const centreIds = [...new Set((comparisonCentreIds || [centreId]).map(String))];
    if (!centreIds.includes(String(centreId))) centreIds.unshift(String(centreId));
    const cycleKey = JSON.stringify([userId || null, profileId, locationKey, mode]);
    if (activeSelectedSamplingCycle?.key === cycleKey && Date.parse(activeSelectedSamplingCycle.cycleExpiresAt) <= now().getTime()) {
      activeSelectedSamplingCycle = null;
    }
    const retainedCycle = !isRetry && activeSelectedSamplingCycle?.key === cycleKey &&
      Date.parse(activeSelectedSamplingCycle.cycleExpiresAt) > now().getTime()
      ? activeSelectedSamplingCycle
      : null;
    let cycleId = retainedCycle?.cycleId || null;
    let index = isRetry ? 0 : (retainedCycle?.selectedIndex || 0);
    let expiryRecoveryUsed = false;
    let allowedSamples = retainedCycle?.allowedSamples || null;
    let cycleExpiresAt = retainedCycle?.cycleExpiresAt || null;
    let cycleReferenceNow = now();
    const currentCycleId = sampling?.cycle_id || sampling?.cycleId;
    const currentSampleIndex = sampling?.selected_index ?? sampling?.selectedIndex;
    const canRetainSameSample = !isRetry && Boolean(cycleId) &&
      currentCycleId === cycleId && currentSampleIndex === index &&
      Date.parse(cycleExpiresAt) > now().getTime();
    let retainedSetData = canRetainSameSample ? setData : {};
    if (!canRetainSameSample) {
      setData = {};
      data = null;
    }

    while (index < 3 && requestId === activeRequestId) {
      const evaluateCentre = async (id, requestCycleId) => {
        try {
          const response = await loadCommute(id, {
            profileId,
            mode,
            samplePair: null,
            ...(includeDirectBaseline ? { includeDirectBaseline: true } : {}),
            sampling: { policy: SELECTED_SAMPLING_CONTRACT, cycle_id: requestCycleId, sample_index: index },
          }, { signal: controller.signal });
          if (!validSelectedResponse(response, index, requestCycleId, id, cycleReferenceNow)) {
            const invalid = new Error("Malformed selected-sample response");
            invalid.code = "invalid_provider_payload";
            return { id, error: invalid };
          }
          return { id, response };
        } catch (err) {
          return { id, error: err };
        }
      };

      // The first response issues the cycle. Every other centre reuses that exact identity.
      const first = await evaluateCentre(String(centreId), cycleId);
      if (requestId !== activeRequestId || controller.signal.aborted) return;
      const issuedCycle = first.response?.sampling?.cycle_id || first.error?.sampling?.cycle_id || cycleId;
      const remainder = centreIds.filter((id) => id !== String(centreId));
      const others = await Promise.all(remainder.map((id) => evaluateCentre(id, issuedCycle)));
      const evaluations = [first, ...others];

      if (requestId !== activeRequestId || controller.signal.aborted) return;
      const firstResponse = evaluations.find((item) => item.response)?.response;
      if (firstResponse) {
        if (includeDirectBaseline) {
          directBaselineStatus = firstResponse.comparison_contract === "direct_baseline_v1"
            ? "supported"
            : "unsupported";
        }
        cycleId = firstResponse.sampling.cycle_id;
        allowedSamples = firstResponse.sampling.allowed_samples;
        cycleExpiresAt = firstResponse.sampling.cycle_expires_at;
        activeSelectedSamplingCycle = { key: cycleKey, cycleId, selectedIndex: index, cycleExpiresAt, allowedSamples };
        if (evaluations.some((item) => item.response &&
          (item.response.sampling.cycle_id !== cycleId ||
           item.response.evaluation.profile_revision !== firstResponse.evaluation.profile_revision ||
           item.response.sampling.allowed_samples.some((entry, i) => entry.conditions_id !== allowedSamples[i].conditions_id) ||
           item.response.samples[0].conditions.conditions_id !== firstResponse.samples[0].conditions.conditions_id ||
           item.response.samples[0].conditions.provider_options_id !== firstResponse.samples[0].conditions.provider_options_id ||
           item.response.samples[0].conditions.initial_departure_at !== firstResponse.samples[0].conditions.initial_departure_at))) {
          loading = false;
          data = null;
          setData = {};
          error = new Error("Selected-sample conditions differ across centres");
          emit();
          return;
        }
      }
      const expired = evaluations.some(({ error: err }) => err?.code === "sample_expired") ||
        (cycleExpiresAt && Date.parse(cycleExpiresAt) <= now().getTime());
      if (expired) {
        if (expiryRecoveryUsed) {
          clearExpiryTimer();
          loading = false;
          data = null;
          error = evaluations.find(({ error: err }) => err)?.error;
          emit();
          return;
        }
        expiryRecoveryUsed = true;
        clearExpiryTimer();
        cycleId = null;
        index = 0;
        cycleReferenceNow = now();
        allowedSamples = null;
        cycleExpiresAt = null;
        activeSelectedSamplingCycle = null;
        setData = {};
        retainedSetData = {};
        data = null;
        sampling = null;
        emit();
        continue;
      }

      const classifiedFailureMetadata = evaluations.find(({ error: err }) =>
        hasClassifiedNoItinerary(err) && validErrorSamplingMetadata(err.sampling, index, cycleId, cycleReferenceNow))?.error?.sampling;
      if (classifiedFailureMetadata) {
        cycleId = classifiedFailureMetadata.cycle_id;
        allowedSamples = classifiedFailureMetadata.allowed_samples;
        cycleExpiresAt = classifiedFailureMetadata.cycle_expires_at;
        activeSelectedSamplingCycle = { key: cycleKey, cycleId, selectedIndex: index, cycleExpiresAt, allowedSamples };
      }

      const dependentFailure = evaluations.some(({ error: err, response }) => {
        const responseBaselineConfirmed = includeDirectBaseline &&
          response?.comparison_contract === "direct_baseline_v1";
        const errorBaselineConfirmed = includeDirectBaseline &&
          err?.comparison_contract === "direct_baseline_v1";
        return (hasClassifiedNoItinerary(response, responseBaselineConfirmed) &&
          !hasNonSampleDependentComponentFailure(response, responseBaselineConfirmed)) ||
        (hasClassifiedNoItinerary(err, errorBaselineConfirmed) &&
          !hasNonSampleDependentComponentFailure(err, errorBaselineConfirmed) &&
          validErrorSamplingMetadata(err.sampling, index, cycleId, cycleReferenceNow));
      });
      const authFailure = evaluations.some(({ error: err }) =>
        err?.status === 401 || err?.status === 403 || err?.failureClass === "authentication");
      const endpointAuthError = evaluations.find(({ error: err }) => isEndpointAuthorizationError(err))?.error;
      if (endpointAuthError) {
        clearExpiryTimer();
        activeSelectedSamplingCycle = null;
        setData = {};
        retainedSetData = {};
        data = null;
        sampling = null;
        loading = false;
        error = endpointAuthError;
        emit();
        return;
      }
      if (dependentFailure && !authFailure && index < 2) {
        index += 1;
        // A new condition invalidates every route in the active set.
        setData = {};
        retainedSetData = {};
        data = null;
        sampling = { cycleId, selectedIndex: index, cycleExpiresAt, allowedSamples };
        activeSelectedSamplingCycle = { key: cycleKey, cycleId, selectedIndex: index, cycleExpiresAt, allowedSamples };
        emit();
        continue;
      }

      if (requestId !== activeRequestId) return;
      const currentResponses = Object.fromEntries(evaluations.filter((item) => item.response).map(({ id, response }) => [id, response]));
      if (Object.entries(currentResponses).some(([id, response]) =>
        retainedSetData[id] && !sameSelectedEvaluationContext(retainedSetData[id], response))) {
        retainedSetData = {};
      }
      setData = { ...retainedSetData };
      for (const [id, response] of Object.entries(currentResponses)) {
        setData[id] = retainedSetData[id] ? retainSameConditionRoutes(retainedSetData[id], response) : response;
      }
      data = setData[String(centreId)] || null;
      loading = false;
      const failed = evaluations.find(({ error: err }) => err);
      error = failed?.error || null;
      sampling = firstResponse
        ? { ...firstResponse.sampling }
        : { cycleId, selectedIndex: index, cycleExpiresAt, allowedSamples };
      if (cycleId && cycleExpiresAt) {
        const canRefresh = evaluations.length > 0 && evaluations.every(({ error: err, response }) =>
          !err && response?.samples?.[0]?.via_status === "available" &&
          !hasClassifiedNoItinerary(response, includeDirectBaseline));
        scheduleCycleExpiry(cycleKey, cycleId, cycleExpiresAt, canRefresh);
      }
      emit();
      return;
    }

    if (requestId === activeRequestId) {
      loading = false;
      data = setData[String(centreId)] || null;
      error = new Error("No selected weekday estimate is available");
      sampling = { cycleId, selectedIndex: 2, cycleExpiresAt, allowedSamples };
      emit();
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
        setData,
        setErrors,
        sampling,
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
        clearExpiryTimer();
        data = null;
        setData = {};
        setErrors = {};
        sampling = null;
        error = null;
      }
      await executeRequest();
    },

    async setMode(newMode) {
      if (mode === newMode) return;
      mode = newMode;
      clearExpiryTimer();
      setSessionMode(userId, newMode);
      data = null;
      setData = {};
      setErrors = {};
      sampling = null;
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
      const retrySameSelectedCondition = selectedSamplingEnabled && mode === "pt" &&
        (sampling?.selected_index ?? sampling?.selectedIndex) === 0 &&
        Boolean(sampling?.cycle_id || sampling?.cycleId);
      await executeRequest(false, selectedSamplingEnabled && mode === "pt" && !retrySameSelectedCondition);
    },

    reset() {
      activeRequestId++;
      if (activeController) {
        activeController.abort();
        activeController = null;
      }
      mode = "drive";
      clearExpiryTimer();
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
      setData = {};
      setErrors = {};
      sampling = null;
      emit();
    },

    destroy() {
      activeRequestId++;
      clearExpiryTimer();
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
  comparisonCentreIds = null,
}) {
  const comparisonKey = comparisonCentreIds ? [...new Set(comparisonCentreIds.map(String))].join("|") : "";
  const normalizedComparisonCentreIds = comparisonKey ? comparisonKey.split("|") : null;
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
    setData: {},
    setErrors: {},
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
      comparisonCentreIds: normalizedComparisonCentreIds,
    });
  if (!sessionRef.current) sessionRef.current = { userId, comparisonKey, session: createSession() };

  useEffect(() => {
    if (sessionRef.current.userId !== userId || sessionRef.current.comparisonKey !== comparisonKey) {
      sessionRef.current.session.destroy();
      sessionRef.current = { userId, comparisonKey, session: createSession() };
      setState({
        mode: getSessionMode(userId), selectedSample: 'weekday', selectedSampleKind: 'weekday',
        centreId, profileId, locationKey, samplePair: getSessionSamplePair(userId),
        loading: Boolean(centreId && profileId), error: null, data: null, setData: {}, setErrors: {}, sampling: null,
        directBaselineStatus: directBaselineEnabled ? "unknown" : "disabled", directBaselineError: null,
      });
    }
    const session = sessionRef.current.session;
    session.open({ centreId, profileId, locationKey });
    return () => {
      // Don't fully reset mode across centre unmounts, but abort inflight requests
      session.destroy();
    };
  }, [centreId, profileId, locationKey, userId, comparisonKey]);

  const visibleState = state.centreId === centreId && state.profileId === profileId && state.locationKey === locationKey &&
    sessionRef.current.userId === userId && sessionRef.current.comparisonKey === comparisonKey
    ? state
    : {
      ...state,
      mode: sessionRef.current.userId === userId ? state.mode : currentMode,
      selectedSample: sessionRef.current.userId === userId ? state.selectedSample : 'weekday',
      selectedSampleKind: sessionRef.current.userId === userId ? state.selectedSampleKind : 'weekday',
      samplePair: sessionRef.current.userId === userId ? state.samplePair : currentSamplePair,
      centreId, profileId, locationKey,
      loading: Boolean(centreId && profileId), error: null, data: null, setData: {}, setErrors: {}, sampling: null,
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
