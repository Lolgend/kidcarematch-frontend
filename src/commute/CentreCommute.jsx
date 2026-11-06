import React, { useState } from "react";
import { divIcon } from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import CentreLocationMap from "./CentreLocationMap.jsx";
import { useCommuteSession } from "./commuteSession.js";
import {
  getCentreCommute as defaultGetCentreCommute,
  getCommuteCapabilities as defaultGetCommuteCapabilities,
  getCentreLocation as defaultGetCentreLocation,
} from "../api";
import MapViewportController from "./MapViewportController.jsx";

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

function hasUsableGeometry(leg) {
  return Array.isArray(leg?.geometry) && leg.geometry.length >= 2 && leg.geometry.every(
    (point) => Number.isFinite(point?.lat) && point.lat >= -90 && point.lat <= 90 &&
      Number.isFinite(point?.lng) && point.lng >= -180 && point.lng <= 180
  );
}

function isUsableRouteLeg(leg) {
  return leg?.status === "available" &&
    isNonEmptyString(leg.source) &&
    hasNonnegativeMetric(leg.duration_seconds) &&
    hasNonnegativeMetric(leg.distance_meters) &&
    hasUsableGeometry(leg);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
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

function completeRoute(route, from, to) {
  const [leg] = route?.legs || [];
  return route?.status === "available" && route.legs.length === 1 &&
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
  profileId,
  workplaceConfigured,
  centre,
  centreName = centre?.name || centre?.centre_name,
  loading,
  error,
  data,
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
        <div className="centre-commute-profile-prompt" role="status">
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
  const samples = Array.isArray(data?.samples) ? data.samples : [];
  const sample = mode === "pt"
    ? samples.find((item) => item.kind === "weekday") || null
    : samples[0] || null;
  const currentSampleKind = sample?.kind || "single";
  const hasConfiguredWorkplace = workplaceConfigured ?? Boolean(
    data?.anchors?.workplace || sample?.legs?.some((leg) => leg.to_anchor === "workplace")
  );
  const legs = (sample?.legs || []).filter((leg) =>
    hasConfiguredWorkplace || leg.to_anchor !== "workplace"
  );

  // Check for unresolvable postal code messages
  const unresolvableLeg = legs.find(
    (l) => l.status === "unavailable" && l.message && l.message.toLowerCase().includes("could not be resolved")
  );
  const homeAnchor = data?.anchors?.home;
  const hasHomeCoordinate = Number.isFinite(homeAnchor?.lat) && Number.isFinite(homeAnchor?.lng);
  const workplaceAnchor = data?.anchors?.workplace;
  const hasWorkplaceCoordinate = Number.isFinite(workplaceAnchor?.lat) && Number.isFinite(workplaceAnchor?.lng);
  const homeUnresolvable = Boolean(data && !hasHomeCoordinate) ||
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
  const expectedLegs = hasConfiguredWorkplace
    ? [["home", "centre"], ["centre", "workplace"]]
    : [["home", "centre"]];
  const hasExpectedLegs = legs.length === expectedLegs.length && legs.every((leg, index) =>
    leg.from_anchor === expectedLegs[index][0] && leg.to_anchor === expectedLegs[index][1]
  );
  const hasCompleteTotals = Boolean(
    hasExpectedLegs && legs.every(isUsableRouteLeg) &&
    hasNonnegativeMetric(sample?.totals?.duration_seconds) &&
    hasNonnegativeMetric(sample?.totals?.distance_meters)
  );
  const directRoute = sample?.direct_route;
  const baselineReady = hasNegotiatedBaseline({ data, sample, profileId, mode, directBaselineStatus });
  const hasDirectRoute = baselineReady && completeRoute(directRoute, "home", "workplace");
  const comparisonAvailable = isCertifiedComparison({
    data, sample, mode, profileId, legs, expectedLegs, hasCompleteTotals, hasConfiguredWorkplace,
    hasNegotiatedBaseline: baselineReady,
  });
  const signedDeviationSeconds = comparisonAvailable
    ? sample.totals.duration_seconds - directRoute.totals.duration_seconds
    : null;
  const deviationHeadline = signedDeviationSeconds === null
    ? null
    : signedDeviationSeconds <= 0
    ? "No extra travel"
    : signedDeviationSeconds < 60
    ? "Less than 1 min extra travel"
    : `${Math.floor(signedDeviationSeconds / 60 + 0.5)} min extra travel`;

  // Determine center coordinates for MapContainer
  const availableLegsWithGeometry = legs.filter(
    isUsableRouteLeg
  );
  const hasCentreCoordinate = Number.isFinite(data?.anchors?.centre?.lat) && Number.isFinite(data?.anchors?.centre?.lng);
  const mapCoordinates = [
    ...[data?.anchors?.home, data?.anchors?.centre, data?.anchors?.workplace]
      .filter((point) => point && Number.isFinite(point.lat) && Number.isFinite(point.lng))
      .map((point) => [point.lat, point.lng]),
    ...availableLegsWithGeometry.flatMap((leg) => leg.geometry
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
      .map((point) => [point.lat, point.lng])),
    ...(hasDirectRoute ? directRoute.legs[0].geometry.map((point) => [point.lat, point.lng]) : []),
  ];
  const routeVisibility = (key) => ({
    opacity: highlightedRoute === "all" || highlightedRoute === key ? 1 : 0.18,
    weight: highlightedRoute === key ? 8 : 5,
  });

  return (
    <section className="centre-map-section" aria-label="Centre commute comparison">
      {/* Travel mode selector */}
      <div className="commute-mode-selector" role="group" aria-label="Travel mode">
        <button
          type="button"
          aria-pressed={mode === "drive"}
          className={`commute-mode-btn ${mode === "drive" ? "active" : ""}`}
          onClick={() => onModeChange && onModeChange("drive")}
        >
          Driving
        </button>
        <button
          type="button"
          aria-pressed={mode === "pt"}
          className={`commute-mode-btn ${mode === "pt" ? "active" : ""}`}
          onClick={() => onModeChange && onModeChange("pt")}
        >
          Public transport
        </button>
        <button
          type="button"
          aria-pressed={mode === "walk"}
          className={`commute-mode-btn ${mode === "walk" ? "active" : ""}`}
          onClick={() => onModeChange && onModeChange("walk")}
        >
          Walking
        </button>
        <button
          type="button"
          aria-pressed={mode === "cycle"}
          className={`commute-mode-btn ${mode === "cycle" ? "active" : ""}`}
          onClick={() => onModeChange && onModeChange("cycle")}
        >
          Cycling
        </button>
      </div>

      {loading && (
        <>
          <CentreLocationMap centre={centre} currentUser={currentUser} getCentreLocation={getCentreLocation} />
          <div className="centre-map-loading" role="status">Loading commute route…</div>
        </>
      )}

      {error && !loading && (
        <>
          <CentreLocationMap centre={centre} currentUser={currentUser} getCentreLocation={getCentreLocation} />
          <div className="centre-map-unavailable" role="status">
            <p>{mode === "pt" ? "Could not load the public transport estimate." : "Could not load commute route."}</p>
            <button type="button" className="retry-route-btn" onClick={onRetry || undefined}>Retry route</button>
          </div>
        </>
      )}

      {!loading && !error && data && (
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
            <div className="commute-deviation" data-deviation-seconds={signedDeviationSeconds}>
              <strong>{deviationHeadline}</strong>
              <p>Via centre {formatDuration(sample.totals.duration_seconds)} · Direct {formatDuration(directRoute.totals.duration_seconds)}</p>
              <small>Times rounded</small>
            </div>
          ) : (
            <div className="commute-estimate-note" role="status">
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
            </div>
          ))}
          {mode === "pt" && !sample && (
            <div className="commute-totals-unavailable" role="status">
              <span>Public transport estimate unavailable.</span>
              <button type="button" className="retry-route-btn" onClick={onRetry || undefined}>Retry route</button>
            </div>
          )}

          {/* Map display */}
          {mapCoordinates.length > 0 && (hasCentreCoordinate || hasDirectRoute) ? <div className="centre-map-wrapper" data-testid="centre-commute-map">
            <MapContainer
              center={mapCoordinates[0]}
              zoom={13}
              zoomAnimation={false}
              scrollWheelZoom={false}
              style={{ height: "100%", width: "100%" }}
            >
              <MapViewportController coordinates={mapCoordinates} />
              <TileLayer
                attribution='&copy; <a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a> &copy; Singapore Land Authority'
                url="https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png"
                maxZoom={19}
                minZoom={11}
              />
              {Number.isFinite(data.anchors?.home?.lat) && Number.isFinite(data.anchors?.home?.lng) && (
                <Marker position={[data.anchors.home.lat, data.anchors.home.lng]} alt="Home" title="Home">
                  <Popup>
                    <strong>Home</strong>
                  </Popup>
                </Marker>
              )}
              {Number.isFinite(data.anchors?.centre?.lat) && Number.isFinite(data.anchors?.centre?.lng) && (
                <Marker position={[data.anchors.centre.lat, data.anchors.centre.lng]} alt="Centre" title="Centre">
                  <Popup>
                    <strong>Centre</strong>{centreName ? `: ${centreName}` : ""}
                  </Popup>
                </Marker>
              )}
              {Number.isFinite(data.anchors?.workplace?.lat) && Number.isFinite(data.anchors?.workplace?.lng) && (
                <Marker position={[data.anchors.workplace.lat, data.anchors.workplace.lng]} alt="Workplace" title="Workplace">
                  <Popup>
                    <strong>Workplace</strong>
                  </Popup>
                </Marker>
              )}
              {availableLegsWithGeometry.map((leg, idx) => {
                const routeKey = idx === 0 ? "home-centre" : "centre-workplace";
                const color = idx === 0 ? "#2563eb" : "#07805f";
                const arrow = routeArrow(leg.geometry);
                return <React.Fragment key={`${currentSampleKind}-${idx}`}>
                  <Polyline
                    positions={leg.geometry.map((c) => [c.lat, c.lng])}
                    pathOptions={{ color, ...routeVisibility(routeKey) }}
                  />
                  <Marker position={arrow.position} icon={arrow.icon} interactive={false} />
                </React.Fragment>;
              })}
              {hasDirectRoute && <>
                <Polyline
                  key="direct-route"
                  positions={directRoute.legs[0].geometry.map((c) => [c.lat, c.lng])}
                  pathOptions={{ color: "#59636e", weight: 3, dashArray: "10, 8", ...routeVisibility("direct") }}
                />
                <Marker position={routeArrow(directRoute.legs[0].geometry).position} icon={routeArrow(directRoute.legs[0].geometry).icon} interactive={false} />
              </>}
            </MapContainer>
          </div> : <div className="centre-map-unavailable" role="status">Map view is currently unavailable for this centre.</div>}

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
          {sample && <div className="commute-breakdown" id="centre-commute-summary" tabIndex={-1} aria-label="Journey breakdown">
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
                      {leg.transit_legs.map((sub, sIdx) => {
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
      profileId={profileId}
      workplaceConfigured={workplaceConfigured}
      centre={centre}
      centreName={centreName}
      loading={session.loading}
      error={session.error}
      data={session.data}
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
