import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-leaflet", () => ({
  useMap: () => ({ invalidateSize: vi.fn(), setView: vi.fn(), fitBounds: vi.fn(), getContainer: () => ({}) }),
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
  TileLayer: ({ url, attribution }) =>
    React.createElement("div", {
      "data-testid": "mock-tile-layer",
      "data-url": url,
      "data-attribution": attribution,
    }),
  Marker: ({ children, position, icon, title, alt }) =>
    React.createElement(
      "div",
      {
        "data-testid": "mock-marker",
        "data-position": JSON.stringify(position),
        "data-icon-html": icon?.options?.html,
        title,
        "aria-label": alt,
      },
      children
    ),
  Popup: ({ children }) =>
    React.createElement("div", { "data-testid": "mock-popup" }, children),
}));
vi.mock("leaflet", () => ({
  divIcon: (options) => ({ options }),
}));
vi.mock("leaflet/dist/leaflet.css", () => ({}));

import { CentreLocationMapView } from "../../src/commute/CentreLocationMap.jsx";

describe("CentreLocationMap presentation", () => {
  it("renders loading indicator while coordinates are being fetched", () => {
    const html = renderToStaticMarkup(
      React.createElement(CentreLocationMapView, {
        loading: true,
        location: null,
        centreName: "Little Stars Childcare",
        currentUser: null,
      })
    );

    expect(html).toContain("centre-map-loading");
    expect(html).toContain("Loading centre location map");
    expect(html).not.toContain("mock-map-container");
  });

  it("renders explicit unavailable message when location coordinates are unavailable", () => {
    const html = renderToStaticMarkup(
      React.createElement(CentreLocationMapView, {
        loading: false,
        location: { centre_id: 1, coordinate: null, status: "unavailable" },
        centreName: "Little Stars Childcare",
        currentUser: { uid: "user-1" },
      })
    );

    expect(html).toContain("centre-map-unavailable");
    expect(html).toContain("Map view is currently unavailable for this centre");
    expect(html).not.toContain("mock-map-container");
  });

  it("renders OneMap MapContainer, TileLayer, and Marker with centre name popup when coordinates are available", () => {
    const html = renderToStaticMarkup(
      React.createElement(CentreLocationMapView, {
        loading: false,
        location: {
          centre_id: 1,
          coordinate: { lat: 1.3521, lng: 103.8198 },
          status: "available",
        },
        centreName: "Little Stars Childcare",
        currentUser: { uid: "user-1" },
      })
    );

    expect(html).toContain("centre-map-wrapper");
    expect(html).toContain('data-testid="mock-map-container"');
    expect(html).toContain('data-center="[1.3521,103.8198]"');
    expect(html).toContain('data-zoom-animation="false"');
    expect(html).toContain('data-url="https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png"');
    expect(html).toContain('data-testid="mock-marker"');
    expect(html).toContain('data-position="[1.3521,103.8198]"');
    expect(html).toContain('title="Centre"');
    expect(html).toContain('aria-label="Centre"');
    expect(html).toContain("map-anchor-centre");
    expect(html).toContain("map-anchor-label");
    expect(html).toContain("Little Stars Childcare");
  });

  it("displays guest sign-in prompt when currentUser is null", () => {
    const html = renderToStaticMarkup(
      React.createElement(CentreLocationMapView, {
        loading: false,
        location: {
          centre_id: 1,
          coordinate: { lat: 1.3521, lng: 103.8198 },
          status: "available",
        },
        centreName: "Little Stars Childcare",
        currentUser: null,
        onSignIn: vi.fn(),
      })
    );

    expect(html).toContain("centre-commute-guest-prompt");
    expect(html).toContain("Sign in to see personalised commute routes and travel times");
    expect(html).toContain("guest-signin-btn");
  });

  it("omits guest sign-in prompt when user is authenticated", () => {
    const html = renderToStaticMarkup(
      React.createElement(CentreLocationMapView, {
        loading: false,
        location: {
          centre_id: 1,
          coordinate: { lat: 1.3521, lng: 103.8198 },
          status: "available",
        },
        centreName: "Little Stars Childcare",
        currentUser: { uid: "user-1", email: "parent@example.com" },
      })
    );

    expect(html).not.toContain("centre-commute-guest-prompt");
    expect(html).not.toContain("guest-signin-btn");
  });
});
