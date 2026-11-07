import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCommuteSession,
  getSessionMode,
  setSessionMode,
  getSessionSamplePair,
  setSessionSamplePair,
  resetSessionMode,
  resetRetainedSessionMode,
  getProfileCommuteContextKey,
} from "../../src/commute/commuteSession.js";

describe("createCommuteSession controller", () => {
  let loadCommute;
  let states;
  let session;

  const mockCommute = (centreId = 101, mode = "drive") => ({
    centre_id: centreId,
    profile_id: "prof-1",
    mode,
    sample_pair: null,
    anchors: {
      home: { lat: 1.3, lng: 103.8 },
      centre: { lat: 1.35, lng: 103.85 },
    },
    samples: [
      {
        kind: "single",
        legs: [
          {
            from_anchor: "home",
            to_anchor: "centre",
            status: "available",
            source: "onemap",
            duration_seconds: 600,
            distance_meters: 5000,
            geometry: [
              { lat: 1.3, lng: 103.8 },
              { lat: 1.35, lng: 103.85 },
            ],
          },
        ],
        totals: { duration_seconds: 600, distance_meters: 5000 },
      },
    ],
  });

  const selectedCycleResponse = (centreId, index, {
    cycleId = "timer-cycle-1",
    primary = "2026-11-11T08:00:00+08:00",
    unavailable = false,
  } = {}) => {
    const allowed = [0, 1, 2].map((sampleIndex) => ({
      sample_index: sampleIndex,
      conditions_id: `${cycleId}-${sampleIndex}`,
      departure_at: new Date(Date.parse(primary) + sampleIndex * 86400000).toISOString(),
    }));
    return {
      centre_id: centreId, profile_id: "prof-1", mode: "pt", sample_pair: null,
      sampling_contract: "weekday_0800_wed_thu_fri_v1",
      evaluation: { evaluation_id: `${cycleId}-${centreId}-${index}`, evaluated_at: "2026-11-10T08:00:00+08:00", profile_revision: "timer-profile-r1", anchor_revision: `timer-anchor-${centreId}` },
      sampling: { policy: "weekday_0800_wed_thu_fri_v1", cycle_id: cycleId, cycle_expires_at: primary, selected_index: index, allowed_samples: allowed },
      samples: [{ kind: "weekday", sampled_at: allowed[index].departure_at, via_status: unavailable ? "unavailable" : "available", reasons: unavailable ? [{ code: "no_itinerary", failure_class: "sample_dependent", retryable: false }] : [], legs: [], conditions: { conditions_id: allowed[index].conditions_id, timing_basis: "scheduled_departure", initial_departure_at: allowed[index].departure_at, provider_options_id: "timer-options-r1" }, totals: unavailable ? null : { duration_seconds: 1200, distance_meters: 4000 } }],
    };
  };

  it("binds commute context to a saved revision or a stable profile snapshot", () => {
    const first = { home: "123456", work: "234567", level: "n1", revision: "r1" };
    expect(getProfileCommuteContextKey(first, "profile-1")).toBe(getProfileCommuteContextKey({ ...first }, "profile-1"));
    expect(getProfileCommuteContextKey(first, "profile-1")).not.toBe(getProfileCommuteContextKey({ ...first, revision: "r2" }, "profile-1"));
    const noRevision = { home: "123456", work: null, level: "n1" };
    expect(getProfileCommuteContextKey(noRevision, "profile-1")).toBe(getProfileCommuteContextKey({ level: "n1", work: null, home: "123456" }, "profile-1"));
    expect(getProfileCommuteContextKey(noRevision, "profile-1")).not.toBe(getProfileCommuteContextKey({ ...noRevision, level: "k1" }, "profile-1"));
  });

  beforeEach(() => {
    session?.destroy();
    resetRetainedSessionMode();
    states = [];
    loadCommute = vi.fn().mockImplementation(async (centreId, { mode }) => {
      return mockCommute(centreId, mode);
    });
  });

  afterEach(() => {
    session?.destroy();
    vi.useRealTimers();
  });

  it("initializes with drive mode and loads commute when open is called", async () => {
    session = createCommuteSession({
      loadCommute,
      onState: (s) => states.push(s),
    });

    expect(session.getMode()).toBe("drive");

    await session.open({ centreId: 101, profileId: "prof-1" });

    expect(loadCommute).toHaveBeenCalledWith(
      101,
      { profileId: "prof-1", mode: "drive", samplePair: null },
      expect.objectContaining({ signal: expect.any(Object) })
    );

    const latest = states[states.length - 1];
    expect(latest.loading).toBe(false);
    expect(latest.data.centre_id).toBe(101);
    expect(latest.error).toBe(null);
  });

  it("loads one shared commute set for the active matches in each selected mode", async () => {
    session = createCommuteSession({
      loadCommute,
      comparisonCentreIds: [101, 202],
      onState: (s) => states.push(s),
    });
    await session.open({ centreId: 101, profileId: "prof-1", locationKey: "home-r1" });
    expect(loadCommute.mock.calls.map(([id, options]) => [String(id), options.mode])).toEqual([
      ["101", "drive"], ["202", "drive"],
    ]);
    expect(Object.keys(session.getState().setData).sort()).toEqual(["101", "202"]);

    loadCommute.mockClear();
    await session.setMode("walk");
    expect(loadCommute.mock.calls.map(([id, options]) => [String(id), options.mode])).toEqual([
      ["101", "walk"], ["202", "walk"],
    ]);
    expect(Object.keys(session.getState().setData).sort()).toEqual(["101", "202"]);
  });

  it("retains usable sibling estimates when one centre fails and clears the entire private set on endpoint authorization failure", async () => {
    const loadSet = vi.fn(async (centreId) => {
      if (String(centreId) === "202") throw Object.assign(new Error("503: unavailable"), { status: 503 });
      return mockCommute(centreId);
    });
    session = createCommuteSession({ loadCommute: loadSet, comparisonCentreIds: [101, 202], onState: (s) => states.push(s) });
    await session.open({ centreId: 101, profileId: "prof-1" });
    expect(session.getState().setData["101"]).toBeTruthy();
    expect(session.getState().setData["202"]).toBeUndefined();
    expect(session.getState().setErrors["202"].status).toBe(503);

    loadSet.mockImplementation(async (centreId) => {
      if (String(centreId) === "202") throw Object.assign(new Error("403: denied"), { status: 403 });
      return mockCommute(centreId);
    });
    await session.retry();
    expect(session.getState().setData).toEqual({});
    expect(session.getState().error.status).toBe(403);
  });

  it("keeps successful sibling estimates when the primary centre request fails", async () => {
    const loadSet = vi.fn(async (centreId) => {
      if (String(centreId) === "101") throw Object.assign(new Error("503: primary unavailable"), { status: 503 });
      return mockCommute(centreId);
    });
    session = createCommuteSession({ loadCommute: loadSet, comparisonCentreIds: [101, 202], onState: (s) => states.push(s) });
    await session.open({ centreId: 101, profileId: "prof-1" });
    expect(session.getState().data).toBeNull();
    expect(session.getState().setData["202"].centre_id).toBe(202);
    expect(session.getState().setErrors["101"].status).toBe(503);
  });

  it("retains route facts but marks the active multi-centre set incomparable when conditions differ", async () => {
    const loadSet = vi.fn(async (centreId) => {
      const response = mockCommute(centreId);
      return {
        ...response,
        evaluation: { profile_revision: "profile-r1" },
        samples: [{ ...response.samples[0], conditions: {
          conditions_id: String(centreId) === "101" ? "conditions-a" : "conditions-b",
          provider_options_id: "options-v1", timing_basis: "provider_default", initial_departure_at: null,
        } }],
      };
    });
    session = createCommuteSession({ loadCommute: loadSet, comparisonCentreIds: [101, 202], onState: (s) => states.push(s) });
    await session.open({ centreId: 101, profileId: "prof-1" });
    expect(Object.keys(session.getState().setData).sort()).toEqual(["101", "202"]);
    expect(session.getState().comparisonCompatible).toBe(false);
  });

  it("discovers the direct-baseline contract before opting in, without requiring sampling support", async () => {
    const getCapabilities = vi.fn().mockResolvedValue({
      direct_baseline_contract: "direct_baseline_v1",
      sampling_contract: null,
    });
    loadCommute = vi.fn().mockResolvedValue({
      ...mockCommute(),
      comparison_contract: "direct_baseline_v1",
    });
    session = createCommuteSession({
      loadCommute,
      getCapabilities,
      directBaselineEnabled: true,
      onState: (state) => states.push(state),
    });

    await session.open({ centreId: 101, profileId: "prof-1" });

    expect(getCapabilities).toHaveBeenCalledTimes(1);
    expect(loadCommute).toHaveBeenCalledWith(
      101,
      { profileId: "prof-1", mode: "drive", samplePair: null, includeDirectBaseline: true },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(states.at(-1).directBaselineStatus).toBe("supported");
  });

  it("keeps legacy route requests when direct-baseline release is off", async () => {
    const getCapabilities = vi.fn();
    session = createCommuteSession({ loadCommute, getCapabilities, directBaselineEnabled: false });

    await session.open({ centreId: 101, profileId: "prof-1" });

    expect(getCapabilities).not.toHaveBeenCalled();
    expect(loadCommute).toHaveBeenCalledWith(
      101,
      { profileId: "prof-1", mode: "drive", samplePair: null },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("treats a missing direct marker as unsupported while retaining the legacy route", async () => {
    const getCapabilities = vi.fn().mockResolvedValue({
      direct_baseline_contract: null,
      sampling_contract: "weekday_0800_wed_thu_fri_v1",
    });
    session = createCommuteSession({
      loadCommute,
      getCapabilities,
      directBaselineEnabled: true,
      onState: (state) => states.push(state),
    });

    await session.open({ centreId: 101, profileId: "prof-1" });

    expect(loadCommute).toHaveBeenCalledWith(
      101,
      { profileId: "prof-1", mode: "drive", samplePair: null },
      expect.any(Object)
    );
    expect(states.at(-1).data.centre_id).toBe(101);
    expect(states.at(-1).directBaselineStatus).toBe("unsupported");
  });

  it("keeps direct-baseline support independent from an unknown sampling marker", async () => {
    loadCommute = vi.fn().mockResolvedValue({
      ...mockCommute(), comparison_contract: "direct_baseline_v1",
    });
    const getCapabilities = vi.fn().mockResolvedValue({
      direct_baseline_contract: "direct_baseline_v1",
      sampling_contract: "future-policy-v2",
    });
    session = createCommuteSession({
      loadCommute,
      getCapabilities,
      directBaselineEnabled: true,
      onState: (state) => states.push(state),
    });

    await session.open({ centreId: 101, profileId: "prof-1" });

    expect(loadCommute).toHaveBeenCalledWith(
      101,
      { profileId: "prof-1", mode: "drive", samplePair: null, includeDirectBaseline: true },
      expect.any(Object)
    );
    expect(states.at(-1).directBaselineStatus).toBe("supported");
  });

  it("fails closed when required independent capability fields are missing or malformed", async () => {
    for (const discovery of [
      { direct_baseline_contract: "direct_baseline_v1" },
      { direct_baseline_contract: "direct_baseline_v1", sampling_contract: {} },
    ]) {
      const getCapabilities = vi.fn().mockResolvedValue(discovery);
      loadCommute = vi.fn().mockResolvedValue(mockCommute());
      session = createCommuteSession({
        loadCommute, getCapabilities, directBaselineEnabled: true,
        onState: (state) => states.push(state),
      });

      await session.open({ centreId: 101, profileId: "prof-1" });

      expect(loadCommute).toHaveBeenCalledWith(
        101,
        { profileId: "prof-1", mode: "drive", samplePair: null },
        expect.any(Object)
      );
      expect(states.at(-1).directBaselineStatus).toBe("unsupported");
      session.destroy();
    }
  });

  it("keeps capability discovery failures recoverable and loads the legacy route", async () => {
    const getCapabilities = vi.fn().mockRejectedValue(new Error("503: service unavailable"));
    session = createCommuteSession({
      loadCommute,
      getCapabilities,
      directBaselineEnabled: true,
      onState: (state) => states.push(state),
    });

    await session.open({ centreId: 101, profileId: "prof-1" });

    expect(loadCommute).toHaveBeenCalledWith(
      101,
      { profileId: "prof-1", mode: "drive", samplePair: null },
      expect.any(Object)
    );
    expect(states.at(-1).data.centre_id).toBe(101);
    expect(states.at(-1).directBaselineStatus).toBe("error");
    expect(states.at(-1).directBaselineError.message).toContain("503");
  });

  it("retains selected mode when opening a different centre", async () => {
    session = createCommuteSession({
      loadCommute,
      onState: (s) => states.push(s),
    });

    await session.open({ centreId: 101, profileId: "prof-1" });
    await session.setMode("pt");

    expect(session.getMode()).toBe("pt");
    expect(loadCommute).toHaveBeenLastCalledWith(
      101,
      { profileId: "prof-1", mode: "pt", samplePair: null },
      expect.any(Object)
    );

    await session.open({ centreId: 202, profileId: "prof-1" });

    // Mode is retained as "pt" for the next centre!
    expect(loadCommute).toHaveBeenLastCalledWith(
      202,
      { profileId: "prof-1", mode: "pt", samplePair: null },
      expect.any(Object)
    );
  });

  it("suppresses stale responses when opening centres rapidly", async () => {
    let resolveFirst;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    loadCommute = vi.fn().mockImplementation((centreId) => {
      if (centreId === 101) return firstPromise;
      return Promise.resolve(mockCommute(centreId));
    });

    session = createCommuteSession({
      loadCommute,
      onState: (s) => states.push(s),
    });

    // Start request for 101 (slow)
    const p1 = session.open({ centreId: 101, profileId: "prof-1" });

    // Quickly switch to 202 (fast)
    await session.open({ centreId: 202, profileId: "prof-1" });

    expect(states[states.length - 1].data.centre_id).toBe(202);

    // Now first request finishes
    resolveFirst(mockCommute(101));
    await p1;

    // Latest state must still be 202, NOT 101!
    expect(states[states.length - 1].data.centre_id).toBe(202);
  });

  it("suppresses stale responses when mode changes while request is pending", async () => {
    let resolveDrive;
    const drivePromise = new Promise((resolve) => {
      resolveDrive = resolve;
    });

    loadCommute = vi.fn().mockImplementation((centreId, { mode }) => {
      if (mode === "drive") return drivePromise;
      return Promise.resolve(mockCommute(centreId, "walk"));
    });

    session = createCommuteSession({
      loadCommute,
      onState: (s) => states.push(s),
    });

    const pDrive = session.open({ centreId: 101, profileId: "prof-1" });
    const pWalk = session.setMode("walk");

    expect(states.at(-1).loading).toBe(true);
    expect(states.at(-1).data).toBe(null);
    await pWalk;
    expect(states[states.length - 1].data.mode).toBe("walk");

    resolveDrive(mockCommute(101, "drive"));
    await pDrive;

    expect(states[states.length - 1].data.mode).toBe("walk");
  });

  it("clears route data and reloads when saved profile locations change", async () => {
    let resolveUpdated;
    loadCommute = vi.fn()
      .mockResolvedValueOnce(mockCommute(101))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveUpdated = resolve; }));
    session = createCommuteSession({ loadCommute, onState: (s) => states.push(s) });
    await session.open({ centreId: 101, profileId: "prof-1", locationKey: "654321:" });
    const changed = session.open({ centreId: 101, profileId: "prof-1", locationKey: "123456:" });
    expect(states.at(-1).data).toBe(null);
    expect(states.at(-1).loading).toBe(true);
    resolveUpdated(mockCommute(101));
    await changed;
    expect(states.at(-1).data.centre_id).toBe(101);
    expect(session.getMode()).toBe("drive");
  });

  it("handles request failure and allows retry", async () => {
    loadCommute = vi
      .fn()
      .mockRejectedValueOnce(new Error("500: Provider unavailable"))
      .mockResolvedValueOnce(mockCommute(101));

    session = createCommuteSession({
      loadCommute,
      onState: (s) => states.push(s),
    });

    await session.open({ centreId: 101, profileId: "prof-1" });

    expect(states[states.length - 1].loading).toBe(false);
    expect(states[states.length - 1].error.message).toContain("500: Provider unavailable");
    expect(states[states.length - 1].data).toBe(null);

    // Retry
    await session.retry();

    expect(states[states.length - 1].loading).toBe(false);
    expect(states[states.length - 1].error).toBe(null);
    expect(states[states.length - 1].data.centre_id).toBe(101);
  });

  it("clears personal state on reset", async () => {
    session = createCommuteSession({
      loadCommute,
      onState: (s) => states.push(s),
    });

    await session.open({ centreId: 101, profileId: "prof-1" });
    expect(states[states.length - 1].data).not.toBe(null);

    session.reset();

    const latest = states[states.length - 1];
    expect(latest.loading).toBe(false);
    expect(latest.data).toBe(null);
    expect(latest.error).toBe(null);
    expect(latest.centreId).toBe(null);
    expect(latest.profileId).toBe(null);
    expect(latest.mode).toBe("drive");
    expect(session.getMode()).toBe("drive");
  });

  it("supports switching to walking and cycling modes with single estimates", async () => {
    session = createCommuteSession({
      loadCommute,
      onState: (s) => states.push(s),
    });

    await session.open({ centreId: 101, profileId: "prof-1" });

    // Switch to walking
    await session.setMode("walk");
    expect(session.getMode()).toBe("walk");
    expect(loadCommute).toHaveBeenLastCalledWith(
      101,
      { profileId: "prof-1", mode: "walk", samplePair: null },
      expect.any(Object)
    );
    expect(states[states.length - 1].data.mode).toBe("walk");
    expect(states[states.length - 1].data.samples[0].kind).toBe("single");

    // Switch to cycling
    await session.setMode("cycle");
    expect(session.getMode()).toBe("cycle");
    expect(loadCommute).toHaveBeenLastCalledWith(
      101,
      { profileId: "prof-1", mode: "cycle", samplePair: null },
      expect.any(Object)
    );
    expect(states[states.length - 1].data.mode).toBe("cycle");
    expect(states[states.length - 1].data.samples[0].kind).toBe("single");
  });

  it("retains walking and cycling modes across different centres in the same session", async () => {
    session = createCommuteSession({
      loadCommute,
      onState: (s) => states.push(s),
    });

    await session.open({ centreId: 101, profileId: "prof-1" });
    await session.setMode("walk");

    // Open next centre retains walk
    await session.open({ centreId: 202, profileId: "prof-1" });
    expect(session.getMode()).toBe("walk");
    expect(loadCommute).toHaveBeenLastCalledWith(
      202,
      { profileId: "prof-1", mode: "walk", samplePair: null },
      expect.any(Object)
    );

    // Switch to cycle on 202
    await session.setMode("cycle");
    expect(session.getMode()).toBe("cycle");

    // Open third centre retains cycle
    await session.open({ centreId: 303, profileId: "prof-1" });
    expect(session.getMode()).toBe("cycle");
    expect(loadCommute).toHaveBeenLastCalledWith(
      303,
      { profileId: "prof-1", mode: "cycle", samplePair: null },
      expect.any(Object)
    );
  });

  it("suppresses stale responses when rapidly switching between driving, walking, and cycling", async () => {
    let resolveWalk;
    const walkPromise = new Promise((resolve) => {
      resolveWalk = resolve;
    });

    loadCommute = vi.fn().mockImplementation((centreId, { mode }) => {
      if (mode === "walk") return walkPromise;
      return Promise.resolve(mockCommute(centreId, mode));
    });

    session = createCommuteSession({
      loadCommute,
      onState: (s) => states.push(s),
    });

    await session.open({ centreId: 101, profileId: "prof-1" });

    // Request walk (slow)
    const pWalk = session.setMode("walk");

    // Quickly switch to cycle (fast)
    await session.setMode("cycle");
    expect(states[states.length - 1].data.mode).toBe("cycle");

    // Slow walk resolves late
    resolveWalk(mockCommute(101, "walk"));
    await pWalk;

    // Latest state must still be cycle, NOT walk
    expect(states[states.length - 1].data.mode).toBe("cycle");
  });

  it("retains mode per user session and resets to drive on account switch or signout", () => {
    resetSessionMode();
    expect(getSessionMode("user-a")).toBe("drive");

    setSessionMode("user-a", "walk");
    expect(getSessionMode("user-a")).toBe("walk");

    // Different user resets to default drive
    expect(getSessionMode("user-b")).toBe("drive");

    setSessionMode("user-b", "cycle");
    expect(getSessionMode("user-b")).toBe("cycle");

    // Sign out (null user) resets to default drive
    expect(getSessionMode(null)).toBe("drive");
  });

  it("preserves retained mode across session instances until reset", async () => {
    const session1 = createCommuteSession({
      loadCommute,
      onState: (s) => states.push(s),
    });
    await session1.open({ centreId: 101, profileId: "prof-1" });
    await session1.setMode("pt");

    const session2 = createCommuteSession({
      loadCommute,
      onState: (s) => states.push(s),
    });
    expect(session2.getMode()).toBe("pt");

    session2.reset();
    expect(session2.getMode()).toBe("drive");
  });

  it("retains samplePair returned by the server and passes it in subsequent commute requests across centres", async () => {
    const samplePair = ["2026-11-11T08:00:00+08:00", "2026-11-14T08:00:00+08:00"];
    loadCommute = vi.fn().mockImplementation(async (centreId, { mode, samplePair: sp }) => {
      return {
        ...mockCommute(centreId, mode),
        sample_pair: sp || samplePair,
      };
    });

    session = createCommuteSession({
      loadCommute,
      onState: (s) => states.push(s),
      userId: "user-1",
    });

    // First request: no samplePair initially
    await session.open({ centreId: 101, profileId: "prof-1" });
    expect(loadCommute).toHaveBeenNthCalledWith(
      1,
      101,
      { profileId: "prof-1", mode: "drive", samplePair: null },
      expect.any(Object)
    );
    expect(states[states.length - 1].samplePair).toEqual(samplePair);

    // Second request on different centre: passes retained samplePair!
    await session.open({ centreId: 202, profileId: "prof-1" });
    expect(loadCommute).toHaveBeenNthCalledWith(
      2,
      202,
      { profileId: "prof-1", mode: "drive", samplePair },
      expect.any(Object)
    );
    expect(states[states.length - 1].samplePair).toEqual(samplePair);
  });

  it("tracks selectedSample defaulting to weekday for multi-sample responses and allows switching", async () => {
    const multiSampleData = {
      centre_id: 101,
      profile_id: "prof-1",
      mode: "pt",
      sample_pair: ["2026-11-11T08:00:00+08:00", "2026-11-14T08:00:00+08:00"],
      samples: [
        { kind: "weekday", legs: [], totals: { duration_seconds: 1500, distance_meters: 5000 } },
        { kind: "weekend", legs: [], totals: { duration_seconds: 1800, distance_meters: 5000 } },
      ],
    };

    loadCommute = vi.fn().mockResolvedValue(multiSampleData);

    session = createCommuteSession({
      loadCommute,
      onState: (s) => states.push(s),
    });

    await session.open({ centreId: 101, profileId: "prof-1" });
    expect(states[states.length - 1].selectedSample).toBe("weekday");

    // Switch to weekend
    session.selectSample("weekend");
    expect(states[states.length - 1].selectedSample).toBe("weekend");

    // Switch back to weekday
    session.selectSample("weekday");
    expect(states[states.length - 1].selectedSample).toBe("weekday");
  });

  it("handles 409 sample_expired error by invalidating samplePair and retrying with fresh pair once", async () => {
    const oldPair = ["2026-11-04T08:00:00+08:00", "2026-11-07T08:00:00+08:00"];
    const freshPair = ["2026-11-11T08:00:00+08:00", "2026-11-14T08:00:00+08:00"];

    loadCommute = vi.fn().mockImplementation(async (centreId, { samplePair: sp }) => {
      if (sp === oldPair) {
        throw new Error("409: sample_expired");
      }
      return {
        ...mockCommute(centreId),
        sample_pair: freshPair,
      };
    });

    session = createCommuteSession({
      loadCommute,
      onState: (s) => states.push(s),
      initialSamplePair: oldPair,
      userId: "user-1",
    });

    await session.open({ centreId: 101, profileId: "prof-1" });

    // Should have called twice: first with oldPair (which failed with 409), second with null (retry)
    expect(loadCommute).toHaveBeenCalledTimes(2);
    expect(loadCommute).toHaveBeenNthCalledWith(
      1,
      101,
      { profileId: "prof-1", mode: "drive", samplePair: oldPair },
      expect.any(Object)
    );
    expect(loadCommute).toHaveBeenNthCalledWith(
      2,
      101,
      { profileId: "prof-1", mode: "drive", samplePair: null },
      expect.any(Object)
    );

    const latest = states[states.length - 1];
    expect(latest.error).toBe(null);
    expect(latest.samplePair).toEqual(freshPair);
  });

  it("resets retained samplePair and mode on signout or account switch", () => {
    resetSessionMode();
    setSessionMode("user-1", "pt");
    setSessionSamplePair("user-1", ["2026-11-11T08:00:00+08:00", "2026-11-14T08:00:00+08:00"]);

    expect(getSessionMode("user-1")).toBe("pt");
    expect(getSessionSamplePair("user-1")).toEqual(["2026-11-11T08:00:00+08:00", "2026-11-14T08:00:00+08:00"]);

    // Different user: mode resets to drive and sample pair resets to null
    expect(getSessionMode("user-2")).toBe("drive");
    expect(getSessionSamplePair("user-2")).toBe(null);

    // Sign out (null user)
    resetSessionMode();
    expect(getSessionMode(null)).toBe("drive");
    expect(getSessionSamplePair(null)).toBe(null);
  });

  it("advances a shared centre set together when one centre has a classified sample-dependent failure", async () => {
    const capabilities = vi.fn().mockResolvedValue({
      direct_baseline_contract: "future_direct_baseline",
      sampling_contract: "weekday_0800_wed_thu_fri_v1",
    });
    const conditions = [
      { sample_index: 0, conditions_id: "pt-wed", departure_at: "2026-11-11T08:00:00+08:00" },
      { sample_index: 1, conditions_id: "pt-thu", departure_at: "2026-11-12T08:00:00+08:00" },
      { sample_index: 2, conditions_id: "pt-fri", departure_at: "2026-11-13T08:00:00+08:00" },
    ];
    const selectedResponse = (id, index, unavailable = false) => ({
      centre_id: id,
      profile_id: "prof-1",
      mode: "pt",
      sample_pair: null,
      sampling_contract: "weekday_0800_wed_thu_fri_v1",
      evaluation: { evaluation_id: `evaluation-${id}`, evaluated_at: "2026-11-07T09:00:00+08:00", profile_revision: "profile-rev-1", anchor_revision: `anchor-${id}` },
      sampling: {
        policy: "weekday_0800_wed_thu_fri_v1", cycle_id: "cycle-issued-by-server",
        cycle_expires_at: "2026-11-11T08:00:00+08:00", selected_index: index,
        allowed_samples: conditions,
      },
      samples: [{
        kind: "weekday", sampled_at: conditions[index].departure_at,
        conditions: {
          conditions_id: conditions[index].conditions_id,
          timing_basis: "scheduled_departure",
          initial_departure_at: conditions[index].departure_at,
          provider_options_id: "pt-options-1",
        },
        via_status: unavailable ? "unavailable" : "available",
        reasons: unavailable ? [{ code: "no_itinerary", failure_class: "sample_dependent", retryable: false }] : [],
        totals: unavailable ? null : { duration_seconds: String(id) === "101" ? 1200 : 1800, distance_meters: 3000 },
        legs: [],
      }],
    });
    loadCommute = vi.fn().mockImplementation(async (id, request) => {
      if (request.sampling.sample_index === 0 && String(id) === "202") return selectedResponse(id, 0, true);
      return selectedResponse(id, request.sampling.sample_index);
    });
    session = createCommuteSession({
      loadCommute,
      getCapabilities: capabilities,
      selectedSamplingEnabled: true,
      comparisonCentreIds: [101, 202],
      now: () => new Date("2026-11-07T09:00:00+08:00"),
      userId: "user-1",
      onState: (state) => states.push(state),
    });

    await session.setMode("pt");
    await session.open({ centreId: 101, profileId: "prof-1", locationKey: "home-rev-1" });

    expect(loadCommute.mock.calls.map(([, request]) => request.sampling)).toEqual([
      { policy: "weekday_0800_wed_thu_fri_v1", cycle_id: null, sample_index: 0 },
      { policy: "weekday_0800_wed_thu_fri_v1", cycle_id: "cycle-issued-by-server", sample_index: 0 },
      { policy: "weekday_0800_wed_thu_fri_v1", cycle_id: "cycle-issued-by-server", sample_index: 1 },
      { policy: "weekday_0800_wed_thu_fri_v1", cycle_id: "cycle-issued-by-server", sample_index: 1 },
    ]);
    expect(session.getState().sampling.selected_index).toBe(1);
    expect(Object.keys(session.getState().setData)).toEqual(["101", "202"]);
    expect(session.getState().setData["101"].samples[0].totals.duration_seconds).toBe(1200);
    expect(session.getState().setData["202"].samples[0].totals.duration_seconds).toBe(1800);

    const nextCentreSession = createCommuteSession({
      loadCommute,
      getCapabilities: capabilities,
      selectedSamplingEnabled: true,
      comparisonCentreIds: [303],
      now: () => new Date("2026-11-07T09:00:00+08:00"),
      userId: "user-1",
    });
    await nextCentreSession.open({ centreId: 303, profileId: "prof-1", locationKey: "home-rev-1" });
    expect(loadCommute.mock.calls.at(-1)[1].sampling).toEqual({
      policy: "weekday_0800_wed_thu_fri_v1", cycle_id: "cycle-issued-by-server", sample_index: 1,
    });
  });

  it("keeps selected sampling off when its independent release control is false", async () => {
    const getCapabilities = vi.fn();
    session = createCommuteSession({ loadCommute, getCapabilities, selectedSamplingEnabled: false });
    await session.setMode("pt");
    await session.open({ centreId: 101, profileId: "prof-1" });
    expect(getCapabilities).not.toHaveBeenCalled();
    expect(loadCommute).toHaveBeenCalledWith(
      101,
      { profileId: "prof-1", mode: "pt", samplePair: null },
      expect.any(Object)
    );
  });

  it("does not advance dates for an authentication failure", async () => {
    const authenticationError = Object.assign(new Error("401: unauthenticated"), { status: 401, code: "unauthenticated" });
    loadCommute = vi.fn().mockRejectedValue(authenticationError);
    session = createCommuteSession({
      loadCommute,
      getCapabilities: vi.fn().mockResolvedValue({ direct_baseline_contract: null, sampling_contract: "weekday_0800_wed_thu_fri_v1" }),
      selectedSamplingEnabled: true,
      onState: (state) => states.push(state),
    });
    await session.setMode("pt");
    await session.open({ centreId: 101, profileId: "prof-1" });

    expect(loadCommute).toHaveBeenCalledTimes(1);
    expect(loadCommute.mock.calls[0][1].sampling.sample_index).toBe(0);
    expect(session.getState().error).toBe(authenticationError);
  });

  it("refreshes the whole selected cycle if its Wednesday boundary passes during an evaluation", async () => {
    let clock = new Date("2026-11-11T07:59:59+08:00");
    const cycles = [
      { id: "cycle-before-expiry", wed: "2026-11-11T08:00:00+08:00" },
      { id: "cycle-after-expiry", wed: "2026-11-18T08:00:00+08:00" },
    ];
    const makeResponse = (cycle, index) => {
      const dates = cycle.id === "cycle-after-expiry"
        ? [cycle.wed, "2026-11-19T08:00:00+08:00", "2026-11-20T08:00:00+08:00"]
        : [cycle.wed, "2026-11-12T08:00:00+08:00", "2026-11-13T08:00:00+08:00"];
      return {
        centre_id: 101, profile_id: "prof-1", mode: "pt", sample_pair: null,
        sampling_contract: "weekday_0800_wed_thu_fri_v1",
        evaluation: { evaluation_id: `eval-${cycle.id}`, evaluated_at: "2026-11-11T07:59:59+08:00", profile_revision: "profile-r1", anchor_revision: "anchor-r1" },
        sampling: {
          policy: "weekday_0800_wed_thu_fri_v1", cycle_id: cycle.id, cycle_expires_at: cycle.wed,
          selected_index: index,
          allowed_samples: dates.map((departure_at, sample_index) => ({ sample_index, departure_at, conditions_id: `${cycle.id}-${sample_index}` })),
        },
        samples: [{
          kind: "weekday", sampled_at: dates[index], via_status: "available", reasons: [], legs: [],
          conditions: { conditions_id: `${cycle.id}-${index}`, timing_basis: "scheduled_departure", initial_departure_at: dates[index], provider_options_id: "pt-r1" },
          totals: { duration_seconds: 900, distance_meters: 1000 },
        }],
      };
    };
    let evaluations = 0;
    loadCommute = vi.fn(async () => {
      const cycle = cycles[Math.min(evaluations, 1)];
      const response = makeResponse(cycle, 0);
      evaluations += 1;
      if (evaluations === 1) clock = new Date("2026-11-11T08:00:00+08:00");
      return response;
    });
    session = createCommuteSession({
      loadCommute,
      getCapabilities: vi.fn().mockResolvedValue({ direct_baseline_contract: null, sampling_contract: "weekday_0800_wed_thu_fri_v1" }),
      selectedSamplingEnabled: true,
      now: () => clock,
    });
    await session.setMode("pt");
    await session.open({ centreId: 101, profileId: "prof-1" });

    expect(loadCommute).toHaveBeenCalledTimes(2);
    expect(loadCommute.mock.calls.map(([, request]) => request.sampling)).toEqual([
      { policy: "weekday_0800_wed_thu_fri_v1", cycle_id: null, sample_index: 0 },
      { policy: "weekday_0800_wed_thu_fri_v1", cycle_id: null, sample_index: 0 },
    ]);
    expect(session.getState().sampling.cycle_id).toBe("cycle-after-expiry");
    expect(session.getState().data.sampling.cycle_id).toBe("cycle-after-expiry");
  });

  it("stops after one recovery when the refreshed selected cycle is already expired", async () => {
    const expired = Object.assign(new Error("409: sample_expired"), { status: 409, code: "sample_expired" });
    loadCommute = vi.fn().mockRejectedValue(expired);
    session = createCommuteSession({
      loadCommute,
      getCapabilities: vi.fn().mockResolvedValue({ direct_baseline_contract: null, sampling_contract: "weekday_0800_wed_thu_fri_v1" }),
      selectedSamplingEnabled: true,
    });
    await session.setMode("pt");
    await session.open({ centreId: 101, profileId: "prof-1" });
    expect(loadCommute).toHaveBeenCalledTimes(2);
    expect(session.getState().error).toBe(expired);
  });

  it("clears Thursday results at Wednesday expiry and refreshes the active set once", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-10T08:00:00+08:00") });
    let clock = new Date("2026-11-10T08:00:00+08:00");
    let calls = 0;
    loadCommute = vi.fn(async (id, request) => {
      calls += 1;
      if (calls === 1) return selectedCycleResponse(id, 0, { unavailable: true });
      if (calls === 2) return selectedCycleResponse(id, 1);
      return selectedCycleResponse(id, 0, { cycleId: "timer-cycle-2", primary: "2026-11-18T08:00:00+08:00" });
    });
    session = createCommuteSession({
      loadCommute,
      getCapabilities: vi.fn().mockResolvedValue({ direct_baseline_contract: null, sampling_contract: "weekday_0800_wed_thu_fri_v1" }),
      selectedSamplingEnabled: true,
      now: () => clock,
    });
    await session.setMode("pt");
    await session.open({ centreId: 101, profileId: "prof-1" });
    expect(session.getState().sampling.selected_index).toBe(1);
    expect(session.getState().data.sampling.cycle_id).toBe("timer-cycle-1");

    clock = new Date("2026-11-11T08:00:00+08:00");
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

    expect(loadCommute).toHaveBeenCalledTimes(3);
    expect(loadCommute.mock.calls[2][1].sampling).toEqual({
      policy: "weekday_0800_wed_thu_fri_v1", cycle_id: null, sample_index: 0,
    });
    expect(session.getState().data.sampling.cycle_id).toBe("timer-cycle-2");
    session.destroy();
    vi.useRealTimers();
  });

  it("does not start a new cycle automatically after fallback exhaustion at expiry", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-10T08:00:00+08:00") });
    let clock = new Date("2026-11-10T08:00:00+08:00");
    loadCommute = vi.fn(async (id, request) => selectedCycleResponse(id, request.sampling.sample_index, {
      unavailable: true,
      cycleId: request.sampling.cycle_id || "exhausted-cycle",
    }));
    session = createCommuteSession({
      loadCommute,
      getCapabilities: vi.fn().mockResolvedValue({ direct_baseline_contract: null, sampling_contract: "weekday_0800_wed_thu_fri_v1" }),
      selectedSamplingEnabled: true,
      now: () => clock,
    });
    await session.setMode("pt");
    await session.open({ centreId: 101, profileId: "prof-1" });
    expect(loadCommute).toHaveBeenCalledTimes(3);
    expect(session.getState().sampling.selected_index).toBe(2);

    clock = new Date("2026-11-11T08:00:00+08:00");
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

    expect(loadCommute).toHaveBeenCalledTimes(3);
    expect(session.getState().data).toBe(null);
    expect(session.getState().setData).toEqual({});
    expect(session.getState().error.message).toMatch(/Retry/);
    session.destroy();
    vi.useRealTimers();
  });

  it("rejects a delayed selected response after the active mode changes", async () => {
    let resolveSelected;
    const delayed = new Promise((resolve) => { resolveSelected = resolve; });
    const dates = ["2026-11-11T08:00:00+08:00", "2026-11-12T08:00:00+08:00", "2026-11-13T08:00:00+08:00"];
    loadCommute = vi.fn((id, request) => {
      if (request.mode === "pt") return delayed;
      return Promise.resolve(mockCommute(id, request.mode));
    });
    session = createCommuteSession({
      loadCommute,
      getCapabilities: vi.fn().mockResolvedValue({ direct_baseline_contract: null, sampling_contract: "weekday_0800_wed_thu_fri_v1" }),
      selectedSamplingEnabled: true,
      comparisonCentreIds: [101, 202],
      now: () => new Date("2026-11-07T09:00:00+08:00"),
    });
    await session.setMode("pt");
    const selectedRequest = session.open({ centreId: 101, profileId: "prof-1" });
    await Promise.resolve();
    await session.setMode("drive");
    resolveSelected({
      centre_id: 101, profile_id: "prof-1", mode: "pt", sample_pair: null,
      sampling_contract: "weekday_0800_wed_thu_fri_v1",
      evaluation: { evaluation_id: "late-evaluation", evaluated_at: "2026-11-07T09:00:00+08:00", profile_revision: "profile-r1", anchor_revision: "anchor-r1" },
      sampling: { policy: "weekday_0800_wed_thu_fri_v1", cycle_id: "late-cycle", cycle_expires_at: dates[0], selected_index: 0,
        allowed_samples: dates.map((departure_at, sample_index) => ({ departure_at, sample_index, conditions_id: `late-${sample_index}` })) },
      samples: [{ kind: "weekday", sampled_at: dates[0], conditions: { conditions_id: "late-0", timing_basis: "scheduled_departure", initial_departure_at: dates[0], provider_options_id: "pt-r1" }, via_status: "available", reasons: [], legs: [], totals: { duration_seconds: 1000, distance_meters: 2000 } }],
    });
    await selectedRequest;
    expect(session.getState().mode).toBe("drive");
    expect(session.getState().data.mode).toBe("drive");
    expect(session.getState().sampling).toBe(null);
    expect(loadCommute.mock.calls.some(([id, request]) => String(id) === "202" && request.mode === "pt")).toBe(false);
  });

  it("negotiates baseline and sampling independently and sends both opt-ins when both are supported", async () => {
    const capabilityDocument = {
      direct_baseline_contract: "direct_baseline_v1",
      sampling_contract: "weekday_0800_wed_thu_fri_v1",
    };
    const sampled = selectedCycleResponse(101, 0);
    loadCommute = vi.fn().mockResolvedValue({
      ...sampled,
      comparison_contract: "direct_baseline_v1",
      samples: [{ ...sampled.samples[0], direct_route: { status: "unavailable", legs: [], totals: null, reasons: [] }, comparison: { status: "unavailable", reasons: [], certification: null } }],
    });
    const getCapabilities = vi.fn().mockResolvedValue(capabilityDocument);
    session = createCommuteSession({
      loadCommute,
      getCapabilities,
      selectedSamplingEnabled: true,
      directBaselineEnabled: true,
      now: () => new Date("2026-11-07T09:00:00+08:00"),
    });
    await session.setMode("pt");
    await session.open({ centreId: 101, profileId: "prof-1", locationKey: "home-rev-1" });

    expect(getCapabilities).toHaveBeenCalledTimes(1);
    expect(loadCommute.mock.calls[0][1]).toEqual({
      profileId: "prof-1",
      mode: "pt",
      samplePair: null,
      includeDirectBaseline: true,
      sampling: { policy: "weekday_0800_wed_thu_fri_v1", cycle_id: null, sample_index: 0 },
    });
    expect(session.getState().directBaselineStatus).toBe("supported");
  });

  it("advances the whole selected set when a required direct component has classified no-itinerary", async () => {
    const allowed = [
      { sample_index: 0, conditions_id: "shared-wed", departure_at: "2026-11-11T08:00:00+08:00" },
      { sample_index: 1, conditions_id: "shared-thu", departure_at: "2026-11-12T08:00:00+08:00" },
      { sample_index: 2, conditions_id: "shared-fri", departure_at: "2026-11-13T08:00:00+08:00" },
    ];
    const combinedResponse = (id, index, directUnavailable = false) => ({
      centre_id: id,
      profile_id: "prof-1",
      mode: "pt",
      sample_pair: null,
      comparison_contract: "direct_baseline_v1",
      sampling_contract: "weekday_0800_wed_thu_fri_v1",
      evaluation: { evaluation_id: `combined-${id}-${index}`, evaluated_at: "2026-11-07T09:00:00+08:00", profile_revision: "profile-rev-1", anchor_revision: `anchor-${id}` },
      sampling: { policy: "weekday_0800_wed_thu_fri_v1", cycle_id: "combined-cycle", cycle_expires_at: allowed[0].departure_at, selected_index: index, allowed_samples: allowed },
      samples: [{
        kind: "weekday",
        sampled_at: allowed[index].departure_at,
        conditions: { conditions_id: allowed[index].conditions_id, timing_basis: "scheduled_departure", initial_departure_at: allowed[index].departure_at, provider_options_id: "pt-options" },
        via_status: "available",
        reasons: [],
        legs: [],
        totals: { duration_seconds: 1800, distance_meters: 3000 },
        direct_route: directUnavailable
          ? { status: "unavailable", legs: [], totals: null, reasons: [{ code: "no_itinerary", failure_class: "sample_dependent", retryable: false }] }
          : { status: "unavailable", legs: [], totals: null, reasons: [{ code: "workplace_unresolved", failure_class: "location", retryable: false }] },
        comparison: { status: "unavailable", reasons: [{ code: "direct_unavailable", failure_class: "conditions", retryable: false }], certification: null },
      }],
    });
    const getCapabilities = vi.fn().mockResolvedValue({
      direct_baseline_contract: "direct_baseline_v1",
      sampling_contract: "weekday_0800_wed_thu_fri_v1",
    });
    loadCommute = vi.fn(async (id, request) => {
      const index = request.sampling.sample_index;
      return combinedResponse(id, index, index === 0 && String(id) === "202");
    });
    session = createCommuteSession({
      loadCommute,
      getCapabilities,
      selectedSamplingEnabled: true,
      directBaselineEnabled: true,
      comparisonCentreIds: [101, 202],
      now: () => new Date("2026-11-07T09:00:00+08:00"),
    });
    await session.setMode("pt");
    await session.open({ centreId: 101, profileId: "prof-1", locationKey: "home-rev-1" });

    expect(loadCommute).toHaveBeenCalledTimes(4);
    expect(loadCommute.mock.calls.map(([, request]) => request.sampling.sample_index)).toEqual([0, 0, 1, 1]);
    expect(loadCommute.mock.calls.every(([, request]) => request.includeDirectBaseline === true)).toBe(true);
    expect(session.getState().sampling.selected_index).toBe(1);
    expect(Object.keys(session.getState().setData)).toEqual(["101", "202"]);
    expect(session.getState().setData["101"].samples[0].totals.duration_seconds).toBe(1800);
    expect(session.getState().setData["202"].samples[0].totals.duration_seconds).toBe(1800);
  });

  it("keeps direct location, timing, and service failures out of calendar fallback", async () => {
    const capabilityDocument = {
      direct_baseline_contract: "direct_baseline_v1",
      sampling_contract: "weekday_0800_wed_thu_fri_v1",
    };
    const selected = selectedCycleResponse(101, 0);
    const failures = [
      { code: "workplace_unresolved", failure_class: "location", retryable: false },
      { code: "timing_unverified", failure_class: "conditions", retryable: false },
      { code: "provider_timeout", failure_class: "service", retryable: true },
    ];
    for (const reason of failures) {
      loadCommute = vi.fn().mockResolvedValue({
        ...selected,
        comparison_contract: "direct_baseline_v1",
        samples: [{
          ...selected.samples[0],
          direct_route: { status: "unavailable", legs: [], totals: null, reasons: [reason] },
          comparison: { status: "unavailable", reasons: [{ code: "direct_unavailable", failure_class: "conditions", retryable: false }], certification: null },
        }],
      });
      session = createCommuteSession({
        loadCommute,
        getCapabilities: vi.fn().mockResolvedValue(capabilityDocument),
        selectedSamplingEnabled: true,
        directBaselineEnabled: true,
        now: () => new Date("2026-11-07T09:00:00+08:00"),
      });
      await session.setMode("pt");
      await session.open({ centreId: 101, profileId: "prof-1" });
      expect(loadCommute).toHaveBeenCalledTimes(1);
      expect(session.getState().sampling.selected_index).toBe(0);
      session.destroy();
    }
  });

  it("advances for a separate via no-itinerary result when direct timing is uncertified", async () => {
    loadCommute = vi.fn(async (_id, request) => {
      const index = request.sampling.sample_index;
      const response = selectedCycleResponse(101, index, { unavailable: index === 0 });
      response.comparison_contract = "direct_baseline_v1";
      response.samples[0].direct_route = {
        status: "unavailable", legs: [], totals: null,
        reasons: [{ code: "timing_unverified", failure_class: "conditions", retryable: false }],
      };
      response.samples[0].comparison = {
        status: "unavailable", reasons: [{ code: "direct_unavailable", failure_class: "conditions", retryable: false }], certification: null,
      };
      if (index === 0) response.samples[0].legs[0] = {
        from_anchor: "home", to_anchor: "centre", status: "unavailable", source: null,
        duration_seconds: null, distance_meters: null, geometry: null,
        reasons: [{ code: "no_itinerary", failure_class: "sample_dependent", retryable: false }],
      };
      return response;
    });
    session = createCommuteSession({
      loadCommute,
      getCapabilities: vi.fn().mockResolvedValue({ direct_baseline_contract: "direct_baseline_v1", sampling_contract: "weekday_0800_wed_thu_fri_v1" }),
      selectedSamplingEnabled: true,
      directBaselineEnabled: true,
      now: () => new Date("2026-11-07T09:00:00+08:00"),
    });
    await session.setMode("pt");
    await session.open({ centreId: 101, profileId: "prof-1" });

    expect(loadCommute).toHaveBeenCalledTimes(2);
    expect(loadCommute.mock.calls.map(([, request]) => request.sampling.sample_index)).toEqual([0, 1]);
    expect(session.getState().sampling.selected_index).toBe(1);
    expect(session.getState().data.samples[0].direct_route.reasons[0].code).toBe("timing_unverified");
    expect(session.getState().data.samples[0].totals.duration_seconds).toBe(1200);
  });

  it("does not calendar-cycle a verified via absence through a direct provider service failure", async () => {
    const response = selectedCycleResponse(101, 0, { unavailable: true });
    response.comparison_contract = "direct_baseline_v1";
    response.samples[0].direct_route = {
      status: "unavailable", legs: [], totals: null,
      reasons: [{ code: "provider_timeout", failure_class: "service", retryable: true }],
    };
    response.samples[0].comparison = {
      status: "unavailable", reasons: [{ code: "direct_unavailable", failure_class: "conditions", retryable: false }], certification: null,
    };
    loadCommute = vi.fn().mockResolvedValue(response);
    session = createCommuteSession({
      loadCommute,
      getCapabilities: vi.fn().mockResolvedValue({ direct_baseline_contract: "direct_baseline_v1", sampling_contract: "weekday_0800_wed_thu_fri_v1" }),
      selectedSamplingEnabled: true,
      directBaselineEnabled: true,
      now: () => new Date("2026-11-07T09:00:00+08:00"),
    });
    await session.setMode("pt");
    await session.open({ centreId: 101, profileId: "prof-1" });

    expect(loadCommute).toHaveBeenCalledTimes(1);
    expect(session.getState().sampling.selected_index).toBe(0);
  });

  it("keeps all four independently controlled capability combinations usable", async () => {
    const combinations = [
      { selectedSamplingEnabled: false, directBaselineEnabled: false, markers: { direct_baseline_contract: null, sampling_contract: null }, expectedBaseline: false, expectedSampling: false },
      { selectedSamplingEnabled: false, directBaselineEnabled: true, markers: { direct_baseline_contract: "direct_baseline_v1", sampling_contract: null }, expectedBaseline: true, expectedSampling: false },
      { selectedSamplingEnabled: true, directBaselineEnabled: false, markers: { direct_baseline_contract: null, sampling_contract: "weekday_0800_wed_thu_fri_v1" }, expectedBaseline: false, expectedSampling: true },
      { selectedSamplingEnabled: true, directBaselineEnabled: true, markers: { direct_baseline_contract: "direct_baseline_v1", sampling_contract: "weekday_0800_wed_thu_fri_v1" }, expectedBaseline: true, expectedSampling: true },
    ];
    for (const combo of combinations) {
      resetSessionMode();
      const response = combo.expectedSampling
        ? { ...selectedCycleResponse(101, 0), ...(combo.expectedBaseline ? { comparison_contract: "direct_baseline_v1" } : {}) }
        : { ...mockCommute(), ...(combo.expectedBaseline ? { comparison_contract: "direct_baseline_v1" } : {}) };
      loadCommute = vi.fn().mockResolvedValue(response);
      const getCapabilities = vi.fn().mockResolvedValue(combo.markers);
      session = createCommuteSession({
        loadCommute, getCapabilities,
        selectedSamplingEnabled: combo.selectedSamplingEnabled,
        directBaselineEnabled: combo.directBaselineEnabled,
        now: () => new Date("2026-11-07T09:00:00+08:00"),
      });
      await session.setMode("pt");
      await session.open({ centreId: 101, profileId: "prof-1" });

      const request = loadCommute.mock.calls.at(-1)[1];
      expect(Boolean(request.includeDirectBaseline)).toBe(combo.expectedBaseline);
      expect(Boolean(request.sampling)).toBe(combo.expectedSampling);
      expect(session.getState().data).not.toBe(null);
      expect(session.getState().directBaselineStatus === "supported").toBe(combo.expectedBaseline);
      session.destroy();
    }
  });

  it("preserves usable direct and partial via data when all selected samples are exhausted", async () => {
    const allowed = [
      { sample_index: 0, conditions_id: "exhaust-wed", departure_at: "2026-11-11T08:00:00+08:00" },
      { sample_index: 1, conditions_id: "exhaust-thu", departure_at: "2026-11-12T08:00:00+08:00" },
      { sample_index: 2, conditions_id: "exhaust-fri", departure_at: "2026-11-13T08:00:00+08:00" },
    ];
    const partialRoute = {
      from_anchor: "home", to_anchor: "centre", status: "available", source: "onemap",
      duration_seconds: 900, distance_meters: 1200, geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.31, lng: 103.81 }], reasons: [],
    };
    const directLeg = {
      from_anchor: "home", to_anchor: "workplace", status: "available", source: "onemap",
      duration_seconds: 1200, distance_meters: 1800, geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.32, lng: 103.82 }], reasons: [],
    };
    loadCommute = vi.fn(async (_id, request) => ({
      centre_id: 101, profile_id: "prof-1", mode: "pt", sample_pair: null,
      comparison_contract: "direct_baseline_v1", sampling_contract: "weekday_0800_wed_thu_fri_v1",
      evaluation: { evaluation_id: `exhaust-${request.sampling.sample_index}`, evaluated_at: "2026-11-07T09:00:00+08:00", profile_revision: "profile-rev", anchor_revision: "anchor-rev" },
      sampling: { policy: "weekday_0800_wed_thu_fri_v1", cycle_id: "exhausted-cycle", cycle_expires_at: allowed[0].departure_at, selected_index: request.sampling.sample_index, allowed_samples: allowed },
      samples: [{
        kind: "weekday", sampled_at: allowed[request.sampling.sample_index].departure_at,
        conditions: { conditions_id: allowed[request.sampling.sample_index].conditions_id, timing_basis: "scheduled_departure", initial_departure_at: allowed[request.sampling.sample_index].departure_at, provider_options_id: "pt-options" },
        via_status: "partial", reasons: [{ code: "no_itinerary", failure_class: "sample_dependent", retryable: false }],
        legs: [partialRoute], totals: null,
        direct_route: { status: "available", legs: [directLeg], totals: { duration_seconds: 1200, distance_meters: 1800 }, reasons: [] },
        comparison: { status: "unavailable", reasons: [{ code: "via_centre_incomplete", failure_class: "conditions", retryable: false }], certification: null },
      }],
    }));
    session = createCommuteSession({
      loadCommute,
      getCapabilities: vi.fn().mockResolvedValue({ direct_baseline_contract: "direct_baseline_v1", sampling_contract: "weekday_0800_wed_thu_fri_v1" }),
      selectedSamplingEnabled: true,
      directBaselineEnabled: true,
      now: () => new Date("2026-11-07T09:00:00+08:00"),
    });
    await session.setMode("pt");
    await session.open({ centreId: 101, profileId: "prof-1" });

    expect(loadCommute).toHaveBeenCalledTimes(3);
    expect(session.getState().data.samples[0].via_status).toBe("partial");
    expect(session.getState().data.samples[0].totals).toBe(null);
    expect(session.getState().data.samples[0].direct_route.status).toBe("available");
  });

  it("rejects selected-set results with different provider options", async () => {
    const selectedResponse = (id, options) => {
      const response = selectedCycleResponse(id, 0);
      response.samples[0].conditions.provider_options_id = options;
      return response;
    };
    loadCommute = vi.fn(async (id) => selectedResponse(id, String(id) === "101" ? "options-a" : "options-b"));
    session = createCommuteSession({
      loadCommute,
      getCapabilities: vi.fn().mockResolvedValue({ direct_baseline_contract: null, sampling_contract: "weekday_0800_wed_thu_fri_v1" }),
      selectedSamplingEnabled: true,
      comparisonCentreIds: [101, 202],
      now: () => new Date("2026-11-07T09:00:00+08:00"),
    });
    await session.setMode("pt");
    await session.open({ centreId: 101, profileId: "prof-1" });

    expect(session.getState().data).toBe(null);
    expect(session.getState().setData).toEqual({});
    expect(session.getState().error.message).toMatch(/conditions differ/);
  });

  it("retains current-condition results during a same-sample user retry", async () => {
    let resolveRetry;
    let loads = 0;
    loadCommute = vi.fn((id, request) => {
      loads += 1;
      if (loads === 1) return Promise.resolve(selectedCycleResponse(id, request.sampling.sample_index));
      return new Promise((resolve) => { resolveRetry = resolve; });
    });
    session = createCommuteSession({
      loadCommute,
      getCapabilities: vi.fn().mockResolvedValue({ direct_baseline_contract: null, sampling_contract: "weekday_0800_wed_thu_fri_v1" }),
      selectedSamplingEnabled: true,
      now: () => new Date("2026-11-07T09:00:00+08:00"),
    });
    await session.setMode("pt");
    await session.open({ centreId: 101, profileId: "prof-1" });
    expect(session.getState().data).not.toBe(null);

    const retry = session.retry();
    await Promise.resolve();

    expect(loadCommute.mock.calls.at(-1)[1].sampling).toEqual({
      policy: "weekday_0800_wed_thu_fri_v1", cycle_id: "timer-cycle-1", sample_index: 0,
    });
    expect(session.getState().data).not.toBe(null);
    expect(session.getState().setData["101"].sampling.cycle_id).toBe("timer-cycle-1");
    resolveRetry(selectedCycleResponse(101, 0));
    await retry;
  });

  it("clears all retained private commute data after endpoint authorization expires", async () => {
    const authorizationError = Object.assign(new Error("401: unauthenticated"), {
      status: 401, code: "unauthenticated", failureClass: "authentication",
    });
    let calls = 0;
    loadCommute = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return mockCommute();
      throw authorizationError;
    });
    session = createCommuteSession({ loadCommute });
    await session.open({ centreId: 101, profileId: "prof-1" });
    expect(session.getState().data).not.toBe(null);

    await session.retry();

    expect(session.getState().error).toBe(authorizationError);
    expect(session.getState().data).toBe(null);
    expect(session.getState().setData).toEqual({});
  });

  it("treats provider authorization as service failure and keeps same-condition successes visible", async () => {
    const providerAuthError = Object.assign(new Error("401: provider auth failed"), {
      status: 401, code: "provider_auth_failed", failureClass: "service",
    });
    let calls = 0;
    loadCommute = vi.fn(async (id, request) => {
      calls += 1;
      if (calls === 1) return selectedCycleResponse(id, request.sampling.sample_index);
      throw providerAuthError;
    });
    session = createCommuteSession({
      loadCommute,
      getCapabilities: vi.fn().mockResolvedValue({ direct_baseline_contract: null, sampling_contract: "weekday_0800_wed_thu_fri_v1" }),
      selectedSamplingEnabled: true,
      now: () => new Date("2026-11-07T09:00:00+08:00"),
    });
    await session.setMode("pt");
    await session.open({ centreId: 101, profileId: "prof-1" });

    await session.retry();

    expect(loadCommute.mock.calls.map(([, request]) => request.sampling.sample_index)).toEqual([0, 0]);
    expect(session.getState().data.samples[0].via_status).toBe("available");
    expect(session.getState().error).toBe(providerAuthError);
  });

  it("does not resurrect Wednesday survivors after the shared set advances and a Thursday centre fails", async () => {
    let retrying = false;
    loadCommute = vi.fn(async (id, request) => {
      const index = request.sampling.sample_index;
      if (!retrying) return selectedCycleResponse(id, index);
      if (index === 0 && String(id) === "202") return selectedCycleResponse(id, index, { unavailable: true });
      if (index === 1 && String(id) === "202") {
        throw Object.assign(new Error("503: provider unavailable"), { status: 503, code: "provider_unavailable", failureClass: "service" });
      }
      return selectedCycleResponse(id, index);
    });
    session = createCommuteSession({
      loadCommute,
      getCapabilities: vi.fn().mockResolvedValue({ direct_baseline_contract: null, sampling_contract: "weekday_0800_wed_thu_fri_v1" }),
      selectedSamplingEnabled: true,
      comparisonCentreIds: [101, 202],
      now: () => new Date("2026-11-07T09:00:00+08:00"),
    });
    await session.setMode("pt");
    await session.open({ centreId: 101, profileId: "prof-1", locationKey: "home-rev-1" });
    expect(Object.keys(session.getState().setData)).toEqual(["101", "202"]);
    retrying = true;

    await session.retry();

    expect(loadCommute.mock.calls.map(([, request]) => request.sampling.sample_index)).toEqual([0, 0, 0, 0, 1, 1]);
    expect(Object.keys(session.getState().setData)).toEqual(["101"]);
    expect(session.getState().setData["101"].samples[0].sampled_at).toBe("2026-11-12T00:00:00.000Z");
    expect(session.getState().setData["202"]).toBeUndefined();
    expect(session.getState().error.status).toBe(503);
  });

  it("retains a failed direct route from the same condition but withholds mixed-evaluation deviation", async () => {
    const allowed = [
      { sample_index: 0, conditions_id: "stable-condition", departure_at: "2026-11-11T08:00:00+08:00" },
      { sample_index: 1, conditions_id: "stable-condition-thu", departure_at: "2026-11-12T08:00:00+08:00" },
      { sample_index: 2, conditions_id: "stable-condition-fri", departure_at: "2026-11-13T08:00:00+08:00" },
    ];
    const directLeg = {
      from_anchor: "home", to_anchor: "workplace", status: "available", source: "onemap",
      duration_seconds: 1500, distance_meters: 8000,
      geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.28, lng: 103.85 }], reasons: [],
    };
    const combined = (directUnavailable) => ({
      ...selectedCycleResponse(101, 0), comparison_contract: "direct_baseline_v1",
      sampling: { ...selectedCycleResponse(101, 0).sampling, allowed_samples: allowed },
      samples: [{ ...selectedCycleResponse(101, 0).samples[0], conditions: {
        conditions_id: allowed[0].conditions_id, timing_basis: "scheduled_departure",
        initial_departure_at: allowed[0].departure_at, provider_options_id: "pt-options",
      },
      direct_route: directUnavailable
        ? { status: "unavailable", legs: [], totals: null, reasons: [{ code: "workplace_unresolved", failure_class: "location", retryable: false }] }
        : { status: "available", legs: [directLeg], totals: { duration_seconds: 1500, distance_meters: 8000 }, reasons: [] },
      comparison: directUnavailable
        ? { status: "unavailable", reasons: [{ code: "direct_unavailable", failure_class: "conditions", retryable: false }], certification: null }
        : { status: "unavailable", reasons: [], certification: null },
      }],
    });
    let call = 0;
    loadCommute = vi.fn(async () => combined(call++ > 0));
    session = createCommuteSession({
      loadCommute,
      getCapabilities: vi.fn().mockResolvedValue({ direct_baseline_contract: "direct_baseline_v1", sampling_contract: "weekday_0800_wed_thu_fri_v1" }),
      selectedSamplingEnabled: true,
      directBaselineEnabled: true,
      now: () => new Date("2026-11-07T09:00:00+08:00"),
    });
    await session.setMode("pt");
    await session.open({ centreId: 101, profileId: "prof-1", locationKey: "home-rev-1" });
    await session.retry();

    const retried = session.getState().data.samples[0];
    expect(retried.via_status).toBe("available");
    expect(retried.direct_route.status).toBe("available");
    expect(retried.comparison.status).toBe("unavailable");
    expect(retried.comparison.certification).toBe(null);
  });

  it("retains a previously usable via leg for the same sample while withholding complete totals", async () => {
    const departure = "2026-11-11T08:00:00+08:00";
    const arrival = "2026-11-11T08:15:00+08:00";
    const firstLeg = {
      from_anchor: "home", to_anchor: "centre", status: "available", source: "onemap",
      duration_seconds: 900, distance_meters: 4000, geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.35, lng: 103.85 }],
      departure_at: departure, arrival_at: arrival, reasons: [],
    };
    const secondLeg = {
      from_anchor: "centre", to_anchor: "workplace", status: "available", source: "onemap",
      duration_seconds: 900, distance_meters: 5000, geometry: [{ lat: 1.35, lng: 103.85 }, { lat: 1.28, lng: 103.85 }],
      departure_at: arrival, arrival_at: "2026-11-11T08:30:00+08:00", reasons: [],
    };
    const makeResponse = (secondUnavailable, outOfRangeGeometry = false) => {
      const response = selectedCycleResponse(101, 0);
      const sample = response.samples[0];
      sample.conditions.initial_departure_at = departure;
      sample.legs = [firstLeg, secondUnavailable ? {
        ...secondLeg, status: "unavailable", source: null, duration_seconds: null, distance_meters: null,
        geometry: null, reasons: [{ code: "workplace_unresolved", failure_class: "location", retryable: false }],
      } : outOfRangeGeometry ? {
        ...secondLeg, geometry: [{ lat: 1.35, lng: 103.85 }, { lat: 95, lng: 103.8 }],
      } : secondLeg];
      sample.via_status = secondUnavailable ? "partial" : "available";
      sample.totals = secondUnavailable ? null : { duration_seconds: 1800, distance_meters: 9000 };
      sample.reasons = secondUnavailable ? [{ code: "workplace_unresolved", failure_class: "location", retryable: false }] : [];
      return response;
    };
    let call = 0;
    loadCommute = vi.fn(async () => makeResponse(call++ > 0));
    session = createCommuteSession({
      loadCommute,
      getCapabilities: vi.fn().mockResolvedValue({ direct_baseline_contract: null, sampling_contract: "weekday_0800_wed_thu_fri_v1" }),
      selectedSamplingEnabled: true,
      now: () => new Date("2026-11-07T09:00:00+08:00"),
    });
    await session.setMode("pt");
    await session.open({ centreId: 101, profileId: "prof-1" });
    await session.retry();

    const retried = session.getState().data.samples[0];
    expect(retried.via_status).toBe("partial");
    expect(retried.legs.map((leg) => leg.status)).toEqual(["available", "available"]);
    expect(retried.totals).toBe(null);
    session.destroy();

    call = 0;
    loadCommute = vi.fn(async () => makeResponse(false, call++ > 0));
    session = createCommuteSession({
      loadCommute,
      getCapabilities: vi.fn().mockResolvedValue({ direct_baseline_contract: null, sampling_contract: "weekday_0800_wed_thu_fri_v1" }),
      selectedSamplingEnabled: true,
      now: () => new Date("2026-11-07T09:00:00+08:00"),
    });
    await session.setMode("pt");
    await session.open({ centreId: 101, profileId: "prof-1" });
    await session.retry();
    const outOfRangeRoute = session.getState().data.samples[0];
    expect(outOfRangeRoute.via_status).toBe("available");
    expect(outOfRangeRoute.legs[1].geometry[1].lat).toBe(1.28);
    expect(outOfRangeRoute.totals.duration_seconds).toBe(1800);
    session.destroy();
  });
});
