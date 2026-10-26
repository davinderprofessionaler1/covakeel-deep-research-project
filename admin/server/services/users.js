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
