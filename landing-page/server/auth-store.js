import {
  consumeOtp as consumeDatabaseOtp,
  createVerifiedUser,
  deleteSession as deleteDatabaseSession,
  findUserByEmail,
  isDatabaseConfigured,
  listRegisteredUsers,
  readLatestOtp,
  readSession as readDatabaseSession,
  recordFailedOtpAttempt,
  saveOtp as saveDatabaseOtp,
  saveSession as saveDatabaseSession,
} from "./db.js";

const memory = {
  nextUserId: 1,
  users: new Map(),
  otps: new Map(),
  sessions: new Map(),
};

export function usesDevelopmentStore() {
  return !isDatabaseConfigured() && process.env.AUTH_DEV_MODE === "true";
}

export function isAuthStoreReady() {
  return isDatabaseConfigured() || usesDevelopmentStore();
}

export async function getUser(email) {
  if (!usesDevelopmentStore()) return findUserByEmail(email);
  return memory.users.get(email) || null;
}

export async function saveOtp(payload) {
  if (!usesDevelopmentStore()) return saveDatabaseOtp(payload);
  memory.otps.set(`${payload.email}:${payload.intent}`, {
    id: `${payload.email}:${payload.intent}`,
    code_hash: payload.codeHash,
    attempts: 0,
    expires_at: payload.expiresAt,
  });
}

export async function getOtp(email, intent) {
  if (!usesDevelopmentStore()) return readLatestOtp(email, intent);
  return memory.otps.get(`${email}:${intent}`) || null;
}

export async function failOtp(id) {
  if (!usesDevelopmentStore()) return recordFailedOtpAttempt(id);
  const record = memory.otps.get(id);
  if (!record) return;
  record.attempts += 1;
  if (record.attempts >= 5) memory.otps.delete(id);
}

export async function consumeOtp(id) {
  if (!usesDevelopmentStore()) return consumeDatabaseOtp(id);
  memory.otps.delete(id);
}

export async function getOrCreateVerifiedUser(email) {
  if (!usesDevelopmentStore()) return createVerifiedUser(email);
  let user = memory.users.get(email);
  if (!user) {
    user = { id: memory.nextUserId++, email, email_verified_at: new Date(), created_at: new Date() };
    memory.users.set(email, user);
  }
  return user;
}

export async function saveSession(payload) {
  if (!usesDevelopmentStore()) return saveDatabaseSession(payload);
  const user = [...memory.users.values()].find((candidate) => candidate.id === payload.userId);
  const now = new Date();
  memory.sessions.set(payload.tokenHash, {
    user_id: payload.userId,
    email: user.email,
    expires_at: payload.expiresAt,
    created_at: now,
    last_seen_at: now,
  });
}

export async function getSession(tokenHash) {
  if (!usesDevelopmentStore()) return readDatabaseSession(tokenHash);
  const session = memory.sessions.get(tokenHash);
  if (!session || new Date(session.expires_at) <= new Date()) {
    memory.sessions.delete(tokenHash);
    return null;
  }
  session.last_seen_at = new Date();
  return session;
}

export async function deleteSession(tokenHash) {
  if (!usesDevelopmentStore()) return deleteDatabaseSession(tokenHash);
  memory.sessions.delete(tokenHash);
}

export async function listUsers({ search = "", page = 1, pageSize = 25 } = {}) {
  if (!usesDevelopmentStore()) return listRegisteredUsers({ search, page, pageSize });
  const needle = search.trim().toLowerCase();
  const allUsers = [...memory.users.values()]
    .filter((user) => !needle || user.email.toLowerCase().includes(needle))
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at));
  const start = (page - 1) * pageSize;
  const users = allUsers.slice(start, start + pageSize).map((user) => {
    const sessions = [...memory.sessions.values()].filter((session) => session.user_id === user.id);
    const lastActive = sessions.reduce((latest, session) => Math.max(latest, new Date(session.last_seen_at).getTime()), 0);
    return {
      ...user,
      conversation_count: 0,
      message_count: 0,
      last_active_at: lastActive ? new Date(lastActive) : user.created_at,
    };
  });
  return {
    users,
    total: allUsers.length,
    summary: {
      verified: allUsers.filter((user) => user.email_verified_at).length,
      conversations: 0,
      messages: 0,
    },
  };
}
