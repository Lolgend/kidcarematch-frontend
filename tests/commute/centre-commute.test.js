import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children, center, zoom, style }) =>
    React.createElement(
      "div",
      {
        "data-testid": "mock-map-container",
        "data-center": JSON.stringify(center),
        "data-zoom": zoom,
        style,
      },
      children
    ),
  TileLayer: ({ url, attribution }) =>
    React.createElement("div", {
      "data-testid": "mock-tile-layer",
      "data-url": url,
      "data-attribution": attribution,
    }),
  Marker: ({ children, position }) =>
    React.createElement(
      "div",
      {
        "data-testid": "mock-marker",
        "data-position": JSON.stringify(position),
      },
      children
    ),
  Popup: ({ children }) =>
    React.createElement("div", { "data-testid": "mock-popup" }, children),
  Polyline: ({ positions, pathOptions }) =>
    React.createElement("div", {
      "data-testid": "mock-polyline",
      "data-positions": JSON.stringify(positions),
      "data-options": JSON.stringify(pathOptions),
    }),
}));
vi.mock("leaflet/dist/leaflet.css", () => ({}));

import { CentreCommuteView } from "../../src/commute/CentreCommute.jsx";

describe("CentreCommute presentation", () => {
  it("renders guest prompt when user is not signed in", () => {
    const html = renderToStaticMarkup(
      React.createElement(CentreCommuteView, {
        currentUser: null,
        profileId: null,
        centre: { id: 101, name: "Star Preschool" },
        loading: false,
        data: null,
      })
    );

    expect(html).toContain("Sign in to see personalised commute routes");
  });

  it("renders profile setup prompt when signed in parent has no profileId", () => {
    const html = renderToStaticMarkup(
      React.createElement(CentreCommuteView, {
        currentUser: { uid: "u1" },
        profileId: null,
        centre: { id: 101, name: "Star Preschool" },
        loading: false,
        data: null,
      })
    );

    expect(html).toContain("finish setting up your family profile");
    expect(html).toContain("Edit family profile");
  });

  it("renders loading indicator when commute is fetching", () => {
    const html = renderToStaticMarkup(
      React.createElement(CentreCommuteView, {
        currentUser: { uid: "u1" },
        profileId: "prof-1",
        centre: { id: 101, name: "Star Preschool" },
        loading: true,
        data: null,
      })
    );

    expect(html).toContain("Loading commute route…");
  });

  it("renders single-leg driving commute with markers, polyline, and totals", () => {
    const data = {
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
              geometry: [
                { lat: 1.3, lng: 103.8 },
                { lat: 1.35, lng: 103.85 },
              ],
            },
          ],
          totals: { duration_seconds: 600, distance_meters: 5000 },
        },
      ],
    };

    const html = renderToStaticMarkup(
      React.createElement(CentreCommuteView, {
        currentUser: { uid: "u1" },
        profileId: "prof-1",
        centre: { id: 101, name: "Star Preschool" },
        loading: false,
        data,
      })
    );

    expect(html).toContain("mock-map-container");
    expect(html).toContain("Home");
    expect(html).toContain("Star Preschool");
    expect(html).toContain("10 mins");
    expect(html).toContain("5.0 km");
    expect(html).toContain("Total travel: 10 mins (5.0 km)");
    expect(html).toContain("Excludes time spent at the centre");
  });

  it("renders two-leg driving commute with distinct line styles and combined totals", () => {
    const data = {
      centre_id: 101,
      profile_id: "prof-1",
      mode: "drive",
      anchors: {
        home: { lat: 1.3, lng: 103.8 },
        centre: { lat: 1.35, lng: 103.85 },
        workplace: { lat: 1.28, lng: 103.85 },
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
            {
              from_anchor: "centre",
              to_anchor: "workplace",
              status: "available",
              source: "onemap",
              duration_seconds: 900,
              distance_meters: 7000,
              geometry: [
                { lat: 1.35, lng: 103.85 },
                { lat: 1.28, lng: 103.85 },
              ],
            },
          ],
          totals: { duration_seconds: 1500, distance_meters: 12000 },
        },
      ],
    };

    const html = renderToStaticMarkup(
      React.createElement(CentreCommuteView, {
        currentUser: { uid: "u1" },
        profileId: "prof-1",
        centre: { id: 101, name: "Star Preschool" },
        loading: false,
        data,
      })
    );

    expect(html).toContain("Home");
    expect(html).toContain("Workplace");
    expect(html).toContain("Leg 1: Home → Centre");
    expect(html).toContain("Leg 2: Centre → Workplace");
    expect(html).toContain("Total travel: 25 mins (12.0 km)");
    // Leg 1 is solid (#2563eb), Leg 2 is dashed (#059669)
    expect(html).toContain("#2563eb");
    expect(html).toContain("#059669");
  });

  it("withholds complete totals and shows retry when a leg is unavailable", () => {
    const data = {
      centre_id: 101,
      profile_id: "prof-1",
      mode: "drive",
      anchors: {
        home: { lat: 1.3, lng: 103.8 },
        centre: { lat: 1.35, lng: 103.85 },
        workplace: { lat: 1.28, lng: 103.85 },
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
              geometry: [{ lat: 1.3, lng: 103.8 }],
            },
            {
              from_anchor: "centre",
              to_anchor: "workplace",
              status: "unavailable",
              source: null,
              duration_seconds: null,
              distance_meters: null,
              geometry: null,
              message: "Route unavailable",
            },
          ],
          totals: null,
        },
      ],
    };

    const html = renderToStaticMarkup(
      React.createElement(CentreCommuteView, {
        currentUser: { uid: "u1" },
        profileId: "prof-1",
        centre: { id: 101, name: "Star Preschool" },
        loading: false,
        data,
      })
    );

    expect(html).toContain("Route unavailable for Centre → Workplace");
    expect(html).toContain("Complete journey totals unavailable");
    expect(html).not.toContain("Total travel: ");
    expect(html).toContain("Retry route");
  });

  it("shows edit profile action when home postal could not be resolved", () => {
    const data = {
      centre_id: 101,
      profile_id: "prof-1",
      mode: "drive",
      anchors: {
        home: null,
        centre: { lat: 1.35, lng: 103.85 },
      },
      samples: [
        {
          kind: "single",
          legs: [
            {
              from_anchor: "home",
              to_anchor: "centre",
              status: "unavailable",
              message: "Home postal code could not be resolved",
            },
          ],
          totals: null,
        },
      ],
    };

    const html = renderToStaticMarkup(
      React.createElement(CentreCommuteView, {
        currentUser: { uid: "u1" },
        profileId: "prof-1",
        centre: { id: 101, name: "Star Preschool" },
        loading: false,
        data,
      })
    );

    expect(html).toContain("Home postal code could not be resolved");
    expect(html).toContain("Edit family profile");
  });

  it("renders travel mode selector with Driving, Transit, Walking, and Cycling radio controls", () => {
    const html = renderToStaticMarkup(
      React.createElement(CentreCommuteView, {
        currentUser: { uid: "u1" },
        profileId: "prof-1",
        centre: { id: 101, name: "Star Preschool" },
        loading: false,
        data: { anchors: {}, samples: [] },
        mode: "walk",
      })
    );

    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Travel mode"');
    expect(html).toContain("Driving");
    expect(html).toContain("Transit");
    expect(html).toContain("Walking");
    expect(html).toContain("Cycling");
    expect(html).toContain('role="radio" aria-checked="true" class="commute-mode-btn active">Walking');
    expect(html).toContain('role="radio" aria-checked="false" class="commute-mode-btn ">Driving');
    expect(html).toContain('role="radio" aria-checked="false" class="commute-mode-btn ">Cycling');
  });

  it("renders single-leg walking commute with actual metrics, geometry, and totals", () => {
    const data = {
      centre_id: 101,
      profile_id: "prof-1",
      mode: "walk",
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
              duration_seconds: 2700,
              distance_meters: 3500,
              geometry: [
                { lat: 1.3, lng: 103.8 },
                { lat: 1.35, lng: 103.85 },
              ],
            },
          ],
          totals: { duration_seconds: 2700, distance_meters: 3500 },
        },
      ],
    };

    const html = renderToStaticMarkup(
      React.createElement(CentreCommuteView, {
        currentUser: { uid: "u1" },
        profileId: "prof-1",
        centre: { id: 101, name: "Star Preschool" },
        loading: false,
        data,
        mode: "walk",
      })
    );

    expect(html).toContain("mock-map-container");
    expect(html).toContain("Home");
    expect(html).toContain("Star Preschool");
    expect(html).toContain("45 mins");
    expect(html).toContain("3.5 km");
    expect(html).toContain("Total travel: 45 mins (3.5 km)");
    expect(html).toContain("Excludes time spent at the centre");
    expect(html).toContain('role="radio" aria-checked="true" class="commute-mode-btn active">Walking');
  });

  it("renders single-leg cycling commute with actual metrics, geometry, and totals", () => {
    const data = {
      centre_id: 101,
      profile_id: "prof-1",
      mode: "cycle",
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
              duration_seconds: 900,
              distance_meters: 3700,
              geometry: [
                { lat: 1.3, lng: 103.8 },
                { lat: 1.35, lng: 103.85 },
              ],
            },
          ],
          totals: { duration_seconds: 900, distance_meters: 3700 },
        },
      ],
    };

    const html = renderToStaticMarkup(
      React.createElement(CentreCommuteView, {
        currentUser: { uid: "u1" },
        profileId: "prof-1",
        centre: { id: 101, name: "Star Preschool" },
        loading: false,
        data,
        mode: "cycle",
      })
    );

    expect(html).toContain("mock-map-container");
    expect(html).toContain("15 mins");
    expect(html).toContain("3.7 km");
    expect(html).toContain("Total travel: 15 mins (3.7 km)");
    expect(html).toContain('role="radio" aria-checked="true" class="commute-mode-btn active">Cycling');
  });

  it("renders two-leg walking commute through centre with combined totals and distinct styling", () => {
    const data = {
      centre_id: 101,
      profile_id: "prof-1",
      mode: "walk",
      anchors: {
        home: { lat: 1.3, lng: 103.8 },
        centre: { lat: 1.35, lng: 103.85 },
        workplace: { lat: 1.28, lng: 103.85 },
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
              duration_seconds: 1800,
              distance_meters: 2500,
              geometry: [
                { lat: 1.3, lng: 103.8 },
                { lat: 1.35, lng: 103.85 },
              ],
            },
            {
              from_anchor: "centre",
              to_anchor: "workplace",
              status: "available",
              source: "onemap",
              duration_seconds: 2400,
              distance_meters: 3200,
              geometry: [
                { lat: 1.35, lng: 103.85 },
                { lat: 1.28, lng: 103.85 },
              ],
            },
          ],
          totals: { duration_seconds: 4200, distance_meters: 5700 },
        },
      ],
    };

    const html = renderToStaticMarkup(
      React.createElement(CentreCommuteView, {
        currentUser: { uid: "u1" },
        profileId: "prof-1",
        centre: { id: 101, name: "Star Preschool" },
        loading: false,
        data,
        mode: "walk",
      })
    );

    expect(html).toContain("Leg 1: Home → Centre");
    expect(html).toContain("30 mins (2.5 km)");
    expect(html).toContain("Leg 2: Centre → Workplace");
    expect(html).toContain("40 mins (3.2 km)");
    expect(html).toContain("Total travel: 1 hr 10 mins (5.7 km)");
    expect(html).toContain("#2563eb");
    expect(html).toContain("#059669");
  });

  it("withholds totals and offers retry for partial cycling journey failure", () => {
    const data = {
      centre_id: 101,
      profile_id: "prof-1",
      mode: "cycle",
      anchors: {
        home: { lat: 1.3, lng: 103.8 },
        centre: { lat: 1.35, lng: 103.85 },
        workplace: { lat: 1.28, lng: 103.85 },
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
              distance_meters: 3000,
              geometry: [{ lat: 1.3, lng: 103.8 }],
            },
            {
              from_anchor: "centre",
              to_anchor: "workplace",
              status: "unavailable",
              source: null,
              duration_seconds: null,
              distance_meters: null,
              geometry: null,
              message: "Route unavailable",
            },
          ],
          totals: null,
        },
      ],
    };

    const html = renderToStaticMarkup(
      React.createElement(CentreCommuteView, {
        currentUser: { uid: "u1" },
        profileId: "prof-1",
        centre: { id: 101, name: "Star Preschool" },
        loading: false,
        data,
        mode: "cycle",
      })
    );

    expect(html).toContain("10 mins (3.0 km)");
    expect(html).toContain("Route unavailable for Centre → Workplace");
    expect(html).toContain("Complete journey totals unavailable due to incomplete route leg");
    expect(html).not.toContain("Total travel: ");
    expect(html).toContain("Retry route");
  });
});
