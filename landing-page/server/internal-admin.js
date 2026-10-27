import crypto from "node:crypto";
import { getUserActivity, listAdminConversations, listUsers, setUserBlocked, usesDevelopmentStore } from "./auth-store.js";

function internalKey() {
  return process.env.ADMIN_INTERNAL_API_KEY || (process.env.NODE_ENV === "production" ? "" : "covakeel-local-internal-only");
}

function keyMatches(candidate, expected) {
  const left = Buffer.from(String(candidate || ""));
  const right = Buffer.from(String(expected || ""));
  return Boolean(expected) && left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function registerInternalAdminRoutes(app) {
  const authorize = (request, response) => {
    const expected = internalKey();
    if (!expected) { response.status(503).json({ error: "Internal admin access is not configured." }); return false; }
    if (!keyMatches(request.get("x-covakeel-admin-key"), expected)) { response.status(401).json({ error: "Internal admin access is required." }); return false; }
    return true;
  };

  app.get("/api/internal/admin/users", async (request, response) => {
    if (!authorize(request, response)) return;

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

  app.get("/api/internal/admin/users/:id/activity", async (request, response) => {
    if (!authorize(request, response)) return;
    const userId = Number.parseInt(request.params.id, 10);
    if (!Number.isInteger(userId) || userId < 1) return response.status(400).json({ error: "Invalid user id." });
    const activity = await getUserActivity(userId);
    return activity ? response.json(activity) : response.status(404).json({ error: "User not found." });
  });

  app.patch("/api/internal/admin/users/:id/block", async (request, response) => {
    if (!authorize(request, response)) return;
    const userId = Number.parseInt(request.params.id, 10);
    const blocked = request.body?.blocked;
    const reason = String(request.body?.reason || "").trim().slice(0, 240);
    if (!Number.isInteger(userId) || userId < 1 || typeof blocked !== "boolean") return response.status(400).json({ error: "Valid user id and blocked status are required." });
    const user = await setUserBlocked(userId, blocked, reason);
    return user ? response.json({ user }) : response.status(404).json({ error: "User not found." });
  });

  app.get("/api/internal/admin/conversations", async (request, response) => {
    if (!authorize(request, response)) return;
    const search = String(request.query.search || "").trim().slice(0, 200);
    const page = Math.max(1, Number.parseInt(request.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(request.query.pageSize, 10) || 25));
    const result = await listAdminConversations({ search, page, pageSize });
    return response.json({ ...result, page, pageSize, pages: Math.max(1, Math.ceil(result.total / pageSize)) });
  });
}
