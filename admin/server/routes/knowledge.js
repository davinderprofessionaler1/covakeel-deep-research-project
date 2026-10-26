import multer from "multer";
import { Router } from "express";
import { addKnowledgeDocument, deleteKnowledgeDocument, getKnowledgeCatalog, getKnowledgeDocument, listKnowledge } from "../services/knowledge-store.js";

export const knowledgeRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: 20 * 1024 * 1024, fields: 20, fieldSize: 1024 * 1024 } });

function receiveDocument(request, response, next) {
  upload.single("file")(request, response, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") return response.status(413).json({ error: "The document must be 20 MB or smaller." });
    return response.status(400).json({ error: "Unable to read the uploaded document." });
  });
}

knowledgeRouter.get("/knowledge", async (request, response, next) => {
  try {
    response.json(await listKnowledge({ search: request.query.search, status: request.query.status, page: request.query.page, pageSize: request.query.pageSize }));
  } catch (error) { next(error); }
});

knowledgeRouter.get("/knowledge/catalog", async (_request, response, next) => {
  try { response.json(await getKnowledgeCatalog()); }
  catch (error) { next(error); }
});

knowledgeRouter.get("/knowledge/documents/:documentId", async (request, response, next) => {
  try {
    const result = await getKnowledgeDocument(request.params.documentId);
    if (!result) return response.status(404).json({ error: "Knowledge document not found." });
    return response.json(result);
  } catch (error) { return next(error); }
});

knowledgeRouter.post("/knowledge/documents", receiveDocument, async (request, response, next) => {
  try {
    const result = await addKnowledgeDocument(request.body || {}, request.file || null);
    return response.status(201).json(result);
  } catch (error) { return next(error); }
});

knowledgeRouter.delete("/knowledge/documents/:documentId", async (request, response, next) => {
  try {
    const result = await deleteKnowledgeDocument(request.params.documentId);
    if (!result) return response.status(404).json({ error: "Knowledge document not found." });
    return response.json(result);
  } catch (error) { return next(error); }
});
