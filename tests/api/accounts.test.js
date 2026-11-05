import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { failClosedFetch, jsonResponse } from "../support/fetch.js";

const auth = { currentUser: null };
vi.mock("../../src/firebase", () => ({ auth }));

describe("shared account request operations", () => {
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
    auth.currentUser = null;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reads the signed-in User profile through its exported operation", async () => {
    const profile = { id: "user-1", full_name: "Synthetic User" };
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, profile));

    await expect(api.getMyProfile()).resolves.toEqual(profile);
    expect(fetchMock).toHaveBeenCalledWith("https://api.invalid/api/v1/users/me", {
      headers: { Accept: "application/json" },
    });
  });

  it("creates a User profile with the supplied name", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, { id: "user-2" }, 201));

    await expect(api.createMyProfile("Synthetic Parent")).resolves.toEqual({ id: "user-2" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.invalid/api/v1/users/signup", {
      method: "POST",
      body: '{"full_name":"Synthetic Parent"}',
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
  });

  it("updates the current User profile with a partial payload", async () => {
    const payload = { full_name: "Updated Synthetic Parent" };
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, { id: "user-1", ...payload }));

    await expect(api.updateMyProfile(payload)).resolves.toEqual({ id: "user-1", ...payload });
    expect(fetchMock).toHaveBeenCalledWith("https://api.invalid/api/v1/users/me", {
      method: "PATCH",
      body: '{"full_name":"Updated Synthetic Parent"}',
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
  });

  it("rejects requests when the shared API base is missing", async () => {
    vi.stubEnv("VITE_API_URL", "");
    vi.resetModules();
    api = await import("../../src/api.js");

    await expect(api.getMyProfile()).rejects.toThrow("Configure VITE_API_URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates a token acquisition rejection before making a request", async () => {
    auth.currentUser = { getIdToken: vi.fn().mockRejectedValue(new Error("token unavailable")) };

    await expect(api.getMyProfile()).rejects.toThrow("token unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 422, 503])("surfaces a JSON HTTP error for status %i", async (status) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, { detail: "synthetic failure" }, status));

    await expect(api.getMyProfile()).rejects.toThrow(`${status}: synthetic failure`);
  });

  it("surfaces a text HTTP error", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 503,
      ok: false,
      headers: new Headers({ "content-type": "text/plain" }),
      text: vi.fn().mockResolvedValue("synthetic outage"),
    });

    await expect(api.getMyProfile()).rejects.toThrow("503: synthetic outage");
  });

  it("uses a JSON message when detail is absent and the generic text for non-string details", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(vi, { message: "synthetic message" }, 500))
      .mockResolvedValueOnce(jsonResponse(vi, { detail: { reason: "synthetic" } }, 500));

    await expect(api.getMyProfile()).rejects.toThrow("500: synthetic message");
    await expect(api.getMyProfile()).rejects.toThrow("500: API request failed");
  });

  it("exposes the current null-body HTTP error edge case", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, null, 500));

    await expect(api.getMyProfile()).rejects.toThrow("Cannot read properties of null");
  });

  it("parses JSON null and treats a 204 response as empty", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(vi, null))
      .mockResolvedValueOnce({ status: 204, ok: true, headers: new Headers() });

    await expect(api.getMyProfile()).resolves.toBeNull();
    await expect(api.getMyProfile()).resolves.toBeNull();
  });

  it("propagates JSON parse failures and rejected fetches", async () => {
    fetchMock
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: vi.fn().mockRejectedValue(new SyntaxError("invalid JSON")),
      })
      .mockRejectedValueOnce(new Error("offline"));

    await expect(api.getMyProfile()).rejects.toThrow("invalid JSON");
    await expect(api.getMyProfile()).rejects.toThrow("offline");
  });
});

describe("administrator request helper", () => {
  let fetchMock;
  let adminApi;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_URL", "https://api.invalid/");
    vi.stubEnv("VITE_API_BASE_URL", "https://admin.invalid///");
    auth.currentUser = null;
    fetchMock = failClosedFetch(vi);
    vi.stubGlobal("fetch", fetchMock);
    ({ adminApi } = await import("../../src/admin/adminApi.js"));
  });

  afterEach(() => {
    expect(fetchMock.unexpectedCalls).toEqual([]);
    auth.currentUser = null;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("requires a configured administrator API base", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    vi.resetModules();
    ({ adminApi } = await import("../../src/admin/adminApi.js"));

    await expect(adminApi("/users")).rejects.toThrow("VITE_API_BASE_URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a signed-in User before requesting administrator data", async () => {
    await expect(adminApi("/users")).rejects.toThrow("Please sign in again.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates administrator token acquisition failures", async () => {
    auth.currentUser = { getIdToken: vi.fn().mockRejectedValue(new Error("token unavailable")) };

    await expect(adminApi("/users")).rejects.toThrow("token unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the token and merged headers to the trimmed base URL", async () => {
    auth.currentUser = { getIdToken: vi.fn().mockResolvedValue("synthetic-admin-token") };
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, { items: [] }));

    await expect(adminApi("/users", {
      method: "POST",
      body: "{}",
      headers: { "X-Test-Header": "present" },
    })).resolves.toEqual({ items: [] });
    expect(fetchMock).toHaveBeenCalledWith("https://admin.invalid/users", {
      method: "POST",
      body: "{}",
      headers: {
        Authorization: "Bearer synthetic-admin-token",
        "Content-Type": "application/json",
        "X-Test-Header": "present",
      },
    });
  });

  it.each([
    [401, "401 Unauthorized: The backend rejected the authentication token."],
    [403, "403 Forbidden: Your account may not have the required ADMIN role."],
  ])("returns its administrator denial message for status %i", async (status, message) => {
    auth.currentUser = { getIdToken: vi.fn().mockResolvedValue("synthetic-token") };
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, { detail: "backend detail" }, status));

    await expect(adminApi("/users")).rejects.toThrow(message);
  });

  it.each([404, 422, 503])("uses the JSON detail for other HTTP status %i", async (status) => {
    auth.currentUser = { getIdToken: vi.fn().mockResolvedValue("synthetic-token") };
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, { detail: "synthetic failure" }, status));

    await expect(adminApi("/users")).rejects.toThrow("synthetic failure");
  });

  it("falls back when an administrator error body cannot be parsed", async () => {
    auth.currentUser = { getIdToken: vi.fn().mockResolvedValue("synthetic-token") };
    fetchMock.mockResolvedValueOnce({
      status: 500,
      ok: false,
      headers: new Headers({ "content-type": "application/json" }),
      json: vi.fn().mockRejectedValue(new SyntaxError("invalid JSON")),
    });

    await expect(adminApi("/users")).rejects.toThrow("Request failed (500).");
  });

  it("serializes non-string administrator error details and falls back without a detail", async () => {
    auth.currentUser = { getIdToken: vi.fn().mockResolvedValue("synthetic-token") };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(vi, { detail: { reason: "synthetic" } }, 422))
      .mockResolvedValueOnce(jsonResponse(vi, { message: "synthetic body" }, 500));

    await expect(adminApi("/users")).rejects.toThrow('{"reason":"synthetic"}');
    await expect(adminApi("/users")).rejects.toThrow('{"message":"synthetic body"}');
  });

  it("returns JSON success data and null for text and 204 responses", async () => {
    auth.currentUser = { getIdToken: vi.fn().mockResolvedValue("synthetic-token") };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(vi, { items: [] }))
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Headers({ "content-type": "text/plain" }),
        text: vi.fn().mockResolvedValue("ignored by current helper"),
      })
      .mockResolvedValueOnce({ status: 204, ok: true, headers: new Headers() });

    await expect(adminApi("/users")).resolves.toEqual({ items: [] });
    await expect(adminApi("/text")).resolves.toBeNull();
    await expect(adminApi("/empty")).resolves.toBeNull();
  });

  it("propagates a JSON parse failure from a successful administrator response", async () => {
    auth.currentUser = { getIdToken: vi.fn().mockResolvedValue("synthetic-token") };
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: vi.fn().mockRejectedValue(new SyntaxError("invalid JSON")),
    });

    await expect(adminApi("/users")).rejects.toThrow("invalid JSON");
  });

  it("maps a rejected fetch to the administrator connectivity message", async () => {
    auth.currentUser = { getIdToken: vi.fn().mockResolvedValue("synthetic-token") };
    fetchMock.mockRejectedValueOnce(new Error("offline"));

    await expect(adminApi("/users")).rejects.toThrow("Cannot reach the backend.");
  });
});
