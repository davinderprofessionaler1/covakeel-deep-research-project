import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const projectRoot = path.resolve(adminRoot, "..");

async function countJsonLines(filePath) {
  try {
    const contents = await readFile(filePath, "utf8");
    return contents.split("\n").filter((line) => line.trim()).length;
  } catch {
    return 0;
  }
}

async function checkService(id, name, icon, url, detail) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1800) });
    return {
      id,
      name,
      icon,
      status: response.ok ? "online" : "offline",
      detail: response.ok ? `${detail} · ${Date.now() - startedAt} ms` : `${detail} · HTTP ${response.status}`,
    };
  } catch {
    return { id, name, icon, status: "offline", detail: `${detail} · Not reachable` };
  }
}

export async function getDashboard() {
  const pendingPath = path.join(projectRoot, "knowledge/phase1/pending/phase1-all.pending.jsonl");
  const approvedPath = path.join(projectRoot, "knowledge/approved/chunks.jsonl");
  const [pendingRecords, approvedRecords, landingService, aiService] = await Promise.all([
    countJsonLines(pendingPath),
    countJsonLines(approvedPath),
    checkService("landing", "User application API", "◫", `${process.env.LANDING_API_URL || "http://127.0.0.1:3001"}/api/health`, "Node.js landing backend"),
    checkService("ai", "Legal AI service", "⚖", `${process.env.AI_SERVICE_URL || "http://127.0.0.1:8080"}/api/health`, "Local RAG and LLM service"),
  ]);

  return {
    environment: process.env.NODE_ENV === "production" ? "Production" : "Local development",
    generatedAt: new Date().toISOString(),
    metrics: {
      registeredUsers: { value: "—", note: "Available after PostgreSQL setup" },
      conversations: { value: "—", note: "Available after PostgreSQL setup" },
      approvedRecords: { value: approvedRecords.toLocaleString("en-IN"), note: "Approved knowledge chunks" },
      pendingRecords: { value: pendingRecords.toLocaleString("en-IN"), note: "Awaiting legal review" },
    },
    services: [
      { id: "admin", name: "Admin API", icon: "◆", status: "online", detail: "Dedicated Node.js backend" },
      landingService,
      aiService,
    ],
  };
}
