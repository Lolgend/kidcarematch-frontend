import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children, center, zoom, style, zoomAnimation }) =>
    React.createElement(
      "div",
      {
        "data-testid": "mock-map-container",
        "data-center": JSON.stringify(center),
        "data-zoom": zoom,
        "data-zoom-animation": zoomAnimation,
        style,
      },
      children
    ),
  useMap: () => ({
    invalidateSize: vi.fn(), setView: vi.fn(), fitBounds: vi.fn(),
    getContainer: () => ({})
  }),
  TileLayer: ({ url, attribution }) =>
    React.createElement("div", {
      "data-testid": "mock-tile-layer",
      "data-url": url,
      "data-attribution": attribution,
    }),
  Marker: ({ children, position, alt, title }) =>
    React.createElement(
      "div",
      {
        "data-testid": "mock-marker",
        "data-position": JSON.stringify(position),
        "data-alt": alt,
        "data-title": title,
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

  it("keeps the independent centre-location map visible while a commute request fails", () => {
    const html = renderToStaticMarkup(
      React.createElement(CentreCommuteView, {
        currentUser: { uid: "u1" }, profileId: "p1",
        centre: { id: 101, name: "Star Preschool" }, loading: false,
        error: new Error("route service down"),
        getCentreLocation: vi.fn(),
      })
    );
    expect(html).toContain("Loading centre location map");
    expect(html).toContain("Could not load commute route");
  });

  it("labels the map anchors and withholds the map when no real centre coordinate exists", () => {
    const data = {
      anchors: { home: { lat: 1.3, lng: 103.8 } },
      samples: [{ kind: "single", legs: [], totals: null }],
    };
    const html = renderToStaticMarkup(React.createElement(CentreCommuteView, {
      currentUser: { uid: "u1" }, profileId: "p1", centre: { id: 101 },
      loading: false, data,
    }));
    expect(html).toContain("Map view is currently unavailable for this centre");
    expect(html).not.toContain("mock-map-container");
    expect(html).not.toContain("1.3521");
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
    expect(html).toContain('data-zoom-animation="false"');
    expect(html).toContain("Home");
    expect(html).toContain("Star Preschool");
    expect(html).toContain('data-alt="Home"');
    expect(html).toContain('data-alt="Centre"');
    expect(html).toContain("Centre</strong>: Star Preschool");
    expect(html).toContain("10 mins");
    expect(html).toContain("5.0 km");
    expect(html).toContain("Total travel: 10 mins (5.0 km)");
    expect(html).toContain("child drop-off time is excluded");
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
              geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.35, lng: 103.85 }],
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

    expect(html).toContain("Your saved home location could not be resolved");
    expect(html).toContain("Edit family profile");
  });

  it("distinguishes an unresolved configured workplace from a profile with no workplace", () => {
    const data = {
      anchors: { home: { lat: 1.3, lng: 103.8 }, centre: { lat: 1.35, lng: 103.85 }, workplace: null },
      samples: [{ kind: "single", legs: [
        { from_anchor: "home", to_anchor: "centre", status: "available", duration_seconds: 600, distance_meters: 5000, geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.35, lng: 103.85 }] },
        { from_anchor: "centre", to_anchor: "workplace", status: "unavailable", duration_seconds: null, distance_meters: null, message: "Workplace could not be resolved" },
      ], totals: null }],
    };
    const unresolved = renderToStaticMarkup(React.createElement(CentreCommuteView, {
      currentUser: { uid: "u1" }, profileId: "p1", workplaceConfigured: true,
      centre: { id: 101 }, data, loading: false,
    }));
    const homeOnly = renderToStaticMarkup(React.createElement(CentreCommuteView, {
      currentUser: { uid: "u1" }, profileId: "p1", workplaceConfigured: false,
      centre: { id: 101 }, data, loading: false,
    }));

    expect(unresolved).toContain("Your configured workplace location could not be resolved");
    expect(unresolved).toContain("Edit family profile");
    expect(unresolved).toContain("Extra travel comparison isn’t available yet");
    expect(unresolved).not.toContain("Home to centre only; no workplace is configured");
    expect(homeOnly).toContain("Home to centre only; no workplace is configured");
    expect(homeOnly).not.toContain("Your configured workplace location could not be resolved");
  });

  it("renders travel mode selector with Driving, Public transport, Walking, and Cycling radio controls", () => {
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

    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Travel mode"');
    expect(html).toContain("Driving");
    expect(html).toContain("Public transport");
    expect(html).toContain("Walking");
    expect(html).toContain("Cycling");
    expect(html).toContain('aria-pressed="true" class="commute-mode-btn active">Walking');
    expect(html).toContain('aria-pressed="false" class="commute-mode-btn ">Driving');
    expect(html).toContain('aria-pressed="false" class="commute-mode-btn ">Cycling');
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

  it("renders one estimate for PT without exposing sample dates or times", () => {
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
              geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.35, lng: 103.85 }],
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

    expect(html).not.toContain("Wednesday");
    expect(html).not.toContain("08:00");
    expect(html).not.toContain("11 Nov 2026");
    expect(html).not.toContain("Representative travel day");
    expect(html).toContain("Estimated travel time");
    expect(html).toContain("Actual journeys may vary");
    expect(html).toContain("child drop-off time is excluded");
    expect(html).toContain("25 mins");
    expect(html).toContain("5.0 km");
    expect(html).toContain("Total travel: 25 mins (5.0 km)");
  });

  it("does not substitute a weekend route or expose provider timing diagnostics when the PT weekday is missing", () => {
    const html = renderToStaticMarkup(React.createElement(CentreCommuteView, {
      currentUser: { uid: "u1" }, profileId: "p1", centre: { id: 101 }, mode: "pt", loading: false,
      data: {
        anchors: { home: { lat: 1.3, lng: 103.8 }, centre: { lat: 1.35, lng: 103.85 } },
        samples: [{ kind: "weekend", sampled_at: "2026-11-14T08:00:00+08:00", legs: [{
          from_anchor: "home", to_anchor: "centre", status: "available", duration_seconds: 600,
          distance_meters: 5000, geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.35, lng: 103.85 }],
          message: "No route on Wednesday 11 Nov at 08:00", transit_legs: [{ mode: "BUS", route: "159", instruction: "Arrive Wednesday 11 Nov at 08:00" }],
        }], totals: { duration_seconds: 600, distance_meters: 5000 } }],
      },
    }));

    expect(html).toContain("Public transport estimate unavailable");
    expect(html).toContain("Retry route");
    expect(html).not.toContain("Total travel:");
    expect(html).not.toContain("14 Nov");
    expect(html).not.toContain("Wednesday");
    expect(html).not.toContain("08:00");
    expect(html).not.toContain("Arrive");
  });

  it("withholds totals for negative metrics and legs in the wrong order", () => {
    const data = {
      anchors: { home: { lat: 1.3, lng: 103.8 }, centre: { lat: 1.35, lng: 103.85 }, workplace: { lat: 1.28, lng: 103.85 } },
      samples: [{ kind: "single", legs: [
        { from_anchor: "centre", to_anchor: "workplace", status: "available", duration_seconds: 600, distance_meters: 5000, geometry: [{ lat: 1.35, lng: 103.85 }, { lat: 1.28, lng: 103.85 }] },
        { from_anchor: "home", to_anchor: "centre", status: "available", duration_seconds: -1, distance_meters: 5000, geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.35, lng: 103.85 }] },
      ], totals: { duration_seconds: 599, distance_meters: 10000 } }],
    };
    const html = renderToStaticMarkup(React.createElement(CentreCommuteView, {
      currentUser: { uid: "u1" }, profileId: "p1", workplaceConfigured: true,
      centre: { id: 101 }, data, loading: false,
    }));

    expect(html).not.toContain("Total travel:");
    expect(html).toContain("Complete journey totals unavailable");
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
              geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.35, lng: 103.85 }],
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
              geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.35, lng: 103.85 }],
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
    expect(html).toContain("child drop-off time is excluded");
    expect(html).toContain('aria-pressed="true" class="commute-mode-btn active">Walking');
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
    expect(html).toContain('aria-pressed="true" class="commute-mode-btn active">Cycling');
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
              geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.35, lng: 103.85 }],
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

  it("uses only the weekday sample from unequal legacy PT samples", () => {
    const data = {
      centre_id: 101,
      profile_id: "prof-1",
      mode: "pt",
      sample_pair: ["2026-11-11T08:00:00+08:00", "2026-11-14T08:00:00+08:00"],
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
              geometry: [
                { lat: 1.3, lng: 103.8 },
                { lat: 1.31, lng: 103.81 },
              ],
            },
          ],
          totals: { duration_seconds: 1500, distance_meters: 5000 },
        },
        {
          kind: "weekend",
          sampled_at: "2026-11-14T08:00:00+08:00",
          legs: [
            {
              from_anchor: "home",
              to_anchor: "centre",
              status: "available",
              source: "onemap",
              duration_seconds: 1800,
              distance_meters: 5000,
              geometry: [
                { lat: 1.3, lng: 103.8 },
                { lat: 1.32, lng: 103.82 },
              ],
            },
          ],
          totals: { duration_seconds: 1800, distance_meters: 5000 },
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
        selectedSample: "weekday",
        data,
      })
    );

    expect(html).not.toContain('aria-label="Representative travel day"');
    expect(html).not.toContain("11 Nov");
    expect(html).not.toContain("14 Nov");
    expect(html).not.toContain("30 mins (5.0 km)");

    // Weekday metrics & geometry
    expect(html).toContain("Total travel: 25 mins (5.0 km)");
    expect(html).toContain(
      JSON.stringify([
        [1.3, 103.8],
        [1.31, 103.81],
      ])
    );
  });

  it("does not switch to the legacy weekend sample", () => {
    const data = {
      centre_id: 101,
      profile_id: "prof-1",
      mode: "pt",
      sample_pair: ["2026-11-11T08:00:00+08:00", "2026-11-14T08:00:00+08:00"],
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
              geometry: [
                { lat: 1.3, lng: 103.8 },
                { lat: 1.31, lng: 103.81 },
              ],
            },
          ],
          totals: { duration_seconds: 1500, distance_meters: 5000 },
        },
        {
          kind: "weekend",
          sampled_at: "2026-11-14T08:00:00+08:00",
          legs: [
            {
              from_anchor: "home",
              to_anchor: "centre",
              status: "available",
              source: "onemap",
              duration_seconds: 1800,
              distance_meters: 5200,
              geometry: [
                { lat: 1.3, lng: 103.8 },
                { lat: 1.39, lng: 103.89 },
              ],
            },
          ],
          totals: { duration_seconds: 1800, distance_meters: 5200 },
        },
      ],
    };

    const htmlWeekend = renderToStaticMarkup(
      React.createElement(CentreCommuteView, {
        currentUser: { uid: "u1" },
        profileId: "prof-1",
        centre: { id: 101, name: "Star Preschool" },
        loading: false,
        mode: "pt",
        selectedSample: "weekend",
        data,
      })
    );

    expect(htmlWeekend).not.toContain("30 mins (5.2 km)");
    expect(htmlWeekend).toContain("Total travel: 25 mins (5.0 km)");
    expect(htmlWeekend).not.toContain("14 Nov");
  });

  it("handles independent weekend leg failure while weekday succeeds", () => {
    const data = {
      centre_id: 101,
      profile_id: "prof-1",
      mode: "pt",
      sample_pair: ["2026-11-11T08:00:00+08:00", "2026-11-14T08:00:00+08:00"],
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
              geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.35, lng: 103.85 }],
            },
          ],
          totals: { duration_seconds: 1500, distance_meters: 5000 },
        },
        {
          kind: "weekend",
          sampled_at: "2026-11-14T08:00:00+08:00",
          legs: [
            {
              from_anchor: "home",
              to_anchor: "centre",
              status: "unavailable",
              source: null,
              duration_seconds: null,
              distance_meters: null,
              geometry: null,
              message: "No public transport itinerary found",
            },
          ],
          totals: null,
        },
      ],
    };

    // Weekday view shows complete totals
    const htmlWeekday = renderToStaticMarkup(
      React.createElement(CentreCommuteView, {
        currentUser: { uid: "u1" },
        profileId: "prof-1",
        centre: { id: 101, name: "Star Preschool" },
        loading: false,
        mode: "pt",
        selectedSample: "weekday",
        data,
      })
    );
    expect(htmlWeekday).toContain("Total travel: 25 mins (5.0 km)");

    // Weekend view withholds totals and offers retry
    const htmlWeekend = renderToStaticMarkup(
      React.createElement(CentreCommuteView, {
        currentUser: { uid: "u1" },
        profileId: "prof-1",
        centre: { id: 101, name: "Star Preschool" },
        loading: false,
        mode: "pt",
        selectedSample: "weekend",
        data,
      })
    );
    expect(htmlWeekend).toContain("Total travel: 25 mins (5.0 km)");
    expect(htmlWeekend).not.toContain("Complete journey totals unavailable");
  });

  it("does not render weekday/weekend tabs for modes with single estimate (drive, walk, cycle)", () => {
    for (const mode of ["drive", "walk", "cycle"]) {
      const data = {
        centre_id: 101,
        profile_id: "prof-1",
        mode,
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
                geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.35, lng: 103.85 }],
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
          mode,
          data,
        })
      );

      // Must NOT contain tab controls or artificial weekday/weekend controls
      expect(html).not.toContain('role="tablist"');
      expect(html).not.toContain('id="tab-weekday"');
      expect(html).not.toContain('id="tab-weekend"');
    }
  });
});
