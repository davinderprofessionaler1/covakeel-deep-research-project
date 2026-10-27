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
    "SELECT id, email, email_verified_at, is_blocked, blocked_at, blocked_reason, created_at FROM users WHERE email = $1",
    [email],
  );
  return result.rows[0] || null;
}

export async function listRegisteredUsers({ search = "", page = 1, pageSize = 25 } = {}) {
  const database = getPool();
  if (!database) throw new Error("PostgreSQL is not configured.");
  const offset = (page - 1) * pageSize;
  const [users, total, summary] = await Promise.all([
    database.query(
      `SELECT u.id, u.email, u.email_verified_at, u.is_blocked, u.blocked_at, u.blocked_reason, u.created_at, u.updated_at,
              COUNT(DISTINCT c.id)::int AS conversation_count,
              COUNT(DISTINCT m.id)::int AS message_count,
              GREATEST(MAX(s.last_seen_at), MAX(c.updated_at), u.created_at) AS last_active_at
       FROM users u
       LEFT JOIN conversations c ON c.user_id = u.id
       LEFT JOIN conversation_messages m ON m.conversation_id = c.id
       LEFT JOIN user_sessions s ON s.user_id = u.id
       WHERE ($1 = '' OR u.email ILIKE '%' || $1 || '%')
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT $2 OFFSET $3`,
      [search, pageSize, offset],
    ),
    database.query(
      `SELECT COUNT(*)::int AS count
       FROM users
       WHERE ($1 = '' OR email ILIKE '%' || $1 || '%')`,
      [search],
    ),
    database.query(
      `SELECT COUNT(DISTINCT u.id) FILTER (WHERE u.email_verified_at IS NOT NULL)::int AS verified,
              COUNT(DISTINCT c.id)::int AS conversations,
              COUNT(DISTINCT m.id)::int AS messages
       FROM users u
       LEFT JOIN conversations c ON c.user_id = u.id
       LEFT JOIN conversation_messages m ON m.conversation_id = c.id
       WHERE ($1 = '' OR u.email ILIKE '%' || $1 || '%')`,
      [search],
    ),
  ]);
  return { users: users.rows, total: total.rows[0]?.count || 0, summary: summary.rows[0] || { verified: 0, conversations: 0, messages: 0 } };
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

export async function readOtpLockout(email, windowMinutes = 5) {
  const database = getPool();
  if (!database) throw new Error("PostgreSQL is not configured.");
  await database.query(
    `DELETE FROM auth_otp_lockouts
     WHERE email = $1
       AND ((locked_until IS NOT NULL AND locked_until <= NOW())
         OR (locked_until IS NULL AND updated_at <= NOW() - ($2 * INTERVAL '1 minute')))`,
    [email, windowMinutes],
  );
  const result = await database.query(
    `SELECT failed_attempts, locked_until
     FROM auth_otp_lockouts
     WHERE email = $1 AND locked_until > NOW()`,
    [email],
  );
  return result.rows[0] || null;
}

export async function recordFailedOtpAttempt({ id, email, maxAttempts = 3, lockMinutes = 5 }) {
  const database = getPool();
  if (!database) throw new Error("PostgreSQL is not configured.");
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [email]);
    const existing = await client.query(
      "SELECT failed_attempts, locked_until, updated_at FROM auth_otp_lockouts WHERE email = $1 FOR UPDATE",
      [email],
    );
    const now = Date.now();
    const state = existing.rows[0];
    const stale = !state
      || (state.locked_until && new Date(state.locked_until).getTime() <= now)
      || (!state.locked_until && now - new Date(state.updated_at).getTime() >= lockMinutes * 60_000);
    const failedAttempts = (stale ? 0 : Number(state.failed_attempts)) + 1;
    const lockedUntil = failedAttempts >= maxAttempts ? new Date(now + lockMinutes * 60_000) : null;

    await client.query(
      `INSERT INTO auth_otp_lockouts (email, failed_attempts, locked_until, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (email) DO UPDATE
       SET failed_attempts = EXCLUDED.failed_attempts,
           locked_until = EXCLUDED.locked_until,
           updated_at = NOW()`,
      [email, failedAttempts, lockedUntil],
    );
    await client.query(
      `UPDATE auth_otps
       SET attempts = attempts + 1,
           consumed_at = CASE WHEN $2 THEN NOW() ELSE consumed_at END
       WHERE id = $1`,
      [id, Boolean(lockedUntil)],
    );
    await client.query("COMMIT");
    return { attempts: failedAttempts, locked_until: lockedUntil };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function clearOtpFailures(email) {
  const database = getPool();
  if (!database) throw new Error("PostgreSQL is not configured.");
  await database.query("DELETE FROM auth_otp_lockouts WHERE email = $1", [email]);
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
     RETURNING id, email, email_verified_at, is_blocked, blocked_at, blocked_reason, created_at`,
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
     WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.is_blocked = FALSE`,
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

export async function setRegisteredUserBlocked(userId, blocked, reason = "") {
  const database = getPool();
  if (!database) throw new Error("PostgreSQL is not configured.");
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE users
       SET is_blocked = $2,
           blocked_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
           blocked_reason = CASE WHEN $2 THEN NULLIF($3, '') ELSE NULL END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, email_verified_at, is_blocked, blocked_at, blocked_reason, created_at, updated_at`,
      [userId, blocked, reason],
    );
    if (blocked && result.rows[0]) await client.query("DELETE FROM user_sessions WHERE user_id = $1", [userId]);
    await client.query("COMMIT");
    return result.rows[0] || null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getRegisteredUserActivity(userId) {
  const database = getPool();
  if (!database) throw new Error("PostgreSQL is not configured.");
  const [user, conversations, messages, sessions] = await Promise.all([
    database.query(
      `SELECT u.id, u.email, u.email_verified_at, u.is_blocked, u.blocked_at, u.blocked_reason,
              u.created_at, u.updated_at,
              COUNT(DISTINCT c.id)::int AS conversation_count,
              COUNT(DISTINCT m.id)::int AS message_count,
              GREATEST(MAX(s.last_seen_at), MAX(c.updated_at), u.created_at) AS last_active_at
       FROM users u
       LEFT JOIN conversations c ON c.user_id = u.id
       LEFT JOIN conversation_messages m ON m.conversation_id = c.id
       LEFT JOIN user_sessions s ON s.user_id = u.id
       WHERE u.id = $1
       GROUP BY u.id`,
      [userId],
    ),
    database.query(
      `SELECT c.id, c.title, c.created_at, c.updated_at, COUNT(m.id)::int AS message_count,
              COALESCE(MAX(m.created_at), c.updated_at) AS last_activity_at
       FROM conversations c
       LEFT JOIN conversation_messages m ON m.conversation_id = c.id
       WHERE c.user_id = $1
       GROUP BY c.id
       ORDER BY last_activity_at DESC
       LIMIT 100`,
      [userId],
    ),
    database.query(
      `SELECT m.id, m.conversation_id, c.title AS conversation_title, m.role,
              LEFT(m.content, 320) AS content, m.created_at
       FROM conversation_messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.user_id = $1
       ORDER BY m.created_at DESC
       LIMIT 50`,
      [userId],
    ),
    database.query(
      `SELECT id, created_at, last_seen_at, expires_at
       FROM user_sessions WHERE user_id = $1
       ORDER BY last_seen_at DESC LIMIT 20`,
      [userId],
    ),
  ]);
  if (!user.rows[0]) return null;
  return { user: user.rows[0], conversations: conversations.rows, recentMessages: messages.rows, sessions: sessions.rows };
}

export async function listAdminConversationRecords({ search = "", page = 1, pageSize = 25 } = {}) {
  const database = getPool();
  if (!database) throw new Error("PostgreSQL is not configured.");
  const offset = (page - 1) * pageSize;
  const [rows, total] = await Promise.all([
    database.query(
      `SELECT c.id, c.title, c.created_at, c.updated_at, u.id AS user_id, u.email AS user_email,
              COUNT(m.id)::int AS message_count,
              COALESCE(MAX(m.created_at), c.updated_at) AS last_activity_at
       FROM conversations c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN conversation_messages m ON m.conversation_id = c.id
       WHERE ($1 = '' OR c.title ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%')
       GROUP BY c.id, u.id
       ORDER BY last_activity_at DESC
       LIMIT $2 OFFSET $3`,
      [search, pageSize, offset],
    ),
    database.query(
      `SELECT COUNT(*)::int AS count FROM conversations c JOIN users u ON u.id = c.user_id
       WHERE ($1 = '' OR c.title ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%')`,
      [search],
    ),
  ]);
  return { conversations: rows.rows, total: total.rows[0]?.count || 0 };
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
