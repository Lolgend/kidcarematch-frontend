import { useEffect, useMemo } from "react";
import { useMap } from "react-leaflet";

export default function MapViewportController({ coordinates }) {
  const map = useMap();
  const serialized = useMemo(() => JSON.stringify(coordinates || []), [coordinates]);

  useEffect(() => {
    const points = JSON.parse(serialized);
    if (!points.length) return undefined;
    const fit = () => {
      map.invalidateSize({ pan: false });
      if (points.length === 1) map.setView(points[0], 15);
      else map.fitBounds(points, { padding: [24, 24], maxZoom: 15 });
    };
    fit();
    const container = map.getContainer();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    return () => observer.disconnect();
  }, [map, serialized]);

  return null;
}
