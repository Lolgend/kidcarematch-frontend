import { describe, expect, it } from "vitest";
import { centreDetailsPath, centreIdFromPath } from "../src/centreDetailsRoute.js";

describe("centre details URL", () => {
  it("uses only the canonical centre ID in the shareable path", () => {
    expect(centreDetailsPath("centre/42")).toBe("/centres/centre%2F42");
    expect(centreIdFromPath("/centres/centre%2F42")).toBe("centre/42");
  });

  it("does not treat other paths as centre details", () => {
    expect(centreIdFromPath("/centres")).toBeNull();
    expect(centreIdFromPath("/centres/" )).toBeNull();
    expect(centreIdFromPath("/profile")).toBeNull();
  });
});
