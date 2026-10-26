import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dashboardRouter } from "./routes/dashboard.js";
import { knowledgeRouter } from "./routes/knowledge.js";

const app = express();
const port = Number(process.env.ADMIN_API_PORT || 3010);
const production = process.env.NODE_ENV === "production";
const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: production ? undefined : false }));
app.use(cors({ origin: process.env.ADMIN_CLIENT_ORIGIN || "http://127.0.0.1:5174" }));
app.use(express.json({ limit: "32kb" }));

app.get("/api/admin/health", (_request, response) => {
  response.json({ status: "ok", service: "covakeel-admin-api", environment: production ? "production" : "development" });
});
app.use("/api/admin", dashboardRouter);
app.use("/api/admin", knowledgeRouter);

if (production) {
  app.use(express.static(path.join(adminRoot, "dist"), { maxAge: "1d", index: false }));
  app.get("*path", (_request, response) => response.sendFile(path.join(adminRoot, "dist", "index.html")));
}

app.use((error, _request, response, _next) => {
  console.error("Admin API error:", error);
  response.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : "The admin service encountered an unexpected error." });
});

app.listen(port, process.env.ADMIN_API_HOST || "127.0.0.1", () => {
  console.log(`CoVakeel admin API: http://127.0.0.1:${port}`);
});
