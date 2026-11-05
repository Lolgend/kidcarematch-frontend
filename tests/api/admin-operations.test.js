import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { failClosedFetch, jsonResponse } from "../support/fetch.js";

const auth = { currentUser: null };
vi.mock("../../src/firebase", () => ({ auth }));

describe("Administrator dashboard operation contracts", () => {
  let fetchMock;
  let adminApi;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE_URL", "https://admin.invalid/");
    auth.currentUser = { getIdToken: vi.fn().mockResolvedValue("synthetic-admin-token") };
    fetchMock = failClosedFetch(vi);
    vi.stubGlobal("fetch", fetchMock);
    ({ adminApi } = await import("../../src/admin/adminApi.js"));
  });

  afterEach(() => {
    expect(fetchMock.unexpectedCalls).toEqual([]);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses the dashboard's named users, Review, source, subsidy and logout contracts", async () => {
    const userBody = { full_name: "Synthetic Admin User", role: "PARENT" };
    const subsidyBody = { rule_id: "rule-1", subsidy_name: "Synthetic rule", income_min: 100 };
    const operations = [
      ["admin access gate", "/admin/users?limit=1&offset=0", undefined],
      ["user search, role filter and pagination", "/admin/users?limit=50&offset=0&query=synthetic+user&role=ADMIN", undefined],
      ["user list page reload", "/admin/users?limit=50&offset=0", undefined],
      ["Review list page reload", "/admin/reviews?limit=50&offset=0", undefined],
      ["source health list", "/admin/status", undefined],
      ["subsidy rule list", "/admin/subsidy-rules", undefined],
      ["Review permanent deletion", "/admin/reviews/review%20%2F%201", { method: "DELETE" }],
      ["source health refresh", "/admin/status/refresh", { method: "POST" }],
      ["ECDA synchronization", "/admin/sync/ecda", { method: "POST" }],
      ["user profile and role update", "/admin/users/user%20%2F%201", { method: "PUT", body: JSON.stringify(userBody) }],
      ["user suspension", "/admin/users/user-1/deactivate", { method: "PATCH" }],
      ["user reactivation", "/admin/users/user-1/reactivate", { method: "PATCH" }],
      ["user deletion", "/admin/users/user-1", { method: "DELETE" }],
      ["subsidy rule creation", "/admin/subsidy-rules", { method: "POST", body: JSON.stringify(subsidyBody) }],
      ["subsidy rule update", "/admin/subsidy-rules/rule%20%2F%201", { method: "PUT", body: JSON.stringify(subsidyBody) }],
      ["subsidy rule deletion", "/admin/subsidy-rules/rule-1", { method: "DELETE" }],
      ["sign-out request", "/admin/auth/logout", { method: "POST" }],
    ];
    for (const [name] of operations) fetchMock.mockResolvedValueOnce(jsonResponse(vi, { operation: name }));

    for (const [name, path, options] of operations) {
      await expect(adminApi(path, options)).resolves.toEqual({ operation: name });
    }

    expect(fetchMock).toHaveBeenCalledTimes(operations.length);
    operations.forEach(([name, path, options], index) => {
      const expectedOptions = {
        ...(options || {}),
        headers: {
          Authorization: "Bearer synthetic-admin-token",
          ...(options?.body ? { "Content-Type": "application/json" } : {}),
        },
      };
      expect(fetchMock).toHaveBeenNthCalledWith(index + 1, `https://admin.invalid${path}`, expectedOptions);
    });
  });

  it("does not issue requests for a signed-out administrator operation", async () => {
    auth.currentUser = null;

    await expect(adminApi("/admin/users?limit=1&offset=0")).rejects.toThrow("Please sign in again.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
