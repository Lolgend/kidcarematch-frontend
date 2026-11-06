export function centreDetailsPath(id) {
  if (id == null || String(id).length === 0) return null;
  return `/centres/${encodeURIComponent(String(id))}`;
}

export function centreIdFromPath(pathname) {
  const match = String(pathname || "").match(/^\/centres\/([^/]+)\/?$/);
  if (!match) return null;
  try {
    const id = decodeURIComponent(match[1]);
    return id || null;
  } catch {
    return null;
  }
}
