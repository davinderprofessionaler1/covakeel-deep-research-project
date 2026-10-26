import { useCallback, useEffect, useRef, useState } from "react";

const suggestedPrompts = [
  "Explain Article 14 of the Constitution of India",
  "What does Section 103 of BNS provide?",
  "Explain electronic evidence under the BSA",
];

function groupLabel(dateValue) {
  const date = new Date(dateValue);
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const difference = Math.round((startToday - startDate) / 86_400_000);
  if (difference === 0) return "Today";
  if (difference === 1) return "Yesterday";
  if (difference < 7) return "Previous 7 days";
  return date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function groupConversations(conversations) {
  return conversations.reduce((groups, conversation) => {
    const label = groupLabel(conversation.updated_at);
    const group = groups.find((item) => item.label === label);
    if (group) group.items.push(conversation);
    else groups.push({ label, items: [conversation] });
    return groups;
  }, []);
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, { credentials: "include", ...options });
  if (response.status === 401) {
    window.location.assign("/auth?mode=login");
    throw new Error("Authentication required.");
  }
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(result?.error || "Request failed.");
  return result;
}

function Sidebar({ user, conversations, activeId, onSearch, onSelect, onNew, onSettings, onHelp, onLogout, open, onClose }) {
  const groups = groupConversations(conversations);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountMenu = useRef(null);

  useEffect(() => {
    if (!accountOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!accountMenu.current?.contains(event.target)) setAccountOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountOpen]);

  return (
    <>
      {open && <button className="workspace-overlay" aria-label="Close sidebar" type="button" onClick={onClose} />}
      <aside className={`workspace-sidebar ${open ? "open" : ""}`}>
        <div className="workspace-brand-row">
          <a className="workspace-brand" href="/"><span>⚖</span> CoVakeel</a>
          <button className="sidebar-close" type="button" aria-label="Close sidebar" onClick={onClose}>×</button>
        </div>
        <nav className="workspace-nav" aria-label="Workspace navigation">
          <button className="primary-action" type="button" onClick={() => { onNew(); onClose(); }}><b>＋</b> New thread</button>
          <button type="button" onClick={() => { onSearch(); onClose(); }}><span>⌕</span> Search</button>
        </nav>
        <div className="sidebar-rule" />
        <div className="recents-heading"><span>Recents</span><span>⌄</span></div>
        <div className="conversation-list">
          {groups.length === 0 && <p className="empty-history">Your saved conversations will appear here.</p>}
          {groups.map((group) => (
            <section key={group.label} className="history-group">
              <h3>{group.label}</h3>
              {group.items.map((conversation) => (
                <button
                  className={conversation.id === activeId ? "active" : ""}
                  type="button"
                  key={conversation.id}
                  title={conversation.title}
                  onClick={() => { onSelect(conversation.id); onClose(); }}
                >
                  {conversation.title}
                </button>
              ))}
            </section>
          ))}
        </div>
        <div className="account-section" ref={accountMenu}>
          {accountOpen && (
            <div className="account-popover" role="menu" aria-label="Account menu">
              <div className="account-popover-email" title={user?.email}>{user?.email || "CoVakeel user"}</div>
              <button type="button" role="menuitem" onClick={() => { setAccountOpen(false); onSettings(); }}><span>⚙</span> Settings</button>
              <button type="button" role="menuitem" onClick={() => { setAccountOpen(false); onHelp(); }}><span>?</span> Help center</button>
              <div className="account-popover-rule" />
              <button className="account-logout" type="button" role="menuitem" onClick={() => { setAccountOpen(false); onLogout(); }}><span>↪</span> Logout</button>
            </div>
          )}
          <button
            className="account-trigger"
            type="button"
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            onClick={() => setAccountOpen((value) => !value)}
          >
            <span className="account-avatar">{user?.email?.[0]?.toUpperCase() || "C"}</span>
            <span className="account-summary"><strong>{user?.email || "CoVakeel user"}</strong><small>Verified account</small></span>
            <span className={`account-chevron ${accountOpen ? "open" : ""}`} aria-hidden="true">⌃</span>
          </button>
        </div>
      </aside>
    </>
  );
}

function AccountDialog({ mode, user, onClose }) {
  useEffect(() => {
    if (!mode) return undefined;
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.classList.remove("modal-open");
    };
  }, [mode, onClose]);

  if (!mode) return null;
  const settings = mode === "settings";

  return (
    <div className="account-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title">
        <button className="account-dialog-close" type="button" aria-label="Close" onClick={onClose}>×</button>
        <span className="account-dialog-icon" aria-hidden="true">{settings ? "⚙" : "?"}</span>
        <h2 id="account-dialog-title">{settings ? "Account settings" : "Help center"}</h2>
        {settings ? (
          <>
            <p>Your CoVakeel conversations are connected to this verified account.</p>
            <div className="account-detail"><span>Email address</span><strong>{user?.email || "CoVakeel user"}</strong><small>Verified</small></div>
          </>
        ) : (
          <>
            <p>Start a new legal research thread, attach a supported document, or reopen a saved conversation from Recents.</p>
            <div className="help-steps">
              <span><b>1</b> Select <strong>New thread</strong> for a fresh conversation.</span>
              <span><b>2</b> Ask a legal question or attach a PDF, DOCX, text file or image.</span>
              <span><b>3</b> Verify important information against the cited official source.</span>
            </div>
          </>
        )}
        <button className="btn primary account-dialog-action" type="button" onClick={onClose}>Done</button>
      </section>
    </div>
  );
}

function SearchModal({ open, onClose, onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    setResults([]);
    const onKeyDown = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("modal-open");
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !query.trim()) { setResults([]); setSearching(false); return undefined; }
    setSearching(true);
    const timer = window.setTimeout(() => {
      jsonRequest(`/api/conversations?search=${encodeURIComponent(query.trim())}`)
        .then((result) => setResults(result.conversations))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, open]);

  if (!open) return null;

  return (
    <div className="thread-search-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="thread-search-modal" role="dialog" aria-modal="true" aria-labelledby="thread-search-title">
        <div className="thread-search-input">
          <span aria-hidden="true">⌕</span>
          <label className="sr-only" htmlFor="thread-search">Search your conversations</label>
          <input id="thread-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your conversations" autoFocus />
          <button type="button" aria-label="Close search" onClick={onClose}>×</button>
        </div>
        <div className="thread-search-content">
          {!query.trim() && (
            <div className="thread-search-empty">
              <div>⌕</div>
              <h2 id="thread-search-title">Search your conversations</h2>
              <p>Find any thread by its title, your question, or CoVakeel’s response.</p>
            </div>
          )}
          {query.trim() && searching && <div className="thread-search-loading">Searching saved conversations…</div>}
          {query.trim() && !searching && results.length === 0 && (
            <div className="thread-search-empty compact"><div>⌕</div><h2>No conversations found</h2><p>Try another keyword or phrase.</p></div>
          )}
          {results.length > 0 && (
            <div className="thread-search-results" aria-live="polite">
              <span className="search-result-count">{results.length} {results.length === 1 ? "conversation" : "conversations"}</span>
              {results.map((conversation) => (
                <button type="button" key={conversation.id} onClick={() => { onSelect(conversation.id); onClose(); }}>
                  <span className="result-icon">▤</span>
                  <span><strong>{conversation.title}</strong><small>{conversation.preview || "Saved legal research conversation"}</small></span>
                  <time>{new Date(conversation.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</time>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function EmptyPanel({ panel, onStart }) {
  if (panel === "projects") {
    return (
      <div className="workspace-empty panel-empty">
        <div className="empty-mark">▱</div><span className="label">Projects</span>
        <h1>Organize related legal work</h1>
        <p>Group conversations, research and drafts by client or matter. Project document uploads will be connected in the next phase.</p>
        <button className="btn primary" type="button" onClick={() => onStart()}>Start a research thread</button>
      </div>
    );
  }
  if (panel === "workflows") {
    return (
      <div className="workspace-empty panel-empty">
        <div className="empty-mark">⇄</div><span className="label">Workflows</span>
        <h1>Start from a guided workflow</h1>
        <div className="workflow-choices">
          {[
            ["Legal research", "Ask a focused question and review cited sources."],
            ["Document drafting", "Turn reviewed research into an editable first draft."],
            ["Compliance check", "Work through obligations with a structured checklist."],
          ].map(([title, text]) => <button type="button" key={title} onClick={() => onStart()}><strong>{title}</strong><span>{text}</span></button>)}
        </div>
      </div>
    );
  }
  return (
    <div className="workspace-empty">
      <div className="empty-mark">⚖</div>
      <span className="label">India-focused legal workspace</span>
      <h1>What would you like<br />to research?</h1>
      <p>Ask a legal question in English, Hindi or Punjabi. CoVakeel will search the available legal knowledge and cite its source.</p>
      <div className="workspace-suggestions">
        {suggestedPrompts.map((prompt) => <button type="button" key={prompt} onClick={() => onStart(prompt)}>{prompt}<span>→</span></button>)}
      </div>
    </div>
  );
}

function Message({ message, conversationId }) {
  const [feedback, setFeedback] = useState("");
  return (
    <article className={`workspace-message ${message.role}`}>
      <div className="message-avatar">{message.role === "assistant" ? "⚖" : "You"}</div>
      <div className="message-body">
        {message.attachments?.length > 0 && (
          <div className="message-attachments">
            {message.attachments.map((attachment) => (
              <a key={attachment.id || attachment.name} href={attachment.id ? `/api/attachments/${attachment.id}/download?conversationId=${conversationId}` : undefined}>
                <span>{attachment.mime_type?.startsWith("image/") ? "▧" : "▤"}</span>
                <span><strong>{attachment.name}</strong><small>{attachment.extraction_status === "stored_image" ? "Image stored" : "Text extracted"}</small></span>
              </a>
            ))}
          </div>
        )}
        <div className="message-content">{message.content || (message.streaming ? "" : "No response received.")}</div>
        {message.role === "assistant" && !message.streaming && (
          <div className="answer-actions">
            <span>{message.elapsed_ms ? `${(message.elapsed_ms / 1000).toFixed(1)}s · ` : ""}Was this useful?</span>
            <button className={feedback === "up" ? "active" : ""} type="button" aria-label="Helpful answer" onClick={() => setFeedback("up")}>♡</button>
            <button className={feedback === "down" ? "active" : ""} type="button" aria-label="Unhelpful answer" onClick={() => setFeedback("down")}>♢</button>
          </div>
        )}
      </div>
    </article>
  );
}

export default function Workspace() {
  const [user, setUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [title, setTitle] = useState("New legal research");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [panel, setPanel] = useState("chat");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountDialog, setAccountDialog] = useState(null);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [attachmentError, setAttachmentError] = useState("");
  const messagesEnd = useRef(null);
  const fileInput = useRef(null);
  const composerInput = useRef(null);

  const loadConversations = useCallback(async () => {
    const result = await jsonRequest("/api/conversations");
    setConversations(result.conversations);
  }, []);

  useEffect(() => {
    Promise.all([jsonRequest("/api/auth/session"), jsonRequest("/api/conversations")])
      .then(([session, history]) => { setUser(session.user); setConversations(history.conversations); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const newThread = (prompt = "") => {
    setActiveId(null); setTitle("New legal research"); setMessages([]); setPanel("chat"); setInput(prompt); setMenuOpen(false); setSearchOpen(false); setPendingFiles([]); setAttachmentError("");
    window.requestAnimationFrame(() => composerInput.current?.focus());
  };

  const selectConversation = async (id) => {
    setPanel("chat"); setLoading(true); setMenuOpen(false);
    try {
      const conversation = await jsonRequest(`/api/conversations/${id}`);
      setActiveId(conversation.id); setTitle(conversation.title); setMessages(conversation.messages); setPendingFiles([]); setAttachmentError("");
    } finally { setLoading(false); }
  };

  const chooseFiles = (event) => {
    const selected = [...event.target.files];
    event.target.value = "";
    const allowed = /\.(pdf|doc|docx|txt|md|csv|json|jpe?g|png|webp)$/i;
    const invalid = selected.find((file) => !allowed.test(file.name) || file.size > 15 * 1024 * 1024);
    if (invalid) {
      setAttachmentError("Use PDF, DOC, DOCX, text or image files up to 15 MB each.");
      return;
    }
    setAttachmentError("");
    setPendingFiles((current) => [...current, ...selected].slice(0, 5));
  };

  const uploadFiles = async (conversationId, files) => {
    if (!files.length) return [];
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    const response = await fetch(`/api/conversations/${conversationId}/attachments`, { method: "POST", credentials: "include", body: form });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to upload the files.");
    return result.attachments;
  };

  const sendMessage = async (event) => {
    event?.preventDefault();
    let content = input.trim();
    if (!content && pendingFiles.length) content = "Please review the attached document and answer my legal question based on it.";
    if (!content || sending) return;
    setPanel("chat"); setInput(""); setSending(true);
    const assistantId = `local-assistant-${Date.now()}`;
    try {
      let conversationId = activeId;
      if (!conversationId && pendingFiles.length) {
        const created = await jsonRequest("/api/conversations", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: content.length > 58 ? `${content.slice(0, 57).trim()}…` : content }),
        });
        conversationId = created.id; setActiveId(created.id); setTitle(created.title);
      }
      const uploaded = await uploadFiles(conversationId, pendingFiles);
      setPendingFiles([]); setAttachmentError("");
      const userMessage = { id: `local-user-${Date.now()}`, role: "user", content, attachments: uploaded };
      setMessages((current) => [...current, userMessage, { id: assistantId, role: "assistant", content: "", streaming: true }]);
      const response = await fetch("/api/workspace/chat/stream", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: content, attachmentIds: uploaded.map((attachment) => attachment.id) }),
      });
      if (response.status === 401) return window.location.assign("/auth?mode=login");
      if (!response.ok || !response.body) throw new Error("Unable to send the message.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split("\n"); buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const item = JSON.parse(line);
          if (item.type === "conversation") { setActiveId(item.conversation.id); setTitle(item.conversation.title); }
          if (item.type === "token") setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: message.content + item.content } : message));
          if (item.type === "status") setMessages((current) => current.map((message) => message.id === assistantId && !message.content ? { ...message, status: item.message } : message));
          if (item.type === "done") setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, streaming: false, elapsed_ms: item.elapsed_ms } : message));
          if (item.type === "error") throw new Error(item.message);
        }
        if (done) break;
      }
      setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, streaming: false } : message));
      await loadConversations();
    } catch (error) {
      setMessages((current) => current.some((message) => message.id === assistantId)
        ? current.map((message) => message.id === assistantId ? { ...message, streaming: false, content: error.message } : message)
        : [...current, { id: assistantId, role: "assistant", streaming: false, content: error.message }]);
    } finally { setSending(false); }
  };

  const renameCurrent = async () => {
    if (!activeId) return;
    const nextTitle = window.prompt("Rename conversation", title)?.trim();
    if (!nextTitle) return;
    const updated = await jsonRequest(`/api/conversations/${activeId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: nextTitle }) });
    setTitle(updated.title); setMenuOpen(false); await loadConversations();
  };

  const deleteCurrent = async () => {
    if (!activeId || !window.confirm("Delete this conversation and its messages?")) return;
    await jsonRequest(`/api/conversations/${activeId}`, { method: "DELETE" });
    newThread(); await loadConversations();
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.assign("/auth?mode=login");
  };

  if (loading && !user) return <div className="workspace-loading"><span>⚖</span><p>Opening CoVakeel…</p></div>;

  return (
    <div className="workspace-shell">
      <Sidebar {...{ user, conversations, activeId, onLogout: logout, open: sidebarOpen }} onSearch={() => setSearchOpen(true)} onClose={() => setSidebarOpen(false)} onSelect={selectConversation} onNew={newThread} onSettings={() => setAccountDialog("settings")} onHelp={() => setAccountDialog("help")} />
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={selectConversation} />
      <AccountDialog mode={accountDialog} user={user} onClose={() => setAccountDialog(null)} />
      <main className="workspace-main">
        <header className="workspace-header">
          <button className="mobile-menu" type="button" aria-label="Open sidebar" onClick={() => setSidebarOpen(true)}>☰</button>
          <div><span>{panel === "chat" ? title : panel === "projects" ? "Projects" : "Workflows"}</span><small>India · Phase 1 legal knowledge</small></div>
          {panel === "chat" && activeId && <div className="thread-menu-wrap"><button className="thread-menu-button" type="button" aria-label="Conversation options" onClick={() => setMenuOpen((value) => !value)}>⋮</button>{menuOpen && <div className="thread-menu"><button type="button" onClick={renameCurrent}>Rename</button><button className="danger" type="button" onClick={deleteCurrent}>Delete</button></div>}</div>}
        </header>

        <div className="workspace-content">
          {panel !== "chat" || messages.length === 0 ? <EmptyPanel panel={panel} onStart={(prompt = "") => newThread(prompt)} /> : (
            <div className="message-list">{messages.map((message) => <Message key={message.id} message={message} conversationId={activeId} />)}<div ref={messagesEnd} /></div>
          )}
        </div>

        {panel === "chat" && (
          <div className="composer-area">
            <form className="workspace-composer" onSubmit={sendMessage}>
              <input ref={fileInput} className="file-input" type="file" multiple accept=".pdf,.doc,.docx,.txt,.md,.csv,.json,.jpg,.jpeg,.png,.webp" onChange={chooseFiles} />
              {pendingFiles.length > 0 && <div className="pending-files">{pendingFiles.map((file, index) => <span key={`${file.name}-${file.size}-${index}`}><b>{/\.(jpe?g|png|webp)$/i.test(file.name) ? "▧" : "▤"}</b>{file.name}<button type="button" aria-label={`Remove ${file.name}`} onClick={() => setPendingFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></span>)}</div>}
              {attachmentError && <p className="attachment-error" role="alert">{attachmentError}</p>}
              <textarea ref={composerInput} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} placeholder="Ask CoVakeel a legal question…" rows="2" maxLength="8000" disabled={sending} />
              <div className="composer-tools"><button type="button" className="attach-button" aria-label="Attach document or image" title="Attach document or image" onClick={() => fileInput.current?.click()}>＋</button><span>PDF · DOCX · Text · Image</span><button className="send-button" type="submit" disabled={sending || (!input.trim() && !pendingFiles.length)} aria-label="Send message">{sending ? "…" : "↑"}</button></div>
            </form>
            <p>CoVakeel can make mistakes. Verify important legal information against the cited official source.</p>
          </div>
        )}
      </main>
    </div>
  );
}
