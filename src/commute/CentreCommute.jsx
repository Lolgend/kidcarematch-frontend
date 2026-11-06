import React from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import CentreLocationMap from "./CentreLocationMap.jsx";
import { useCommuteSession } from "./commuteSession.js";
import { getCentreCommute as defaultGetCentreCommute, getCentreLocation as defaultGetCentreLocation } from "../api";
import MapViewportController from "./MapViewportController.jsx";

export function formatDuration(secs) {
  if (typeof secs !== "number") return "";
  const totalMins = Math.max(1, Math.round(secs / 60));
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
    (point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng)
  );
}

function isUsableRouteLeg(leg) {
  return leg?.status === "available" &&
    hasNonnegativeMetric(leg.duration_seconds) &&
    hasNonnegativeMetric(leg.distance_meters) &&
    hasUsableGeometry(leg);
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
  onModeChange,
  onRetry,
  onSignIn,
  onEditProfile,
  getCentreLocation = defaultGetCentreLocation,
}) {
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

  // Determine center coordinates for MapContainer
  const availableLegsWithGeometry = legs.filter(
    isUsableRouteLeg
  );
  const hasCentreCoordinate = Number.isFinite(data?.anchors?.centre?.lat) && Number.isFinite(data?.anchors?.centre?.lng);
  const mapCoordinates = hasCentreCoordinate ? [
    ...[data?.anchors?.home, data?.anchors?.centre, data?.anchors?.workplace]
      .filter((point) => point && Number.isFinite(point.lat) && Number.isFinite(point.lng))
      .map((point) => [point.lat, point.lng]),
    ...availableLegsWithGeometry.flatMap((leg) => leg.geometry
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
      .map((point) => [point.lat, point.lng])),
  ] : [];

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
          {hasConfiguredWorkplace && (
            <p className="commute-estimate-note" role="note">Extra travel comparison isn’t available yet.</p>
          )}
          {mode === "pt" && !sample && (
            <div className="commute-totals-unavailable" role="status">
              <span>Public transport estimate unavailable.</span>
              <button type="button" className="retry-route-btn" onClick={onRetry || undefined}>Retry route</button>
            </div>
          )}

          {/* Map display */}
          {mapCoordinates.length > 0 ? <div className="centre-map-wrapper" data-testid="centre-commute-map">
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
              {data.anchors?.home && (
                <Marker position={[data.anchors.home.lat, data.anchors.home.lng]} alt="Home" title="Home">
                  <Popup>
                    <strong>Home</strong>
                  </Popup>
                </Marker>
              )}
              {data.anchors?.centre && (
                <Marker position={[data.anchors.centre.lat, data.anchors.centre.lng]} alt="Centre" title="Centre">
                  <Popup>
                    <strong>Centre</strong>{centreName ? `: ${centreName}` : ""}
                  </Popup>
                </Marker>
              )}
              {data.anchors?.workplace && (
                <Marker position={[data.anchors.workplace.lat, data.anchors.workplace.lng]} alt="Workplace" title="Workplace">
                  <Popup>
                    <strong>Workplace</strong>
                  </Popup>
                </Marker>
              )}
              {availableLegsWithGeometry.map((leg, idx) => (
                <Polyline
                  key={`${currentSampleKind}-${idx}`}
                  positions={leg.geometry.map((c) => [c.lat, c.lng])}
                  pathOptions={
                    leg.from_anchor === "home"
                      ? { color: "#2563eb", weight: 5 }
                      : { color: "#059669", weight: 5, dashArray: "8, 8" }
                  }
                />
              ))}
            </MapContainer>
          </div> : <div className="centre-map-unavailable" role="status">Map view is currently unavailable for this centre.</div>}

          {/* Readable text breakdown */}
          {sample && <div className="commute-breakdown" id="centre-commute-summary" tabIndex={-1} aria-label="Journey breakdown">
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
                        className={`commute-leg-indicator ${isLeg1 ? "indicator-solid-blue" : "indicator-dashed-green"}`}
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
  getCentreLocation = defaultGetCentreLocation,
}) {
  const effectiveUserId = userId || currentUser?.uid || currentUser?.user_id || currentUser?.id || currentUser?.email || null;
  const session = useCommuteSession({
    centreId: currentUser && profileId ? centreId : null,
    profileId: currentUser && profileId ? profileId : null,
    locationKey: currentUser && profileId ? profileLocationKey : null,
    userId: effectiveUserId,
    loadCommute,
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
      onModeChange={session.setMode}
      onSelectSample={session.selectSample}
      onRetry={session.retry}
      onSignIn={onSignIn}
      onEditProfile={onEditProfile}
      getCentreLocation={getCentreLocation}
    />
  );
}
