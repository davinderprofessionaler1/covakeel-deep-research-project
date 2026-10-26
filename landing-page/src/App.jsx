import { useEffect, useState } from "react";
import Workspace from "./Workspace.jsx";

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
          <span aria-hidden="true">⚖</span> CoVakeel
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
        <strong><span aria-hidden="true">⚖</span> CoVakeel</strong>
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

function AuthPage() {
  const initialMode = new URLSearchParams(window.location.search).get("mode") === "signup" ? "signup" : "login";
  const [mode, setMode] = useState(initialMode);
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [status, setStatus] = useState({ type: "idle", message: "" });

  const chooseMode = (nextMode) => {
    setMode(nextMode);
    setStep("email");
    setCode("");
    setDevOtp("");
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
      if (!response.ok) throw new Error(result.error || "Unable to send the verification code.");
      setDevOtp(result.devOtp || "");
      setStep("otp");
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
        <a className="brand auth-brand" href="/"><span aria-hidden="true">⚖</span> CoVakeel</a>
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
              />
              <button className="btn primary auth-submit" type="submit" disabled={status.type === "loading"}>
                {status.type === "loading" ? "Sending…" : "Continue with email →"}
              </button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={verifyOtp}>
              <span className="label">Verify your email</span>
              <h2>Enter the 6-digit code</h2>
              <p>We sent a verification code to <strong>{maskedEmail}</strong>.</p>
              {devOtp && (
                <div className="dev-otp" role="note">
                  <span>Local testing code</span>
                  <strong>{devOtp}</strong>
                  <small>SMTP is not connected locally. This code will be emailed in production.</small>
                </div>
              )}
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
              />
              <button className="btn primary auth-submit" type="submit" disabled={status.type === "loading" || code.length !== 6}>
                {status.type === "loading" ? "Verifying…" : "Verify and continue →"}
              </button>
              <button className="text-button" type="button" onClick={() => { setStep("email"); setCode(""); setStatus({ type: "idle", message: "" }); }}>
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
  const [contactOpen, setContactOpen] = useState(false);

  if (window.location.pathname === "/auth") return <AuthPage />;
  if (window.location.pathname === "/workspace") return <Workspace />;

  return (
    <>
      <Header onContact={() => setContactOpen(true)} />
      <main>
        <section className="hero" id="home">
          <div className="wrap split">
            <div className="hero-copy">
              <span className="label">India-focused AI research & drafting</span>
              <h1>Smarter Research.<br /><span className="gold">Better Decisions.</span></h1>
              <p>Research answers with sources. Turn findings into professional drafts through a simple, thoughtful workspace.</p>
              <div className="actions">
                <a className="btn primary" href="#research">Try CoVakeel →</a>
                <a className="btn" href="#workflow">See How It Works ↗</a>
              </div>
              <div className="ticks">
                <span>Source-backed answers</span>
                <span>India focused</span>
                <span>Research to draft</span>
              </div>
            </div>
            <ResearchDemo />
          </div>
        </section>

        <section className="strip" aria-label="Platform highlights">
          <div className="wrap stripgrid">
            <div><span>◈</span>Source-backed Answers</div>
            <div><span>◎</span>Deep Research</div>
            <div><span>▤</span>AI Drafting</div>
            <div><span>♧</span>Private Knowledge <small>planned</small></div>
          </div>
        </section>

        <section className="section features" id="features">
          <div className="wrap">
            <div className="center section-heading">
              <span className="label">Powerful capabilities</span>
              <h2>Everything You Need for<br />Better Research</h2>
              <p>Explore complex questions, understand supporting sources and turn your work into professional drafts.</p>
            </div>
            <div className="cards">
              {features.map((feature) => (
                <article className="card" key={feature.title}>
                  <div className="icon" aria-hidden="true">{feature.icon}</div>
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                  <a href={feature.href}>Explore →</a>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section workflow" id="workflow">
          <div className="wrap split">
            <div>
              <span className="label">How it works</span>
              <h2>From Question<br />to Draft in Minutes</h2>
              <p>A simple workflow designed to keep research organized and understandable.</p>
              {steps.map(([title, text], index) => (
                <div className="step" key={title}>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  <div><strong>{title}</strong><p>{text}</p></div>
                </div>
              ))}
            </div>
            <div className="visual" aria-label="CoVakeel workspace preview">
              <div className="laptop">
                <div className="brand"><span aria-hidden="true">⚖</span> CoVakeel</div>
                <h3>What would you like to research?</h3>
                <div className="fake">Ask a question about Indian law, policy or compliance... <span>→</span></div>
                <p className="preview-modes">Quick Research · Deep Research · Drafting</p>
                <hr />
                <p className="preview-copy">A research summary and source panel will appear here.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section uses" id="uses">
          <div className="wrap center">
            <span className="label">Made for focused work</span>
            <h2>Built for Your Research Needs</h2>
            <p>Designed for professionals and learners who need organized information and clear drafting tools.</p>
            <div className="usegrid">
              {useCases.map(([icon, title, text]) => (
                <article className="use" key={title}>
                  <div className="emoji" aria-hidden="true">{icon}</div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section why">
          <div className="wrap split">
            <div className="whyart" aria-hidden="true"><span>⚖</span></div>
            <div>
              <span className="label">Why CoVakeel</span>
              <h2>More Clarity.<br />Better Research.<br />Stronger Drafts.</h2>
              <p>CoVakeel is designed around a transparent workflow: investigate questions, inspect citations, save work and create editable drafts.</p>
              <p>India is the default jurisdiction, with relevant Indian sources prioritized where appropriate.</p>
              <a className="btn primary" href="#research">Start Research →</a>
            </div>
          </div>
        </section>

        <section className="cta" id="contact">
          <div className="wrap ctabox">
            <div>
              <span className="label">A smarter way to work</span>
              <h2>Research with More Confidence</h2>
              <p>Explore an easier path from questions to professional drafts.</p>
            </div>
            <button className="btn primary" type="button" onClick={() => setContactOpen(true)}>Contact the Team →</button>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap">
          <div className="footgrid">
            <div>
              <div className="brand"><span aria-hidden="true">⚖</span> CoVakeel</div>
              <p>AI Research · Deep Research · Source-backed Answers · AI Drafting</p>
              <p>India-focused research and drafting platform.</p>
            </div>
            <div><h4>Product</h4><a href="#features">Features</a><a href="#workflow">How It Works</a><a href="#research">Research Preview</a></div>
            <div><h4>Company</h4><a href="#uses">Use Cases</a><button type="button" onClick={() => setContactOpen(true)}>Contact</button><a href="#home">Back to Top</a></div>
            <div><h4>Important</h4><p>AI-generated information can be inaccurate. Legal, tax and financial outputs require qualified professional review.</p></div>
          </div>
          <div className="bottom">© 2026 CoVakeel · Research and drafting platform.</div>
        </div>
      </footer>

      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </>
  );
}
