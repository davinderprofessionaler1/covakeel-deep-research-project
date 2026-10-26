import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const projectRoot = path.resolve(adminRoot, "..");
const storageRoot = path.join(projectRoot, "storage", "admin");
const settingsPath = path.join(storageRoot, "settings.json");
export const brandingRoot = path.join(storageRoot, "branding");

const defaultEmail = String(process.env.ADMIN_INITIAL_EMAIL || "admin@covakeel.local").trim().toLowerCase();
const configuredInitialPassword = process.env.ADMIN_INITIAL_PASSWORD;
const defaultPassword = configuredInitialPassword || "Admin@12345";

function passwordRecord(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString("hex") };
}

function encryptionKey() {
  const secret = process.env.ADMIN_SETTINGS_SECRET || (process.env.NODE_ENV === "production" ? "" : "covakeel-local-settings-only");
  if (!secret) throw new Error("ADMIN_SETTINGS_SECRET is required in production.");
  return crypto.createHash("sha256").update(secret).digest();
}

function encrypt(value) {
  if (!value) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decrypt(value) {
  if (!value) return "";
  const [ivValue, tagValue, payload] = value.split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(payload, "base64url")), decipher.final()]).toString("utf8");
}

function initialSettings() {
  if (process.env.NODE_ENV === "production" && !configuredInitialPassword) {
    throw new Error("ADMIN_INITIAL_PASSWORD is required when creating production admin settings.");
  }
  const password = passwordRecord(defaultPassword);
  return {
    version: 1,
    admin: {
      id: crypto.randomUUID(),
      name: process.env.ADMIN_INITIAL_NAME || "Local administrator",
      email: defaultEmail,
      passwordSalt: password.salt,
      passwordHash: password.hash,
      updatedAt: new Date().toISOString(),
    },
    branding: {
      brandName: "CoVakeel",
      logoFilename: "",
      updatedAt: new Date().toISOString(),
    },
    smtp: {
      host: "",
      port: 587,
      secure: false,
      username: "",
      passwordEncrypted: "",
      from: "",
      updatedAt: null,
    },
  };
}

async function atomicWrite(value) {
  await fs.mkdir(storageRoot, { recursive: true });
  const temporary = `${settingsPath}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, settingsPath);
}

export async function readSettings() {
  try {
    return JSON.parse(await fs.readFile(settingsPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const settings = initialSettings();
    await atomicWrite(settings);
    return settings;
  }
}

export async function updateSettings(mutator) {
  const current = await readSettings();
  const updated = await mutator(structuredClone(current));
  await atomicWrite(updated);
  return updated;
}

export function verifyPassword(admin, password) {
  const expected = Buffer.from(admin.passwordHash, "hex");
  const actual = crypto.scryptSync(String(password || ""), admin.passwordSalt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function setPassword(admin, password) {
  const record = passwordRecord(password);
  admin.passwordSalt = record.salt;
  admin.passwordHash = record.hash;
  admin.updatedAt = new Date().toISOString();
}

export function setSmtpPassword(smtp, password) {
  smtp.passwordEncrypted = encrypt(password);
}

export function publicBranding(settings) {
  return {
    brandName: settings.branding.brandName || "CoVakeel",
    hasLogo: Boolean(settings.branding.logoFilename),
    logoFilename: settings.branding.logoFilename || "",
    updatedAt: settings.branding.updatedAt,
  };
}
