import { useEffect, useState } from "react";
import { getCentreLocation as defaultGetCentreLocation } from "../api";

export function createCentreLocationLoader({
  getCentreLocation = defaultGetCentreLocation,
  onStateChange = () => {},
}) {
  let activeRequestId = 0;
  let activeController = null;

  return {
    async load(centreId) {
      if (activeController) {
        activeController.abort();
        activeController = null;
      }

      if (centreId === null || centreId === undefined || centreId === "") {
        onStateChange({ loading: false, location: null, error: null });
        return;
      }

      const requestId = ++activeRequestId;
      const controller = new AbortController();
      activeController = controller;

      onStateChange({ loading: true, location: null, error: null });

      try {
        const data = await getCentreLocation(centreId, {
          signal: controller.signal,
        });

        if (requestId === activeRequestId) {
          onStateChange({ loading: false, location: data, error: null });
        }
      } catch (err) {
        if (requestId === activeRequestId && err?.name !== "AbortError") {
          onStateChange({ loading: false, location: null, error: err });
        }
      }
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

export function useCentreLocation(centreId, options = {}) {
  const [state, setState] = useState({
    loading: Boolean(centreId),
    location: null,
    error: null,
  });

  useEffect(() => {
    const loader = createCentreLocationLoader({
      getCentreLocation: options.getCentreLocation || defaultGetCentreLocation,
      onStateChange: setState,
    });

    loader.load(centreId);

    return () => {
      loader.destroy();
    };
  }, [centreId, options.getCentreLocation]);

  return state;
}
