import { useEffect, useState } from "react";

const emptySettings = {
  branding: { brandName: "CoVakeel", logoUrl: "", hasLogo: false, updatedAt: null },
  smtp: { host: "", port: 587, secure: false, username: "", from: "", passwordConfigured: false },
  plans: [],
};

async function request(url, options = {}) {
  const response = await fetch(url, { credentials: "include", ...options });
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(result?.error || "Unable to save settings.");
  return result;
}

function Message({ state }) {
  return state.message ? <div className={`settings-message ${state.type}`} role="status">{state.message}</div> : null;
}

export default function Settings({ admin, onAdminUpdated, onPasswordChanged, onBrandingUpdated }) {
  const [settings, setSettings] = useState(emptySettings);
  const [loading, setLoading] = useState(true);
  const [brandingStatus, setBrandingStatus] = useState({ type: "", message: "" });
  const [profile, setProfile] = useState({ name: admin.name, email: admin.email, currentPassword: "" });
  const [profileStatus, setProfileStatus] = useState({ type: "", message: "" });
  const [password, setPassword] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordStatus, setPasswordStatus] = useState({ type: "", message: "" });
  const [smtp, setSmtp] = useState(emptySettings.smtp);
  const [smtpStatus, setSmtpStatus] = useState({ type: "", message: "" });
  const [plans, setPlans] = useState([]);
  const [plansStatus, setPlansStatus] = useState({ type: "", message: "" });
  const smtpReady = Boolean(smtp.host && smtp.username && smtp.passwordConfigured && smtp.from);

  useEffect(() => {
    request("/api/admin/settings").then((result) => {
      setSettings(result);
      setSmtp({ ...result.smtp, password: "" });
      setPlans(result.plans || []);
      onBrandingUpdated(result.branding);
    }).catch((error) => setBrandingStatus({ type: "error", message: error.message })).finally(() => setLoading(false));
  }, [onBrandingUpdated]);

  const saveBrandName = async (event) => {
    event.preventDefault();
    setBrandingStatus({ type: "loading", message: "Saving brand…" });
    try {
      const result = await request("/api/admin/settings/branding", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandName: settings.branding.brandName }) });
      setSettings((value) => ({ ...value, branding: result.branding }));
      onBrandingUpdated(result.branding);
      setBrandingStatus({ type: "success", message: "Brand name saved for admin, landing page and workspace." });
    } catch (error) { setBrandingStatus({ type: "error", message: error.message }); }
  };

  const uploadLogo = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBrandingStatus({ type: "loading", message: "Uploading logo…" });
    const body = new FormData();
    body.append("logo", file);
    try {
      const result = await request("/api/admin/settings/logo", { method: "POST", body });
      const branding = { ...result.branding, logoUrl: `${result.branding.logoUrl}?v=${Date.now()}` };
      setSettings((value) => ({ ...value, branding }));
      onBrandingUpdated(branding);
      setBrandingStatus({ type: "success", message: "Logo updated across CoVakeel." });
    } catch (error) { setBrandingStatus({ type: "error", message: error.message }); }
    event.target.value = "";
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setProfileStatus({ type: "loading", message: "Updating administrator…" });
    try {
      const result = await request("/api/admin/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
      setProfile((value) => ({ ...value, currentPassword: "" }));
      onAdminUpdated(result.admin);
      setProfileStatus({ type: "success", message: "Administrator profile updated." });
    } catch (error) { setProfileStatus({ type: "error", message: error.message }); }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    if (password.newPassword !== password.confirmPassword) return setPasswordStatus({ type: "error", message: "New passwords do not match." });
    setPasswordStatus({ type: "loading", message: "Changing password…" });
    try {
      const result = await request("/api/admin/account/password", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(password) });
      setPasswordStatus({ type: "success", message: result.message });
      window.setTimeout(onPasswordChanged, 700);
    } catch (error) { setPasswordStatus({ type: "error", message: error.message }); }
  };

  const saveSmtp = async (event) => {
    event.preventDefault();
    setSmtpStatus({ type: "loading", message: "Saving SMTP settings…" });
    try {
      const result = await request("/api/admin/settings/smtp", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(smtp) });
      setSmtp({ ...result.smtp, password: "" });
      setSmtpStatus({ type: "success", message: "SMTP settings saved securely." });
    } catch (error) { setSmtpStatus({ type: "error", message: error.message }); }
  };

  const updatePlan = (index, key, value) => setPlans((current) => current.map((plan, itemIndex) => itemIndex === index ? { ...plan, [key]: value } : plan));
  const savePlans = async (event) => {
    event.preventDefault();
    setPlansStatus({ type: "loading", message: "Saving plans and pricing…" });
    try {
      const result = await request("/api/admin/settings/plans", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plans }) });
      setPlans(result.plans);
      setPlansStatus({ type: "success", message: "Plans and monthly prices are now managed by the backend." });
    } catch (error) { setPlansStatus({ type: "error", message: error.message }); }
  };

  if (loading) return <section className="module-placeholder"><div>⚙</div><h1>Loading settings…</h1></section>;

  return (
    <div className="settings-page">
      <section className="settings-heading"><div><span className="eyebrow">Configuration</span><h1>Settings</h1><p>Control the shared CoVakeel identity, administrator account and email delivery.</p></div></section>
      <section className="settings-grid">
        <article className="settings-card branding-card">
          <div className="settings-card-head"><span className="settings-icon">◇</span><div><h2>Brand identity</h2><p>The logo is shared by admin, landing page and user workspace.</p></div></div>
          <div className="logo-editor">
            <div className="logo-preview"><img src={settings.branding.logoUrl || "/assets/covakeel-logo-transparent.png"} alt="Current CoVakeel logo" /></div>
            <div><label className="file-button">Upload logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadLogo} /></label><small>PNG, JPG or WebP. Maximum 2 MB.</small></div>
          </div>
          <form className="settings-form inline-action" onSubmit={saveBrandName}><label>Brand name<input value={settings.branding.brandName} onChange={(event) => setSettings((value) => ({ ...value, branding: { ...value.branding, brandName: event.target.value } }))} required /></label><button className="settings-primary" type="submit">Save brand</button></form>
          <Message state={brandingStatus} />
        </article>

        <article className="settings-card">
          <div className="settings-card-head"><span className="settings-icon">A</span><div><h2>Administrator profile</h2><p>Edit the name and email used for admin access.</p></div></div>
          <form className="settings-form" onSubmit={saveProfile}>
            <div className="settings-fields two"><label>Full name<input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} required /></label><label>Email address<input type="email" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} required /></label></div>
            <label>Current password<input type="password" value={profile.currentPassword} onChange={(event) => setProfile({ ...profile, currentPassword: event.target.value })} autoComplete="current-password" required /></label>
            <button className="settings-primary" type="submit">Update administrator</button><Message state={profileStatus} />
          </form>
        </article>

        <article className="settings-card">
          <div className="settings-card-head"><span className="settings-icon">⌁</span><div><h2>Change password</h2><p>Changing the password signs out every active admin session.</p></div></div>
          <form className="settings-form" onSubmit={changePassword}>
            <label>Current password<input type="password" value={password.currentPassword} onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })} required /></label>
            <div className="settings-fields two"><label>New password<input type="password" value={password.newPassword} onChange={(event) => setPassword({ ...password, newPassword: event.target.value })} minLength="10" required /></label><label>Confirm new password<input type="password" value={password.confirmPassword} onChange={(event) => setPassword({ ...password, confirmPassword: event.target.value })} minLength="10" required /></label></div>
            <button className="settings-primary" type="submit">Change password</button><Message state={passwordStatus} />
          </form>
        </article>

        <article className="settings-card smtp-card">
          <div className="settings-card-head"><span className="settings-icon">✉</span><div><h2>SMTP email delivery</h2><p>Used for user OTP and transactional email configuration.</p></div></div>
          <div className={`smtp-readiness ${smtpReady ? "ready" : "pending"}`}><i />{smtpReady ? "Email OTP delivery configured" : "Complete all SMTP fields to enable real email OTP delivery"}</div>
          <form className="settings-form" onSubmit={saveSmtp}>
            <div className="settings-fields three"><label>SMTP host<input value={smtp.host} onChange={(event) => setSmtp({ ...smtp, host: event.target.value })} placeholder="smtp.example.com" /></label><label>Port<input type="number" min="1" max="65535" value={smtp.port} onChange={(event) => setSmtp({ ...smtp, port: Number(event.target.value) })} /></label><label className="toggle-label"><input type="checkbox" checked={smtp.secure} onChange={(event) => setSmtp({ ...smtp, secure: event.target.checked })} />Use secure TLS</label></div>
            <div className="settings-fields two"><label>Username<input value={smtp.username} onChange={(event) => setSmtp({ ...smtp, username: event.target.value })} autoComplete="off" /></label><label>Password<input type="password" value={smtp.password || ""} onChange={(event) => setSmtp({ ...smtp, password: event.target.value })} placeholder={smtp.passwordConfigured ? "Saved — leave blank to keep" : "SMTP password"} autoComplete="new-password" /></label></div>
            <label>From email<input value={smtp.from} onChange={(event) => setSmtp({ ...smtp, from: event.target.value })} placeholder="hello@covakeel.com" /></label>
            <button className="settings-primary" type="submit">Save SMTP settings</button><Message state={smtpStatus} />
          </form>
        </article>
        <article className="settings-card plans-card">
          <div className="settings-card-head"><span className="settings-icon">₹</span><div><h2>Plans and pricing</h2><p>Change plan names, monthly prices and availability from the backend.</p></div></div>
          <form className="settings-form" onSubmit={savePlans}>
            <div className="plans-editor">
              {plans.map((plan, index) => <article className="plan-editor-row" key={plan.id}>
                <div className="settings-fields plan-fields"><label>Plan name<input value={plan.name} onChange={(event) => updatePlan(index, "name", event.target.value)} required /></label><label>Monthly price<input type="number" min="0" step="1" value={plan.priceMonthly} onChange={(event) => updatePlan(index, "priceMonthly", Number(event.target.value))} required /></label><label>Currency<input maxLength="3" value={plan.currency} onChange={(event) => updatePlan(index, "currency", event.target.value.toUpperCase())} required /></label><label className="toggle-label"><input type="checkbox" checked={plan.active} onChange={(event) => updatePlan(index, "active", event.target.checked)} />Active</label></div>
                <label>Description<input value={plan.description || ""} onChange={(event) => updatePlan(index, "description", event.target.value)} placeholder="Who this plan is for" /></label>
              </article>)}
            </div>
            <button className="settings-primary" type="submit">Save plans and prices</button><Message state={plansStatus} />
          </form>
        </article>
      </section>
    </div>
  );
}
