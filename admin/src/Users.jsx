import { useCallback, useEffect, useMemo, useState } from "react";

const emptyResult = { users: [], total: 0, page: 1, pageSize: 25, pages: 1, source: "", summary: { verified: 0, conversations: 0, messages: 0 } };
const emptyThreads = { conversations: [], total: 0, page: 1, pages: 1 };

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: "include", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Unable to complete this request.");
  return body;
}

function ActivityDrawer({ activity, loading, onClose }) {
  if (!activity && !loading) return null;
  return (
    <div className="activity-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="activity-drawer" role="dialog" aria-modal="true" aria-label="User activity">
        <header><div><span className="eyebrow">User activity</span><h2>{activity?.user.email || "Loading activity…"}</h2></div><button type="button" onClick={onClose} aria-label="Close activity">×</button></header>
        {loading ? <p className="activity-loading">Loading conversations and sessions…</p> : <>
          <section className="activity-stats">
            <article><span>Threads</span><strong>{Number(activity.user.conversation_count || 0)}</strong></article>
            <article><span>Messages</span><strong>{Number(activity.user.message_count || 0)}</strong></article>
            <article><span>Sessions</span><strong>{activity.sessions.length}</strong></article>
          </section>
          <dl className="activity-profile"><div><dt>Account</dt><dd>{activity.user.is_blocked ? "Blocked" : "Active"}</dd></div><div><dt>Signed up</dt><dd>{formatDate(activity.user.created_at)}</dd></div><div><dt>Last active</dt><dd>{formatDate(activity.user.last_active_at)}</dd></div></dl>
          <section className="activity-section"><h3>Chat threads</h3>{activity.conversations.length === 0 ? <p>No chat threads yet.</p> : activity.conversations.map((thread) => <article className="activity-thread" key={thread.id}><div><strong>{thread.title}</strong><small>{thread.id}</small></div><span>{thread.message_count} messages</span><time>{formatDate(thread.last_activity_at)}</time></article>)}</section>
          <section className="activity-section"><h3>Recent messages</h3>{activity.recentMessages.length === 0 ? <p>No messages yet.</p> : activity.recentMessages.slice(0, 12).map((message) => <article className="activity-message" key={message.id}><div><strong>{message.role === "user" ? "User" : "CoVakeel"}</strong><span>{message.conversation_title}</span><time>{formatDate(message.created_at)}</time></div><p>{message.content}</p></article>)}</section>
        </>}
      </aside>
    </div>
  );
}

export default function Users() {
  const [result, setResult] = useState(emptyResult);
  const [threads, setThreads] = useState(emptyThreads);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activity, setActivity] = useState(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [changingUserId, setChangingUserId] = useState(null);

  const loadUsers = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ search, page: String(page), pageSize: "25" });
      const [usersResult, threadsResult] = await Promise.all([
        api(`/api/admin/users?${params}`),
        api(`/api/admin/conversations?${new URLSearchParams({ search, page: "1", pageSize: "25" })}`),
      ]);
      setResult(usersResult); setThreads(threadsResult);
    } catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const pageStats = useMemo(() => result.users.reduce((stats, user) => ({
    verified: stats.verified + (user.email_verified_at ? 1 : 0),
    conversations: stats.conversations + Number(user.conversation_count || 0),
    messages: stats.messages + Number(user.message_count || 0),
  }), { verified: 0, conversations: 0, messages: 0 }), [result.users]);

  const submitSearch = (event) => { event.preventDefault(); setPage(1); setSearch(query.trim()); };

  const showActivity = async (user) => {
    setActivity({ user, conversations: [], recentMessages: [], sessions: [] }); setActivityLoading(true);
    try { setActivity(await api(`/api/admin/users/${user.id}/activity`)); }
    catch (loadError) { setError(loadError.message); setActivity(null); }
    finally { setActivityLoading(false); }
  };

  const toggleBlock = async (user) => {
    const blocked = !user.is_blocked;
    if (!window.confirm(blocked ? `Block ${user.email}? Their active sessions will be signed out immediately.` : `Unblock ${user.email}? They will be allowed to sign in again.`)) return;
    setChangingUserId(user.id); setError("");
    try {
      await api(`/api/admin/users/${user.id}/block`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blocked, reason: blocked ? "Blocked by administrator" : "" }) });
      await loadUsers();
    } catch (changeError) { setError(changeError.message); }
    finally { setChangingUserId(null); }
  };

  return (
    <div className="users-page">
      <section className="users-heading"><div><span className="eyebrow">User management</span><h1>Registered users</h1><p>Review every signup, block access, and see exactly which user created each research thread.</p></div><button className="refresh-button" type="button" onClick={loadUsers} disabled={loading}>{loading ? "Refreshing…" : "↻ Refresh users"}</button></section>
      <section className="user-summary" aria-label="User summary">
        <article><span>Total signups</span><strong>{result.total.toLocaleString("en-IN")}</strong><small>{result.source === "postgresql" ? "Persistent database" : "Local development store"}</small></article>
        <article><span>Verified users</span><strong>{Number(result.summary?.verified ?? pageStats.verified).toLocaleString("en-IN")}</strong><small>Email OTP verified</small></article>
        <article><span>Conversations</span><strong>{Number(result.summary?.conversations ?? pageStats.conversations).toLocaleString("en-IN")}</strong><small>User research threads</small></article>
        <article><span>Messages</span><strong>{Number(result.summary?.messages ?? pageStats.messages).toLocaleString("en-IN")}</strong><small>Conversation activity</small></article>
      </section>
      <section className="users-panel">
        <form className="users-toolbar" onSubmit={submitSearch}><label><span>Search email or chat thread</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by email address or thread title…" /></label><button className="settings-primary" type="submit">Search</button>{search && <button className="users-clear" type="button" onClick={() => { setQuery(""); setSearch(""); setPage(1); }}>Clear</button>}</form>
        {error && <div className="admin-alert" role="alert">{error}</div>}
        <div className="users-table-wrap"><table className="users-table"><thead><tr><th>User</th><th>Status</th><th>Signup</th><th>Last active</th><th>Threads</th><th>Messages</th><th>Actions</th></tr></thead><tbody>
          {loading && result.users.length === 0 && <tr><td className="table-empty" colSpan="7">Loading registered users…</td></tr>}
          {!loading && result.users.length === 0 && <tr><td className="table-empty" colSpan="7">{search ? "No user matches this search." : "No users have completed signup yet."}</td></tr>}
          {result.users.map((user) => <tr key={user.id}><td><div className="user-identity"><span>{user.email.slice(0, 1).toUpperCase()}</span><div><strong>{user.email}</strong><small>User #{user.id}</small></div></div></td><td><span className={`user-status ${user.is_blocked ? "blocked" : user.email_verified_at ? "verified" : "pending"}`}>{user.is_blocked ? "Blocked" : user.email_verified_at ? "Verified" : "Pending"}</span></td><td>{formatDate(user.created_at)}</td><td>{formatDate(user.last_active_at)}</td><td><b className="user-count">{Number(user.conversation_count || 0).toLocaleString("en-IN")}</b></td><td><b className="user-count">{Number(user.message_count || 0).toLocaleString("en-IN")}</b></td><td><div className="user-actions"><button type="button" onClick={() => showActivity(user)}>Activity</button><button className={user.is_blocked ? "unblock" : "block"} type="button" disabled={changingUserId === user.id} onClick={() => toggleBlock(user)}>{changingUserId === user.id ? "Saving…" : user.is_blocked ? "Unblock" : "Block"}</button></div></td></tr>)}
        </tbody></table></div>
        <footer className="users-pagination"><span>Page {result.page} of {result.pages} · {result.total.toLocaleString("en-IN")} users</span><div><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</button><button type="button" disabled={page >= result.pages || loading} onClick={() => setPage((value) => value + 1)}>Next</button></div></footer>
      </section>
      <section className="users-panel thread-panel"><div className="thread-panel-heading"><div><span className="eyebrow">Conversation ownership</span><h2>Recent chat threads</h2><p>See the thread title, its creator and the latest activity.</p></div><strong>{threads.total} total</strong></div><div className="users-table-wrap"><table className="users-table thread-table"><thead><tr><th>Chat thread</th><th>Created by</th><th>Messages</th><th>Created</th><th>Last activity</th></tr></thead><tbody>{threads.conversations.length === 0 && <tr><td className="table-empty" colSpan="5">No chat threads match this search.</td></tr>}{threads.conversations.map((thread) => <tr key={thread.id}><td><strong>{thread.title}</strong><small className="thread-id">{thread.id}</small></td><td><button className="thread-owner" type="button" onClick={() => showActivity({ id: thread.user_id, email: thread.user_email })}>{thread.user_email}</button></td><td>{thread.message_count}</td><td>{formatDate(thread.created_at)}</td><td>{formatDate(thread.last_activity_at)}</td></tr>)}</tbody></table></div></section>
      <ActivityDrawer activity={activity} loading={activityLoading} onClose={() => setActivity(null)} />
    </div>
  );
}
