import React, { useState } from "react";
import { divIcon } from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import CentreLocationMap from "./CentreLocationMap.jsx";
import MapAnchorMarker from "./MapAnchorMarker.jsx";
import { useCommuteSession } from "./commuteSession.js";
import {
  getCentreCommute as defaultGetCentreCommute,
  getCommuteCapabilities as defaultGetCommuteCapabilities,
  getCentreLocation as defaultGetCentreLocation,
} from "../api";
import MapViewportController from "./MapViewportController.jsx";
import { isEndpointAuthorizationError, isNonEmptyString, isUsableRouteLeg } from "./commuteContract.js";

export function formatDuration(secs) {
  if (typeof secs !== "number") return "";
  const totalMins = Math.max(0, Math.round(secs / 60));
  if (totalMins < 60) {
    return `${totalMins} min${totalMins === 1 ? "" : "s"}`;
  }
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (mins === 0) {
    return `${hrs} hr${hrs === 1 ? "" : "s"}`;
  }
  return `${hrs} hr${hrs === 1 ? "" : "s"} ${mins} min${mins === 1 ? "" : "s"}`;
}

export function formatDistance(meters) {
  if (typeof meters !== "number") return "";
  const km = (meters / 1000).toFixed(1);
  return `${km} km`;
}

function hasNonnegativeMetric(value) {
  return Number.isFinite(value) && value >= 0;
}

function hasTimezoneTimestamp(value) {
  return typeof value === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value) &&
    Number.isFinite(Date.parse(value));
}

function hasCoordinate(point) {
  return Number.isFinite(point?.lat) && point.lat >= -90 && point.lat <= 90 &&
    Number.isFinite(point?.lng) && point.lng >= -180 && point.lng <= 180;
}

function sameMetric(left, right) {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < 0.001;
}

function elapsedDurationMatchesTimestamps(leg) {
  const hasDeparture = leg?.departure_at != null;
  const hasArrival = leg?.arrival_at != null;
  if ((hasDeparture && !hasTimezoneTimestamp(leg.departure_at)) ||
      (hasArrival && !hasTimezoneTimestamp(leg.arrival_at))) return false;
  if (!hasDeparture || !hasArrival) return true;
  return sameMetric((Date.parse(leg.arrival_at) - Date.parse(leg.departure_at)) / 1000, leg.duration_seconds);
}

function directRouteFailureMessage(directRoute) {
  if (directRoute?.status !== "unavailable") return null;
  const codes = Array.isArray(directRoute.reasons) ? directRoute.reasons.map((reason) => reason?.code) : [];
  if (codes.includes("provider_timeout")) return "The direct route estimate timed out.";
  if (codes.includes("provider_unavailable")) return "The direct route estimate is temporarily unavailable.";
  if (codes.includes("no_itinerary")) return "No direct route was found for these conditions.";
  if (codes.includes("timing_unverified")) return "Direct route timing could not be verified.";
  return "The direct route estimate is unavailable.";
}

function completeRoute(route, from, to) {
  const routeLegs = Array.isArray(route?.legs) ? route.legs : [];
  const [leg] = routeLegs;
  return route?.status === "available" && routeLegs.length === 1 && leg &&
    leg.from_anchor === from && leg.to_anchor === to && isUsableRouteLeg(leg) &&
    Array.isArray(route.reasons) && route.reasons.length === 0 &&
      Array.isArray(leg.reasons) && leg.reasons.length === 0 &&
    hasNonnegativeMetric(route.totals?.duration_seconds) &&
    hasNonnegativeMetric(route.totals?.distance_meters) &&
    sameMetric(route.totals.duration_seconds, leg.duration_seconds) &&
    sameMetric(route.totals.distance_meters, leg.distance_meters);
}

function hasNegotiatedBaseline({ data, sample, profileId, mode, directBaselineStatus }) {
  const evaluation = data?.evaluation;
  const conditions = sample?.conditions;
  return directBaselineStatus === "supported" && data?.comparison_contract === "direct_baseline_v1" &&
    data?.mode === mode && sample?.kind === (mode === "pt" ? "weekday" : "single") &&
    String(data?.profile_id) === String(profileId) &&
    isNonEmptyString(evaluation?.evaluation_id) && hasTimezoneTimestamp(evaluation?.evaluated_at) &&
    isNonEmptyString(evaluation?.profile_revision) && isNonEmptyString(evaluation?.anchor_revision) &&
    isNonEmptyString(conditions?.conditions_id) && isNonEmptyString(conditions?.provider_options_id) &&
    hasCoordinate(data?.anchors?.home) && hasCoordinate(data?.anchors?.workplace);
}

function isCertifiedComparison({ data, sample, mode, profileId, legs, expectedLegs, hasCompleteTotals, hasConfiguredWorkplace, hasNegotiatedBaseline: baselineReady }) {
  const evaluation = data?.evaluation;
  const conditions = sample?.conditions;
  const comparison = sample?.comparison;
  const certification = comparison?.certification;
  const directRoute = sample?.direct_route;
  if (!hasConfiguredWorkplace || !baselineReady || !hasCompleteTotals ||
      sample?.via_status !== "available" || !completeRoute(directRoute, "home", "workplace") ||
      comparison?.status !== "available" || !Array.isArray(comparison.reasons) || comparison.reasons.length !== 0 ||
      !Array.isArray(sample?.reasons) || sample.reasons.length !== 0 ||
      !isNonEmptyString(evaluation?.evaluation_id) || !isNonEmptyString(evaluation?.profile_revision) ||
      !isNonEmptyString(evaluation?.anchor_revision) || !hasTimezoneTimestamp(evaluation?.evaluated_at) ||
      !isNonEmptyString(conditions?.conditions_id) || !isNonEmptyString(conditions?.provider_options_id) ||
      !isNonEmptyString(certification?.provider_options_id) ||
      certification.provider_options_id !== conditions.provider_options_id) return false;

  const expectedDurationBasis = mode === "pt" ? "elapsed_from_requested_departure" : "provider_default";
  if (certification.duration_basis !== expectedDurationBasis ||
      (mode === "pt" && (conditions.timing_basis !== "scheduled_departure" ||
        !hasTimezoneTimestamp(conditions.initial_departure_at))) ||
      (mode !== "pt" && conditions.timing_basis !== "provider_default")) return false;

  const directLeg = directRoute.legs[0];
  const requiredLegs = [...legs, directLeg];
  const source = requiredLegs[0]?.source;
  if (!isNonEmptyString(source) ||
      !requiredLegs.every((leg) => leg.timing?.duration_basis === expectedDurationBasis &&
        leg.source === source && Array.isArray(leg.reasons) && leg.reasons.length === 0)) return false;
  if (mode === "pt") {
    if (!requiredLegs.every((leg) => leg.timing?.initial_wait_included === true)) return false;
    if (!requiredLegs.every(elapsedDurationMatchesTimestamps)) return false;
    const firstViaLeg = legs[0];
    const onwardLeg = legs[1];
    if (!hasTimezoneTimestamp(firstViaLeg?.departure_at) ||
        Date.parse(firstViaLeg.departure_at) !== Date.parse(conditions.initial_departure_at) ||
        !hasTimezoneTimestamp(directLeg.departure_at) ||
        Date.parse(directLeg.departure_at) !== Date.parse(conditions.initial_departure_at) ||
        !hasTimezoneTimestamp(firstViaLeg?.arrival_at) || !hasTimezoneTimestamp(onwardLeg?.departure_at) ||
        Date.parse(firstViaLeg.arrival_at) !== Date.parse(onwardLeg.departure_at)) return false;
  }

  const viaDuration = legs.reduce((total, leg) => total + leg.duration_seconds, 0);
  const viaDistance = legs.reduce((total, leg) => total + leg.distance_meters, 0);
  return expectedLegs.length === legs.length &&
    sameMetric(viaDuration, sample.totals.duration_seconds) &&
    sameMetric(viaDistance, sample.totals.distance_meters);
}

/** Shared, fail-closed commute summary for matches, details and comparison. */
export function summarizeCommute({ data, profileId, mode = "drive", directBaselineStatus = "disabled", workplaceConfigured, comparisonCompatible = true, comparisonSetComplete = true }) {
  const samples = Array.isArray(data?.samples) ? data.samples.filter((item) => item && typeof item === "object") : [];
  const sample = mode === "pt" ? samples.find((item) => item.kind === "weekday") || null : samples[0] || null;
  const hasConfiguredWorkplace = workplaceConfigured ?? Boolean(
    data?.anchors?.workplace || (Array.isArray(sample?.legs) && sample.legs.some((leg) => leg?.to_anchor === "workplace"))
  );
  const legs = (Array.isArray(sample?.legs) ? sample.legs : []).filter((leg) => leg && typeof leg === "object")
    .filter((leg) => hasConfiguredWorkplace || leg.to_anchor !== "workplace");
  const expectedLegs = hasConfiguredWorkplace
    ? [["home", "centre"], ["centre", "workplace"]]
    : [["home", "centre"]];
  const hasExpectedLegs = legs.length === expectedLegs.length && legs.every((leg, index) =>
    leg.from_anchor === expectedLegs[index][0] && leg.to_anchor === expectedLegs[index][1]
  );
  const hasCompleteTotals = Boolean(
    hasExpectedLegs && legs.every(isUsableRouteLeg) &&
    (mode !== "pt" || legs.every(elapsedDurationMatchesTimestamps)) &&
    sample?.via_status !== "partial" && sample?.via_status !== "unavailable" &&
    hasNonnegativeMetric(sample?.totals?.duration_seconds) &&
    hasNonnegativeMetric(sample?.totals?.distance_meters) &&
    sameMetric(legs.reduce((total, leg) => total + leg.duration_seconds, 0), sample.totals.duration_seconds) &&
    sameMetric(legs.reduce((total, leg) => total + leg.distance_meters, 0), sample.totals.distance_meters)
  );
  const baselineReady = hasNegotiatedBaseline({ data, sample, profileId, mode, directBaselineStatus });
  const directRoute = sample?.direct_route;
  const hasDirectRoute = baselineReady && completeRoute(directRoute, "home", "workplace");
  const directFailureMessage = baselineReady ? directRouteFailureMessage(directRoute) : null;
  const individuallyCertified = isCertifiedComparison({
    data, sample, mode, profileId, legs, expectedLegs, hasCompleteTotals, hasConfiguredWorkplace,
    hasNegotiatedBaseline: baselineReady,
  });
  const comparisonAvailable = individuallyCertified && comparisonCompatible;
  const signedDeviationSeconds = comparisonAvailable
    ? sample.totals.duration_seconds - directRoute.totals.duration_seconds
    : null;
  const deviationHeadline = signedDeviationSeconds === null ? null
    : signedDeviationSeconds <= 0 ? "No extra travel"
      : signedDeviationSeconds < 60 ? "Less than 1 min extra travel"
        : `${Math.floor(signedDeviationSeconds / 60 + 0.5)} min extra travel`;
  const hasHomeCoordinate = hasCoordinate(data?.anchors?.home);
  const hasWorkplaceCoordinate = hasCoordinate(data?.anchors?.workplace);
  const unresolvedLeg = legs.find((leg) => leg?.status === "unavailable" &&
    typeof leg.message === "string" && leg.message.toLowerCase().includes("could not be resolved"));
  const homeUnresolvable = Boolean(data && !hasHomeCoordinate) ||
    Boolean(unresolvedLeg?.message?.toLowerCase().includes("home"));
  const workplaceUnresolvable = hasConfiguredWorkplace && Boolean(data) && (!hasWorkplaceCoordinate ||
    Boolean(unresolvedLeg?.message?.toLowerCase().includes("workplace")));
  const locationError = homeUnresolvable
    ? "Your saved home location could not be resolved. Edit your family profile to update it."
    : workplaceUnresolvable
      ? "Your configured workplace location could not be resolved. Edit your family profile to update it."
      : null;
  const reasonCodes = [
    ...(Array.isArray(sample?.reasons) ? sample.reasons : []),
    ...(Array.isArray(sample?.comparison?.reasons) ? sample.comparison.reasons : []),
    ...(Array.isArray(sample?.direct_route?.reasons) ? sample.direct_route.reasons : []),
    ...legs.flatMap((leg) => Array.isArray(leg?.reasons) ? leg.reasons : []),
  ].map((reason) => reason?.code).filter(Boolean);
  const retryable = [
    ...(Array.isArray(sample?.reasons) ? sample.reasons : []),
    ...(Array.isArray(sample?.comparison?.reasons) ? sample.comparison.reasons : []),
    ...(Array.isArray(sample?.direct_route?.reasons) ? sample.direct_route.reasons : []),
    ...legs.flatMap((leg) => Array.isArray(leg?.reasons) ? leg.reasons : []),
  ].some((reason) => reason?.retryable === true);
  const timingUnverified = reasonCodes.includes("timing_unverified") ||
    legs.some((leg) => leg?.timing?.verified === false) || sample?.comparison?.status === "unavailable" &&
      !reasonCodes.some((code) => code !== "timing_unverified");
  const comparisonUnavailableMessage = !comparisonSetComplete ? "Some centre estimates are missing, so route estimates cannot be compared directly."
    : !comparisonCompatible ? "Cannot verify that route estimates use the same conditions, so they cannot be compared directly."
    : !hasConfiguredWorkplace ? null
    : directBaselineStatus === "unsupported" ? "Extra travel comparison is not supported for this profile and mode."
      : directBaselineStatus === "disabled" ? "Extra travel comparison is not enabled for this service."
        : directBaselineStatus === "error" ? "Extra travel comparison could not be checked. Retry to check support."
          : directFailureMessage ? directFailureMessage
            : timingUnverified ? "Travel timing could not be verified, so extra travel is unavailable."
            : directBaselineStatus === "supported" ? "Extra travel unavailable with the available route data."
              : "Extra travel comparison is not available yet.";
  const usableViaLegs = legs.filter((leg, index) =>
    leg?.from_anchor === expectedLegs[index]?.[0] && leg?.to_anchor === expectedLegs[index]?.[1] && isUsableRouteLeg(leg)
  ).map((leg) => ({
    from: leg.from_anchor, to: leg.to_anchor, durationSeconds: leg.duration_seconds,
    distanceMeters: leg.distance_meters,
  }));
  return {
    sample, legs, expectedLegs, hasConfiguredWorkplace, hasCompleteTotals, baselineReady,
    directRoute, hasDirectRoute, comparisonAvailable, signedDeviationSeconds, deviationHeadline,
    homeTravelSeconds: !hasConfiguredWorkplace && hasCompleteTotals ? sample.totals.duration_seconds : null,
    homeTravelDistanceMeters: !hasConfiguredWorkplace && hasCompleteTotals ? sample.totals.distance_meters : null,
    homeTravelComparable: comparisonCompatible && comparisonSetComplete,
    directFailureMessage: baselineReady ? directRouteFailureMessage(directRoute) : null,
    directFailureRetryable: baselineReady && Array.isArray(directRoute?.reasons) && directRoute.reasons.some((reason) => reason?.retryable === true),
    retryable,
    directBaselineStatus, locationError, comparisonUnavailableMessage, timingUnverified,
    usableViaLegs,
    directTravelSeconds: hasDirectRoute ? directRoute.totals.duration_seconds : null,
    directTravelDistanceMeters: hasDirectRoute ? directRoute.totals.distance_meters : null,
  };
}

export function CommuteModeSelector({ mode, onModeChange }) {
  const modes = [["drive", "Driving"], ["pt", "Public transport"], ["walk", "Walking"], ["cycle", "Cycling"]];
  return <div className="commute-mode-selector" role="group" aria-label="Travel mode">
    {modes.map(([value, label]) => <button key={value} type="button"
      aria-pressed={mode === value} className={`commute-mode-btn ${mode === value ? "active" : ""}`}
      onClick={() => onModeChange?.(value)}>{label}</button>)}
  </div>;
}

function routeArrow(geometry) {
  const startIndex = Math.max(0, Math.floor((geometry.length - 2) / 2));
  const start = geometry[startIndex];
  const end = geometry[startIndex + 1];
  const angle = Math.atan2(end.lng - start.lng, end.lat - start.lat) * 180 / Math.PI;
  return {
    position: [(start.lat + end.lat) / 2, (start.lng + end.lng) / 2],
    icon: divIcon({
      className: "commute-direction-arrow",
      html: `<svg viewBox="0 0 20 20" aria-hidden="true" style="transform:rotate(${angle}deg)"><path d="M10 1 19 18 10 14 1 18Z" fill="currentColor" stroke="white" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    }),
  };
}

export function CentreCommuteView({
  currentUser,
  centreId,
  profileId,
  workplaceConfigured,
  centre,
  centreName = centre?.name || centre?.centre_name,
  loading,
  error,
  data,
  setData = {},
  mode = "drive",
  directBaselineStatus = "disabled",
  directBaselineError = null,
  onModeChange,
  onRetry,
  onSignIn,
  onEditProfile,
  getCentreLocation = defaultGetCentreLocation,
}) {
  const [highlightedRoute, setHighlightedRoute] = useState("all");
  // 1. Guests see only centre location map with sign-in prompt
  if (!currentUser) {
    return (
      <CentreLocationMap
        centre={centre}
        currentUser={currentUser}
        onSignIn={onSignIn}
        getCentreLocation={getCentreLocation}
        summaryTarget
      />
    );
  }

  // 2. Signed-in parents without saved profile see centre location map with edit profile prompt
  if (!profileId) {
    return (
      <section className="centre-map-section" aria-label="Centre location and commute setup">
        <CentreLocationMap
          centre={centre}
          currentUser={currentUser}
          onSignIn={onSignIn}
          getCentreLocation={getCentreLocation}
        />
        <div className="centre-commute-profile-prompt" id="centre-commute-summary" tabIndex={-1} aria-label="Commute details" role="status">
          <p>Please finish setting up your family profile to see personalised commute routes and travel times.</p>
          <button
            type="button"
            className="guest-signin-btn"
            onClick={onEditProfile || undefined}
          >
            Edit family profile
          </button>
        </div>
      </section>
    );
  }

  // 3. Parents with saved profile
  const activeCentreId = centreId ?? centre?.id ?? centre?.centre_id;
  const routeAuthError = isEndpointAuthorizationError(error);
  const activeData = routeAuthError ? null :
    data || (activeCentreId != null ? setData?.[String(activeCentreId)] : null) || null;
  const summary = summarizeCommute({ data: activeData, profileId, mode, directBaselineStatus, workplaceConfigured });
  const { sample, legs, expectedLegs, hasConfiguredWorkplace, hasCompleteTotals, directRoute,
    hasDirectRoute, comparisonAvailable, signedDeviationSeconds, deviationHeadline,
    directFailureMessage, directFailureRetryable } = summary;
  const currentSampleKind = sample?.kind || "single";

  // Check for unresolvable postal code messages
  const unresolvableLeg = legs.find(
    (l) => l.status === "unavailable" && typeof l.message === "string" && l.message.toLowerCase().includes("could not be resolved")
  );
  const homeAnchor = activeData?.anchors?.home;
  const hasHomeCoordinate = Number.isFinite(homeAnchor?.lat) && Number.isFinite(homeAnchor?.lng);
  const workplaceAnchor = activeData?.anchors?.workplace;
  const hasWorkplaceCoordinate = Number.isFinite(workplaceAnchor?.lat) && Number.isFinite(workplaceAnchor?.lng);
  const homeUnresolvable = Boolean(activeData && !hasHomeCoordinate) ||
    (unresolvableLeg && unresolvableLeg.message.toLowerCase().includes("home"));
  const workplaceUnresolvable = hasConfiguredWorkplace && (
    !hasWorkplaceCoordinate ||
    (unresolvableLeg && unresolvableLeg.message.toLowerCase().includes("workplace"))
  );

  const unresolvableMessage = homeUnresolvable
    ? "Your saved home location could not be resolved. Edit your family profile to update it."
    : workplaceUnresolvable
    ? "Your configured workplace location could not be resolved. Edit your family profile to update it."
    : null;

  // Determine center coordinates for MapContainer
  const availableLegsWithGeometry = legs.filter(
    isUsableRouteLeg
  );
  const hasCentreCoordinate = hasCoordinate(activeData?.anchors?.centre);
  const mapCoordinates = [
    ...[activeData?.anchors?.home, activeData?.anchors?.centre, activeData?.anchors?.workplace]
      .filter(hasCoordinate)
      .map((point) => [point.lat, point.lng]),
    ...availableLegsWithGeometry.flatMap((leg) => leg.geometry
      .filter(hasCoordinate)
      .map((point) => [point.lat, point.lng])),
    ...(hasDirectRoute ? directRoute.legs[0].geometry.map((point) => [point.lat, point.lng]) : []),
  ];
  const routeVisibility = (key) => ({
    opacity: highlightedRoute === "all" || highlightedRoute === key ? 1 : 0.18,
    weight: highlightedRoute === key ? 8 : 5,
  });

  const commuteMap = activeData ? (mapCoordinates.length > 0 && (hasCentreCoordinate || hasDirectRoute) ? <div className="centre-map-wrapper" data-testid="centre-commute-map">
    <MapContainer center={mapCoordinates[0]} zoom={13} zoomAnimation={false} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
      <MapViewportController coordinates={mapCoordinates} />
      <TileLayer attribution='&copy; <a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a> &copy; Singapore Land Authority' url="https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png" maxZoom={19} minZoom={11} />
      {hasCoordinate(activeData.anchors?.home) && <MapAnchorMarker kind="home" position={[activeData.anchors.home.lat, activeData.anchors.home.lng]} popup={<Popup><strong>Home</strong></Popup>} />}
      {hasCoordinate(activeData.anchors?.centre) && <MapAnchorMarker kind="centre" position={[activeData.anchors.centre.lat, activeData.anchors.centre.lng]} popup={<Popup><strong>Centre</strong>{centreName ? `: ${centreName}` : ""}</Popup>} />}
      {hasCoordinate(activeData.anchors?.workplace) && <MapAnchorMarker kind="work" position={[activeData.anchors.workplace.lat, activeData.anchors.workplace.lng]} popup={<Popup><strong>Work</strong></Popup>} />}
      {availableLegsWithGeometry.map((leg, idx) => { const routeKey = idx === 0 ? "home-centre" : "centre-workplace"; const color = idx === 0 ? "#2563eb" : "#07805f"; const arrow = routeArrow(leg.geometry); return <React.Fragment key={`${currentSampleKind}-${idx}`}><Polyline positions={leg.geometry.map((c) => [c.lat, c.lng])} pathOptions={{ color, ...routeVisibility(routeKey) }} /><Marker position={arrow.position} icon={arrow.icon} interactive={false} /></React.Fragment>; })}
      {hasDirectRoute && <><Polyline key="direct-route" positions={directRoute.legs[0].geometry.map((c) => [c.lat, c.lng])} pathOptions={{ color: "#59636e", weight: 3, dashArray: "10, 8", ...routeVisibility("direct") }} /><Marker position={routeArrow(directRoute.legs[0].geometry).position} icon={routeArrow(directRoute.legs[0].geometry).icon} interactive={false} /></>}
    </MapContainer>
  </div> : <div className="centre-map-unavailable" role="status">Map view is currently unavailable for this centre.</div>) : <CentreLocationMap centre={centre} currentUser={currentUser} getCentreLocation={getCentreLocation} />;

  return (
    <section className="centre-map-section" aria-label="Centre commute comparison">
      {commuteMap}
      <div id="centre-commute-summary" tabIndex={-1} aria-label="Commute details">
      {/* Travel mode selector */}
      <CommuteModeSelector mode={mode} onModeChange={onModeChange} />

      {loading && !activeData && (
        <>
          <div className="centre-map-loading" role="status">Loading commute route…</div>
        </>
      )}

      {error && !loading && !activeData && (
        <>
          <div className="centre-map-unavailable" role="status">
            <p>{routeAuthError
              ? error.status === 401
                ? "Your sign-in has expired. Sign in again to load your personal commute route."
                : "This account cannot access personal commute routes. Switch to a parent account to continue."
              : mode === "pt" ? "Could not load the public transport estimate." : "Could not load commute route."}</p>
            <button type="button" className="retry-route-btn" onClick={routeAuthError ? onSignIn || undefined : onRetry || undefined}>
              {routeAuthError ? error.status === 401 ? "Sign in" : "Sign in with a parent account" : "Retry route"}
            </button>
          </div>
        </>
      )}

      {activeData && (loading || error) && (
        <div className={error ? "commute-refresh-status commute-refresh-error" : "commute-refresh-status"} role={error ? "alert" : "status"}>
          <p>{loading
            ? "Refreshing commute estimates. Showing available results for this selection."
            : routeAuthError
            ? error.status === 401
              ? "Your sign-in expired while refreshing. Showing available results for this selection."
              : "This account cannot refresh personal commute routes. Showing available results for this selection."
            : "Some commute estimates could not be refreshed. Showing available results for this selection."}</p>
          {error && <button type="button" className="retry-route-btn" onClick={routeAuthError ? onSignIn || undefined : onRetry || undefined}>
            {routeAuthError ? error.status === 401 ? "Sign in" : "Sign in with a parent account" : "Retry route"}
          </button>}
        </div>
      )}

      {activeData && (
        <>
          {unresolvableMessage && (
            <div className="commute-unresolvable-warning" role="alert">
              <p>{unresolvableMessage}</p>
              <button
                type="button"
                className="guest-signin-btn"
                onClick={onEditProfile || undefined}
              >
                Edit family profile
              </button>
            </div>
          )}

          <p className="commute-estimate-note" role="note">Estimated travel time. Actual journeys may vary.</p>
          {!hasConfiguredWorkplace && (
            <p className="commute-estimate-note" role="note">Home to centre only; no workplace is configured in your saved profile.</p>
          )}
          {hasConfiguredWorkplace && (comparisonAvailable ? (
            <div className="commute-deviation">
              <strong>{deviationHeadline}</strong>
              <p>Via centre {formatDuration(sample.totals.duration_seconds)} · Direct {formatDuration(directRoute.totals.duration_seconds)}</p>
              <small>Times rounded</small>
            </div>
          ) : (
            <div className="commute-estimate-note" role="status">
              {directFailureMessage && <p>{directFailureMessage}</p>}
              <p>{directBaselineStatus === "supported"
                ? "Extra travel unavailable with the available route data."
                : directBaselineStatus === "error"
                ? directBaselineError?.status === 401 || directBaselineError?.status === 403
                  ? "Sign in again to check direct-route support."
                  : "Extra travel comparison could not be checked."
                : "Extra travel comparison isn’t available yet."}</p>
              {directBaselineStatus === "error" && <button type="button" className="retry-route-btn" onClick={
                directBaselineError?.status === 401 || directBaselineError?.status === 403 ? onSignIn || onRetry : onRetry
              }>{directBaselineError?.status === 401 || directBaselineError?.status === 403 ? "Sign in" : "Retry comparison check"}</button>}
              {directFailureRetryable && <button type="button" className="retry-route-btn" onClick={onRetry || undefined}>Retry route</button>}
            </div>
          ))}
          {mode === "pt" && !sample && (
            <div className="commute-totals-unavailable" role="status">
              <span>Public transport estimate unavailable.</span>
              <button type="button" className="retry-route-btn" onClick={onRetry || undefined}>Retry route</button>
            </div>
          )}

          {hasConfiguredWorkplace && <div className="commute-route-legend" role="group" aria-label="Route alternatives">
            {hasDirectRoute && <button type="button" aria-pressed={highlightedRoute === "direct"} onClick={() => setHighlightedRoute(highlightedRoute === "direct" ? "all" : "direct")}>
              <span className="commute-route-key direct" aria-hidden="true" />Direct home to workplace
            </button>}
          {legs[0] && <button type="button" aria-pressed={highlightedRoute === "home-centre"} onClick={() => setHighlightedRoute(highlightedRoute === "home-centre" ? "all" : "home-centre")}>
              <span className="commute-route-key home-centre" aria-hidden="true" />Home to centre
            </button>}
            {legs[1] && <button type="button" aria-pressed={highlightedRoute === "centre-workplace"} onClick={() => setHighlightedRoute(highlightedRoute === "centre-workplace" ? "all" : "centre-workplace")}>
              <span className="commute-route-key centre-workplace" aria-hidden="true" />Centre to workplace
            </button>}
            <button type="button" aria-pressed={highlightedRoute === "all"} onClick={() => setHighlightedRoute("all")}>Show all routes</button>
          </div>}

          {/* Readable text breakdown */}
          {sample && <div className="commute-breakdown" aria-label="Journey breakdown">
            {hasDirectRoute && <div className="commute-direct-summary">
              <strong>Direct home to workplace</strong>
              <span>{formatDuration(directRoute.totals.duration_seconds)} ({formatDistance(directRoute.totals.distance_meters)})</span>
            </div>}
            {legs.map((leg, idx) => {
              const isLeg1 = leg.from_anchor === "home";
              const legTitle = isLeg1 ? "Leg 1: Home → Centre" : "Leg 2: Centre → Workplace";
              const matchesExpectedLeg = leg.from_anchor === expectedLegs[idx]?.[0] && leg.to_anchor === expectedLegs[idx]?.[1];
              const isAvailable = matchesExpectedLeg && isUsableRouteLeg(leg);

              return (
                <div key={idx} className="commute-leg-item">
                  <div className="commute-leg-main">
                    <div className="commute-leg-header">
                      <span
                        className={`commute-leg-indicator ${isLeg1 ? "indicator-solid-blue" : "indicator-solid-green"}`}
                        aria-hidden="true"
                      />
                      <strong>{legTitle}</strong>
                    </div>
                    {isAvailable ? (
                      <span className="commute-leg-metrics">
                        {formatDuration(leg.duration_seconds)} ({formatDistance(leg.distance_meters)})
                      </span>
                    ) : (
                      <div className="commute-leg-failed">
                        <span>Route unavailable for {isLeg1 ? "Home → Centre" : "Centre → Workplace"}</span>
                        <button type="button" className="retry-route-btn" onClick={onRetry || undefined}>
                          Retry route
                        </button>
                      </div>
                    )}
                  </div>
                  {isAvailable && Array.isArray(leg.transit_legs) && leg.transit_legs.length > 0 && (
                    <div className="commute-transit-legs" aria-label="Transit segments">
                      {leg.transit_legs.filter((sub) => sub && typeof sub === "object").map((sub, sIdx) => {
                        const isWalk = sub.mode === "WALK";
                        const route = typeof sub.route === "string" ? sub.route.trim() : "";
                        const safeRouteId = /^(?:[A-Z]{1,3}\d{1,4}|\d{1,4}[A-Z]?)$/i.test(route);
                        const subTitle = isWalk ? "Walk" : safeRouteId ? `Transit (${route})` : "Transit";
                        return (
                          <div key={sIdx} className="commute-transit-subleg">
                            <span className="commute-subleg-type">{subTitle}: </span>
                            <span className="commute-subleg-metrics">
                              {formatDuration(sub.duration_seconds)} ({formatDistance(sub.distance_meters)})
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Totals */}
            {hasCompleteTotals ? (
              <div className="commute-totals">
                <div className="commute-totals-value">
                  <strong>
                    Total travel: {formatDuration(sample.totals.duration_seconds)} ({formatDistance(sample.totals.distance_meters)})
                  </strong>
                </div>
                <small className="commute-totals-note">Travel time only; child drop-off time is excluded. Actual journeys may vary.</small>
              </div>
            ) : (
              <div className="commute-totals-unavailable">
                <span>Complete journey totals unavailable due to incomplete route leg.</span>
                <button type="button" className="retry-route-btn" onClick={onRetry || undefined}>
                  Retry route
                </button>
              </div>
            )}
          </div>}
        </>
      )}
      </div>
    </section>
  );
}

export default function CentreCommute({
  centre,
  centreId = centre?.id || centre?.centre_id,
  centreName = centre?.name || centre?.centre_name,
  currentUser = null,
  profileId = null,
  workplaceConfigured,
  profileLocationKey = null,
  userId = currentUser?.uid || currentUser?.user_id || currentUser?.id || currentUser?.email || null,
  onSignIn = null,
  onEditProfile = null,
  loadCommute = defaultGetCentreCommute,
  getCapabilities = defaultGetCommuteCapabilities,
  directBaselineEnabled = import.meta.env.VITE_COMMUTE_DIRECT_BASELINE_ENABLED === "true",
  getCentreLocation = defaultGetCentreLocation,
}) {
  const effectiveUserId = userId || currentUser?.uid || currentUser?.user_id || currentUser?.id || currentUser?.email || null;
  const session = useCommuteSession({
    centreId: currentUser && profileId ? centreId : null,
    profileId: currentUser && profileId ? profileId : null,
    locationKey: currentUser && profileId ? profileLocationKey : null,
    userId: effectiveUserId,
    loadCommute,
    getCapabilities,
    directBaselineEnabled,
  });

  return (
    <CentreCommuteView
      currentUser={currentUser}
      centreId={centreId}
      profileId={profileId}
      workplaceConfigured={workplaceConfigured}
      centre={centre}
      centreName={centreName}
      loading={session.loading}
      error={session.error}
      data={session.data}
      setData={session.setData}
      mode={session.mode}
      directBaselineStatus={session.directBaselineStatus}
      directBaselineError={session.directBaselineError}
      onModeChange={session.setMode}
      onSelectSample={session.selectSample}
      onRetry={session.retry}
      onSignIn={onSignIn}
      onEditProfile={onEditProfile}
      getCentreLocation={getCentreLocation}
    />
  );
}
