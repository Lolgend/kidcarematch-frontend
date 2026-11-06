import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { failClosedFetch, jsonResponse } from "../support/fetch.js";

const auth = { currentUser: null };
vi.mock("../../src/firebase", () => ({ auth }));

describe("getCentreCommute API client", () => {
  let fetchMock;
  let api;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_URL", "https://api.invalid/");
    auth.currentUser = { getIdToken: vi.fn().mockResolvedValue("test-token") };
    fetchMock = failClosedFetch(vi);
    vi.stubGlobal("fetch", fetchMock);
    api = await import("../../src/api.js");
  });

  afterEach(() => {
    expect(fetchMock.unexpectedCalls).toEqual([]);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("posts to centre commute endpoint with encoded ID and default drive mode", async () => {
    const commuteData = {
      centre_id: 101,
      profile_id: "prof-1",
      mode: "drive",
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
            },
          ],
          totals: { duration_seconds: 600, distance_meters: 5000 },
        },
      ],
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, commuteData));

    const result = await api.getCentreCommute("101/special", {
      profileId: "prof-1",
    });

    expect(result).toEqual(commuteData);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.invalid/api/v1/centres/101%2Fspecial/commute",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        }),
        body: JSON.stringify({
          profile_id: "prof-1",
          mode: "drive",
        }),
      })
    );
  });

  it("forwards custom mode, samplePair, and AbortSignal options", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, { status: "ok" }));
    const controller = new AbortController();

    await api.getCentreCommute(
      42,
      {
        profileId: "prof-2",
        mode: "drive",
        samplePair: ["2026-11-11T00:00:00Z", "2026-11-14T00:00:00Z"],
      },
      { signal: controller.signal }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.invalid/api/v1/centres/42/commute",
      expect.objectContaining({
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          profile_id: "prof-2",
          mode: "drive",
          sample_pair: ["2026-11-11T00:00:00Z", "2026-11-14T00:00:00Z"],
        }),
      })
    );
  });

  it("supports walking and cycling mode payloads", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, { mode: "walk" }));
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, { mode: "cycle" }));

    await api.getCentreCommute(101, { profileId: "prof-1", mode: "walk" });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.invalid/api/v1/centres/101/commute",
      expect.objectContaining({
        body: JSON.stringify({
          profile_id: "prof-1",
          mode: "walk",
        }),
      })
    );

    await api.getCentreCommute(101, { profileId: "prof-1", mode: "cycle" });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.invalid/api/v1/centres/101/commute",
      expect.objectContaining({
        body: JSON.stringify({
          profile_id: "prof-1",
          mode: "cycle",
        }),
      })
    );
  });

  it("rejects on HTTP error response", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(vi, { detail: "Preference profile not found" }, 404)
    );

    await expect(
      api.getCentreCommute(101, { profileId: "prof-nonexistent" })
    ).rejects.toThrow("404: Preference profile not found");
  });
});
