import { useEffect, useState } from "react";

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function Conversations({ onOpenUser }) {
  const [result, setResult] = useState({ conversations: [], total: 0, page: 1, pages: 1 });
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true); setError("");
    const params = new URLSearchParams({ search, page: String(page), pageSize: "25" });
    fetch(`/api/admin/conversations?${params}`, { credentials: "include" })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "Unable to load conversations."); return body; })
      .then(setResult).catch((loadError) => setError(loadError.message)).finally(() => setLoading(false));
  }, [page, search]);

  return <div className="users-page">
    <section className="users-heading"><div><span className="eyebrow">Conversation ownership</span><h1>Chat threads</h1><p>Every saved research thread is linked to the verified user who created it.</p></div><strong className="conversation-total">{result.total.toLocaleString("en-IN")} threads</strong></section>
    <section className="users-panel">
      <form className="users-toolbar" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(query.trim()); }}><label><span>Search thread or creator</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or user email…" /></label><button className="settings-primary" type="submit">Search</button>{search && <button className="users-clear" type="button" onClick={() => { setQuery(""); setSearch(""); setPage(1); }}>Clear</button>}</form>
      {error && <div className="admin-alert" role="alert">{error}</div>}
      <div className="users-table-wrap"><table className="users-table thread-table"><thead><tr><th>Chat thread</th><th>Created by</th><th>Messages</th><th>Created</th><th>Last activity</th></tr></thead><tbody>{loading && result.conversations.length === 0 && <tr><td className="table-empty" colSpan="5">Loading chat threads…</td></tr>}{!loading && result.conversations.length === 0 && <tr><td className="table-empty" colSpan="5">No chat threads match this search.</td></tr>}{result.conversations.map((thread) => <tr key={thread.id}><td><strong>{thread.title}</strong><small className="thread-id">{thread.id}</small></td><td><button className="thread-owner" type="button" onClick={() => onOpenUser(thread.user_email)}>{thread.user_email}</button></td><td>{thread.message_count}</td><td>{formatDate(thread.created_at)}</td><td>{formatDate(thread.last_activity_at)}</td></tr>)}</tbody></table></div>
      <footer className="users-pagination"><span>Page {result.page} of {result.pages} · {result.total.toLocaleString("en-IN")} threads</span><div><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</button><button type="button" disabled={page >= result.pages || loading} onClick={() => setPage((value) => value + 1)}>Next</button></div></footer>
    </section>
  </div>;
}
