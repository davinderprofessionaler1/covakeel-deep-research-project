import crypto from "node:crypto";
import { listUsers, usesDevelopmentStore } from "./auth-store.js";

function internalKey() {
  return process.env.ADMIN_INTERNAL_API_KEY || (process.env.NODE_ENV === "production" ? "" : "covakeel-local-internal-only");
}

function keyMatches(candidate, expected) {
  const left = Buffer.from(String(candidate || ""));
  const right = Buffer.from(String(expected || ""));
  return Boolean(expected) && left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function registerInternalAdminRoutes(app) {
  app.get("/api/internal/admin/users", async (request, response) => {
    const expected = internalKey();
    if (!expected) return response.status(503).json({ error: "Internal admin access is not configured." });
    if (!keyMatches(request.get("x-covakeel-admin-key"), expected)) return response.status(401).json({ error: "Internal admin access is required." });

    const search = String(request.query.search || "").trim().slice(0, 200);
    const page = Math.max(1, Number.parseInt(request.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(request.query.pageSize, 10) || 25));
    const result = await listUsers({ search, page, pageSize });
    return response.json({
      ...result,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(result.total / pageSize)),
      source: usesDevelopmentStore() ? "local-development" : "postgresql",
    });
  });
}
