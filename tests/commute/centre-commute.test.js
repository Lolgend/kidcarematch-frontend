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
vi.mock("leaflet", () => ({ divIcon: (options) => options }));

import { CentreCommuteView, summarizeCommute } from "../../src/commute/CentreCommute.jsx";

describe("CentreCommute presentation", () => {
  it("exposes the shared home-only summary for matches and details without inventing a workplace deviation", () => {
    const summary = summarizeCommute({
      profileId: "prof-1", mode: "drive", workplaceConfigured: false,
      data: {
        profile_id: "prof-1", mode: "drive",
        anchors: { home: { lat: 1.3, lng: 103.8 }, centre: { lat: 1.35, lng: 103.85 } },
        samples: [{ kind: "single", via_status: "available",
          legs: [{ from_anchor: "home", to_anchor: "centre", status: "available", source: "onemap", duration_seconds: 600, distance_meters: 5000, geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.35, lng: 103.85 }] }],
          totals: { duration_seconds: 600, distance_meters: 5000 } }],
      },
    });
    expect(summary.homeTravelSeconds).toBe(600);
    expect(summary.homeTravelDistanceMeters).toBe(5000);
    expect(summary.signedDeviationSeconds).toBeNull();
    expect(summary.deviationHeadline).toBeNull();
    const incomparable = summarizeCommute({
      data: null, profileId: "prof-1", mode: "drive", workplaceConfigured: false,
      comparisonCompatible: false,
    });
    expect(incomparable.homeTravelSeconds).toBeNull();
    expect(incomparable.comparisonUnavailableMessage).toContain("different conditions");
  });

  it("distinguishes unsupported comparison and retains usable route facts when timing is uncertified", () => {
    const timing = { duration_basis: "provider_default", arrival_source: "not_applicable", initial_wait_included: null };
    const data = {
      profile_id: "prof-1", mode: "drive", comparison_contract: "direct_baseline_v1",
      anchors: { home: { lat: 1.3, lng: 103.8 }, centre: { lat: 1.35, lng: 103.85 }, workplace: { lat: 1.28, lng: 103.85 } },
      evaluation: { evaluation_id: "eval-1", evaluated_at: "2026-11-07T03:00:00Z", profile_revision: "r1", anchor_revision: "a1" },
      samples: [{ kind: "single", via_status: "partial", conditions: { conditions_id: "c1", provider_options_id: "p1" },
        legs: [{ from_anchor: "home", to_anchor: "centre", status: "available", source: "onemap", duration_seconds: 600, distance_meters: 5000,
          geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.35, lng: 103.85 }], timing, reasons: [] },
        { from_anchor: "centre", to_anchor: "workplace", status: "unavailable", reasons: [{ code: "timing_unverified" }] }],
        totals: null, comparison: { status: "unavailable", reasons: [{ code: "timing_unverified" }], certification: null },
        direct_route: { status: "available", reasons: [], legs: [{ from_anchor: "home", to_anchor: "workplace", status: "available", source: "onemap", duration_seconds: 1800, distance_meters: 9000,
          geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.28, lng: 103.85 }], timing, reasons: [] }], totals: { duration_seconds: 1800, distance_meters: 9000 } } }],
    };
    const unsupported = summarizeCommute({ data, profileId: "prof-1", mode: "drive", workplaceConfigured: true, directBaselineStatus: "unsupported" });
    expect(unsupported.comparisonUnavailableMessage).toContain("not supported");
    expect(unsupported.usableViaLegs).toHaveLength(1);

    const timingUnavailable = summarizeCommute({ data, profileId: "prof-1", mode: "drive", workplaceConfigured: true, directBaselineStatus: "supported" });
    expect(timingUnavailable.comparisonUnavailableMessage).toContain("timing could not be verified");
    expect(timingUnavailable.directTravelSeconds).toBe(1800);
    expect(timingUnavailable.usableViaLegs[0].durationSeconds).toBe(600);

    const incoherent = summarizeCommute({ data, profileId: "prof-1", mode: "drive", workplaceConfigured: true,
      directBaselineStatus: "supported", comparisonCompatible: false });
    expect(incoherent.comparisonAvailable).toBe(false);
    expect(incoherent.comparisonUnavailableMessage).toContain("different conditions");
    expect(incoherent.directTravelSeconds).toBe(1800);
    expect(incoherent.usableViaLegs).toHaveLength(1);
  });

  it("keeps usable current-context routes visible while refreshing or showing an independent error", () => {
    const activeData = {
      centre_id: 101, profile_id: "prof-1", mode: "drive",
      anchors: { home: { lat: 1.3, lng: 103.8 }, centre: { lat: 1.35, lng: 103.85 }, workplace: null },
      samples: [{
        kind: "single", via_status: "available",
        legs: [{ from_anchor: "home", to_anchor: "centre", status: "available", source: "onemap", duration_seconds: 600, distance_meters: 5000, geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.35, lng: 103.85 }] }],
        totals: { duration_seconds: 600, distance_meters: 5000 },
      }],
    };
    const render = (props) => renderToStaticMarkup(React.createElement(CentreCommuteView, {
      currentUser: { uid: "u1" }, profileId: "prof-1", workplaceConfigured: false,
      centre: { id: 101, name: "Star Preschool" }, mode: "drive", directBaselineStatus: "disabled",
      ...props,
    }));

    const refreshing = render({ loading: true, error: null, data: activeData });
    expect(refreshing).toContain("Refreshing commute estimates. Showing available results for this selection.");
    expect(refreshing).toContain("Total travel: 10 mins");

    const failedRefresh = render({ loading: false, error: Object.assign(new Error("503: unavailable"), { status: 503 }), data: activeData });
    expect(failedRefresh).toContain("Some commute estimates could not be refreshed.");
    expect(failedRefresh).toContain("Total travel: 10 mins");
    expect(failedRefresh).toContain("Retry route");
  });

  it("offers sign-in or parent-account recovery for commute authorization failures", () => {
    const previousPrivateRoute = {
      centre_id: 101, profile_id: "prof-1", mode: "drive",
      anchors: { home: { lat: 1.3, lng: 103.8 }, centre: { lat: 1.35, lng: 103.85 }, workplace: null },
      samples: [{ kind: "single", via_status: "available",
        legs: [{ from_anchor: "home", to_anchor: "centre", status: "available", source: "onemap", duration_seconds: 600, distance_meters: 5000, geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.35, lng: 103.85 }] }],
        totals: { duration_seconds: 600, distance_meters: 5000 } }],
    };
    const render = (status) => renderToStaticMarkup(React.createElement(CentreCommuteView, {
      currentUser: { uid: "u1" }, profileId: "prof-1", workplaceConfigured: false,
      centre: { id: 101, name: "Star Preschool" }, loading: false,
      error: Object.assign(new Error(`${status}: denied`), { status }),
      data: previousPrivateRoute, setData: { "101": previousPrivateRoute },
      onSignIn: () => {},
    }));

    const expired = render(401);
    expect(expired).toContain("Your sign-in has expired. Sign in again to load your personal commute route.");
    expect(expired).toContain(">Sign in</button>");
    expect(expired).not.toContain("Total travel:");
    expect(expired).not.toContain("centre-commute-map");
    const forbidden = render(403);
    expect(forbidden).toContain("This account cannot access personal commute routes. Switch to a parent account to continue.");
    expect(forbidden).toContain(">Sign in with a parent account</button>");
    expect(forbidden).not.toContain("Total travel:");

    const providerAuth = renderToStaticMarkup(React.createElement(CentreCommuteView, {
      currentUser: { uid: "u1" }, profileId: "prof-1", workplaceConfigured: false,
      centre: { id: 101, name: "Star Preschool" }, loading: false,
      error: Object.assign(new Error("401: provider auth failed"), { status: 401, code: "provider_auth_failed", failureClass: "service" }),
      data: previousPrivateRoute,
    }));
    expect(providerAuth).toContain("Some commute estimates could not be refreshed.");
    expect(providerAuth).toContain("Total travel: 10 mins");
    expect(providerAuth).not.toContain("Your sign-in has expired");
  });

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
    expect(html).toContain('id="centre-commute-summary"');
    expect(html).toContain('tabindex="-1"');
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
    expect(html).toContain('id="centre-commute-summary"');
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
    // Each via-centre leg uses a distinct solid stroke.
    expect(html).toContain("#2563eb");
    expect(html).toContain("#07805f");
  });

  it("shows certified direct and via routes with raw-second commute deviation", () => {
    const anchors = {
      home: { lat: 1.3, lng: 103.8 },
      centre: { lat: 1.35, lng: 103.85 },
      workplace: { lat: 1.28, lng: 103.85 },
    };
    const timing = {
      duration_basis: "provider_default",
      arrival_source: "not_applicable",
      initial_wait_included: null,
    };
    const data = {
      centre_id: 101,
      profile_id: "prof-1",
      mode: "drive",
      comparison_contract: "direct_baseline_v1",
      anchors,
      evaluation: {
        evaluation_id: "eval-1",
        evaluated_at: "2026-11-07T03:00:00Z",
        profile_revision: "profile-rev-1",
        anchor_revision: "anchor-rev-1",
      },
      samples: [{
        kind: "single",
        conditions: {
          conditions_id: "drive-default-v1",
          timing_basis: "provider_default",
          initial_departure_at: null,
          provider_options_id: "onemap-drive-v1",
        },
        via_status: "available",
        legs: [
          { from_anchor: "home", to_anchor: "centre", status: "available", source: "onemap", duration_seconds: 1000, distance_meters: 5000, geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.35, lng: 103.85 }], timing, reasons: [] },
          { from_anchor: "centre", to_anchor: "workplace", status: "available", source: "onemap", duration_seconds: 1491, distance_meters: 7000, geometry: [{ lat: 1.35, lng: 103.85 }, { lat: 1.28, lng: 103.85 }], timing, reasons: [] },
        ],
        totals: { duration_seconds: 2491, distance_meters: 12000 },
        reasons: [],
        direct_route: {
          status: "available",
          legs: [{ from_anchor: "home", to_anchor: "workplace", status: "available", source: "onemap", duration_seconds: 1829, distance_meters: 9000, geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.28, lng: 103.85 }], timing, reasons: [] }],
          totals: { duration_seconds: 1829, distance_meters: 9000 },
          reasons: [],
        },
        comparison: {
          status: "available",
          reasons: [],
          certification: { duration_basis: "provider_default", provider_options_id: "onemap-drive-v1" },
        },
      }],
    };
    const html = renderToStaticMarkup(React.createElement(CentreCommuteView, {
      currentUser: { uid: "u1" }, profileId: "prof-1", workplaceConfigured: true,
      centre: { id: 101, name: "Star Preschool" }, loading: false, data,
      mode: "drive", directBaselineStatus: "supported",
    }));

    expect(html).toContain("11 min extra travel");
    expect(html).toContain("Via centre 42 mins");
    expect(html).toContain("Direct 30 mins");
    expect(html).toContain("Times rounded");
    expect(html).toContain("Direct home to workplace");
    expect(html).toContain("Home to centre");
    expect(html).toContain("Centre to workplace");
    expect(html).toContain("Show all routes");
    expect(html).toContain('data-options="{&quot;color&quot;:&quot;#59636e&quot;');

    data.samples[0].comparison = { status: "unavailable", reasons: [{ code: "timing_unverified", failure_class: "conditions", retryable: false }], certification: null };
    const timingUnavailable = renderToStaticMarkup(React.createElement(CentreCommuteView, {
      currentUser: { uid: "u1" }, profileId: "prof-1", workplaceConfigured: true,
      centre: { id: 101, name: "Star Preschool" }, loading: false, data,
      mode: "drive", directBaselineStatus: "supported",
    }));
    expect(timingUnavailable).toContain("Direct home to workplace");
    expect(timingUnavailable).toContain("Extra travel unavailable");
    data.samples[0].comparison = {
      status: "available", reasons: [],
      certification: { duration_basis: "provider_default", provider_options_id: "onemap-drive-v1" },
    };

    const renderUpdated = () => renderToStaticMarkup(React.createElement(CentreCommuteView, {
      currentUser: { uid: "u1" }, profileId: "prof-1", workplaceConfigured: true,
      centre: { id: 101, name: "Star Preschool" }, loading: false, data,
      mode: "drive", directBaselineStatus: "supported",
    }));
    const viaLegs = data.samples[0].legs;
    viaLegs[0].duration_seconds = 2520;
    viaLegs[1].duration_seconds = 0;
    data.samples[0].totals.duration_seconds = 2520;
    data.samples[0].direct_route.legs[0].duration_seconds = 1800;
    data.samples[0].direct_route.totals.duration_seconds = 1800;
    expect(renderUpdated()).toContain("12 min extra travel");

    viaLegs[0].duration_seconds = 1919;
    viaLegs[1].duration_seconds = 0;
    data.samples[0].totals.duration_seconds = 1919;
    data.samples[0].direct_route.legs[0].duration_seconds = 1829;
    data.samples[0].direct_route.totals.duration_seconds = 1829;
    expect(renderUpdated()).toContain("2 min extra travel");

    viaLegs[0].duration_seconds = 1859;
    data.samples[0].totals.duration_seconds = 1859;
    expect(renderUpdated()).toContain("Less than 1 min extra travel");

    viaLegs[0].duration_seconds = 1200;
    data.samples[0].totals.duration_seconds = 1200;
    data.samples[0].direct_route.legs[0].duration_seconds = 1800;
    data.samples[0].direct_route.totals.duration_seconds = 1800;
    const negativeHtml = renderUpdated();
    expect(negativeHtml).toContain("No extra travel");
    expect(negativeHtml).toContain("Via centre 20 mins");
  });

  it("withholds deviation when the response marker or timing certification is missing", () => {
    const sample = {
      kind: "single",
      conditions: { conditions_id: "drive", timing_basis: "provider_default", provider_options_id: "opts" },
      via_status: "available",
      legs: [
        { from_anchor: "home", to_anchor: "centre", status: "available", source: "onemap", duration_seconds: 100, distance_meters: 1000, geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.35, lng: 103.85 }] },
        { from_anchor: "centre", to_anchor: "workplace", status: "available", source: "onemap", duration_seconds: 100, distance_meters: 1000, geometry: [{ lat: 1.35, lng: 103.85 }, { lat: 1.28, lng: 103.85 }] },
      ],
      totals: { duration_seconds: 200, distance_meters: 2000 },
      direct_route: { status: "available", legs: [{ from_anchor: "home", to_anchor: "workplace", status: "available", source: "onemap", duration_seconds: 100, distance_meters: 1000, geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.28, lng: 103.85 }] }], totals: { duration_seconds: 100, distance_meters: 1000 }, reasons: [] },
      comparison: { status: "available", reasons: [], certification: { duration_basis: "provider_default", provider_options_id: "opts" } },
    };
    const data = {
      centre_id: 101, profile_id: "prof-1", mode: "drive",
      anchors: { home: { lat: 1.3, lng: 103.8 }, centre: { lat: 1.35, lng: 103.85 }, workplace: { lat: 1.28, lng: 103.85 } },
      evaluation: { evaluation_id: "eval", evaluated_at: "2026-11-07T03:00:00Z", profile_revision: "p1", anchor_revision: "a1" },
      samples: [sample],
    };
    const html = renderToStaticMarkup(React.createElement(CentreCommuteView, {
      currentUser: { uid: "u1" }, profileId: "prof-1", workplaceConfigured: true,
      centre: { id: 101 }, loading: false, data, mode: "drive", directBaselineStatus: "supported",
    }));

    expect(html).not.toContain("extra travel</strong>");
    expect(html).toContain("Extra travel unavailable");
    expect(html).toContain("Total travel: 3 mins");
    expect(html).not.toContain("Direct home to workplace");
  });

  it("retains a complete direct route and its map when the known centre location is unresolved", () => {
    const timing = { duration_basis: "provider_default", arrival_source: "not_applicable", initial_wait_included: null };
    const data = {
      centre_id: 101, profile_id: "prof-1", mode: "drive", comparison_contract: "direct_baseline_v1",
      anchors: { home: { lat: 1.3, lng: 103.8 }, centre: null, workplace: { lat: 1.28, lng: 103.85 } },
      evaluation: { evaluation_id: "eval", evaluated_at: "2026-11-07T03:00:00Z", profile_revision: "p1", anchor_revision: "a1" },
      samples: [{
        kind: "single", conditions: { conditions_id: "drive", timing_basis: "provider_default", initial_departure_at: null, provider_options_id: "opts" },
        via_status: "partial", reasons: [{ code: "centre_location_unavailable", failure_class: "location", retryable: false }],
        legs: [{ from_anchor: "home", to_anchor: "centre", status: "unavailable", source: null, duration_seconds: null, distance_meters: null, geometry: null, timing, reasons: [{ code: "centre_location_unavailable", failure_class: "location", retryable: false }] }],
        totals: null,
        direct_route: {
          status: "available", reasons: [],
          legs: [{ from_anchor: "home", to_anchor: "workplace", status: "available", source: "onemap", duration_seconds: 800, distance_meters: 5000, geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.28, lng: 103.85 }], timing, reasons: [] }],
          totals: { duration_seconds: 800, distance_meters: 5000 },
        },
        comparison: { status: "unavailable", reasons: [{ code: "location_unavailable", failure_class: "location", retryable: false }], certification: null },
      }],
    };
    const html = renderToStaticMarkup(React.createElement(CentreCommuteView, {
      currentUser: { uid: "u1" }, profileId: "prof-1", workplaceConfigured: true,
      centre: { id: 101, name: "Star Preschool" }, loading: false, data,
      mode: "drive", directBaselineStatus: "supported",
    }));

    expect(html).toContain("Direct home to workplace");
    expect(html).toContain("13 mins (5.0 km)");
    expect(html).not.toContain("Total travel:");
    expect(html).toContain("data-testid=\"centre-commute-map\"");
    expect(html).not.toContain('data-alt="Centre"');
  });

  it("requires certified PT elapsed timing and zero dwell before showing a comparison", () => {
    const departure = "2026-11-11T08:00:00+08:00";
    const firstArrival = "2026-11-11T08:15:00+08:00";
    const timing = { duration_basis: "elapsed_from_requested_departure", arrival_source: "provider_end_time", initial_wait_included: true };
    const viaLegs = [
      { from_anchor: "home", to_anchor: "centre", status: "available", source: "onemap", duration_seconds: 900, distance_meters: 5000, geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.35, lng: 103.85 }], timing, departure_at: departure, arrival_at: firstArrival, reasons: [] },
      { from_anchor: "centre", to_anchor: "workplace", status: "available", source: "onemap", duration_seconds: 900, distance_meters: 5000, geometry: [{ lat: 1.35, lng: 103.85 }, { lat: 1.28, lng: 103.85 }], timing, departure_at: firstArrival, arrival_at: "2026-11-11T08:30:00+08:00", reasons: [] },
    ];
    const data = {
      centre_id: 101, profile_id: "prof-1", mode: "pt", comparison_contract: "direct_baseline_v1",
      anchors: { home: { lat: 1.3, lng: 103.8 }, centre: { lat: 1.35, lng: 103.85 }, workplace: { lat: 1.28, lng: 103.85 } },
      evaluation: { evaluation_id: "eval-pt", evaluated_at: "2026-11-07T03:00:00Z", profile_revision: "p1", anchor_revision: "a1" },
      samples: [{
        kind: "weekday", conditions: { conditions_id: "pt-wed", timing_basis: "scheduled_departure", initial_departure_at: departure, provider_options_id: "pt-options" },
        via_status: "available", reasons: [], legs: viaLegs, totals: { duration_seconds: 1800, distance_meters: 10000 },
        direct_route: {
          status: "available", reasons: [],
          legs: [{ from_anchor: "home", to_anchor: "workplace", status: "available", source: "onemap", duration_seconds: 1500, distance_meters: 8000, geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.28, lng: 103.85 }], timing, departure_at: departure, arrival_at: "2026-11-11T08:25:00+08:00", reasons: [] }],
          totals: { duration_seconds: 1500, distance_meters: 8000 },
        },
        comparison: { status: "available", reasons: [], certification: { duration_basis: "elapsed_from_requested_departure", provider_options_id: "pt-options" } },
      }],
    };
    const render = () => renderToStaticMarkup(React.createElement(CentreCommuteView, {
      currentUser: { uid: "u1" }, profileId: "prof-1", workplaceConfigured: true,
      centre: { id: 101 }, loading: false, data, mode: "pt", directBaselineStatus: "supported",
    }));

    const valid = render();
    expect(valid).toContain("5 min extra travel");
    expect(valid).not.toContain("2026-11-11");
    viaLegs[1].departure_at = "2026-11-11T08:16:00+08:00";
    const contradictory = render();
    expect(contradictory).not.toContain("5 min extra travel");
    expect(contradictory).toContain("Direct home to workplace");
    expect(contradictory).toContain("Extra travel unavailable");
    viaLegs[1].departure_at = firstArrival;
    viaLegs[0].duration_seconds = 600;
    data.samples[0].totals.duration_seconds = 1500;
    const elapsedMismatch = render();
    expect(elapsedMismatch).not.toContain("5 min extra travel");
    expect(elapsedMismatch).toContain("Complete journey totals unavailable");
    expect(elapsedMismatch).toContain('data-testid="centre-commute-map"');
  });

  it("puts the map before commute controls and gives Skip map one focusable destination after it", () => {
    const data = {
      centre_id: 101, mode: "drive", anchors: { centre: { lat: 1.35, lng: 103.85 } },
      samples: [{ kind: "single", via_status: "partial", legs: [], totals: null }],
    };
    const html = renderToStaticMarkup(React.createElement(CentreCommuteView, {
      currentUser: { uid: "u1" }, profileId: "prof-1", workplaceConfigured: false,
      centre: { id: 101, name: "Star Preschool" }, loading: false, data,
    }));
    const mapIndex = html.indexOf('data-testid="centre-commute-map"');
    const targetIndex = html.indexOf('id="centre-commute-summary"');
    const controlsIndex = html.indexOf('class="commute-mode-selector"');

    expect(mapIndex).toBeGreaterThanOrEqual(0);
    expect(targetIndex).toBeGreaterThan(mapIndex);
    expect(controlsIndex).toBeGreaterThan(targetIndex);
    expect((html.match(/id="centre-commute-summary"/g) || [])).toHaveLength(1);

    for (const state of [{ loading: true }, { loading: false, error: new Error("route unavailable") }]) {
      const unavailable = renderToStaticMarkup(React.createElement(CentreCommuteView, {
        currentUser: { uid: "u1" }, profileId: "prof-1", centre: { id: 101 }, data: null,
        getCentreLocation: vi.fn(), ...state,
      }));
      const locationMapIndex = unavailable.indexOf('aria-label="Centre location map"');
      const summaryIndex = unavailable.indexOf('id="centre-commute-summary"');
      const controlsAfterMap = unavailable.indexOf('class="commute-mode-selector"');
      expect(locationMapIndex).toBeGreaterThanOrEqual(0);
      expect(summaryIndex).toBeGreaterThan(locationMapIndex);
      expect(controlsAfterMap).toBeGreaterThan(summaryIndex);
      expect((unavailable.match(/aria-label="Centre location map"/g) || [])).toHaveLength(1);
    }
  });

  it("explains a retryable direct timeout while retaining a complete via-centre estimate", () => {
    const onRetry = vi.fn();
    const timing = { duration_basis: "provider_default", initial_wait_included: null };
    const viaLegs = [
      { from_anchor: "home", to_anchor: "centre", status: "available", source: "onemap", duration_seconds: 900, distance_meters: 5000, geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.35, lng: 103.85 }], timing, reasons: [] },
      { from_anchor: "centre", to_anchor: "workplace", status: "available", source: "onemap", duration_seconds: 900, distance_meters: 5000, geometry: [{ lat: 1.35, lng: 103.85 }, { lat: 1.28, lng: 103.85 }], timing, reasons: [] },
    ];
    const data = {
      centre_id: 101, profile_id: "prof-1", mode: "drive", comparison_contract: "direct_baseline_v1",
      anchors: { home: { lat: 1.3, lng: 103.8 }, centre: { lat: 1.35, lng: 103.85 }, workplace: { lat: 1.28, lng: 103.85 } },
      evaluation: { evaluation_id: "eval", evaluated_at: "2026-11-07T03:00:00Z", profile_revision: "p1", anchor_revision: "a1" },
      samples: [{
        kind: "single", conditions: { conditions_id: "drive", timing_basis: "provider_default", provider_options_id: "opts" },
        via_status: "available", reasons: [], legs: viaLegs, totals: { duration_seconds: 1800, distance_meters: 10000 },
        direct_route: { status: "unavailable", legs: [], totals: null, reasons: [{ code: "provider_timeout", retryable: true }] },
        comparison: { status: "unavailable", reasons: [{ code: "direct_unavailable" }], certification: null },
      }],
    };
    const html = renderToStaticMarkup(React.createElement(CentreCommuteView, {
      currentUser: { uid: "u1" }, profileId: "prof-1", workplaceConfigured: true,
      centre: { id: 101 }, loading: false, data, mode: "drive", directBaselineStatus: "supported", onRetry,
    }));

    expect(html).toContain("The direct route estimate timed out.");
    expect(html).toContain("Total travel: 30 mins");
    expect(html).toContain("Retry route");
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

  it("keeps centre details renderable for malformed unavailable route messages and entries", () => {
    const data = {
      centre_id: 101,
      mode: "drive",
      anchors: { centre: { lat: 1.35, lng: 103.85 } },
      samples: [null, {
        kind: "single",
        via_status: "partial",
        legs: [null, { from_anchor: "home", to_anchor: "centre", status: "unavailable", message: { text: "could not be resolved" } }],
        totals: { duration_seconds: 600, distance_meters: 5000 },
      }],
    };
    const html = renderToStaticMarkup(React.createElement(CentreCommuteView, {
      currentUser: { uid: "u1" }, profileId: "prof-1", workplaceConfigured: false,
      centre: { id: 101, name: "Star Preschool" }, loading: false, data,
    }));

    expect(html).toContain("Route unavailable for Home");
    expect(html).toContain("Complete journey totals unavailable");
  });

  it("withholds totals when a complete-looking response contradicts its leg sums or partial status", () => {
    const sample = {
      kind: "single", via_status: "available",
      legs: [{ from_anchor: "home", to_anchor: "centre", status: "available", source: "onemap", duration_seconds: 600, distance_meters: 5000, geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 1.35, lng: 103.85 }] }],
      totals: { duration_seconds: 900, distance_meters: 5000 },
    };
    const data = { centre_id: 101, mode: "drive", anchors: { centre: { lat: 1.35, lng: 103.85 } }, samples: [sample] };
    const render = () => renderToStaticMarkup(React.createElement(CentreCommuteView, {
      currentUser: { uid: "u1" }, profileId: "prof-1", workplaceConfigured: false,
      centre: { id: 101, name: "Star Preschool" }, loading: false, data,
    }));

    expect(render()).not.toContain("Total travel: 15 mins");
    sample.totals = { duration_seconds: 600, distance_meters: 5000 };
    expect(render()).toContain("Total travel: 10 mins");
    sample.via_status = "partial";
    expect(render()).not.toContain("Total travel: 10 mins");
  });

  it("rejects an out-of-range route geometry while keeping the centre map available", () => {
    const data = {
      centre_id: 101, mode: "drive", anchors: { centre: { lat: 1.35, lng: 103.85 } },
      samples: [{
        kind: "single", via_status: "available",
        legs: [{ from_anchor: "home", to_anchor: "centre", status: "available", source: "onemap", duration_seconds: 600, distance_meters: 5000, geometry: [{ lat: 1.3, lng: 103.8 }, { lat: 95, lng: 103.85 }] }],
        totals: { duration_seconds: 600, distance_meters: 5000 },
      }],
    };
    const html = renderToStaticMarkup(React.createElement(CentreCommuteView, {
      currentUser: { uid: "u1" }, profileId: "prof-1", workplaceConfigured: false,
      centre: { id: 101 }, loading: false, data,
    }));

    expect(html).toContain('data-testid="centre-commute-map"');
    expect(html).toContain("Route unavailable for Home");
    expect(html).toContain("Complete journey totals unavailable");
    expect(html).not.toContain('data-testid="mock-polyline"');
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
    expect(html).toContain("#07805f");
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
