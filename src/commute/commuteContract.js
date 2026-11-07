export function isEndpointAuthorizationError(error) {
  if (error?.failureClass === "service" || error?.code === "provider_auth_failed") return false;
  return error?.failureClass === "authentication" || error?.status === 401 || error?.status === 403;
}

export function isUsableRouteLeg(leg) {
  return leg?.status === "available" && typeof leg.source === "string" && leg.source.trim() !== "" &&
    Number.isFinite(leg.duration_seconds) && leg.duration_seconds >= 0 &&
    Number.isFinite(leg.distance_meters) && leg.distance_meters >= 0 &&
    Array.isArray(leg.geometry) && leg.geometry.length >= 2 &&
    leg.geometry.every((point) => Number.isFinite(point?.lat) && point.lat >= -90 && point.lat <= 90 &&
      Number.isFinite(point?.lng) && point.lng >= -180 && point.lng <= 180);
}

export function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
