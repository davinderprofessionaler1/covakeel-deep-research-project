import crypto from "node:crypto";
import { readSettings, verifyPassword } from "./settings-store.js";

const COOKIE_NAME = "covakeel_admin_session";
const sessions = new Map();

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((item) => item.trim()).filter(Boolean).map((item) => {
    const index = item.indexOf("=");
    return [decodeURIComponent(item.slice(0, index)), decodeURIComponent(item.slice(index + 1))];
  }));
}

function sessionHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge,
    path: "/",
  };
}

export async function login(email, password) {
  const settings = await readSettings();
  if (settings.admin.email.toLowerCase() !== String(email || "").trim().toLowerCase() || !verifyPassword(settings.admin, password)) return null;
  const token = crypto.randomBytes(32).toString("base64url");
  const maxAge = Number(process.env.ADMIN_SESSION_DAYS || 7) * 24 * 60 * 60 * 1000;
  sessions.set(sessionHash(token), { adminId: settings.admin.id, expiresAt: Date.now() + maxAge });
  return { token, maxAge, admin: safeAdmin(settings.admin) };
}

export async function resolveAdmin(request) {
  const token = parseCookies(request.headers.cookie)[COOKIE_NAME];
  if (!token) return null;
  const key = sessionHash(token);
  const session = sessions.get(key);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(key);
    return null;
  }
  const settings = await readSettings();
  return settings.admin.id === session.adminId ? safeAdmin(settings.admin) : null;
}

export function safeAdmin(admin) {
  return { id: admin.id, name: admin.name, email: admin.email, updatedAt: admin.updatedAt };
}

export function setSessionCookie(response, token, maxAge) {
  response.cookie(COOKIE_NAME, token, cookieOptions(maxAge));
}

export function clearSession(request, response) {
  const token = parseCookies(request.headers.cookie)[COOKIE_NAME];
  if (token) sessions.delete(sessionHash(token));
  response.clearCookie(COOKIE_NAME, cookieOptions(0));
}

export function revokeAdminSessions(adminId) {
  for (const [key, session] of sessions) if (session.adminId === adminId) sessions.delete(key);
}

export async function requireAdmin(request, response, next) {
  const admin = await resolveAdmin(request);
  if (!admin) return response.status(401).json({ error: "Admin authentication is required." });
  request.admin = admin;
  return next();
}
