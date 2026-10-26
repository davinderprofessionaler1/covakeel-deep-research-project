import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const landingRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const storageRoot = path.resolve(landingRoot, "..", "storage", "admin");
const settingsPath = path.join(storageRoot, "settings.json");
const brandingRoot = path.join(storageRoot, "branding");

async function publicBranding() {
  try {
    const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
    return {
      brandName: settings.branding?.brandName || "CoVakeel",
      hasLogo: Boolean(settings.branding?.logoFilename),
      logoUrl: settings.branding?.logoFilename ? "/api/branding/logo" : "",
      updatedAt: settings.branding?.updatedAt || null,
    };
  } catch (error) {
    if (error.code !== "ENOENT") console.error("Unable to read branding settings:", error.message);
    return { brandName: "CoVakeel", hasLogo: false, logoUrl: "", updatedAt: null };
  }
}

export function registerBrandingRoutes(app) {
  app.get("/api/branding", async (_request, response) => response.json(await publicBranding()));
  app.get("/api/branding/logo", async (_request, response) => {
    try {
      const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
      if (!settings.branding?.logoFilename) return response.status(404).end();
      response.set("Cache-Control", "no-cache");
      return response.sendFile(path.join(brandingRoot, settings.branding.logoFilename));
    } catch {
      return response.status(404).end();
    }
  });
}
