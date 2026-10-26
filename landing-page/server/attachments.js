import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import mammoth from "mammoth";
import multer from "multer";
import { resolveSession } from "./auth.js";
import { getAttachments, getConversation, saveAttachment } from "./chat-store.js";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const uploadRoot = path.join(root, "storage", "uploads");
const maxFileBytes = 15 * 1024 * 1024;
const maxExtractedCharacters = 100_000;

const allowedExtensions = new Set([".pdf", ".doc", ".docx", ".txt", ".md", ".csv", ".json", ".jpg", ".jpeg", ".png", ".webp"]);
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const textExtensions = new Set([".txt", ".md", ".csv", ".json"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 5, fileSize: maxFileBytes, fields: 5 },
});

function runUpload(request, response) {
  return new Promise((resolve, reject) => {
    upload.array("files", 5)(request, response, (error) => error ? reject(error) : resolve());
  });
}

function normalizedExtension(name) {
  return path.extname(String(name || "")).toLowerCase();
}

function safeOriginalName(name) {
  return path.basename(String(name || "file")).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255) || "file";
}

async function extractLegacyWord(filePath) {
  const outputDirectory = await fs.mkdtemp(path.join(root, "storage", "doc-convert-"));
  try {
    await execFileAsync("libreoffice", ["--headless", "--convert-to", "txt:Text", "--outdir", outputDirectory, filePath], { timeout: 30_000, maxBuffer: 1024 * 1024 });
    const outputPath = path.join(outputDirectory, `${path.basename(filePath, path.extname(filePath))}.txt`);
    return await fs.readFile(outputPath, "utf8");
  } finally {
    await fs.rm(outputDirectory, { recursive: true, force: true });
  }
}

async function extractText(filePath, extension) {
  if (textExtensions.has(extension)) return fs.readFile(filePath, "utf8");
  if (extension === ".pdf") {
    const result = await execFileAsync("pdftotext", ["-layout", filePath, "-"], { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
    return result.stdout;
  }
  if (extension === ".docx") {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }
  if (extension === ".doc") return extractLegacyWord(filePath);
  return "";
}

function publicAttachment(attachment) {
  return {
    id: attachment.id,
    name: attachment.name,
    mime_type: attachment.mime_type,
    size_bytes: attachment.size_bytes,
    extraction_status: attachment.extraction_status,
    created_at: attachment.created_at,
    download_url: `/api/attachments/${attachment.id}/download`,
  };
}

export function registerAttachmentRoutes(app) {
  app.post("/api/conversations/:id/attachments", async (request, response) => {
    const session = await resolveSession(request);
    if (!session) return response.status(401).json({ error: "Authentication required." });
    const conversation = await getConversation(session.user_id, request.params.id);
    if (!conversation) return response.status(404).json({ error: "Conversation not found." });

    try {
      await runUpload(request, response);
    } catch (error) {
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") return response.status(413).json({ error: "Each file must be 15 MB or smaller." });
      return response.status(400).json({ error: "Unable to read the uploaded files." });
    }
    if (!request.files?.length) return response.status(400).json({ error: "Choose at least one file." });

    const invalid = request.files.find((file) => !allowedExtensions.has(normalizedExtension(file.originalname)));
    if (invalid) return response.status(415).json({ error: `${safeOriginalName(invalid.originalname)} is not a supported file type.` });

    const directory = path.join(uploadRoot, String(session.user_id), conversation.id);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const saved = [];
    for (const file of request.files) {
      const extension = normalizedExtension(file.originalname);
      const name = safeOriginalName(file.originalname);
      const storagePath = path.join(directory, `${crypto.randomUUID()}${extension}`);
      await fs.writeFile(storagePath, file.buffer, { mode: 0o600 });
      let extractedText = "";
      let extractionStatus = imageExtensions.has(extension) ? "stored_image" : "extracted";
      if (!imageExtensions.has(extension)) {
        try {
          extractedText = (await extractText(storagePath, extension)).replace(/\u0000/g, "").trim().slice(0, maxExtractedCharacters);
          if (!extractedText) extractionStatus = "no_text_found";
        } catch (error) {
          console.error(`Attachment extraction failed for ${name}:`, error.message);
          extractionStatus = "extraction_failed";
        }
      }
      const attachment = await saveAttachment({
        userId: session.user_id,
        conversationId: conversation.id,
        name,
        mimeType: file.mimetype || "application/octet-stream",
        sizeBytes: file.size,
        storagePath,
        extractedText,
        extractionStatus,
      });
      if (!attachment) {
        await fs.unlink(storagePath).catch(() => {});
        return response.status(404).json({ error: "Conversation not found." });
      }
      saved.push(publicAttachment(attachment));
    }
    return response.status(201).json({ attachments: saved });
  });

  app.get("/api/attachments/:id/download", async (request, response) => {
    const session = await resolveSession(request);
    if (!session) return response.status(401).json({ error: "Authentication required." });
    const conversations = String(request.query.conversationId || "");
    if (!conversations) return response.status(400).json({ error: "Conversation ID is required." });
    const attachment = (await getAttachments(session.user_id, conversations, [request.params.id]))[0];
    if (!attachment) return response.status(404).json({ error: "Attachment not found." });
    return response.download(attachment.storage_path, attachment.name);
  });
}
