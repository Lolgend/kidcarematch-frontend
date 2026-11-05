import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCommuteSession,
  getSessionMode,
  setSessionMode,
  resetSessionMode,
  resetRetainedSessionMode,
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

  beforeEach(() => {
    resetRetainedSessionMode();
    states = [];
    loadCommute = vi.fn().mockImplementation(async (centreId, { mode }) => {
      return mockCommute(centreId, mode);
    });
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
    await session.setMode("walk");

    expect(states[states.length - 1].data.mode).toBe("walk");

    resolveDrive(mockCommute(101, "drive"));
    await pDrive;

    expect(states[states.length - 1].data.mode).toBe("walk");
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
});
