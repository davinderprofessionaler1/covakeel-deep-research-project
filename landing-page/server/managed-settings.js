import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const landingRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const settingsPath = path.resolve(landingRoot, "..", "storage", "admin", "settings.json");

function encryptionKey() {
  const secret = process.env.ADMIN_SETTINGS_SECRET || (process.env.NODE_ENV === "production" ? "" : "covakeel-local-settings-only");
  if (!secret) throw new Error("ADMIN_SETTINGS_SECRET is required to read managed SMTP settings.");
  return crypto.createHash("sha256").update(secret).digest();
}

function decrypt(value) {
  if (!value) return "";
  const [ivValue, tagValue, payload] = value.split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(payload, "base64url")), decipher.final()]).toString("utf8");
}

export async function managedSmtpSettings() {
  try {
    const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
    const smtp = settings.smtp || {};
    if (!smtp.host || !smtp.username || !smtp.passwordEncrypted || !smtp.from) return null;
    return {
      host: smtp.host,
      port: Number(smtp.port || 587),
      secure: Boolean(smtp.secure),
      user: smtp.username,
      pass: decrypt(smtp.passwordEncrypted),
      from: smtp.from,
    };
  } catch (error) {
    if (error.code !== "ENOENT") console.error("Unable to load managed SMTP settings:", error.message);
    return null;
  }
}
