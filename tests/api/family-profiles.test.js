import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { failClosedFetch, jsonResponse } from "../support/fetch.js";

const auth = { currentUser: null };
vi.mock("../../src/firebase", () => ({ auth }));

describe("Family Preference Profile API operations", () => {
  let fetchMock;
  let api;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_URL", "https://api.invalid/");
    vi.stubEnv("VITE_API_BASE_URL", "https://admin.invalid/");
    auth.currentUser = null;
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

  it("retrieves saved profiles with a Firebase token and preserves the response", async () => {
    const profiles = [{ profile_id: "profile-1", profile_name: "Synthetic family" }];
    auth.currentUser = { getIdToken: vi.fn().mockResolvedValue("synthetic-token") };
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, profiles));

    await expect(api.getFamilyProfiles()).resolves.toEqual(profiles);
    expect(fetchMock).toHaveBeenCalledWith("https://api.invalid/api/v1/profile", {
      headers: { Accept: "application/json", Authorization: "Bearer synthetic-token" },
    });
  });

  it("creates a profile with the supplied JSON payload", async () => {
    const payload = {
      profile_name: "Synthetic family",
      service_type: "FULL_DAY",
      enrolment_month: "2027-03",
      cost_weight: 0.7,
      travel_weight: 0.3,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, { profile_id: "profile-2", ...payload }, 201));

    await expect(api.createFamilyProfile(payload)).resolves.toEqual({ profile_id: "profile-2", ...payload });
    expect(fetchMock).toHaveBeenCalledWith("https://api.invalid/api/v1/profile", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { Accept: "application/json", "Content-Type": "application/json" },
    });
  });

  it("updates an encoded profile identifier and returns the server response", async () => {
    const payload = { profile_name: "Edited synthetic family", cost_weight: 0.59, travel_weight: 0.41 };
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, { profile_id: "profile / 3", ...payload }));

    await expect(api.updateFamilyProfile("profile / 3", payload)).resolves.toEqual({ profile_id: "profile / 3", ...payload });
    expect(fetchMock).toHaveBeenCalledWith("https://api.invalid/api/v1/profile/profile%20%2F%203", {
      method: "PUT",
      body: JSON.stringify(payload),
      headers: { Accept: "application/json", "Content-Type": "application/json" },
    });
  });

  it("does not send an authorization header when there is no signed-in user", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, []));

    await api.getFamilyProfiles();

    expect(fetchMock.mock.calls[0][1]).toEqual({ headers: { Accept: "application/json" } });
  });

  it.each([401, 403, 404, 422, 500, 503])("surfaces profile API HTTP %i errors", async (status) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, { detail: `synthetic ${status}` }, status));

    await expect(api.getFamilyProfiles()).rejects.toThrow(`${status}: synthetic ${status}`);
  });

  it("propagates token acquisition and rejected fetch failures", async () => {
    auth.currentUser = { getIdToken: vi.fn().mockRejectedValue(new Error("synthetic token failure")) };
    await expect(api.getFamilyProfiles()).rejects.toThrow("synthetic token failure");
    expect(fetchMock).not.toHaveBeenCalled();

    auth.currentUser = null;
    fetchMock.mockRejectedValueOnce(new Error("synthetic network failure"));
    await expect(api.getFamilyProfiles()).rejects.toThrow("synthetic network failure");
  });

  it("returns null for an empty 204 response and rejects malformed JSON", async () => {
    fetchMock
      .mockResolvedValueOnce({ status: 204, ok: true, headers: new Headers() })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Headers({ "content-type": "text/plain" }),
        text: vi.fn().mockResolvedValue("synthetic text response"),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: vi.fn().mockRejectedValue(new SyntaxError("synthetic invalid JSON")),
      });

    await expect(api.updateFamilyProfile("profile-4", {})).resolves.toBeNull();
    await expect(api.getFamilyProfiles()).resolves.toBe("synthetic text response");
    await expect(api.getFamilyProfiles()).rejects.toThrow("synthetic invalid JSON");
  });
});
