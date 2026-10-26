import { useCallback, useEffect, useMemo, useState } from "react";

const emptyResult = { users: [], total: 0, page: 1, pageSize: 25, pages: 1, source: "", summary: { verified: 0, conversations: 0, messages: 0 } };

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function Users() {
  const [result, setResult] = useState(emptyResult);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ search, page: String(page), pageSize: "25" });
      const response = await fetch(`/api/admin/users?${params}`, { credentials: "include" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load users.");
      setResult(body);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const pageStats = useMemo(() => result.users.reduce((stats, user) => ({
    verified: stats.verified + (user.email_verified_at ? 1 : 0),
    conversations: stats.conversations + Number(user.conversation_count || 0),
    messages: stats.messages + Number(user.message_count || 0),
  }), { verified: 0, conversations: 0, messages: 0 }), [result.users]);

  const submitSearch = (event) => {
    event.preventDefault();
    setPage(1);
    setSearch(query.trim());
  };

  return (
    <div className="users-page">
      <section className="users-heading">
        <div><span className="eyebrow">User management</span><h1>Registered users</h1><p>Every verified CoVakeel signup appears here from the user application.</p></div>
        <button className="refresh-button" type="button" onClick={loadUsers} disabled={loading}>{loading ? "Refreshing…" : "↻ Refresh users"}</button>
      </section>

      <section className="user-summary" aria-label="User summary">
        <article><span>Total signups</span><strong>{result.total.toLocaleString("en-IN")}</strong><small>{result.source === "postgresql" ? "Persistent database" : "Local development store"}</small></article>
        <article><span>Verified users</span><strong>{Number(result.summary?.verified ?? pageStats.verified).toLocaleString("en-IN")}</strong><small>Email OTP verified</small></article>
        <article><span>Conversations</span><strong>{Number(result.summary?.conversations ?? pageStats.conversations).toLocaleString("en-IN")}</strong><small>User research threads</small></article>
        <article><span>Messages</span><strong>{Number(result.summary?.messages ?? pageStats.messages).toLocaleString("en-IN")}</strong><small>Conversation activity</small></article>
      </section>

      <section className="users-panel">
        <form className="users-toolbar" onSubmit={submitSearch}>
          <label><span>Search registered email</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by email address…" /></label>
          <button className="settings-primary" type="submit">Search users</button>
          {search && <button className="users-clear" type="button" onClick={() => { setQuery(""); setSearch(""); setPage(1); }}>Clear</button>}
        </form>

        {error && <div className="admin-alert" role="alert">{error}</div>}
        <div className="users-table-wrap">
          <table className="users-table">
            <thead><tr><th>User</th><th>Status</th><th>Signup date</th><th>Last active</th><th>Conversations</th><th>Messages</th></tr></thead>
            <tbody>
              {loading && result.users.length === 0 && <tr><td className="table-empty" colSpan="6">Loading registered users…</td></tr>}
              {!loading && result.users.length === 0 && <tr><td className="table-empty" colSpan="6">{search ? "No signup matches this email." : "No users have completed signup yet."}</td></tr>}
              {result.users.map((user) => (
                <tr key={user.id}>
                  <td><div className="user-identity"><span>{user.email.slice(0, 1).toUpperCase()}</span><div><strong>{user.email}</strong><small>User #{user.id}</small></div></div></td>
                  <td><span className={`user-status ${user.email_verified_at ? "verified" : "pending"}`}>{user.email_verified_at ? "Verified" : "Pending"}</span></td>
                  <td>{formatDate(user.created_at)}</td>
                  <td>{formatDate(user.last_active_at)}</td>
                  <td><b className="user-count">{Number(user.conversation_count || 0).toLocaleString("en-IN")}</b></td>
                  <td><b className="user-count">{Number(user.message_count || 0).toLocaleString("en-IN")}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="users-pagination">
          <span>Page {result.page} of {result.pages} · {result.total.toLocaleString("en-IN")} users</span>
          <div><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</button><button type="button" disabled={page >= result.pages || loading} onClick={() => setPage((value) => value + 1)}>Next</button></div>
        </footer>
      </section>
    </div>
  );
}
