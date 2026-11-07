import React from "react";
import { MapContainer, TileLayer, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useCentreLocation } from "./centreLocation.js";
import MapViewportController from "./MapViewportController.jsx";
import MapAnchorMarker from "./MapAnchorMarker.jsx";

export function CentreLocationMapView({
  loading,
  location,
  centreName,
  currentUser,
  onSignIn,
  summaryTarget = false,
}) {
  const coordinate = location?.coordinate;
  const isAvailable =
    !loading &&
    location?.status === "available" &&
    coordinate &&
    typeof coordinate.lat === "number" &&
    typeof coordinate.lng === "number";

  return (
    <section className="centre-map-section" aria-label="Centre location map">
      {loading && (
        <div className="centre-map-loading" role="status">
          Loading centre location map…
        </div>
      )}

      {!loading && !isAvailable && (
        <div className="centre-map-unavailable" role="status">
          <p>Map view is currently unavailable for this centre.</p>
        </div>
      )}

      {isAvailable && (
        <div className="centre-map-wrapper" data-testid="centre-location-map">
          <MapContainer
            center={[coordinate.lat, coordinate.lng]}
            zoom={15}
            zoomAnimation={false}
            scrollWheelZoom={false}
            style={{ height: "100%", width: "100%" }}
          >
            <MapViewportController coordinates={[[coordinate.lat, coordinate.lng]]} />
            <TileLayer
              attribution='&copy; <a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a> &copy; Singapore Land Authority'
              url="https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png"
              maxZoom={19}
              minZoom={11}
            />
            <MapAnchorMarker kind="centre" position={[coordinate.lat, coordinate.lng]} popup={<Popup><strong>{centreName || "Preschool Centre"}</strong></Popup>} />
          </MapContainer>
        </div>
      )}

      {!currentUser && (
        <div
          className="centre-commute-guest-prompt"
          data-testid="commute-guest-prompt"
          id={summaryTarget ? "centre-commute-summary" : undefined}
          tabIndex={summaryTarget ? -1 : undefined}
          aria-label={summaryTarget ? "Commute details" : undefined}
        >
          <p>Sign in to see personalised commute routes and travel times.</p>
          {onSignIn && (
            <button
              type="button"
              className="guest-signin-btn"
              onClick={onSignIn}
            >
              Sign in
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export default function CentreLocationMap({
  centre,
  centreId = centre?.id,
  centreName = centre?.name,
  currentUser = null,
  onSignIn = null,
  getCentreLocation,
  summaryTarget = false,
}) {
  const { loading, location } = useCentreLocation(centreId, {
    getCentreLocation,
  });

  return (
    <CentreLocationMapView
      loading={loading}
      location={location}
      centreName={centreName}
      currentUser={currentUser}
      onSignIn={onSignIn}
      summaryTarget={summaryTarget}
    />
  );
}
