import { useCallback, useEffect, useState } from "react";

const initialResult = {
  documents: [],
  pagination: { page: 1, pages: 1, total: 0 },
  summary: { approved: 0, pending: 0, rejected: 0, unknown: 0, totalRecords: 0, totalDocuments: 0, invalidRecords: 0 },
  activeIndex: "Loading…",
  allowPending: false,
};

const initialCatalog = {
  active: { count: 0, description: "Loading active knowledge…", items: [] },
  tax: { count: 0, downloaded: 0, imported: 0, description: "Loading collected tax sources…", items: [] },
  planned: { count: 0, description: "Loading planned laws…", items: [] },
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

function formatDate(value) {
  if (!value) return "Date unavailable";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function KnowledgePipeline({ catalog }) {
  const [tab, setTab] = useState("active");
  const group = catalog[tab];
  return (
    <section className="knowledge-pipeline">
      <div className="pipeline-heading"><div><span className="eyebrow">Source pipeline</span><h2>What CoVakeel has and what comes next</h2></div></div>
      <div className="pipeline-tabs" role="tablist" aria-label="Knowledge source groups">
        <button className={tab === "active" ? "active" : ""} type="button" role="tab" aria-selected={tab === "active"} onClick={() => setTab("active")}><strong>{formatNumber(catalog.active.count)}</strong><span>Active documents</span></button>
        <button className={tab === "tax" ? "active" : ""} type="button" role="tab" aria-selected={tab === "tax"} onClick={() => setTab("tax")}><strong>{formatNumber(catalog.tax.imported)} active</strong><span>{formatNumber(catalog.tax.downloaded)} of {formatNumber(catalog.tax.count)} tax sources downloaded</span></button>
        <button className={tab === "planned" ? "active" : ""} type="button" role="tab" aria-selected={tab === "planned"} onClick={() => setTab("planned")}><strong>{formatNumber(catalog.planned.count)}</strong><span>Additional planned laws</span></button>
      </div>
      <p className="pipeline-description">{group.description}</p>
      <div className="pipeline-list" role="tabpanel">
        {group.items.map((item) => <div className="pipeline-item" key={item.id}><span className="pipeline-symbol">{tab === "active" ? "✓" : tab === "tax" ? "₹" : "＋"}</span><div><strong>{item.title}</strong><small>{item.category.replaceAll("_", " ")} · {item.detail}</small></div><span className={`pipeline-status ${item.status}`}>{item.status.replaceAll("_", " ")}</span></div>)}
        {group.items.length === 0 && <div className="pipeline-empty">No sources are registered in this group yet.</div>}
      </div>
    </section>
  );
}

function KnowledgeDialog({ open, onClose, onSaved, allowPending }) {
  const [status, setStatus] = useState("pending");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    setStatus("pending");
    setError("");
    const closeOnEscape = (event) => { if (event.key === "Escape" && !submitting) onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    document.body.classList.add("admin-modal-open");
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.classList.remove("admin-modal-open");
    };
  }, [open]);

  if (!open) return null;

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const payload = new FormData(event.currentTarget);
      payload.set("status", status);
      if (status === "approved") payload.set("approvalConfirmed", String(payload.get("approvalConfirmed") === "true"));
      const response = await fetch("/api/admin/knowledge/documents", { method: "POST", body: payload });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to add the document.");
      onSaved(result);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="knowledge-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose(); }}>
      <section className="knowledge-modal" role="dialog" aria-modal="true" aria-labelledby="add-knowledge-title">
        <button className="knowledge-modal-close" type="button" aria-label="Close" onClick={onClose} disabled={submitting}>×</button>
        <span className="eyebrow">Knowledge ingestion</span>
        <h2 id="add-knowledge-title">Add legal information</h2>
        <p>Upload a document or paste reviewed text. CoVakeel will store it as searchable RAG chunks in the active knowledge index.</p>
        <form className="knowledge-form" onSubmit={submit}>
          <label className="full-field">Document title<input name="title" required maxLength="300" placeholder="e.g. Consumer Protection Act, 2019" /></label>
          <label>Document type<select name="documentType" defaultValue="act"><option value="constitution">Constitution</option><option value="act">Act</option><option value="rule">Rule</option><option value="regulation">Regulation</option><option value="notification">Notification</option><option value="judgment">Judgment</option><option value="order">Order</option><option value="amendment">Amendment</option><option value="ordinance">Ordinance</option><option value="other">Other</option></select></label>
          <label>Language<select name="language" defaultValue="en"><option value="en">English</option><option value="hi">Hindi</option><option value="pa">Punjabi</option><option value="mixed">Mixed</option></select></label>
          <label>Section / article<input name="section" maxLength="150" placeholder="Optional" /></label>
          <label>Jurisdiction<input name="jurisdiction" defaultValue="India" maxLength="80" /></label>
          <label className="full-field">Official source URL<input name="sourceUrl" type="url" maxLength="1000" placeholder="https://... (optional for an internal document)" /></label>
          <label className="full-field">Source publisher<input name="sourcePublisher" maxLength="220" placeholder="e.g. Legislative Department, Government of India" /></label>
          <label className="full-field upload-field">Document file<span>PDF, DOC, DOCX, TXT, MD, CSV or JSON · maximum 20 MB</span><input name="file" type="file" accept=".pdf,.doc,.docx,.txt,.md,.csv,.json" /></label>
          <div className="or-divider"><span>or paste text</span></div>
          <label className="full-field">Legal text<textarea name="text" rows="7" maxLength="750000" placeholder="Paste the document text when no file is selected…" /></label>
          <label>Knowledge status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="pending">Pending legal review</option><option value="approved">Approved</option></select></label>
          <label>Notes<input name="notes" maxLength="1000" placeholder="Review notes (optional)" /></label>
          {status === "pending" && <div className="knowledge-notice full-field">{allowPending ? "Pending records are enabled in the current local testing mode." : "Pending records will be stored but will not answer user questions until approved."}</div>}
          {status === "approved" && <label className="approval-confirm full-field"><input type="checkbox" name="approvalConfirmed" value="true" required /><span>I confirm that the legal text and its official source have been reviewed and may be used in CoVakeel answers.</span></label>}
          {error && <div className="knowledge-error full-field" role="alert">{error}</div>}
          <div className="knowledge-form-actions full-field"><button type="button" onClick={onClose} disabled={submitting}>Cancel</button><button className="primary-admin-button" type="submit" disabled={submitting}>{submitting ? "Processing document…" : "Add to knowledge base"}</button></div>
        </form>
      </section>
    </div>
  );
}

function DocumentDialog({ documentId, onClose }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!documentId) return undefined;
    let cancelled = false;
    fetch(`/api/admin/knowledge/documents/${encodeURIComponent(documentId)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load the document.");
        if (!cancelled) setResult(data);
      })
      .catch((loadError) => { if (!cancelled) setError(loadError.message); });
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    document.body.classList.add("admin-modal-open");
    return () => { cancelled = true; document.removeEventListener("keydown", closeOnEscape); document.body.classList.remove("admin-modal-open"); };
  }, [documentId]);

  if (!documentId) return null;
  return (
    <div className="knowledge-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="knowledge-modal document-viewer" role="dialog" aria-modal="true" aria-label="Knowledge document details">
        <button className="knowledge-modal-close" type="button" aria-label="Close" onClick={onClose}>×</button>
        {!result && !error && <div className="dialog-loading">Loading document…</div>}
        {error && <div className="knowledge-error" role="alert">{error}</div>}
        {result && <><span className="eyebrow">{result.document.documentType} · {result.document.status}</span><h2>{result.document.title}</h2><p>{result.document.sourcePublisher} · {formatNumber(result.document.chunkCount)} chunks</p><div className="chunk-list">{result.chunks.map((chunk, index) => <article key={chunk.id}><header><strong>{chunk.section || `Chunk ${index + 1}`}</strong><span>{chunk.status}</span></header><p>{chunk.text}</p></article>)}</div></>}
      </section>
    </div>
  );
}

export default function KnowledgeBase() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(initialResult);
  const [catalog, setCatalog] = useState(initialCatalog);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const closeAddDialog = useCallback(() => setAddOpen(false), []);
  const closeDocumentDialog = useCallback(() => setSelectedDocument(null), []);

  const load = async (targetPage = page) => {
    setLoading(true);
    setError("");
    try {
      const parameters = new URLSearchParams({ search: query.trim(), status, page: String(targetPage), pageSize: "12" });
      const response = await fetch(`/api/admin/knowledge?${parameters}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load the knowledge base.");
      setResult(data);
      setPage(data.pagination.page);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  const loadCatalog = async () => {
    try {
      const response = await fetch("/api/admin/knowledge/catalog");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load the knowledge source pipeline.");
      setCatalog(data);
    } catch (catalogError) {
      setError(catalogError.message);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { load(1); }, 250);
    return () => window.clearTimeout(timer);
  }, [query, status]);

  useEffect(() => { loadCatalog(); }, []);

  const removeDocument = async (document) => {
    if (!window.confirm(`Delete “${document.title}” and all ${document.chunkCount} knowledge chunks? This changes CoVakeel's active knowledge index.`)) return;
    setError("");
    try {
      const response = await fetch(`/api/admin/knowledge/documents/${encodeURIComponent(document.id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to delete the document.");
      setMessage(`${document.title} was deleted. CoVakeel will use the updated index on the next question.`);
      await Promise.all([load(page), loadCatalog()]);
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  return (
    <section className="knowledge-page">
      <div className="knowledge-heading"><div><span className="eyebrow">RAG content management</span><h1>Knowledge base</h1><p>Review everything available to CoVakeel, then add or remove complete legal documents.</p></div><button className="primary-admin-button" type="button" onClick={() => setAddOpen(true)}>＋ Add information</button></div>
      <div className="active-index"><span>Active AI index</span><strong>{result.activeIndex}</strong><small>{result.allowPending ? "Local testing accepts pending records" : "Only approved records answer questions"}</small></div>
      {message && <div className="admin-success" role="status">{message}<button type="button" aria-label="Dismiss" onClick={() => setMessage("")}>×</button></div>}
      {error && <div className="admin-alert" role="alert">{error}</div>}
      <div className="knowledge-summary">
        <div><span>Documents</span><strong>{formatNumber(result.summary.totalDocuments)}</strong></div>
        <div><span>Total chunks</span><strong>{formatNumber(result.summary.totalRecords)}</strong></div>
        <div><span>Approved</span><strong>{formatNumber(result.summary.approved)}</strong></div>
        <div><span>Pending review</span><strong>{formatNumber(result.summary.pending)}</strong></div>
      </div>
      <KnowledgePipeline catalog={catalog} />
      <div className="knowledge-toolbar">
        <label><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, publisher, type or content…" /></label>
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status"><option value="all">All statuses</option><option value="approved">Approved</option><option value="pending">Pending</option><option value="rejected">Rejected</option></select>
        <button type="button" onClick={() => load(page)} disabled={loading}>{loading ? "Loading…" : "↻ Refresh"}</button>
      </div>
      <div className="knowledge-table-wrap">
        <table className="knowledge-table">
          <thead><tr><th>Document</th><th>Type</th><th>Status</th><th>Chunks</th><th>Source</th><th aria-label="Actions" /></tr></thead>
          <tbody>
            {!loading && result.documents.length === 0 && <tr><td className="table-empty" colSpan="6">No knowledge documents match this search.</td></tr>}
            {result.documents.map((document) => (
              <tr key={document.id}>
                <td><button className="document-title" type="button" onClick={() => setSelectedDocument(document.id)}><strong>{document.title}</strong><small>{document.id}</small></button></td>
                <td><span className="type-chip">{document.documentType}</span></td>
                <td><span className={`record-status ${document.status}`}>{document.status}</span></td>
                <td>{formatNumber(document.chunkCount)}</td>
                <td><strong className="source-name">{document.sourcePublisher}</strong><small className="source-date">{formatDate(document.retrievedAt)}</small></td>
                <td><div className="row-actions"><button type="button" onClick={() => setSelectedDocument(document.id)}>View</button><button className="delete-action" type="button" onClick={() => removeDocument(document)}>Delete</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="knowledge-pagination"><span>{formatNumber(result.pagination.total)} documents</span><div><button type="button" disabled={page <= 1 || loading} onClick={() => { const next = page - 1; setPage(next); load(next); }}>← Previous</button><span>Page {page} of {result.pagination.pages}</span><button type="button" disabled={page >= result.pagination.pages || loading} onClick={() => { const next = page + 1; setPage(next); load(next); }}>Next →</button></div></div>
      <KnowledgeDialog open={addOpen} allowPending={result.allowPending} onClose={closeAddDialog} onSaved={(saved) => { setAddOpen(false); setMessage(`${saved.document.title} was added as ${saved.document.status}. CoVakeel will load ${saved.chunksAdded} new chunks on the next question.`); load(1); loadCatalog(); }} />
      <DocumentDialog documentId={selectedDocument} onClose={closeDocumentDialog} />
    </section>
  );
}
