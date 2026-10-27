function internalKey() {
  return process.env.ADMIN_INTERNAL_API_KEY || (process.env.NODE_ENV === "production" ? "" : "covakeel-local-internal-only");
}

export async function getRegisteredUsers({ search = "", page = 1, pageSize = 25 } = {}) {
  const key = internalKey();
  if (!key) throw new Error("ADMIN_INTERNAL_API_KEY is required in production.");
  const base = process.env.LANDING_API_URL || "http://127.0.0.1:3001";
  const url = new URL("/api/internal/admin/users", base);
  url.searchParams.set("search", search);
  url.searchParams.set("page", String(page));
  url.searchParams.set("pageSize", String(pageSize));
  const response = await fetch(url, {
    headers: { "x-covakeel-admin-key": key },
    signal: AbortSignal.timeout(5000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Unable to load registered users.");
  return result;
}

async function internalRequest(pathname, options = {}) {
  const key = internalKey();
  if (!key) throw new Error("ADMIN_INTERNAL_API_KEY is required in production.");
  const base = process.env.LANDING_API_URL || "http://127.0.0.1:3001";
  const response = await fetch(new URL(pathname, base), {
    ...options,
    headers: { "x-covakeel-admin-key": key, ...(options.headers || {}) },
    signal: AbortSignal.timeout(5000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Unable to complete user administration request.");
  return result;
}

export function getRegisteredUserActivity(userId) {
  return internalRequest(`/api/internal/admin/users/${userId}/activity`);
}

export function updateRegisteredUserBlock(userId, { blocked, reason }) {
  return internalRequest(`/api/internal/admin/users/${userId}/block`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocked, reason }),
  });
}

export function getConversationThreads({ search = "", page = 1, pageSize = 25 } = {}) {
  const params = new URLSearchParams({ search, page: String(page), pageSize: String(pageSize) });
  return internalRequest(`/api/internal/admin/conversations?${params}`);
}
