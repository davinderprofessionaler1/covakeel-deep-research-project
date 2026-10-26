import crypto from "node:crypto";
import nodemailer from "nodemailer";
import {
  consumeOtp,
  deleteSession,
  getOrCreateVerifiedUser,
  getOtp,
  getSession,
  getUser,
  isAuthStoreReady,
  saveOtp,
  saveSession,
  usesDevelopmentStore,
  failOtp,
} from "./auth-store.js";

const SESSION_COOKIE = "covakeel_session";
const requestTimes = new Map();

function numberSetting(name, fallback) {
  const value = Number(process.env[name] || fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function emailIsValid(email) {
  return email.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function codeHash(email, code) {
  return crypto
    .createHmac("sha256", process.env.OTP_SECRET || "")
    .update(`${email}:${code}`)
    .digest("hex");
}

function valueMatches(left, right) {
  const first = Buffer.from(left);
  const second = Buffer.from(right);
  return first.length === second.length && crypto.timingSafeEqual(first, second);
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
      const index = part.indexOf("=");
      return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
    }),
  );
}

function sessionHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function resolveSession(request) {
  const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
  return token ? getSession(sessionHash(token)) : null;
}

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge,
    path: "/",
  };
}

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM);
}

async function sendOtpEmail(email, code) {
  if (!smtpConfigured()) {
    if (usesDevelopmentStore()) return { delivered: false, development: true };
    throw new Error("SMTP is not configured.");
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: numberSetting("SMTP_PORT", 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: "Your CoVakeel verification code",
    text: `Your CoVakeel verification code is ${code}. It expires in ${numberSetting("OTP_TTL_MINUTES", 10)} minutes.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;color:#29231f"><h1 style="font-family:Georgia,serif">CoVakeel</h1><p>Use this verification code to continue:</p><p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#9d713c">${code}</p><p>This code expires in ${numberSetting("OTP_TTL_MINUTES", 10)} minutes. If you did not request it, you can ignore this email.</p></div>`,
  });
  return { delivered: true, development: false };
}

export function registerAuthRoutes(app) {
  app.get("/api/auth/status", (_request, response) => {
    response.json({
      ready: isAuthStoreReady() && Boolean(process.env.OTP_SECRET),
      emailDelivery: smtpConfigured(),
      developmentMode: usesDevelopmentStore(),
    });
  });

  app.post("/api/auth/request-otp", async (request, response) => {
    const email = normalizeEmail(request.body?.email);
    const intent = request.body?.intent === "signup" ? "signup" : "login";
    if (!emailIsValid(email)) return response.status(400).json({ error: "Enter a valid email address." });
    if (!isAuthStoreReady() || !process.env.OTP_SECRET) return response.status(503).json({ error: "Authentication is not configured." });

    const rateKey = `${request.ip}:${email}`;
    const lastRequest = requestTimes.get(rateKey) || 0;
    if (Date.now() - lastRequest < 60_000) {
      return response.status(429).json({ error: "Please wait one minute before requesting another code." });
    }

    const user = await getUser(email);
    if (intent === "login" && !user) return response.status(404).json({ error: "No CoVakeel account exists for this email. Please sign up first." });
    if (intent === "signup" && user) return response.status(409).json({ error: "An account already exists. Please sign in." });

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    const ttlMinutes = numberSetting("OTP_TTL_MINUTES", 10);
    try {
      const delivery = await sendOtpEmail(email, code);
      await saveOtp({ email, intent, codeHash: codeHash(email, code), expiresAt: new Date(Date.now() + ttlMinutes * 60_000) });
      requestTimes.set(rateKey, Date.now());
      return response.json({
        message: delivery.delivered ? "Verification code sent to your email." : "Development verification code generated.",
        expiresInSeconds: ttlMinutes * 60,
        ...(delivery.development ? { devOtp: code } : {}),
      });
    } catch (error) {
      console.error("OTP delivery failed:", error.message);
      return response.status(503).json({ error: "Unable to send the verification email. Check the email service configuration." });
    }
  });

  app.post("/api/auth/verify-otp", async (request, response) => {
    const email = normalizeEmail(request.body?.email);
    const intent = request.body?.intent === "signup" ? "signup" : "login";
    const code = String(request.body?.code || "").trim();
    if (!emailIsValid(email) || !/^\d{6}$/.test(code)) return response.status(400).json({ error: "Enter the 6-digit verification code." });

    const otp = await getOtp(email, intent);
    if (!otp || new Date(otp.expires_at) <= new Date() || otp.attempts >= 5) {
      return response.status(400).json({ error: "The code is invalid or has expired. Request a new code." });
    }
    if (!valueMatches(otp.code_hash, codeHash(email, code))) {
      await failOtp(otp.id);
      return response.status(400).json({ error: "The code is incorrect." });
    }

    await consumeOtp(otp.id);
    const user = intent === "signup" ? await getOrCreateVerifiedUser(email) : await getUser(email);
    if (!user) return response.status(404).json({ error: "Account not found. Please sign up first." });

    const sessionToken = crypto.randomBytes(32).toString("base64url");
    const sessionDays = numberSetting("SESSION_TTL_DAYS", 30);
    const maxAge = sessionDays * 24 * 60 * 60 * 1000;
    await saveSession({ userId: user.id, tokenHash: sessionHash(sessionToken), expiresAt: new Date(Date.now() + maxAge) });
    response.cookie(SESSION_COOKIE, sessionToken, cookieOptions(maxAge));
    return response.json({ user: { id: user.id, email: user.email }, redirectUrl: process.env.APP_URL || "/" });
  });

  app.get("/api/auth/session", async (request, response) => {
    const session = await resolveSession(request);
    if (!session) return response.status(401).json({ authenticated: false });
    return response.json({ authenticated: true, user: { id: session.user_id, email: session.email } });
  });

  app.post("/api/auth/logout", async (request, response) => {
    const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
    if (token) await deleteSession(sessionHash(token));
    response.clearCookie(SESSION_COOKIE, cookieOptions(0));
    response.status(204).end();
  });
}
