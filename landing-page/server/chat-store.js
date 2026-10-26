import crypto from "node:crypto";
import {
  addConversationMessageRecord,
  createConversationRecord,
  deleteConversationRecord,
  getConversationRecord,
  getAttachmentRecords,
  isDatabaseConfigured,
  linkAttachmentRecords,
  listConversationRecords,
  renameConversationRecord,
  saveAttachmentRecord,
} from "./db.js";

const memoryConversations = new Map();

function useMemory() {
  return !isDatabaseConfigured() && process.env.AUTH_DEV_MODE === "true";
}

function dateValue(value) {
  return value instanceof Date ? value : new Date(value);
}

export async function createConversation(userId, title) {
  const payload = { id: crypto.randomUUID(), userId, title };
  if (!useMemory()) return createConversationRecord(payload);
  const now = new Date();
  const conversation = { id: payload.id, user_id: userId, title, created_at: now, updated_at: now, messages: [], attachments: [] };
  memoryConversations.set(conversation.id, conversation);
  return conversation;
}

export async function listConversations(userId, search = "") {
  if (!useMemory()) return listConversationRecords(userId, search);
  const needle = search.trim().toLowerCase();
  return [...memoryConversations.values()]
    .filter((item) => item.user_id === userId && (!needle
      || item.title.toLowerCase().includes(needle)
      || item.messages.some((message) => message.content.toLowerCase().includes(needle))))
    .sort((left, right) => dateValue(right.updated_at) - dateValue(left.updated_at))
    .slice(0, 100)
    .map((item) => ({
      id: item.id,
      title: item.title,
      created_at: item.created_at,
      updated_at: item.updated_at,
      preview: item.messages.at(-1)?.content.slice(0, 180) || "",
    }));
}

export async function getConversation(userId, conversationId) {
  if (!useMemory()) return getConversationRecord(userId, conversationId);
  const item = memoryConversations.get(conversationId);
  if (!item || item.user_id !== userId) return null;
  return { ...item, messages: item.messages.map((message) => ({ ...message })) };
}

export async function addMessage({ userId, conversationId, role, content, elapsedMs = null, attachmentIds = [] }) {
  const payload = { id: crypto.randomUUID(), userId, conversationId, role, content, elapsedMs };
  if (!useMemory()) {
    const message = await addConversationMessageRecord(payload);
    if (message && attachmentIds.length) await linkAttachmentRecords(message.id, attachmentIds);
    return { ...message, attachments: attachmentIds.length ? await getAttachmentRecords(userId, conversationId, attachmentIds) : [] };
  }
  const item = memoryConversations.get(conversationId);
  if (!item || item.user_id !== userId) return null;
  const attachments = item.attachments.filter((attachment) => attachmentIds.includes(attachment.id)).map((attachment) => ({
    id: attachment.id, name: attachment.name, mime_type: attachment.mime_type, size_bytes: attachment.size_bytes,
    extraction_status: attachment.extraction_status, created_at: attachment.created_at,
  }));
  const message = { id: payload.id, role, content, elapsed_ms: elapsedMs, created_at: new Date(), attachments };
  item.messages.push(message);
  item.updated_at = new Date();
  return message;
}

export async function saveAttachment(payload) {
  const attachment = { id: crypto.randomUUID(), ...payload, created_at: new Date() };
  if (!useMemory()) return saveAttachmentRecord(attachment);
  const item = memoryConversations.get(payload.conversationId);
  if (!item || item.user_id !== payload.userId) return null;
  const stored = {
    id: attachment.id,
    name: payload.name,
    mime_type: payload.mimeType,
    size_bytes: payload.sizeBytes,
    storage_path: payload.storagePath,
    extracted_text: payload.extractedText,
    extraction_status: payload.extractionStatus,
    created_at: attachment.created_at,
  };
  item.attachments.push(stored);
  return stored;
}

export async function getAttachments(userId, conversationId, ids = []) {
  if (!useMemory()) return getAttachmentRecords(userId, conversationId, ids);
  const item = memoryConversations.get(conversationId);
  if (!item || item.user_id !== userId) return [];
  return item.attachments.filter((attachment) => !ids.length || ids.includes(attachment.id));
}

export async function renameConversation(userId, conversationId, title) {
  if (!useMemory()) return renameConversationRecord(userId, conversationId, title);
  const item = memoryConversations.get(conversationId);
  if (!item || item.user_id !== userId) return null;
  item.title = title;
  item.updated_at = new Date();
  return item;
}

export async function deleteConversation(userId, conversationId) {
  if (!useMemory()) return deleteConversationRecord(userId, conversationId);
  const item = memoryConversations.get(conversationId);
  if (!item || item.user_id !== userId) return false;
  memoryConversations.delete(conversationId);
  return true;
}
