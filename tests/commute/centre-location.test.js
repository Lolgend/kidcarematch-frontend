import { describe, expect, it, vi } from "vitest";
import { createCentreLocationLoader } from "../../src/commute/centreLocation.js";

describe("centre location loader", () => {
  it("emits loading state then available location when API resolves successfully", async () => {
    const states = [];
    const locationData = {
      centre_id: 101,
      coordinate: { lat: 1.3691, lng: 103.8512 },
      status: "available",
    };
    const getCentreLocation = vi.fn().mockResolvedValue(locationData);

    const loader = createCentreLocationLoader({
      getCentreLocation,
      onStateChange: (state) => states.push(state),
    });

    await loader.load(101);

    expect(states).toEqual([
      { loading: true, location: null, error: null },
      { loading: false, location: locationData, error: null },
    ]);
    expect(getCentreLocation).toHaveBeenCalledWith(101, expect.objectContaining({ signal: expect.any(Object) }));
  });

  it("emits unavailable status when API returns unavailable status or null coordinate", async () => {
    const states = [];
    const unavailableData = {
      centre_id: 102,
      coordinate: null,
      status: "unavailable",
    };
    const getCentreLocation = vi.fn().mockResolvedValue(unavailableData);

    const loader = createCentreLocationLoader({
      getCentreLocation,
      onStateChange: (state) => states.push(state),
    });

    await loader.load(102);

    expect(states).toEqual([
      { loading: true, location: null, error: null },
      { loading: false, location: unavailableData, error: null },
    ]);
  });

  it("emits error when API rejects with failure", async () => {
    const states = [];
    const error = new Error("Network error");
    const getCentreLocation = vi.fn().mockRejectedValue(error);

    const loader = createCentreLocationLoader({
      getCentreLocation,
      onStateChange: (state) => states.push(state),
    });

    await loader.load(103);

    expect(states).toEqual([
      { loading: true, location: null, error: null },
      { loading: false, location: null, error },
    ]);
  });

  it("ignores stale responses when centre changes before earlier request resolves", async () => {
    const states = [];
    let resolveFirst;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    const secondData = {
      centre_id: 200,
      coordinate: { lat: 1.38, lng: 103.86 },
      status: "available",
    };

    const getCentreLocation = vi.fn().mockImplementation((id) => {
      if (id === 100) return firstPromise;
      return Promise.resolve(secondData);
    });

    const loader = createCentreLocationLoader({
      getCentreLocation,
      onStateChange: (state) => states.push(state),
    });

    // Start first request
    const load1 = loader.load(100);
    // Quickly switch to second centre
    const load2 = loader.load(200);

    await load2;
    // Now resolve first request after second has already completed
    resolveFirst({
      centre_id: 100,
      coordinate: { lat: 1.11, lng: 103.11 },
      status: "available",
    });
    await load1;

    // The first response must NOT overwrite the second response
    expect(states[states.length - 1]).toEqual({
      loading: false,
      location: secondData,
      error: null,
    });
  });

  it("aborts in-flight request when load is called again or destroyed", () => {
    let capturedSignal1;
    let capturedSignal2;
    const getCentreLocation = vi.fn().mockImplementation((id, options) => {
      if (id === 1) capturedSignal1 = options.signal;
      if (id === 2) capturedSignal2 = options.signal;
      return new Promise(() => {});
    });

    const loader = createCentreLocationLoader({
      getCentreLocation,
      onStateChange: () => {},
    });

    loader.load(1);
    expect(capturedSignal1.aborted).toBe(false);

    loader.load(2);
    expect(capturedSignal1.aborted).toBe(true);
    expect(capturedSignal2.aborted).toBe(false);

    loader.destroy();
    expect(capturedSignal2.aborted).toBe(true);
  });

  it("handles null or empty centreId without calling API", async () => {
    const states = [];
    const getCentreLocation = vi.fn();

    const loader = createCentreLocationLoader({
      getCentreLocation,
      onStateChange: (state) => states.push(state),
    });

    await loader.load(null);

    expect(getCentreLocation).not.toHaveBeenCalled();
    expect(states).toEqual([{ loading: false, location: null, error: null }]);
  });
});
