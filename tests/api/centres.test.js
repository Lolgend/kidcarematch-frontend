import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { failClosedFetch, jsonResponse } from "../support/fetch.js";

const auth = { currentUser: null };
vi.mock("../../src/firebase", () => ({ auth }));

describe("shared API request harness", () => {
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

  it("sends the expected directory filters and returns centres", async () => {
    const centres = [{ id: "centre-1", name: "Synthetic Centre" }];
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, centres));

    await expect(api.getCentres({ district: "Central", page: 2, limit: 10 }))
      .resolves.toEqual(centres);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.invalid/api/v1/centres?district=Central&page=2&limit=10",
      { headers: { Accept: "application/json" } },
    );
  });

  it("merges JSON request headers and adds a synthetic Firebase token", async () => {
    auth.currentUser = { getIdToken: vi.fn().mockResolvedValue("synthetic-token") };
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, { accepted: true }));

    await api.apiRequest("/synthetic", {
      method: "POST",
      body: JSON.stringify({ source: "fixture" }),
      headers: { "X-Test-Header": "present" },
    });

    expect(fetchMock).toHaveBeenCalledWith("https://api.invalid/synthetic", {
      method: "POST",
      body: '{"source":"fixture"}',
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Test-Header": "present",
        Authorization: "Bearer synthetic-token",
      },
    });
  });

  it("reads text responses and treats 204 as an empty result", async () => {
    fetchMock
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Headers({ "content-type": "text/plain" }),
        text: vi.fn().mockResolvedValue("synthetic response"),
      })
      .mockResolvedValueOnce({ status: 204, ok: true, headers: new Headers() });

    await expect(api.apiRequest("/text")).resolves.toBe("synthetic response");
    await expect(api.apiRequest("/empty")).resolves.toBeNull();
  });

  it("repeats array filters and omits empty values", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, []));

    await api.getCentres({ district: ["Central", "East Side"], q: "", offset: null });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.invalid/api/v1/centres?district=Central&district=East+Side",
    );
  });

  it("returns an empty result for an empty directory response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, []));

    await expect(api.getCentres({ query: "no matching synthetic result" })).resolves.toEqual([]);
  });

  it("fetches districts and summary through their exported operations", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(vi, ["Central", "East Side"]))
      .mockResolvedValueOnce(jsonResponse(vi, { total: 2 }));

    await expect(api.getDistricts()).resolves.toEqual(["Central", "East Side"]);
    await expect(api.getCentreSummary()).resolves.toEqual({ total: 2 });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.invalid/api/v1/centres/districts",
      "https://api.invalid/api/v1/centres/summary",
    ]);
  });

  it("encodes centre identifiers and codes as one path segment", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(vi, { id: "A/B" }))
      .mockResolvedValueOnce(jsonResponse(vi, { code: "C D" }));

    await api.getCentreById("A/B");
    await api.getCentreByCode("C D");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.invalid/api/v1/centres/A%2FB",
      "https://api.invalid/api/v1/centres/code/C%20D",
    ]);
  });

  it("returns partial centre data without reshaping it", async () => {
    const partial = { id: "centre-2", name: "Partial fixture" };
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, partial));

    await expect(api.getCentreById("centre-2")).resolves.toEqual(partial);
  });

  it("surfaces an HTTP error returned by directory search", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, { detail: "temporarily unavailable" }, 503));

    await expect(api.getCentres()).rejects.toThrow("503: temporarily unavailable");
  });
});
