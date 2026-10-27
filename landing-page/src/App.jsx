import { useEffect, useState } from "react";
import Workspace from "./Workspace.jsx";
import { BrandMark } from "./Branding.jsx";

const features = [
  {
    icon: "⌕",
    title: "Quick Research",
    text: "Ask questions naturally and review answers grounded in retrieved legal sources.",
    href: "#research",
  },
  {
    icon: "◇",
    title: "Deep Research",
    text: "Break complex legal questions into steps and explore multiple relevant sources.",
    href: "#workflow",
  },
  {
    icon: "▤",
    title: "AI Drafting",
    text: "Turn research into editable letters, reports, memos and professional documents.",
    href: "#workflow",
  },
  {
    icon: "▣",
    title: "Projects & Knowledge",
    text: "Save research and drafts, then add reviewed private knowledge in a later phase.",
    href: "#contact",
  },
];

const useCases = [
  ["⚖", "Lawyers", "Research statutes, judgments and legal questions."],
  ["▣", "Business Teams", "Explore contracts, policies and commercial requirements."],
  ["♙", "Compliance Teams", "Investigate rules and regulatory obligations."],
  ["♧", "Students", "Learn with sources and structured research context."],
  ["▤", "Researchers", "Organize findings, projects and drafts."],
];

const steps = [
  ["Ask Your Question", "Describe your legal, tax, regulatory or business research need."],
  ["Review Source-backed Findings", "Explore the answer and inspect its citations."],
  ["Explore & Refine", "Ask follow-up questions and examine further sources."],
  ["Create a Draft", "Turn findings into a document you can edit and review."],
];

function Header({ onContact }) {
  const [open, setOpen] = useState(false);

  const closeMenu = () => setOpen(false);

  return (
    <header className="navbox">
      <div className="wrap nav">
        <a className="brand" href="#home" onClick={closeMenu} aria-label="CoVakeel home">
          <BrandMark />
        </a>
        <nav className={`links ${open ? "open" : ""}`} aria-label="Main navigation">
          <a href="#home" onClick={closeMenu}>Home</a>
          <a href="#features" onClick={closeMenu}>Features</a>
          <a href="#uses" onClick={closeMenu}>Use Cases</a>
          <a href="#workflow" onClick={closeMenu}>How It Works</a>
          <button className="nav-link" type="button" onClick={() => { closeMenu(); onContact(); }}>
            Contact
          </button>
        </nav>
        <div className="right">
          <label className="sr-only" htmlFor="jurisdiction">Jurisdiction</label>
          <select id="jurisdiction" defaultValue="india">
            <option value="india">🇮🇳 India</option>
          </select>
          <a href="/auth?mode=login">Sign In</a>
          <a href="/auth?mode=signup" className="btn primary">Get Started <span aria-hidden="true">→</span></a>
        </div>
        <button
          className="menu"
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "×" : "☰"}
        </button>
      </div>
    </header>
  );
}

function ResearchDemo() {
  const [mode, setMode] = useState("Quick Research");
  const [question, setQuestion] = useState("");
  const [preview, setPreview] = useState(null);

  const submit = (event) => {
    event.preventDefault();
    setPreview({ mode, question: question.trim() });
  };

  return (
    <div className="demo" id="research">
      <div className="demohead">
        <strong><BrandMark compact /></strong>
        <small>🇮🇳 India</small>
      </div>
      <div className="modes" aria-label="Research mode">
        {["Quick Research", "Deep Research", "Drafting"].map((item) => (
          <button
            type="button"
            key={item}
            className={mode === item ? "active" : ""}
            aria-pressed={mode === item}
            onClick={() => setMode(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <form className="query" onSubmit={submit}>
        <label className="sr-only" htmlFor="research-question">Research question</label>
        <input
          id="research-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask your legal, policy or compliance question..."
          required
        />
        <button type="submit" aria-label="Preview research">➜</button>
      </form>
      <div className="chips" aria-label="Example questions">
        {[
          ["Company law", "Company incorporation requirements in India"],
          ["GST", "GST registration requirements in India"],
          ["Employment law", "Employment contract basics in India"],
        ].map(([label, value]) => (
          <button type="button" key={label} onClick={() => setQuestion(value)}>{label}</button>
        ))}
      </div>
      <div className="answer" aria-live="polite">
        <strong>{preview ? `${preview.mode} — preview` : "Illustrative research preview"}</strong>
        <p>
          {preview
            ? `Your question: ${preview.question}. Connect the approved CoVakeel research API to generate an evidence-grounded answer with verified citations.`
            : "Enter a question to preview the research experience. The production workspace will use retrieved evidence, clickable citations and follow-up questions."}
        </p>
        <div className="source">◈ Sources — publisher, URL, date and relevant excerpt</div>
        <div className="source">▤ Create Draft — convert findings into editable writing</div>
        <p className="fine-print">Interface preview only. It does not generate a legal answer.</p>
      </div>
    </div>
  );
}

function ContactModal({ open, onClose }) {
  const [form, setForm] = useState({ name: "", email: "", organisation: "", message: "" });
  const [state, setState] = useState({ status: "idle", message: "" });

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("modal-open");
    };
  }, [open, onClose]);

  if (!open) return null;

  const update = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setState({ status: "loading", message: "Sending your enquiry…" });
    try {
      const response = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to send the enquiry.");
      setState({ status: "success", message: "Thank you. Your enquiry has been received." });
      setForm({ name: "", email: "", organisation: "", message: "" });
    } catch (error) {
      setState({ status: "error", message: error.message });
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="contact-title">
        <button className="modal-close" type="button" aria-label="Close contact form" onClick={onClose}>×</button>
        <span className="label">Contact CoVakeel</span>
        <h2 id="contact-title">Tell us what you need</h2>
        <p>Share a short note and the team can follow up about access, partnerships or product questions.</p>
        <form className="contact-form" onSubmit={submit}>
          <label>Name<input name="name" value={form.name} onChange={update} maxLength="100" required /></label>
          <label>Email<input name="email" type="email" value={form.email} onChange={update} maxLength="200" required /></label>
          <label>Organisation <span>(optional)</span><input name="organisation" value={form.organisation} onChange={update} maxLength="160" /></label>
          <label>Message<textarea name="message" value={form.message} onChange={update} rows="4" minLength="10" maxLength="2000" required /></label>
          <button className="btn primary" type="submit" disabled={state.status === "loading"}>
            {state.status === "loading" ? "Sending…" : "Send enquiry →"}
          </button>
          {state.message && <p className={`form-status ${state.status}`} role="status">{state.message}</p>}
        </form>
      </section>
    </div>
  );
}

function LandingIcon({ name }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" };
  const paths = {
    book: <><path d="M4 5.5c2.8-.8 5.1-.3 8 1.7v12c-2.9-2-5.2-2.5-8-1.7z"/><path d="M20 5.5c-2.8-.8-5.1-.3-8 1.7v12c2.9-2 5.2-2.5 8-1.7z"/></>,
    shield: <><path d="M12 3 5 6v5c0 4.7 2.8 7.8 7 10 4.2-2.2 7-5.3 7-10V6z"/><path d="m9 12 2 2 4-5"/></>,
    target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M15 9 21 3M17 3h4v4"/></>,
    question: <><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.6 2.1c-1 .6-1.4 1.1-1.4 2.2M12 17h.01"/></>,
    file: <><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></>,
    list: <><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></>,
    scales: <><path d="M12 3v18M7 21h10M5 6h14M7 6 3.5 13h7zM17 6 13.5 13h7z"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></>,
    gavel: <><path d="m14 5 5 5M11 8l5 5M13 6 4 4M18 11l-4 4M3 21l8-8M8 20H3v-5"/></>,
    users: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c.4-4 2.3-6 6-6s5.6 2 6 6M15 15c3.6 0 5.5 1.7 6 5"/></>,
    graduate: <><path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11.5V16c3 2 9 2 12 0v-4.5M22 9v6"/></>,
  };
  return <svg className="landing-line-icon" viewBox="0 0 24 24" aria-hidden="true" {...common}>{paths[name] || paths.file}</svg>;
}

function ExactLanding() {
  const features = [
    ["book", "Readable.", "The law in clean, connected text, not scanned PDFs."],
    ["shield", "Verifiable.", "Every answer carries its source. Nothing floats free."],
    ["target", "Honest about scope.", "Research today. Drafting assistance next, on the same foundation."],
  ];
  const steps = [
    ["question", "Ask.", "Type your question the way you would say it. If you have a notice in hand, describe what it says."],
    ["file", "Read.", "The answer comes in plain language, with the section, rule or circular it rests on beside it."],
    ["search", "Verify.", "Open any citation to check the official source and the provision supporting the answer."],
    ["list", "Go deeper.", "Browse the connected material, continue with follow-up questions and save the research thread."],
  ];
  const uses = [
    ["file", "Understanding a notice.", "Which provisions it rests on, what they require and the time limits involved."],
    ["scales", "Checking a position before you act.", "Research whether a tax treatment, supply or deduction is covered."],
    ["clock", "Tracking what changed.", "Read amendments and Finance Act provisions beside the principal material."],
    ["gavel", "Finding the provision.", "Go directly to a cited Article, Section, Rule or form in the selected sources."],
    ["users", "Preparing for a meeting.", "Keep every question and source-backed answer together in one saved thread."],
    ["graduate", "Learning the subject.", "Explore the available Acts and Rules one focused question at a time."],
  ];

  return (
    <div className="exact-landing">
      <header className="landing-top">
        <a className="landing-brand" href="#top" aria-label="CoVakeel home"><BrandMark /></a>
        <nav className="landing-nav" aria-label="Account access">
          <a className="landing-btn outline" href="/auth?mode=login">Sign In</a>
          <a className="landing-btn primary" href="/auth?mode=signup">Sign Up</a>
        </nav>
      </header>

      <main>
        <section className="landing-hero" id="top">
          <div className="landing-hero-content">
            <h1>Draft what’s <em>next</em></h1>
            <p>Your drafting partner for tax litigation — GST, Income Tax, Customs.</p>
            <div className="landing-auth-actions">
              <a href="/auth?mode=login">Sign in to your account</a>
              <span>OR</span>
              <a className="email" href="/auth?mode=signup">Continue with email</a>
            </div>
            <p className="landing-disclaimer">By continuing, you acknowledge our Privacy Policy and agree to receive essential account communications.</p>
            <a className="landing-explore" href="#how-it-works">↓ <span>Explore how it works</span></a>
          </div>
        </section>

        <div className="landing-content">
          <div className="landing-wrap">
            <div className="landing-intro"><span className="landing-eyebrow">Company · Platform</span></div>

            <section className="landing-info" id="who-we-are">
              <h2>Who we are</h2>
              <p className="landing-section-lead">Indian tax law, made readable. For everyone who has to deal with it.</p>
              <div className="landing-copy centered">
                <p>CoVakeel is an AI research platform for GST, Income Tax and Customs.</p>
                <p>Indian tax law lives across Acts, sections, rules, circulars, notifications, instructions and judgments. Finding the right provision is hard. Knowing whether it still applies is harder. CoVakeel brings the available law and its source together.</p>
                <p>It is built for business owners, advocates, tax professionals, finance teams and students who need to understand what the available law says.</p>
              </div>
              <div className="landing-image wide"><img src="/assets/tax-law-books-v2.png" alt="GST, Income Tax and Customs law books" /></div>
              <div className="landing-feature-grid">
                {features.map(([icon, title, text]) => <article key={title}><LandingIcon name={icon} /><strong>{title}</strong><p>{text}</p></article>)}
              </div>
            </section>

            <section className="landing-info" id="what-we-do">
              <h2>What we do</h2>
              <p className="landing-section-lead">A focused legal library, and an AI that works inside it.</p>
              <div className="landing-two-column">
                <div className="landing-copy">
                  <p><strong>The library.</strong> Selected official GST legislation, amendment Acts, Finance Acts, Rules and forms, organized for reliable retrieval.</p>
                  <p><strong>The connections.</strong> Related provisions and changes stay close to the answer, so the research can continue without losing context.</p>
                  <p><strong>The AI.</strong> Ask a question in plain language. CoVakeel locates relevant material and keeps the official source beside the answer.</p>
                </div>
                <div className="landing-image"><img src="/assets/research-laptop-v2.png" alt="Laptop displaying legal research" /></div>
              </div>
            </section>

            <section className="landing-info" id="how-it-works">
              <h2>How it works</h2>
              <p className="landing-section-lead">Ask. Read. Verify.</p>
              <div className="landing-step-grid">
                {steps.map(([icon, title, text]) => <article key={title}><LandingIcon name={icon} /><strong>{title}</strong><p>{text}</p></article>)}
              </div>
            </section>

            <section className="landing-info" id="use-cases">
              <h2>What should I use <em>CoVakeel</em> for?</h2>
              <p className="landing-section-lead">Questions that begin with “what does the law actually say?”</p>
              <div className="landing-use-grid">
                {uses.map(([icon, title, text]) => <article key={title}><LandingIcon name={icon} /><strong>{title}</strong><p>{text}</p></article>)}
              </div>
            </section>
          </div>
        </div>
      </main>

      <footer className="landing-footer">
        <div className="landing-wrap">
          <div className="landing-footer-grid">
            <div><a className="landing-brand footer-logo" href="#top"><BrandMark /></a><p>Indian tax-law research with official-source citations.</p><p className="footer-status">● Secure email access · Saved research workspace</p></div>
            <div><h3>Company</h3><a href="#who-we-are">Who we are</a><a href="#what-we-do">What we do</a><a href="#how-it-works">How it works</a></div>
            <div><h3>Research</h3><a href="#use-cases">What CoVakeel is for</a><a href="/auth?mode=login">Open workspace</a></div>
            <div><h3>Account & support</h3><a href="/auth?mode=login">Sign in</a><a href="/auth?mode=signup">Create account</a></div>
          </div>
          <div className="landing-footer-bottom"><span>© 2026 CoVakeel. All rights reserved.</span><span>Research · Read · Verify</span></div>
        </div>
      </footer>
    </div>
  );
}

function AuthPage() {
  const initialMode = new URLSearchParams(window.location.search).get("mode") === "signup" ? "signup" : "login";
  const [mode, setMode] = useState(initialMode);
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [availability, setAvailability] = useState({ loading: true, ready: false });
  const [resendSeconds, setResendSeconds] = useState(0);
  const [lockSeconds, setLockSeconds] = useState(0);
  const [status, setStatus] = useState({ type: "idle", message: "" });

  useEffect(() => {
    fetch("/api/auth/status")
      .then((response) => response.json())
      .then((result) => setAvailability({ loading: false, ready: Boolean(result.ready) }))
      .catch(() => setAvailability({ loading: false, ready: false }));
  }, []);

  useEffect(() => {
    if (resendSeconds <= 0) return undefined;
    const timer = window.setInterval(() => setResendSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  useEffect(() => {
    if (lockSeconds <= 0) return undefined;
    const timer = window.setInterval(() => setLockSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [lockSeconds]);

  const chooseMode = (nextMode) => {
    setMode(nextMode);
    setStep("email");
    setCode("");
    setResendSeconds(0);
    setLockSeconds(0);
    setStatus({ type: "idle", message: "" });
    window.history.replaceState({}, "", `/auth?mode=${nextMode}`);
  };

  const requestOtp = async (event) => {
    event.preventDefault();
    setStatus({ type: "loading", message: "Sending verification code…" });
    try {
      const response = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, intent: mode }),
      });
      const result = await response.json();
      if (result.retryAfterSeconds) setLockSeconds(result.retryAfterSeconds);
      if (!response.ok) throw new Error(result.error || "Unable to send the verification code.");
      setStep("otp");
      setResendSeconds(60);
      setStatus({ type: "success", message: result.message });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  };

  const verifyOtp = async (event) => {
    event.preventDefault();
    setStatus({ type: "loading", message: "Verifying your code…" });
    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, intent: mode, code }),
      });
      const result = await response.json();
      if (result.retryAfterSeconds) setLockSeconds(result.retryAfterSeconds);
      if (!response.ok) throw new Error(result.error || "Unable to verify the code.");
      setStatus({ type: "success", message: "Email verified. Opening your CoVakeel workspace…" });
      window.setTimeout(() => window.location.assign(result.redirectUrl), 500);
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  };

  const maskedEmail = email.replace(/^(.{2}).*(@.*)$/, "$1••••$2");

  return (
    <main className="auth-shell">
      <section className="auth-brand-panel">
        <a className="brand auth-brand" href="/"><BrandMark /></a>
        <div>
          <span className="label">Secure workspace access</span>
          <h1>Legal research,<br /><span className="gold">ready when you are.</span></h1>
          <p>Sign in securely with a one-time code. No password to remember.</p>
          <div className="auth-benefits">
            <span>✓ Email verification</span>
            <span>✓ Secure session</span>
            <span>✓ Direct workspace access</span>
          </div>
        </div>
        <p className="auth-legal">Protected by short-lived verification codes and secure HTTP-only sessions.</p>
      </section>

      <section className="auth-form-panel">
        <div className="auth-card">
          <a className="auth-back" href="/">← Back to home</a>
          <div className="auth-tabs" role="tablist" aria-label="Account access">
            <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => chooseMode("login")}>Sign In</button>
            <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "active" : ""} onClick={() => chooseMode("signup")}>Create Account</button>
          </div>

          {!availability.loading && !availability.ready && (
            <div className="auth-service-state unavailable" role="status">
              <span>!</span>
              Email verification is temporarily unavailable. Please try again later.
            </div>
          )}

          {step === "email" ? (
            <form className="auth-form" onSubmit={requestOtp}>
              <span className="label">{mode === "login" ? "Welcome back" : "Create your account"}</span>
              <h2>{mode === "login" ? "Sign in to CoVakeel" : "Start using CoVakeel"}</h2>
              <p>{mode === "login" ? "Enter the email linked to your account." : "Use your work email to create a verified account."}</p>
              <label htmlFor="auth-email">Email address</label>
              <input
                id="auth-email"
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                maxLength="200"
                required
                autoFocus
                onInput={() => {
                  if (lockSeconds > 0) {
                    setLockSeconds(0);
                    setStatus({ type: "idle", message: "" });
                  }
                }}
              />
              <button className="btn primary auth-submit" type="submit" disabled={status.type === "loading" || availability.loading || !availability.ready || lockSeconds > 0}>
                {lockSeconds > 0 ? `Locked for ${Math.ceil(lockSeconds / 60)}m` : status.type === "loading" ? "Sending…" : "Continue with email →"}
              </button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={verifyOtp}>
              <span className="label">Verify your email</span>
              <h2>Enter the 6-digit code</h2>
              <p>We sent a verification code to <strong>{maskedEmail}</strong>.</p>
              <label htmlFor="auth-code">Verification code</label>
              <input
                className="otp-input"
                id="auth-code"
                name="code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength="6"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                autoComplete="one-time-code"
                required
                autoFocus
                disabled={lockSeconds > 0}
              />
              <button className="btn primary auth-submit" type="submit" disabled={status.type === "loading" || code.length !== 6 || lockSeconds > 0}>
                {lockSeconds > 0 ? `Account locked for ${Math.ceil(lockSeconds / 60)}m` : status.type === "loading" ? "Verifying…" : "Verify and continue →"}
              </button>
              <button className="text-button" type="button" disabled={status.type === "loading" || resendSeconds > 0 || lockSeconds > 0} onClick={requestOtp}>
                {lockSeconds > 0 ? `Locked for ${Math.ceil(lockSeconds / 60)}m` : resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : "Resend verification code"}
              </button>
              <button className="text-button" type="button" onClick={() => {
                setStep("email");
                setCode("");
                setLockSeconds(0);
                setStatus({ type: "idle", message: "" });
              }}>
                Use a different email
              </button>
            </form>
          )}

          {status.message && <p className={`form-status auth-status ${status.type}`} role="status">{status.message}</p>}
          <p className="auth-terms">By continuing, you agree to CoVakeel’s Terms and Privacy Policy.</p>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  if (window.location.pathname === "/auth") return <AuthPage />;
  if (window.location.pathname === "/workspace") return <Workspace />;
  return <ExactLanding />;
}
