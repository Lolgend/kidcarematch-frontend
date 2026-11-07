const STORAGE_KEY = 'kidcare:centre-return:v1';
const TAB_KEY = 'kidcare:tab:v1';
const CHANNEL_NAME = 'kidcare:tab-context:v1';
const HOME_QUERY_TOKEN = '{{kidcare-owned-home}}';
const WORK_QUERY_TOKEN = '{{kidcare-owned-work}}';

export function protectCentreReturnQuery(query, profile) {
  let safeQuery = String(query || '');
  for (const [value, marker] of [[profile?.home, HOME_QUERY_TOKEN], [profile?.work, WORK_QUERY_TOKEN]]) {
    if (typeof value === 'string' && value.trim()) safeQuery = safeQuery.split(value).join(marker);
  }
  return safeQuery;
}

export function restoreCentreReturnQuery(context, profile) {
  let query = String(context?.query || '');
  if (query.includes(HOME_QUERY_TOKEN)) {
    if (!profile?.home) return '';
    query = query.split(HOME_QUERY_TOKEN).join(String(profile.home));
  }
  if (query.includes(WORK_QUERY_TOKEN)) {
    if (!profile?.work) return '';
    query = query.split(WORK_QUERY_TOKEN).join(String(profile.work));
  }
  return query;
}

function token() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readJson(storage, key) {
  try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; }
}

function sessionStorageOrNull() {
  try { return window.sessionStorage; } catch { return null; }
}

// sessionStorage survives reloads, but browsers may clone it when duplicating a tab.
// A live BroadcastChannel claim lets the clone discard the copied browsing context.
export function claimCentreReturnTab() {
  if (typeof window === 'undefined') return { ready: Promise.resolve(true), dispose() {} };
  const storage = sessionStorageOrNull();
  let id = null;
  try { id = storage?.getItem(TAB_KEY); } catch { /* persistence may be disabled */ }
  if (!id) {
    id = token();
    try { storage?.setItem(TAB_KEY, id); } catch { /* persistence may be disabled */ }
  }
  const navigationType = performance.getEntriesByType('navigation')[0]?.type;
  if (!storage) return { ready: Promise.resolve(true), dispose() {} };
  if (typeof BroadcastChannel === 'undefined') {
    if (navigationType !== 'reload') clearCentreReturnContext();
    return { ready: Promise.resolve(true), dispose() {} };
  }

  const channel = new BroadcastChannel(CHANNEL_NAME);
  const instanceId = token();
  let collided = false;
  let timer = null;
  channel.onmessage = ({ data }) => {
    if (data?.id !== id) return;
    if (data.type === 'hello') channel.postMessage({ type: 'claim', id, requestId: data.instanceId });
    if (data.type === 'claim' && data.requestId === instanceId) collided = true;
  };
  // Reloads keep their own context, but still need to answer a later duplicate-tab
  // claim so a fresh document cannot inherit the reloaded tab's origin.
  if (navigationType !== 'reload') channel.postMessage({ type: 'hello', id, instanceId });
  const ready = new Promise((resolve) => {
    timer = window.setTimeout(() => {
      if (collided) {
        clearCentreReturnContext();
        const nextId = token();
        try { storage.setItem(TAB_KEY, nextId); } catch { /* persistence may be disabled */ }
        id = nextId;
        channel.postMessage({ type: 'rotated', id: nextId });
      }
      resolve(true);
    }, 250);
  });
  return { ready, dispose() { if (timer !== null) window.clearTimeout(timer); channel.close(); } };
}

export function saveCentreReturnContext(context) {
  const storage = sessionStorageOrNull();
  if (!storage) return null;
  const id = context.id || token();
  let stored = readJson(storage, STORAGE_KEY);
  if (!stored || stored.version !== 1 || stored.uid !== (context.uid || null)) {
    stored = { version: 1, uid: context.uid || null, origins: {} };
  }
  stored.origins = { ...(stored.origins || {}), [id]: { ...context, id } };
  const keys = Object.keys(stored.origins);
  keys.slice(0, Math.max(0, keys.length - 50)).forEach((oldId) => delete stored.origins[oldId]);
  try { storage.setItem(STORAGE_KEY, JSON.stringify(stored)); } catch { /* storage may be disabled */ }
  return id;
}

export function loadCentreReturnContext(uid, id) {
  const stored = readJson(sessionStorageOrNull(), STORAGE_KEY);
  if (!stored || stored.version !== 1 || stored.uid !== (uid || null)) return null;
  return (id && stored.origins && typeof stored.origins === 'object') ? stored.origins[id] || null : null;
}

export function hasCentreReturnAccount(uid) {
  const stored = readJson(sessionStorageOrNull(), STORAGE_KEY);
  return Boolean(stored && stored.version === 1 && stored.uid === (uid || null));
}

export function clearCentreReturnContext() {
  try { sessionStorageOrNull()?.removeItem(STORAGE_KEY); } catch { /* storage may be disabled */ }
}
