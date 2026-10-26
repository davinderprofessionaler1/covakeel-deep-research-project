import pg from "pg";

const { Pool } = pg;

let pool;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool() {
  if (!isDatabaseConfigured()) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    pool.on("error", (error) => console.error("Unexpected PostgreSQL pool error:", error.message));
  }
  return pool;
}

export async function databaseStatus() {
  const database = getPool();
  if (!database) return { configured: false, connected: false };
  try {
    await database.query("SELECT 1");
    return { configured: true, connected: true };
  } catch {
    return { configured: true, connected: false };
  }
}

export async function saveEnquiry({ name, email, organisation, message }) {
  const database = getPool();
  if (!database) {
    const error = new Error("Contact storage is not configured yet.");
    error.code = "DATABASE_NOT_CONFIGURED";
    throw error;
  }
  const result = await database.query(
    `INSERT INTO enquiries (name, email, organisation, message)
     VALUES ($1, $2, $3, $4)
     RETURNING id, created_at`,
    [name, email, organisation || null, message],
  );
  return result.rows[0];
}

export async function findUserByEmail(email) {
  const database = getPool();
  if (!database) return null;
  const result = await database.query(
    "SELECT id, email, email_verified_at, created_at FROM users WHERE email = $1",
    [email],
  );
  return result.rows[0] || null;
}

export async function saveOtp({ email, intent, codeHash, expiresAt }) {
  const database = getPool();
  if (!database) throw new Error("PostgreSQL is not configured.");
  await database.query(
    "UPDATE auth_otps SET consumed_at = NOW() WHERE email = $1 AND consumed_at IS NULL",
    [email],
  );
  await database.query(
    `INSERT INTO auth_otps (email, intent, code_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [email, intent, codeHash, expiresAt],
  );
}

export async function readLatestOtp(email, intent) {
  const database = getPool();
  if (!database) throw new Error("PostgreSQL is not configured.");
  const result = await database.query(
    `SELECT id, code_hash, attempts, expires_at
     FROM auth_otps
     WHERE email = $1 AND intent = $2 AND consumed_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [email, intent],
  );
  return result.rows[0] || null;
}

export async function recordFailedOtpAttempt(id) {
  const database = getPool();
  if (!database) throw new Error("PostgreSQL is not configured.");
  await database.query(
    `UPDATE auth_otps
     SET attempts = attempts + 1,
         consumed_at = CASE WHEN attempts + 1 >= 5 THEN NOW() ELSE consumed_at END
     WHERE id = $1`,
    [id],
  );
}

export async function consumeOtp(id) {
  const database = getPool();
  if (!database) throw new Error("PostgreSQL is not configured.");
  await database.query("UPDATE auth_otps SET consumed_at = NOW() WHERE id = $1", [id]);
}

export async function createVerifiedUser(email) {
  const database = getPool();
  if (!database) throw new Error("PostgreSQL is not configured.");
  const result = await database.query(
    `INSERT INTO users (email, email_verified_at)
     VALUES ($1, NOW())
     ON CONFLICT (email) DO UPDATE SET email_verified_at = COALESCE(users.email_verified_at, NOW()), updated_at = NOW()
     RETURNING id, email, email_verified_at, created_at`,
    [email],
  );
  return result.rows[0];
}

export async function saveSession({ userId, tokenHash, expiresAt }) {
  const database = getPool();
  if (!database) throw new Error("PostgreSQL is not configured.");
  await database.query(
    "INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [userId, tokenHash, expiresAt],
  );
}

export async function readSession(tokenHash) {
  const database = getPool();
  if (!database) return null;
  const result = await database.query(
    `SELECT s.id, s.expires_at, u.id AS user_id, u.email
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [tokenHash],
  );
  if (!result.rows[0]) return null;
  await database.query("UPDATE user_sessions SET last_seen_at = NOW() WHERE id = $1", [result.rows[0].id]);
  return result.rows[0];
}

export async function deleteSession(tokenHash) {
  const database = getPool();
  if (!database) return;
  await database.query("DELETE FROM user_sessions WHERE token_hash = $1", [tokenHash]);
}

export async function createConversationRecord({ id, userId, title }) {
  const database = getPool();
  if (!database) throw new Error("PostgreSQL is not configured.");
  const result = await database.query(
    `INSERT INTO conversations (id, user_id, title)
     VALUES ($1, $2, $3)
     RETURNING id, title, created_at, updated_at`,
    [id, userId, title],
  );
  return result.rows[0];
}

export async function listConversationRecords(userId, search = "") {
  const database = getPool();
  if (!database) throw new Error("PostgreSQL is not configured.");
  const result = await database.query(
    `SELECT c.id, c.title, c.created_at, c.updated_at,
            COALESCE((SELECT left(m.content, 180) FROM conversation_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1), '') AS preview
     FROM conversations c
     WHERE c.user_id = $1
       AND ($2 = '' OR c.title ILIKE '%' || $2 || '%'
         OR EXISTS (
           SELECT 1 FROM conversation_messages sm
           WHERE sm.conversation_id = c.id AND sm.content ILIKE '%' || $2 || '%'
         ))
     ORDER BY c.updated_at DESC
     LIMIT 100`,
    [userId, search],
  );
  return result.rows;
}

export async function getConversationRecord(userId, conversationId) {
  const database = getPool();
  if (!database) throw new Error("PostgreSQL is not configured.");
  const conversation = await database.query(
    "SELECT id, title, created_at, updated_at FROM conversations WHERE id = $1 AND user_id = $2",
    [conversationId, userId],
  );
  if (!conversation.rows[0]) return null;
  const messages = await database.query(
    `SELECT id, role, content, elapsed_ms, created_at
     FROM conversation_messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC, id ASC`,
    [conversationId],
  );
  const attachments = await database.query(
    `SELECT ma.message_id, a.id, a.original_name AS name, a.mime_type, a.size_bytes,
            a.extraction_status, a.created_at
     FROM conversation_message_attachments ma
     JOIN conversation_attachments a ON a.id = ma.attachment_id
     WHERE a.conversation_id = $1 AND a.user_id = $2
     ORDER BY a.created_at ASC`,
    [conversationId, userId],
  );
  const byMessage = new Map();
  for (const attachment of attachments.rows) {
    const list = byMessage.get(attachment.message_id) || [];
    list.push(attachment);
    byMessage.set(attachment.message_id, list);
  }
  return {
    ...conversation.rows[0],
    messages: messages.rows.map((message) => ({ ...message, attachments: byMessage.get(message.id) || [] })),
  };
}

export async function addConversationMessageRecord({ id, userId, conversationId, role, content, elapsedMs }) {
  const database = getPool();
  if (!database) throw new Error("PostgreSQL is not configured.");
  const result = await database.query(
    `INSERT INTO conversation_messages (id, conversation_id, role, content, elapsed_ms)
     SELECT $1, c.id, $3, $4, $5
     FROM conversations c
     WHERE c.id = $2 AND c.user_id = $6
     RETURNING id, role, content, elapsed_ms, created_at`,
    [id, conversationId, role, content, elapsedMs || null, userId],
  );
  if (!result.rows[0]) return null;
  await database.query("UPDATE conversations SET updated_at = NOW() WHERE id = $1", [conversationId]);
  return result.rows[0];
}

export async function renameConversationRecord(userId, conversationId, title) {
  const database = getPool();
  if (!database) throw new Error("PostgreSQL is not configured.");
  const result = await database.query(
    `UPDATE conversations SET title = $3, updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id, title, created_at, updated_at`,
    [conversationId, userId, title],
  );
  return result.rows[0] || null;
}

export async function deleteConversationRecord(userId, conversationId) {
  const database = getPool();
  if (!database) throw new Error("PostgreSQL is not configured.");
  const result = await database.query(
    "DELETE FROM conversations WHERE id = $1 AND user_id = $2 RETURNING id",
    [conversationId, userId],
  );
  return Boolean(result.rows[0]);
}

export async function saveAttachmentRecord(payload) {
  const database = getPool();
  if (!database) throw new Error("PostgreSQL is not configured.");
  const result = await database.query(
    `INSERT INTO conversation_attachments
       (id, conversation_id, user_id, original_name, mime_type, size_bytes, storage_path, extracted_text, extraction_status)
     SELECT $1, c.id, $3, $4, $5, $6, $7, $8, $9
     FROM conversations c
     WHERE c.id = $2 AND c.user_id = $3
     RETURNING id, original_name AS name, mime_type, size_bytes, extraction_status, created_at`,
    [payload.id, payload.conversationId, payload.userId, payload.name, payload.mimeType, payload.sizeBytes, payload.storagePath, payload.extractedText, payload.extractionStatus],
  );
  return result.rows[0] || null;
}

export async function getAttachmentRecords(userId, conversationId, ids = []) {
  const database = getPool();
  if (!database) throw new Error("PostgreSQL is not configured.");
  const result = await database.query(
    `SELECT id, original_name AS name, mime_type, size_bytes, storage_path, extracted_text, extraction_status, created_at
     FROM conversation_attachments
     WHERE user_id = $1 AND conversation_id = $2 AND ($3::uuid[] IS NULL OR id = ANY($3::uuid[]))
     ORDER BY created_at ASC`,
    [userId, conversationId, ids.length ? ids : null],
  );
  return result.rows;
}

export async function linkAttachmentRecords(messageId, attachmentIds) {
  const database = getPool();
  if (!database || !attachmentIds.length) return;
  await database.query(
    `INSERT INTO conversation_message_attachments (message_id, attachment_id)
     SELECT $1, unnest($2::uuid[])
     ON CONFLICT DO NOTHING`,
    [messageId, attachmentIds],
  );
}
