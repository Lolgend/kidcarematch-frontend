import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { failClosedFetch, jsonResponse } from "../support/fetch.js";

const auth = { currentUser: null };
vi.mock("../../src/firebase", () => ({ auth }));

describe("watchlist and notification API wrappers", () => {
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

  it("uses the documented default page sizes for watchlist and notifications", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(vi, { items: [], total: 0 }))
      .mockResolvedValueOnce(jsonResponse(vi, { items: [], unread_count: 0 }));

    await api.getMyWatchlist();
    await api.getNotifications();

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.invalid/api/v1/watchlist/me?limit=100",
      "https://api.invalid/api/v1/notifications?limit=20",
    ]);
    expect(fetchMock.mock.calls.map(([, options]) => options.headers)).toEqual([
      { Accept: "application/json" },
      { Accept: "application/json" },
    ]);
  });

  it("encodes custom and repeated query values while omitting empty pagination values", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(vi, { items: [], total: 0 }))
      .mockResolvedValueOnce(jsonResponse(vi, { items: [], unread_count: 0 }));

    await api.getMyWatchlist({ limit: 25, offset: 50, status: ["open", "limited"], cursor: "" });
    await api.getNotifications({ limit: 7, offset: 14, category: ["vacancy alert", "centre/1"] });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.invalid/api/v1/watchlist/me?limit=25&offset=50&status=open&status=limited",
      "https://api.invalid/api/v1/notifications?limit=7&offset=14&category=vacancy+alert&category=centre%2F1",
    ]);
  });

  it("creates a cohort watchlist entry with an authenticated JSON request", async () => {
    auth.currentUser = { getIdToken: vi.fn().mockResolvedValue("synthetic-user-token") };
    const entry = {
      watchlist_id: "watch-1",
      user_id: "synthetic-user",
      centre_id: 37,
      level: "n1",
      enrollment_month_year: "2026-12-01T00:00:00Z",
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, entry, 201));

    await expect(api.createWatchlist({
      centre_id: 37,
      level: "n1",
      enrollment_month_year: "2026-12-01T00:00:00Z",
    })).resolves.toEqual(entry);

    expect(fetchMock).toHaveBeenCalledWith("https://api.invalid/api/v1/watchlist", {
      method: "POST",
      body: '{"centre_id":37,"level":"n1","enrollment_month_year":"2026-12-01T00:00:00Z"}',
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: "Bearer synthetic-user-token",
      },
    });
    expect(auth.currentUser.getIdToken).toHaveBeenCalledOnce();
  });

  it("attaches the signed-in Firebase token to watchlist and notification reads", async () => {
    auth.currentUser = { getIdToken: vi.fn().mockResolvedValue("synthetic-user-token") };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(vi, { items: [], total: 0 }))
      .mockResolvedValueOnce(jsonResponse(vi, { items: [], unread_count: 0 }));

    await api.getMyWatchlist();
    await api.getNotifications();

    expect(fetchMock.mock.calls.map(([, options]) => options.headers.Authorization)).toEqual([
      "Bearer synthetic-user-token",
      "Bearer synthetic-user-token",
    ]);
    expect(auth.currentUser.getIdToken).toHaveBeenCalledTimes(2);
  });

  it("deletes one encoded watchlist entry and treats 204 as an empty result", async () => {
    fetchMock.mockResolvedValueOnce({ status: 204, ok: true, headers: new Headers() });

    await expect(api.deleteWatchlist("watch/id 2")).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledWith("https://api.invalid/api/v1/watchlist/watch%2Fid%202", {
      method: "DELETE",
      headers: { Accept: "application/json" },
    });
  });

  it("preserves the backend duplicate-subscription conflict for caller reconciliation", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, { detail: "already subscribed" }, 409));

    await expect(api.createWatchlist({ centre_id: 37, level: "n1" }))
      .rejects.toThrow("409: already subscribed");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.invalid/api/v1/watchlist");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });

  it("reads and marks individual and all server notifications through their exported operations", async () => {
    const page = { items: [{ notification_id: "note/1", is_read: false }], unread_count: 1 };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(vi, page))
      .mockResolvedValueOnce(jsonResponse(vi, { notification_id: "note/1", is_read: true }))
      .mockResolvedValueOnce(jsonResponse(vi, { updated: 1 }));

    await expect(api.getNotifications({})).resolves.toEqual(page);
    await expect(api.markNotificationRead("note/1")).resolves.toEqual({ notification_id: "note/1", is_read: true });
    await expect(api.markAllNotificationsRead()).resolves.toEqual({ updated: 1 });

    expect(fetchMock.mock.calls.map(([url, options]) => [url, options])).toEqual([
      ["https://api.invalid/api/v1/notifications", { headers: { Accept: "application/json" } }],
      ["https://api.invalid/api/v1/notifications/note%2F1/read", { method: "POST", headers: { Accept: "application/json" } }],
      ["https://api.invalid/api/v1/notifications/read-all", { method: "POST", headers: { Accept: "application/json" } }],
    ]);
  });

  it.each([
    ["401", 401, { detail: "authentication required" }],
    ["403", 403, { detail: "access denied" }],
    ["404", 404, { detail: "route not found" }],
    ["409", 409, { detail: "already subscribed" }],
    ["422", 422, { detail: "invalid cohort" }],
    ["500", 500, { message: "server failure" }],
    ["503", 503, "temporarily unavailable"],
  ])("surfaces a %s response from supported watchlist and notification calls", async (_label, status, body) => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(vi, body, status))
      .mockResolvedValueOnce(jsonResponse(vi, body, status));

    await expect(api.getMyWatchlist({ limit: 1 })).rejects.toThrow(`${status}: ${typeof body === "string" ? body : body.detail || body.message}`);
    await expect(api.getNotifications({ limit: 1 })).rejects.toThrow(`${status}: ${typeof body === "string" ? body : body.detail || body.message}`);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.invalid/api/v1/watchlist/me?limit=1",
      "https://api.invalid/api/v1/notifications?limit=1",
    ]);
  });

  it("surfaces rejected create, delete, individual-read, and read-all writes", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(vi, { detail: "invalid cohort" }, 422))
      .mockResolvedValueOnce(jsonResponse(vi, { detail: "entry not found" }, 404))
      .mockResolvedValueOnce(jsonResponse(vi, { detail: "read unavailable" }, 503))
      .mockResolvedValueOnce(jsonResponse(vi, { detail: "read-all unavailable" }, 500));

    await expect(api.createWatchlist({ centre_id: 0 })).rejects.toThrow("422: invalid cohort");
    await expect(api.deleteWatchlist("missing-entry")).rejects.toThrow("404: entry not found");
    await expect(api.markNotificationRead("missing-notification")).rejects.toThrow("503: read unavailable");
    await expect(api.markAllNotificationsRead()).rejects.toThrow("500: read-all unavailable");

    expect(fetchMock.mock.calls.map(([url, options]) => [url, options.method])).toEqual([
      ["https://api.invalid/api/v1/watchlist", "POST"],
      ["https://api.invalid/api/v1/watchlist/missing-entry", "DELETE"],
      ["https://api.invalid/api/v1/notifications/missing-notification/read", "POST"],
      ["https://api.invalid/api/v1/notifications/read-all", "POST"],
    ]);
  });

  it("does not send a protected request when token retrieval rejects", async () => {
    auth.currentUser = { getIdToken: vi.fn().mockRejectedValue(new Error("token unavailable")) };

    await expect(api.createWatchlist({ centre_id: 37, level: "n1" })).rejects.toThrow("token unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates rejected fetch and JSON parse failures without fabricating a response", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: vi.fn().mockRejectedValue(new SyntaxError("invalid JSON")),
      });

    await expect(api.getMyWatchlist()).rejects.toThrow("network unavailable");
    await expect(api.getNotifications()).rejects.toThrow("invalid JSON");
  });

  it("passes through partial and malformed successful payloads for callers to assess", async () => {
    const partialWatchlist = { items: [{ watchlist_id: "legacy-entry" }] };
    const malformedNotifications = { items: null, unread_count: "unknown" };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(vi, partialWatchlist))
      .mockResolvedValueOnce(jsonResponse(vi, malformedNotifications));

    await expect(api.getMyWatchlist()).resolves.toEqual(partialWatchlist);
    await expect(api.getNotifications()).resolves.toEqual(malformedNotifications);
  });
});
