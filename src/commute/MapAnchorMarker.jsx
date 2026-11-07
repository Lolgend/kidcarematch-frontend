import React, { useMemo } from "react";
import { divIcon } from "leaflet";
import { Marker } from "react-leaflet";

const ANCHORS = {
  home: {
    label: "Home",
    shape: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/>',
  },
  work: {
    label: "Work",
    shape: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18m-11 0v2h4v-2"/>',
  },
  centre: {
    label: "Centre",
    shape: '<path d="M4 21V4a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v17M2 21h20"/><path d="M8 7h2m4 0h2M8 11h2m4 0h2M8 15h2m4 0h2m-5 6v-4h2v4"/>',
  },
};

function anchorIcon(kind) {
  const { label, shape } = ANCHORS[kind];
  return divIcon({
    className: "map-anchor-div-icon",
    html: `<span class="map-anchor-marker map-anchor-${kind}" role="img" aria-label="${label}"><span class="map-anchor-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${shape}</svg></span><span class="map-anchor-label" aria-hidden="true">${label}</span></span>`,
    iconSize: [90, 42],
    iconAnchor: [14, 38],
  });
}

export default function MapAnchorMarker({ kind, position, popup = null }) {
  const icon = useMemo(() => anchorIcon(kind), [kind]);
  const label = ANCHORS[kind].label;
  return (
    <Marker position={position} icon={icon} alt={label} title={label}>
      {popup}
    </Marker>
  );
}
