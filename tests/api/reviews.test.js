import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { failClosedFetch, jsonResponse } from "../support/fetch.js";

const auth = { currentUser: null };
vi.mock("../../src/firebase", () => ({ auth }));

describe("Review and report API operations", () => {
  let fetchMock;
  let api;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_URL", "https://api.invalid/");
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

  it("lists public centre Reviews with pagination and an encoded centre id", async () => {
    const result = { items: [{ review_id: "review-a", rating: 5, comment: "Synthetic text" }], total: 1 };
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, result));

    await expect(api.getCentreReviews("centre / 7", { limit: 10, offset: 20 })).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledWith("https://api.invalid/api/v1/centres/centre%20%2F%207/reviews?limit=10&offset=20", {
      headers: { Accept: "application/json" },
    });
  });

  it("retrieves the signed-in user's own Review for a centre and preserves pending state", async () => {
    auth.currentUser = { getIdToken: vi.fn().mockResolvedValue("synthetic-token") };
    const review = { review_id: "own-review", moderation_status: "PENDING", review_description: "Synthetic text" };
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, review));

    await expect(api.getMyReview("centre-7")).resolves.toEqual(review);
    expect(fetchMock).toHaveBeenCalledWith("https://api.invalid/api/v1/centres/centre-7/reviews/mine", {
      headers: { Accept: "application/json", Authorization: "Bearer synthetic-token" },
    });
  });

  it("submits a centre Review using the supplied JSON body", async () => {
    const payload = { rating: 5, review_description: "Synthetic positive experience" };
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, { review_id: "created-review", ...payload, moderation_status: "PENDING" }, 201));

    await expect(api.submitReview("centre-7", payload)).resolves.toEqual({ review_id: "created-review", ...payload, moderation_status: "PENDING" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.invalid/api/v1/centres/centre-7/reviews", {
      method: "POST", body: JSON.stringify(payload), headers: { Accept: "application/json", "Content-Type": "application/json" },
    });
  });

  it("reports a Review with an encoded id and returns the server acknowledgement", async () => {
    const payload = { reason: "SYNTHETIC_REASON", details: "Synthetic report" };
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, { report_id: "report-1", status: "RECEIVED" }, 202));

    await expect(api.reportReview("review / 8", payload)).resolves.toEqual({ report_id: "report-1", status: "RECEIVED" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.invalid/api/v1/reviews/review%20%2F%208/reports", {
      method: "POST", body: JSON.stringify(payload), headers: { Accept: "application/json", "Content-Type": "application/json" },
    });
  });

  it("lists the current user's Reviews with pagination and preserves partial records", async () => {
    const partial = { review_id: "own-2", rating: 4 };
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, { items: [partial], total: 3 }));

    await expect(api.getMyReviews({ limit: 2, offset: 1 })).resolves.toEqual({ items: [partial], total: 3 });
    expect(fetchMock).toHaveBeenCalledWith("https://api.invalid/api/v1/reviews/me?limit=2&offset=1", { headers: { Accept: "application/json" } });
  });

  it("updates and deletes an owned Review through their exposed routes", async () => {
    const payload = { rating: 3, review_description: "Edited synthetic text" };
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, { review_id: "review / 9", ...payload }));
    await expect(api.updateReview("review / 9", payload)).resolves.toEqual({ review_id: "review / 9", ...payload });
    expect(fetchMock).toHaveBeenLastCalledWith("https://api.invalid/api/v1/reviews/review%20%2F%209", {
      method: "PATCH", body: JSON.stringify(payload), headers: { Accept: "application/json", "Content-Type": "application/json" },
    });

    fetchMock.mockResolvedValueOnce({ status: 204, ok: true, headers: new Headers() });
    await expect(api.deleteReview("review / 9")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenLastCalledWith("https://api.invalid/api/v1/reviews/review%20%2F%209", {
      method: "DELETE", headers: { Accept: "application/json" },
    });
  });

  it.each([401, 403, 404, 422, 500, 503])("surfaces Review/report HTTP %i failures for the calling feature", async (status) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, { detail: `synthetic ${status}` }, status));
    await expect(api.reportReview("review-1", { reason: "SYNTHETIC_REASON" })).rejects.toThrow(`${status}: synthetic ${status}`);
  });

  it("propagates token, rejected-fetch and malformed-response errors without retrying writes", async () => {
    auth.currentUser = { getIdToken: vi.fn().mockRejectedValue(new Error("synthetic token failure")) };
    await expect(api.submitReview("centre-7", { rating: 5 })).rejects.toThrow("synthetic token failure");
    expect(fetchMock).not.toHaveBeenCalled();

    auth.currentUser = null;
    fetchMock.mockRejectedValueOnce(new Error("synthetic network failure"));
    await expect(api.reportReview("review-1", { reason: "SYNTHETIC_REASON" })).rejects.toThrow("synthetic network failure");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce({ status: 200, ok: true, headers: new Headers({ "content-type": "application/json" }), json: vi.fn().mockRejectedValue(new SyntaxError("synthetic invalid JSON")) });
    await expect(api.getMyReviews()).rejects.toThrow("synthetic invalid JSON");
  });

  it("supports text error responses and leaves validation/malformed success assessment to callers", async () => {
    fetchMock.mockResolvedValueOnce({ status: 422, ok: false, headers: new Headers({ "content-type": "text/plain" }), text: vi.fn().mockResolvedValue("synthetic validation failure") });
    await expect(api.submitReview("centre-7", { rating: 9 })).rejects.toThrow("422: synthetic validation failure");

    const partial = { review_id: "review-without-enrichment" };
    fetchMock.mockResolvedValueOnce(jsonResponse(vi, partial));
    await expect(api.getCentreReviews("centre-7")).resolves.toEqual(partial);
  });
});
