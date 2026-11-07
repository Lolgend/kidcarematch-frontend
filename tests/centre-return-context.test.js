import { afterEach, describe, expect, it } from "vitest";
import { loadCentreReturnContext, protectCentreReturnQuery, restoreCentreReturnQuery, saveCentreReturnContext } from "../src/centreReturnContext.js";

const previousWindow = globalThis.window;

afterEach(() => {
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
});

describe("centre return query privacy", () => {
  it("restores postcode searches from the current saved profile without storing the postcode", () => {
    const values = new Map();
    const sessionStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    };
    globalThis.window = { sessionStorage };
    const profile = { home: "123456", work: "345678" };
    const originalQuery = "123456 near 345678";
    const origin = { id: "origin-1", uid: "user-1", query: protectCentreReturnQuery(originalQuery, profile) };

    saveCentreReturnContext(origin);
    const stored = JSON.stringify([...values.values()]);
    const restored = loadCentreReturnContext("user-1", "origin-1");

    expect(stored).not.toContain("123456");
    expect(stored).not.toContain("345678");
    expect(restoreCentreReturnQuery(restored, profile)).toBe(originalQuery);
    expect(restoreCentreReturnQuery(restored, { home: "654321", work: "987654" })).toBe("654321 near 987654");
  });

  it("fails closed when a stored home or workplace reference cannot be resolved", () => {
    const protectedQuery = protectCentreReturnQuery("near 123456", { home: "123456" });
    expect(restoreCentreReturnQuery({ query: protectedQuery }, null)).toBe("");
  });
});
