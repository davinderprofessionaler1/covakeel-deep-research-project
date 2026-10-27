import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { databaseStatus, saveEnquiry } from "./db.js";
import { registerAuthRoutes } from "./auth.js";
import { registerChatRoutes } from "./chat.js";
import { registerAttachmentRoutes } from "./attachments.js";
import { registerBrandingRoutes } from "./branding.js";
import { registerInternalAdminRoutes } from "./internal-admin.js";
import { registerSourceFileRoutes } from "./source-files.js";
import { managedPlans } from "./managed-settings.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const production = process.env.NODE_ENV === "production";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: production ? undefined : false }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://127.0.0.1:5173" }));
app.use(express.json({ limit: "32kb" }));

registerAuthRoutes(app);
registerBrandingRoutes(app);
registerInternalAdminRoutes(app);
registerAttachmentRoutes(app);
registerSourceFileRoutes(app);
registerChatRoutes(app);

app.get("/api/plans", async (_request, response) => response.json({ plans: await managedPlans() }));

app.get("/api/health", async (_request, response) => {
  response.json({ status: "ok", database: await databaseStatus() });
});

app.post("/api/enquiries", async (request, response) => {
  const values = Object.fromEntries(
    ["name", "email", "organisation", "message"].map((key) => [key, String(request.body?.[key] || "").trim()]),
  );
  const errors = [];
  if (values.name.length < 2 || values.name.length > 100) errors.push("Please enter a valid name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) || values.email.length > 200) errors.push("Please enter a valid email address.");
  if (values.organisation.length > 160) errors.push("Organisation is too long.");
  if (values.message.length < 10 || values.message.length > 2000) errors.push("Message must be between 10 and 2,000 characters.");
  if (errors.length) return response.status(400).json({ error: errors[0] });

  try {
    const enquiry = await saveEnquiry(values);
    return response.status(201).json({ id: enquiry.id, createdAt: enquiry.created_at });
  } catch (error) {
    if (error.code === "DATABASE_NOT_CONFIGURED") {
      return response.status(503).json({ error: "Contact form storage is not configured. Add DATABASE_URL and run the database schema." });
    }
    console.error("Unable to save enquiry:", error.message);
    return response.status(503).json({ error: "The contact service is temporarily unavailable." });
  }
});

if (production) {
  app.use(express.static(path.join(root, "dist"), { maxAge: "1d", index: false }));
  app.get("*path", (_request, response) => response.sendFile(path.join(root, "dist", "index.html")));
}

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: "Unexpected server error." });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`CoVakeel landing API: http://127.0.0.1:${port}`);
});
