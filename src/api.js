
import { auth } from "./firebase";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || ""
).replace(/\/$/, "");

export async function apiRequest(endpoint, options = {}) {
  if (!API_BASE_URL) {
    throw new Error(
      "Preschool data is not connected yet. Configure VITE_API_URL with your deployed HTTPS backend URL, then rebuild and redeploy."
    );
  }

  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : null;

  const headers = {
    Accept: "application/json",
    ...(options.body
      ? { "Content-Type": "application/json" }
      : {}),
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(
    `${API_BASE_URL}${endpoint}`,
    {
      ...options,
      headers,
    }
  );

  if (response.status === 204) return null;

  const contentType =
    response.headers.get("content-type") || "";

  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const detail =
      typeof body === "object"
        ? body.detail || body.message
        : body;

    throw new Error(
      `${response.status}: ${
        typeof detail === "string"
          ? detail
          : "API request failed"
      }`
    );
  }

  return body;
}

const qs = (params = {}) => {
  const p = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((v) => {
        if (
          v !== undefined &&
          v !== null &&
          v !== ""
        ) {
          p.append(key, String(v));
        }
      });
    } else if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      p.set(key, String(value));
    }
  });

  const query = p.toString();
  return query ? `?${query}` : "";
};

// ==========================================
// PRESCHOOL CENTRES
// ==========================================

export const getCentres = (params = {}) =>
  apiRequest(`/api/v1/centres${qs(params)}`);

export const getDistricts = () =>
  apiRequest("/api/v1/centres/districts");

export const getCentreSummary = () =>
  apiRequest("/api/v1/centres/summary");

export const getCentreById = (id) =>
  apiRequest(
    `/api/v1/centres/${encodeURIComponent(id)}`
  );

export const getCentreByCode = (code) =>
  apiRequest(
    `/api/v1/centres/code/${encodeURIComponent(code)}`
  );

// ==========================================
// CENTRE REVIEWS
// ==========================================

export const getCentreReviews = (id, params = {}) =>
  apiRequest(
    `/api/v1/centres/${encodeURIComponent(id)}/reviews${qs(params)}`
  );

export const getMyReview = (id) =>
  apiRequest(
    `/api/v1/centres/${encodeURIComponent(id)}/reviews/mine`
  );

export const submitReview = (id, payload) =>
  apiRequest(
    `/api/v1/centres/${encodeURIComponent(id)}/reviews`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );

// ==========================================
// REPORT A REVIEW
// ==========================================

export const reportReview = (reviewId, payload) =>
  apiRequest(
    `/api/v1/reviews/${encodeURIComponent(reviewId)}/reports`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );

// ==========================================
// USER PROFILE
// ==========================================

export const getMyProfile = () =>
  apiRequest("/api/v1/users/me");

export const createMyProfile = (full_name) =>
  apiRequest("/api/v1/users/signup", {
    method: "POST",
    body: JSON.stringify({ full_name }),
  });

export const updateMyProfile = (payload) =>
  apiRequest("/api/v1/users/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

// ==========================================
// FAMILY PREFERENCE PROFILE
// ==========================================

export const getFamilyProfiles = () =>
  apiRequest("/api/v1/profile");

export const createFamilyProfile = (payload) =>
  apiRequest("/api/v1/profile", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateFamilyProfile = (id, payload) =>
  apiRequest(
    `/api/v1/profile/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    }
  );

// ==========================================
// NOTIFICATIONS
// ==========================================

export const getNotifications = (params = { limit: 20 }) =>
  apiRequest(`/api/v1/notifications${qs(params)}`);

export const markNotificationRead = (id) =>
  apiRequest(
    `/api/v1/notifications/${encodeURIComponent(id)}/read`,
    { method: "POST" }
  );

export const markAllNotificationsRead = () =>
  apiRequest("/api/v1/notifications/read-all", {
    method: "POST",
  });

// ==========================================
// WATCHLIST
// ==========================================

export const getMyWatchlist = (params = { limit: 100 }) =>
  apiRequest(`/api/v1/watchlist/me${qs(params)}`);

export const createWatchlist = (payload) =>
  apiRequest("/api/v1/watchlist", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const deleteWatchlist = (id) =>
  apiRequest(
    `/api/v1/watchlist/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );

// ==========================================
// USER REVIEWS
// ==========================================

export const getMyReviews = (params = {}) =>
  apiRequest(`/api/v1/reviews/me${qs(params)}`);

export const updateReview = (id, payload) =>
  apiRequest(
    `/api/v1/reviews/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  );

export const deleteReview = (id) =>
  apiRequest(
    `/api/v1/reviews/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    }
  );
