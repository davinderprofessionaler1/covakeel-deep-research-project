import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { requireAdmin } from "../services/admin-auth.js";
import { brandingRoot, publicBranding, publicPlans, readSettings, setSmtpPassword, updateSettings } from "../services/settings-store.js";

export const settingsRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
const logoTypes = new Map([
  ["image/png", { extension: ".png", signature: (data) => data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) }],
  ["image/jpeg", { extension: ".jpg", signature: (data) => data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff }],
  ["image/webp", { extension: ".webp", signature: (data) => data.subarray(0, 4).toString() === "RIFF" && data.subarray(8, 12).toString() === "WEBP" }],
]);

function settingsResponse(settings) {
  return {
    branding: { ...publicBranding(settings), logoUrl: settings.branding.logoFilename ? "/api/admin/settings/logo" : "" },
    smtp: {
      host: settings.smtp.host,
      port: settings.smtp.port,
      secure: settings.smtp.secure,
      username: settings.smtp.username,
      from: settings.smtp.from,
      passwordConfigured: Boolean(settings.smtp.passwordEncrypted),
      updatedAt: settings.smtp.updatedAt,
    },
    plans: publicPlans(settings),
  };
}

settingsRouter.get("/settings", requireAdmin, async (_request, response) => response.json(settingsResponse(await readSettings())));

settingsRouter.put("/settings/branding", requireAdmin, async (request, response) => {
  const brandName = String(request.body?.brandName || "").trim();
  if (brandName.length < 2 || brandName.length > 60) return response.status(400).json({ error: "Brand name must be between 2 and 60 characters." });
  const settings = await updateSettings((value) => {
    value.branding.brandName = brandName;
    value.branding.updatedAt = new Date().toISOString();
    return value;
  });
  return response.json(settingsResponse(settings));
});

settingsRouter.post("/settings/logo", requireAdmin, upload.single("logo"), async (request, response) => {
  if (!request.file) return response.status(400).json({ error: "Choose a PNG, JPG or WebP logo." });
  const type = logoTypes.get(request.file.mimetype);
  if (!type || !type.signature(request.file.buffer)) return response.status(400).json({ error: "Logo must be a valid PNG, JPG or WebP image." });
  await fs.mkdir(brandingRoot, { recursive: true });
  const filename = `logo${type.extension}`;
  await fs.writeFile(path.join(brandingRoot, filename), request.file.buffer, { mode: 0o644 });
  const settings = await updateSettings(async (value) => {
    if (value.branding.logoFilename && value.branding.logoFilename !== filename) {
      await fs.rm(path.join(brandingRoot, value.branding.logoFilename), { force: true });
    }
    value.branding.logoFilename = filename;
    value.branding.updatedAt = new Date().toISOString();
    return value;
  });
  return response.json(settingsResponse(settings));
});

settingsRouter.get("/settings/logo", requireAdmin, async (_request, response) => {
  const settings = await readSettings();
  if (!settings.branding.logoFilename) return response.status(404).end();
  response.set("Cache-Control", "no-cache");
  return response.sendFile(path.join(brandingRoot, settings.branding.logoFilename));
});

settingsRouter.put("/settings/smtp", requireAdmin, async (request, response) => {
  const host = String(request.body?.host || "").trim();
  const port = Number(request.body?.port || 587);
  const username = String(request.body?.username || "").trim();
  const from = String(request.body?.from || "").trim();
  const password = String(request.body?.password || "");
  if (host.length > 255 || username.length > 255 || from.length > 320) return response.status(400).json({ error: "SMTP values are too long." });
  if (!Number.isInteger(port) || port < 1 || port > 65535) return response.status(400).json({ error: "SMTP port must be between 1 and 65535." });
  if (from && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from.replace(/^.*<([^>]+)>.*$/, "$1"))) return response.status(400).json({ error: "Enter a valid sender email address." });
  const settings = await updateSettings((value) => {
    value.smtp.host = host;
    value.smtp.port = port;
    value.smtp.secure = Boolean(request.body?.secure);
    value.smtp.username = username;
    value.smtp.from = from;
    if (password) setSmtpPassword(value.smtp, password);
    value.smtp.updatedAt = new Date().toISOString();
    return value;
  });
  return response.json(settingsResponse(settings));
});

settingsRouter.put("/settings/plans", requireAdmin, async (request, response) => {
  const plans = request.body?.plans;
  if (!Array.isArray(plans) || plans.length < 1 || plans.length > 8) return response.status(400).json({ error: "Add between 1 and 8 plans." });
  const normalized = plans.map((plan, index) => ({
    id: String(plan.id || `plan-${index + 1}`).trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 48),
    name: String(plan.name || "").trim().slice(0, 60),
    priceMonthly: Number(plan.priceMonthly),
    currency: String(plan.currency || "INR").trim().toUpperCase().slice(0, 3),
    description: String(plan.description || "").trim().slice(0, 240),
    active: Boolean(plan.active),
  }));
  if (normalized.some((plan) => !plan.id || !plan.name || !Number.isFinite(plan.priceMonthly) || plan.priceMonthly < 0 || !/^[A-Z]{3}$/.test(plan.currency))) {
    return response.status(400).json({ error: "Each plan needs a name, valid currency and non-negative monthly price." });
  }
  if (new Set(normalized.map((plan) => plan.id)).size !== normalized.length) return response.status(400).json({ error: "Plan identifiers must be unique." });
  const settings = await updateSettings((value) => { value.plans = normalized; return value; });
  return response.json({ plans: publicPlans(settings) });
});
