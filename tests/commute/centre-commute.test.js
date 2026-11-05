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

  it("renders Public transport mode control button", () => {
    const html = renderToStaticMarkup(
      React.createElement(CentreCommuteView, {
        currentUser: { uid: "u1" },
        profileId: "prof-1",
        centre: { id: 101, name: "Star Preschool" },
        loading: false,
        data: null,
        mode: "pt",
      })
    );

    expect(html).toContain("Public transport");
  });

  it("renders representative weekday label with sample date and 08:00 SGT assumption for PT mode", () => {
    const data = {
      centre_id: 101,
      profile_id: "prof-1",
      mode: "pt",
      anchors: {
        home: { lat: 1.3, lng: 103.8 },
        centre: { lat: 1.35, lng: 103.85 },
      },
      samples: [
        {
          kind: "weekday",
          sampled_at: "2026-11-11T08:00:00+08:00",
          legs: [
            {
              from_anchor: "home",
              to_anchor: "centre",
              status: "available",
              source: "onemap",
              duration_seconds: 1500,
              distance_meters: 5000,
              geometry: [{ lat: 1.3, lng: 103.8 }],
              transit_legs: [
                {
                  mode: "WALK",
                  duration_seconds: 300,
                  distance_meters: 250,
                  instruction: "Walk (250 m)",
                },
                {
                  mode: "BUS",
                  route: "159",
                  duration_seconds: 900,
                  distance_meters: 4500,
                  instruction: "Take Bus 159",
                },
                {
                  mode: "WALK",
                  duration_seconds: 300,
                  distance_meters: 250,
                  instruction: "Walk (250 m)",
                },
              ],
            },
          ],
          totals: { duration_seconds: 1500, distance_meters: 5000 },
        },
      ],
    };

    const html = renderToStaticMarkup(
      React.createElement(CentreCommuteView, {
        currentUser: { uid: "u1" },
        profileId: "prof-1",
        centre: { id: 101, name: "Star Preschool" },
        loading: false,
        mode: "pt",
        data,
      })
    );

    expect(html).toContain("Representative Wednesday 08:00 SGT");
    expect(html).toContain("11 Nov 2026");
    expect(html).toContain("25 mins");
    expect(html).toContain("5.0 km");
    expect(html).toContain("Total travel: 25 mins (5.0 km)");
  });

  it("displays walking and transit legs in the route breakdown", () => {
    const data = {
      centre_id: 101,
      profile_id: "prof-1",
      mode: "pt",
      anchors: {
        home: { lat: 1.3, lng: 103.8 },
        centre: { lat: 1.35, lng: 103.85 },
      },
      samples: [
        {
          kind: "weekday",
          sampled_at: "2026-11-11T08:00:00+08:00",
          legs: [
            {
              from_anchor: "home",
              to_anchor: "centre",
              status: "available",
              source: "onemap",
              duration_seconds: 1500,
              distance_meters: 5000,
              geometry: [{ lat: 1.3, lng: 103.8 }],
              transit_legs: [
                {
                  mode: "WALK",
                  duration_seconds: 300,
                  distance_meters: 250,
                },
                {
                  mode: "BUS",
                  route: "159",
                  duration_seconds: 900,
                  distance_meters: 4500,
                },
                {
                  mode: "WALK",
                  duration_seconds: 300,
                  distance_meters: 250,
                },
              ],
            },
          ],
          totals: { duration_seconds: 1500, distance_meters: 5000 },
        },
      ],
    };

    const html = renderToStaticMarkup(
      React.createElement(CentreCommuteView, {
        currentUser: { uid: "u1" },
        profileId: "prof-1",
        centre: { id: 101, name: "Star Preschool" },
        loading: false,
        mode: "pt",
        data,
      })
    );

    expect(html).toContain("Walk: ");
    expect(html).toContain("Transit (159): ");
    expect(html).toContain("5 mins (0.3 km)");
    expect(html).toContain("15 mins (4.5 km)");
  });

  it("withholds complete totals on partial failure in PT mode", () => {
    const data = {
      centre_id: 101,
      profile_id: "prof-1",
      mode: "pt",
      anchors: {
        home: { lat: 1.3, lng: 103.8 },
        centre: { lat: 1.35, lng: 103.85 },
        workplace: { lat: 1.28, lng: 103.85 },
      },
      samples: [
        {
          kind: "weekday",
          sampled_at: "2026-11-11T08:00:00+08:00",
          legs: [
            {
              from_anchor: "home",
              to_anchor: "centre",
              status: "available",
              source: "onemap",
              duration_seconds: 1500,
              distance_meters: 5000,
              geometry: [{ lat: 1.3, lng: 103.8 }],
              transit_legs: [
                {
                  mode: "WALK",
                  duration_seconds: 300,
                  distance_meters: 250,
                },
                {
                  mode: "BUS",
                  route: "159",
                  duration_seconds: 1200,
                  distance_meters: 4750,
                },
              ],
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
        mode: "pt",
        data,
      })
    );

    expect(html).toContain("Walk: ");
    expect(html).toContain("Transit (159): ");
    expect(html).toContain("Route unavailable for Centre → Workplace");
    expect(html).toContain("Complete journey totals unavailable");
    expect(html).not.toContain("Total travel: ");
  });
});
