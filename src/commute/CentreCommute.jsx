import React from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import CentreLocationMap from "./CentreLocationMap.jsx";
import { useCommuteSession } from "./commuteSession.js";
import { getCentreCommute as defaultGetCentreCommute, getCentreLocation as defaultGetCentreLocation } from "../api";

export function formatDuration(secs) {
  if (typeof secs !== "number") return "";
  const mins = Math.max(1, Math.round(secs / 60));
  return `${mins} min${mins === 1 ? "" : "s"}`;
}

export function formatDistance(meters) {
  if (typeof meters !== "number") return "";
  const km = (meters / 1000).toFixed(1);
  return `${km} km`;
}

export function formatSampleDate(isoString) {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString("en-SG", {
      timeZone: "Asia/Singapore",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export function CentreCommuteView({
  currentUser,
  profileId,
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
  const sample = data?.samples?.[0] || null;
  const legs = sample?.legs || [];

  // Check for unresolvable postal code messages
  const unresolvableLeg = legs.find(
    (l) => l.status === "unavailable" && l.message && l.message.toLowerCase().includes("could not be resolved")
  );
  const homeUnresolvable =
    data?.anchors?.home === null ||
    (unresolvableLeg && unresolvableLeg.message.toLowerCase().includes("home"));
  const workplaceUnresolvable =
    data?.anchors?.workplace === null ||
    (unresolvableLeg && unresolvableLeg.message.toLowerCase().includes("workplace"));

  const unresolvableMessage = homeUnresolvable
    ? "Home postal code could not be resolved on OneMap."
    : workplaceUnresolvable
    ? "Workplace postal code could not be resolved on OneMap."
    : null;

  // Determine center coordinates for MapContainer
  const centreCoord = data?.anchors?.centre || null;
  const homeCoord = data?.anchors?.home || null;
  const centerLat = centreCoord?.lat || homeCoord?.lat || 1.3521;
  const centerLng = centreCoord?.lng || homeCoord?.lng || 103.8198;

  const availableLegsWithGeometry = legs.filter(
    (l) => l.status === "available" && Array.isArray(l.geometry) && l.geometry.length > 0
  );

  return (
    <section className="centre-map-section" aria-label="Centre commute comparison">
      {/* Travel mode selector */}
      <div className="commute-mode-selector" role="radiogroup" aria-label="Travel mode">
        <button
          type="button"
          className={`commute-mode-btn ${mode === "drive" ? "active" : ""}`}
          onClick={() => onModeChange && onModeChange("drive")}
        >
          Driving
        </button>
        <button
          type="button"
          className={`commute-mode-btn ${mode === "pt" ? "active" : ""}`}
          onClick={() => onModeChange && onModeChange("pt")}
        >
          Public transport
        </button>
        <button
          type="button"
          className={`commute-mode-btn ${mode === "walk" ? "active" : ""}`}
          onClick={() => onModeChange && onModeChange("walk")}
        >
          Walk
        </button>
        <button
          type="button"
          className={`commute-mode-btn ${mode === "cycle" ? "active" : ""}`}
          onClick={() => onModeChange && onModeChange("cycle")}
        >
          Cycle
        </button>
      </div>

      {loading && (
        <div className="centre-map-loading" role="status">
          Loading commute route…
        </div>
      )}

      {error && !loading && (
        <div className="centre-map-unavailable" role="status">
          <p>Could not load commute route. ({error.message || "Network error"})</p>
          <button type="button" className="retry-route-btn" onClick={onRetry || undefined}>
            Retry route
          </button>
        </div>
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

          {sample?.kind === "weekday" && (
            <div className="commute-sample-label" role="note" aria-label="Sample conditions">
              <span className="commute-sample-badge">Representative Wednesday 08:00 SGT</span>
              {sample.sampled_at && (
                <span className="commute-sample-date"> ({formatSampleDate(sample.sampled_at)})</span>
              )}
            </div>
          )}

          {/* Map display */}
          <div className="centre-map-wrapper" data-testid="centre-commute-map">
            <MapContainer
              center={[centerLat, centerLng]}
              zoom={13}
              scrollWheelZoom={false}
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a> &copy; Singapore Land Authority'
                url="https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png"
                maxZoom={19}
                minZoom={11}
              />
              {data.anchors?.home && (
                <Marker position={[data.anchors.home.lat, data.anchors.home.lng]}>
                  <Popup>
                    <strong>Home</strong>
                  </Popup>
                </Marker>
              )}
              {data.anchors?.centre && (
                <Marker position={[data.anchors.centre.lat, data.anchors.centre.lng]}>
                  <Popup>
                    <strong>{centreName || "Preschool Centre"}</strong>
                  </Popup>
                </Marker>
              )}
              {data.anchors?.workplace && (
                <Marker position={[data.anchors.workplace.lat, data.anchors.workplace.lng]}>
                  <Popup>
                    <strong>Workplace</strong>
                  </Popup>
                </Marker>
              )}
              {availableLegsWithGeometry.map((leg, idx) => (
                <Polyline
                  key={idx}
                  positions={leg.geometry.map((c) => [c.lat, c.lng])}
                  pathOptions={
                    leg.from_anchor === "home"
                      ? { color: "#2563eb", weight: 5 }
                      : { color: "#059669", weight: 5, dashArray: "8, 8" }
                  }
                />
              ))}
            </MapContainer>
          </div>

          {/* Readable text breakdown */}
          <div className="commute-breakdown" aria-label="Journey breakdown">
            {legs.map((leg, idx) => {
              const isLeg1 = leg.from_anchor === "home";
              const legTitle = isLeg1 ? "Leg 1: Home → Centre" : "Leg 2: Centre → Workplace";
              const isAvailable = leg.status === "available" && leg.duration_seconds !== null;

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
                        const subTitle = isWalk
                          ? "Walk"
                          : sub.route
                          ? `Transit (${sub.route})`
                          : "Transit";
                        return (
                          <div key={sIdx} className="commute-transit-subleg">
                            <span className="commute-subleg-type">{subTitle}: </span>
                            <span className="commute-subleg-metrics">
                              {formatDuration(sub.duration_seconds)} ({formatDistance(sub.distance_meters)})
                            </span>
                            {sub.instruction && (
                              <span className="commute-subleg-instruction"> ({sub.instruction})</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Totals */}
            {sample?.totals ? (
              <div className="commute-totals">
                <div className="commute-totals-value">
                  <strong>
                    Total travel: {formatDuration(sample.totals.duration_seconds)} ({formatDistance(sample.totals.distance_meters)})
                  </strong>
                </div>
                <small className="commute-totals-note">Excludes time spent at the centre.</small>
              </div>
            ) : (
              <div className="commute-totals-unavailable">
                <span>Complete journey totals unavailable due to incomplete route leg.</span>
                <button type="button" className="retry-route-btn" onClick={onRetry || undefined}>
                  Retry route
                </button>
              </div>
            )}
          </div>
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
  onSignIn = null,
  onEditProfile = null,
  loadCommute = defaultGetCentreCommute,
  getCentreLocation = defaultGetCentreLocation,
}) {
  const session = useCommuteSession({
    centreId: currentUser && profileId ? centreId : null,
    profileId: currentUser && profileId ? profileId : null,
    loadCommute,
  });

  return (
    <CentreCommuteView
      currentUser={currentUser}
      profileId={profileId}
      centre={centre}
      centreName={centreName}
      loading={session.loading}
      error={session.error}
      data={session.data}
      mode={session.mode}
      onModeChange={session.setMode}
      onRetry={session.retry}
      onSignIn={onSignIn}
      onEditProfile={onEditProfile}
      getCentreLocation={getCentreLocation}
    />
  );
}
