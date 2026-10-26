import { Router } from "express";
import { clearSession, login, requireAdmin, resolveAdmin, revokeAdminSessions, safeAdmin, setSessionCookie } from "../services/admin-auth.js";
import { readSettings, setPassword, updateSettings, verifyPassword } from "../services/settings-store.js";

export const authRouter = Router();
const failedLogins = new Map();
const loginWindowMs = 15 * 60 * 1000;
const maxLoginAttempts = 5;

function loginAttempt(request) {
  const email = String(request.body?.email || "").trim().toLowerCase();
  const key = `${request.ip}:${email}`;
  const existing = failedLogins.get(key);
  if (!existing || existing.resetAt <= Date.now()) {
    const fresh = { key, count: 0, resetAt: Date.now() + loginWindowMs };
    failedLogins.set(key, fresh);
    return fresh;
  }
  return { key, ...existing };
}

authRouter.post("/auth/login", async (request, response) => {
  const attempt = loginAttempt(request);
  if (attempt.count >= maxLoginAttempts) {
    response.set("Retry-After", String(Math.max(1, Math.ceil((attempt.resetAt - Date.now()) / 1000))));
    return response.status(429).json({ error: "Too many sign-in attempts. Try again later." });
  }
  const result = await login(request.body?.email, request.body?.password);
  if (!result) {
    failedLogins.set(attempt.key, { count: attempt.count + 1, resetAt: attempt.resetAt });
    return response.status(401).json({ error: "Email or password is incorrect." });
  }
  failedLogins.delete(attempt.key);
  setSessionCookie(response, result.token, result.maxAge);
  return response.json({ authenticated: true, admin: result.admin });
});

authRouter.get("/auth/session", async (request, response) => {
  const admin = await resolveAdmin(request);
  if (!admin) return response.status(401).json({ authenticated: false });
  return response.json({ authenticated: true, admin });
});

authRouter.post("/auth/logout", (request, response) => {
  clearSession(request, response);
  response.status(204).end();
});

authRouter.patch("/account", requireAdmin, async (request, response) => {
  const name = String(request.body?.name || "").trim();
  const email = String(request.body?.email || "").trim().toLowerCase();
  const currentPassword = String(request.body?.currentPassword || "");
  if (name.length < 2 || name.length > 100) return response.status(400).json({ error: "Name must be between 2 and 100 characters." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return response.status(400).json({ error: "Enter a valid email address." });
  const current = await readSettings();
  if (!verifyPassword(current.admin, currentPassword)) return response.status(403).json({ error: "Current password is incorrect." });
  const updated = await updateSettings((settings) => {
    settings.admin.name = name;
    settings.admin.email = email;
    settings.admin.updatedAt = new Date().toISOString();
    return settings;
  });
  return response.json({ admin: safeAdmin(updated.admin) });
});

authRouter.patch("/account/password", requireAdmin, async (request, response) => {
  const currentPassword = String(request.body?.currentPassword || "");
  const newPassword = String(request.body?.newPassword || "");
  if (newPassword.length < 10 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
    return response.status(400).json({ error: "New password must be at least 10 characters and include uppercase, lowercase and a number." });
  }
  const current = await readSettings();
  if (!verifyPassword(current.admin, currentPassword)) return response.status(403).json({ error: "Current password is incorrect." });
  await updateSettings((settings) => {
    setPassword(settings.admin, newPassword);
    return settings;
  });
  revokeAdminSessions(request.admin.id);
  clearSession(request, response);
  return response.json({ message: "Password changed. Sign in again with the new password." });
});
