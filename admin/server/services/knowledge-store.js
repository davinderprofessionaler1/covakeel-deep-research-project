import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import mammoth from "mammoth";

const execFileAsync = promisify(execFile);
const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const projectRoot = path.resolve(adminRoot, "..");
const adminKnowledgeRoot = path.join(projectRoot, "knowledge", "admin");
const rawUploadRoot = path.join(adminKnowledgeRoot, "raw");
const manifestPath = path.join(adminKnowledgeRoot, "documents.json");
const allowedTypes = new Set(["constitution", "act", "rule", "regulation", "notification", "judgment", "order", "amendment", "ordinance", "other"]);
const allowedExtensions = new Set([".pdf", ".doc", ".docx", ".txt", ".md", ".csv", ".json"]);
const textExtensions = new Set([".txt", ".md", ".csv", ".json"]);
const maxExtractedCharacters = 2_000_000;

function safeValue(value, max = 500) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function safeName(name) {
  return path.basename(String(name || "document")).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 220) || "document";
}

async function readEnvironment() {
  try {
    const contents = await fs.readFile(path.join(projectRoot, ".env"), "utf8");
    return Object.fromEntries(contents.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")];
    }));
  } catch {
    return {};
  }
}

export async function activeKnowledgeConfig() {
  const environment = await readEnvironment();
  const configured = process.env.COVAKEEL_KNOWLEDGE_INDEX || environment.COVAKEEL_KNOWLEDGE_INDEX || "knowledge/approved/chunks.jsonl";
  const indexPath = path.resolve(projectRoot, configured);
  if (indexPath !== projectRoot && !indexPath.startsWith(`${projectRoot}${path.sep}`)) throw new Error("Knowledge index must remain inside the CoVakeel project.");
  const pendingSetting = process.env.COVAKEEL_ALLOW_PENDING_KNOWLEDGE || environment.COVAKEEL_ALLOW_PENDING_KNOWLEDGE || "false";
  return {
    indexPath,
    relativePath: path.relative(projectRoot, indexPath),
    allowPending: /^(1|true|yes|on)$/i.test(pendingSetting),
  };
}

async function readRecords() {
  const config = await activeKnowledgeConfig();
  let contents = "";
  try { contents = await fs.readFile(config.indexPath, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const records = [];
  let invalidRecords = 0;
  for (const line of contents.split("\n")) {
    if (!line.trim()) continue;
    try { records.push(JSON.parse(line)); } catch { invalidRecords += 1; }
  }
  return { config, records, invalidRecords };
}

async function writeRecords(indexPath, records) {
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  const temporaryPath = path.join(path.dirname(indexPath), `.admin-${crypto.randomUUID()}.jsonl`);
  const output = records.map((record) => JSON.stringify(record)).join("\n");
  await fs.writeFile(temporaryPath, output ? `${output}\n` : "", { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporaryPath, indexPath);
}

function summarizeDocuments(records) {
  const documents = new Map();
  for (const record of records) {
    const documentId = safeValue(record.document_id || record.id, 180);
    if (!documentId) continue;
    const existing = documents.get(documentId);
    if (existing) {
      existing.chunkCount += 1;
      existing.characterCount += String(record.text || "").length;
      if (record.verification_status !== existing.status) existing.status = "mixed";
      continue;
    }
    documents.set(documentId, {
      id: documentId,
      title: safeValue(record.title || "Untitled document", 300),
      documentType: safeValue(record.document_type || "other", 40),
      status: safeValue(record.verification_status || "unknown", 30),
      sourcePublisher: safeValue(record.source_publisher || "Not specified", 220),
      sourceUrl: safeValue(record.source_url, 1000),
      language: safeValue(record.language || "en", 20),
      retrievedAt: record.retrieved_at || null,
      chunkCount: 1,
      characterCount: String(record.text || "").length,
      preview: safeValue(record.text, 260),
    });
  }
  return [...documents.values()];
}

export async function listKnowledge({ search = "", status = "all", page = 1, pageSize = 12 } = {}) {
  const { config, records, invalidRecords } = await readRecords();
  const query = safeValue(search, 200).toLocaleLowerCase("en-IN");
  let documents = summarizeDocuments(records);
  if (query) documents = documents.filter((document) => [document.title, document.id, document.documentType, document.sourcePublisher, document.preview].some((value) => value.toLocaleLowerCase("en-IN").includes(query)));
  if (status !== "all") documents = documents.filter((document) => document.status === status);
  documents.sort((first, second) => first.title.localeCompare(second.title, "en-IN"));
  const safePageSize = Math.min(Math.max(Number(pageSize) || 12, 1), 50);
  const total = documents.length;
  const pages = Math.max(Math.ceil(total / safePageSize), 1);
  const currentPage = Math.min(Math.max(Number(page) || 1, 1), pages);
  const start = (currentPage - 1) * safePageSize;
  const counts = records.reduce((result, record) => {
    const key = ["approved", "pending", "rejected"].includes(record.verification_status) ? record.verification_status : "unknown";
    result[key] += 1;
    return result;
  }, { approved: 0, pending: 0, rejected: 0, unknown: 0 });
  return {
    documents: documents.slice(start, start + safePageSize),
    pagination: { page: currentPage, pageSize: safePageSize, pages, total },
    summary: { ...counts, totalRecords: records.length, totalDocuments: summarizeDocuments(records).length, invalidRecords },
    activeIndex: config.relativePath,
    allowPending: config.allowPending,
  };
}

async function readJson(filePath, fallback) {
  try { return JSON.parse(await fs.readFile(filePath, "utf8")); } catch { return fallback; }
}

export async function getKnowledgeCatalog() {
  const store = await readRecords();
  const activeDocuments = summarizeDocuments(store.records).sort((first, second) => first.title.localeCompare(second.title, "en-IN"));
  const taxSources = await readJson(path.join(projectRoot, "knowledge", "tax", "downloaded-sources.json"), []);
  const plannedManifest = await readJson(path.join(projectRoot, "knowledge", "catalog", "additional-laws.json"), { records: [] });
  const activeTitles = new Set(activeDocuments.map((document) => document.title.toLocaleLowerCase("en-IN")));
  const importedTaxSources = taxSources.filter((source) => activeTitles.has(String(source.title || "").toLocaleLowerCase("en-IN"))).length;
  return {
    active: {
      count: activeDocuments.length,
      description: "Documents currently present in CoVakeel's active RAG index.",
      items: activeDocuments.map((document) => ({ id: document.id, title: document.title, category: document.documentType, status: document.status, detail: `${document.chunkCount.toLocaleString("en-IN")} chunks` })),
    },
    tax: {
      count: taxSources.length,
      downloaded: taxSources.filter((source) => source.status === "downloaded").length,
      imported: importedTaxSources,
      description: "Official tax sources collected separately and awaiting staged review/import.",
      items: taxSources.map((source) => ({ id: source.id, title: source.title, category: "tax", status: activeTitles.has(String(source.title || "").toLocaleLowerCase("en-IN")) ? "active" : source.status === "downloaded" ? "downloaded" : "needs_download", detail: source.authority, filename: source.filename || null })),
    },
    planned: {
      count: plannedManifest.records?.length || 0,
      description: "Additional official laws identified for collection, extraction and legal review.",
      items: (plannedManifest.records || []).map((source, index) => ({ id: `planned-${index + 1}`, title: source.title, category: source.category, status: source.collection_status || "not_downloaded", detail: source.source_kind })),
    },
  };
}

export async function getKnowledgeDocument(documentId) {
  const { records } = await readRecords();
  const chunks = records.filter((record) => record.document_id === documentId);
  if (!chunks.length) return null;
  return {
    document: summarizeDocuments(chunks)[0],
    chunks: chunks.map((record) => ({ id: record.id, section: record.section || null, pageStart: record.page_start || null, pageEnd: record.page_end || null, status: record.verification_status, text: record.text })),
  };
}

async function extractLegacyWord(filePath) {
  const outputDirectory = await fs.mkdtemp(path.join(adminKnowledgeRoot, "convert-"));
  try {
    await execFileAsync("libreoffice", ["--headless", "--convert-to", "txt:Text", "--outdir", outputDirectory, filePath], { timeout: 45_000, maxBuffer: 1024 * 1024 });
    return fs.readFile(path.join(outputDirectory, `${path.basename(filePath, path.extname(filePath))}.txt`), "utf8");
  } finally {
    await fs.rm(outputDirectory, { recursive: true, force: true });
  }
}

async function extractText(filePath, extension) {
  if (textExtensions.has(extension)) return fs.readFile(filePath, "utf8");
  if (extension === ".pdf") {
    const result = await execFileAsync("pdftotext", ["-layout", filePath, "-"], { timeout: 45_000, maxBuffer: 12 * 1024 * 1024 });
    return result.stdout;
  }
  if (extension === ".docx") return (await mammoth.extractRawText({ path: filePath })).value;
  if (extension === ".doc") return extractLegacyWord(filePath);
  return "";
}

function chunkText(value, maxLength = 1800) {
  const paragraphs = value.replace(/\r/g, "").split(/\n\s*\n/).map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean);
  const chunks = [];
  let current = "";
  const push = () => { if (current.trim()) chunks.push(current.trim()); current = ""; };
  for (const paragraph of paragraphs) {
    if (paragraph.length > maxLength) {
      push();
      for (let index = 0; index < paragraph.length; index += maxLength) chunks.push(paragraph.slice(index, index + maxLength).trim());
    } else if (!current || current.length + paragraph.length + 2 <= maxLength) {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    } else {
      push();
      current = paragraph;
    }
  }
  push();
  return chunks;
}

async function updateManifest(documentId, metadata) {
  await fs.mkdir(adminKnowledgeRoot, { recursive: true, mode: 0o700 });
  let manifest = {};
  try { manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")); } catch { manifest = {}; }
  if (metadata) manifest[documentId] = metadata;
  else delete manifest[documentId];
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return manifest;
}

export async function addKnowledgeDocument(fields, file) {
  const title = safeValue(fields.title, 300);
  const documentType = allowedTypes.has(fields.documentType) ? fields.documentType : "other";
  const status = fields.status === "approved" ? "approved" : "pending";
  if (!title) throw Object.assign(new Error("Document title is required."), { statusCode: 400 });
  if (status === "approved" && fields.approvalConfirmed !== "true") throw Object.assign(new Error("Confirm legal review before adding approved knowledge."), { statusCode: 400 });
  const extension = file ? path.extname(file.originalname).toLowerCase() : "";
  if (file && !allowedExtensions.has(extension)) throw Object.assign(new Error("Use PDF, DOC, DOCX, TXT, MD, CSV or JSON files."), { statusCode: 415 });

  const documentId = `admin-${crypto.randomUUID()}`;
  let storagePath = null;
  let extracted = safeValue(fields.text, maxExtractedCharacters);
  await fs.mkdir(rawUploadRoot, { recursive: true, mode: 0o700 });
  if (file) {
    storagePath = path.join(rawUploadRoot, `${documentId}${extension}`);
    await fs.writeFile(storagePath, file.buffer, { mode: 0o600 });
    try { extracted = (await extractText(storagePath, extension)).replace(/\u0000/g, "").trim().slice(0, maxExtractedCharacters); }
    catch (error) {
      await fs.unlink(storagePath).catch(() => {});
      throw Object.assign(new Error(`Unable to extract text from ${safeName(file.originalname)}: ${error.message}`), { statusCode: 422 });
    }
  }
  if (!extracted) {
    if (storagePath) await fs.unlink(storagePath).catch(() => {});
    throw Object.assign(new Error("The document does not contain readable text. Add text manually or choose another file."), { statusCode: 422 });
  }

  const chunks = chunkText(extracted);
  const checksum = crypto.createHash("sha256").update(file?.buffer || extracted).digest("hex");
  const sourceUrl = safeValue(fields.sourceUrl, 1000) || `urn:covakeel:admin:${documentId}`;
  const baseSection = safeValue(fields.section, 150) || null;
  const now = new Date().toISOString();
  const records = chunks.map((text, index) => ({
    id: `${documentId}-c${index + 1}`,
    document_id: documentId,
    document_type: documentType,
    title,
    act_number: null,
    section: chunks.length > 1 ? `${baseSection || "Document"} · Part ${index + 1}` : baseSection,
    court: null,
    case_number: null,
    neutral_citation: null,
    jurisdiction: safeValue(fields.jurisdiction, 80) || "India",
    language: safeValue(fields.language, 20) || "en",
    publication_date: null,
    effective_from: null,
    effective_to: null,
    source_url: sourceUrl,
    source_publisher: safeValue(fields.sourcePublisher, 220) || "CoVakeel admin upload",
    retrieved_at: now,
    sha256: checksum,
    page_start: null,
    page_end: null,
    text,
    verification_status: status,
    supersedes: [],
    notes: safeValue(fields.notes, 1000) || "Added through CoVakeel Admin.",
  }));
  const store = await readRecords();
  await writeRecords(store.config.indexPath, [...store.records, ...records]);
  await updateManifest(documentId, { storagePath, originalName: file ? safeName(file.originalname) : null, createdAt: now });
  return { document: summarizeDocuments(records)[0], chunksAdded: records.length, activeIndex: store.config.relativePath, restartRequired: true };
}

export async function deleteKnowledgeDocument(documentId) {
  const safeDocumentId = safeValue(documentId, 180);
  const store = await readRecords();
  const remaining = store.records.filter((record) => record.document_id !== safeDocumentId);
  const removed = store.records.length - remaining.length;
  if (!removed) return null;
  await writeRecords(store.config.indexPath, remaining);
  let manifest = {};
  try { manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")); } catch { manifest = {}; }
  const storagePath = manifest[safeDocumentId]?.storagePath;
  if (storagePath && path.resolve(storagePath).startsWith(`${rawUploadRoot}${path.sep}`)) await fs.unlink(storagePath).catch(() => {});
  await updateManifest(safeDocumentId, null);
  return { documentId: safeDocumentId, chunksDeleted: removed, restartRequired: true };
}
