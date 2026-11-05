import { auth } from "../firebase";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

export async function adminApi(path, options = {}) {
  if (!API_BASE) {
  throw new Error(
    "Admin API is not configured. Set VITE_API_BASE_URL in your environment configuration."
  );
}
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Please sign in again.");

  const token = await currentUser.getIdToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...options.headers,
  };

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error("Cannot reach the backend. Check VITE_API_BASE_URL and that the API is online and accessible over HTTPS.");
  }

  if (response.status === 401) {
  throw new Error(
    "401 Unauthorized: The backend rejected the authentication token."
  );
}

if (response.status === 403) {
  throw new Error(
    "403 Forbidden: Your account may not have the required ADMIN role."
  );
}

  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail || body);
    } catch {}
    throw new Error(detail || `Request failed (${response.status}).`);
  }

  if (response.status === 204) return null;
  const type = response.headers.get("content-type") || "";
  return type.includes("application/json") ? response.json() : null;
}
