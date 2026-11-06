import { useEffect, useMemo } from "react";
import { useMap } from "react-leaflet";

export default function MapViewportController({ coordinates }) {
  const map = useMap();
  const serialized = useMemo(() => JSON.stringify(coordinates || []), [coordinates]);

  useEffect(() => {
    const points = JSON.parse(serialized);
    if (!points.length) return undefined;
    let disposed = false;
    const fit = () => {
      if (disposed) return;
      map.invalidateSize({ pan: false });
      if (points.length === 1) map.setView(points[0], 15, { animate: false });
      else map.fitBounds(points, { padding: [24, 24], maxZoom: 15, animate: false });
    };
    fit();
    const container = map.getContainer();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    observer?.observe(container);
    return () => {
      disposed = true;
      observer?.disconnect();
      if (map._loaded && container.isConnected) map.stop();
    };
  }, [map, serialized]);

  return null;
}
