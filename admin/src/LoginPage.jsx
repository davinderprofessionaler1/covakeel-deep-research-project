import { useState } from "react";

export default function LoginPage({ onLogin }) {
  const [form, setForm] = useState({ email: "admin@covakeel.local", password: "" });
  const [status, setStatus] = useState({ loading: false, error: "" });

  const submit = async (event) => {
    event.preventDefault();
    setStatus({ loading: true, error: "" });
    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to sign in.");
      onLogin(result.admin);
    } catch (error) {
      setStatus({ loading: false, error: error.message });
    }
  };

  return (
    <main className="admin-login-shell">
      <section className="admin-login-intro">
        <div className="admin-login-brand"><img src="/assets/covakeel-logo-transparent.png" alt="CoVakeel" /><small>Administration</small></div>
        <div><span className="eyebrow">Protected workspace</span><h1>Manage legal knowledge with control.</h1><p>Sign in to manage CoVakeel branding, legal sources, administrators and delivery settings.</p></div>
        <p className="admin-login-note">Admin sessions use an HTTP-only cookie and expire automatically.</p>
      </section>
      <section className="admin-login-panel">
        <form className="admin-login-card" onSubmit={submit}>
          <span className="eyebrow">Administrator access</span>
          <h2>Sign in</h2>
          <p>Use your CoVakeel admin account.</p>
          <label>Email address<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="username" required /></label>
          <label>Password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="current-password" required /></label>
          {status.error && <div className="settings-message error" role="alert">{status.error}</div>}
          <button className="settings-primary full" type="submit" disabled={status.loading}>{status.loading ? "Signing in…" : "Sign in →"}</button>
          {window.location.hostname === "127.0.0.1" && <small className="local-login-hint">First local sign-in uses <b>ADMIN_INITIAL_EMAIL</b> and <b>ADMIN_INITIAL_PASSWORD</b> from <b>admin/.env</b>.</small>}
        </form>
      </section>
    </main>
  );
}
