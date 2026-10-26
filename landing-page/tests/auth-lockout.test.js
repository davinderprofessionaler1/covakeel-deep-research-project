import assert from "node:assert/strict";
import test from "node:test";

process.env.AUTH_DEV_MODE = "true";
delete process.env.DATABASE_URL;

const {
  clearOtpFailures,
  failOtp,
  getOtp,
  getOtpLockout,
  saveOtp,
} = await import("../server/auth-store.js");

function otpPayload(email, intent = "login") {
  return {
    email,
    intent,
    codeHash: "0".repeat(64),
    expiresAt: new Date(Date.now() + 10 * 60_000),
  };
}

test("locks an email for five minutes after three incorrect OTP attempts", async () => {
  const email = `lock-${Date.now()}@example.com`;
  await saveOtp(otpPayload(email));
  const otp = await getOtp(email, "login");

  const first = await failOtp(otp.id, email);
  const second = await failOtp(otp.id, email);
  const third = await failOtp(otp.id, email);

  assert.equal(first.attempts, 1);
  assert.equal(first.locked_until, null);
  assert.equal(second.attempts, 2);
  assert.equal(second.locked_until, null);
  assert.equal(third.attempts, 3);
  assert.ok(third.locked_until instanceof Date);
  assert.ok(third.locked_until.getTime() >= Date.now() + 4 * 60_000);
  assert.ok(await getOtpLockout(email));
  assert.equal(await getOtp(email, "login"), null);
});

test("tracks failures across newly requested codes and both auth intents", async () => {
  const email = `shared-${Date.now()}@example.com`;
  await saveOtp(otpPayload(email, "login"));
  const loginOtp = await getOtp(email, "login");
  assert.equal((await failOtp(loginOtp.id, email)).attempts, 1);

  await saveOtp(otpPayload(email, "signup"));
  const signupOtp = await getOtp(email, "signup");
  assert.equal((await failOtp(signupOtp.id, email)).attempts, 2);
  assert.ok((await failOtp(signupOtp.id, email)).locked_until);
  assert.ok(await getOtpLockout(email));
});

test("a successful verification can clear the failure counter", async () => {
  const email = `clear-${Date.now()}@example.com`;
  await saveOtp(otpPayload(email));
  let otp = await getOtp(email, "login");
  assert.equal((await failOtp(otp.id, email)).attempts, 1);

  await clearOtpFailures(email);
  await saveOtp(otpPayload(email));
  otp = await getOtp(email, "login");
  assert.equal((await failOtp(otp.id, email)).attempts, 1);
});
