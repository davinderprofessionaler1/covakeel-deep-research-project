import { useEffect, useState } from "react";
import KnowledgeBase from "./KnowledgeBase.jsx";

const navigation = [
  { id: "overview", icon: "⌂", label: "Overview" },
  { id: "knowledge", icon: "▤", label: "Knowledge base" },
  { id: "users", icon: "♙", label: "Users" },
  { id: "conversations", icon: "◫", label: "Conversations" },
  { id: "system", icon: "◉", label: "System health" },
];

const emptyDashboard = {
  environment: "Local development",
  generatedAt: null,
  metrics: {
    registeredUsers: { value: "—", note: "Connect PostgreSQL" },
    conversations: { value: "—", note: "Connect PostgreSQL" },
    approvedRecords: { value: "—", note: "Loading legal corpus" },
    pendingRecords: { value: "—", note: "Loading legal corpus" },
  },
  services: [],
};

function StatusBadge({ status }) {
  const normalized = status === "online" ? "online" : status === "offline" ? "offline" : "pending";
  return <span className={`status-badge ${normalized}`}><i />{normalized === "online" ? "Online" : normalized === "offline" ? "Offline" : "Checking"}</span>;
}

function Sidebar({ activePage, onNavigate, open, onClose }) {
  return (
    <>
      {open && <button className="sidebar-overlay" type="button" aria-label="Close navigation" onClick={onClose} />}
      <aside className={`admin-sidebar ${open ? "open" : ""}`}>
        <div className="admin-brand"><span>⚖</span><div>CoVakeel<small>Administration</small></div><button type="button" aria-label="Close navigation" onClick={onClose}>×</button></div>
        <nav aria-label="Admin navigation">
          {navigation.map((item) => (
            <button className={activePage === item.id ? "active" : ""} type="button" key={item.id} onClick={() => { onNavigate(item.id); onClose(); }}>
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-foot">
          <div className="admin-avatar">A</div>
          <div><strong>Local administrator</strong><small>Development access</small></div>
        </div>
      </aside>
    </>
  );
}

function MetricCard({ label, metric, icon }) {
  return (
    <article className="metric-card">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{metric.value}</strong>
      <small>{metric.note}</small>
    </article>
  );
}

function Overview({ dashboard, loading, error, onRefresh }) {
  const metrics = dashboard.metrics;
  return (
    <>
      <section className="overview-heading">
        <div><span className="eyebrow">Control centre</span><h1>Good to see you.</h1><p>Monitor CoVakeel’s users, legal knowledge and application services from one workspace.</p></div>
        <button className="refresh-button" type="button" onClick={onRefresh} disabled={loading}>{loading ? "Refreshing…" : "↻ Refresh data"}</button>
      </section>
      {error && <div className="admin-alert" role="alert">{error}</div>}
      <section className="metric-grid" aria-label="Admin metrics">
        <MetricCard label="Registered users" metric={metrics.registeredUsers} icon="♙" />
        <MetricCard label="Conversations" metric={metrics.conversations} icon="◫" />
        <MetricCard label="Approved records" metric={metrics.approvedRecords} icon="✓" />
        <MetricCard label="Pending review" metric={metrics.pendingRecords} icon="⌛" />
      </section>
      <section className="dashboard-grid">
        <article className="admin-panel service-panel">
          <div className="panel-heading"><div><span className="eyebrow">Infrastructure</span><h2>Service status</h2></div><span className="environment-chip">{dashboard.environment}</span></div>
          <div className="service-list">
            {dashboard.services.length === 0 && <p className="empty-state">Service checks will appear after the admin API responds.</p>}
            {dashboard.services.map((service) => (
              <div className="service-row" key={service.id}>
                <div className="service-symbol">{service.icon}</div>
                <div><strong>{service.name}</strong><small>{service.detail}</small></div>
                <StatusBadge status={service.status} />
              </div>
            ))}
          </div>
        </article>
        <article className="admin-panel next-panel">
          <div className="panel-heading"><div><span className="eyebrow">Implementation</span><h2>Next admin modules</h2></div></div>
          <ol className="next-list">
            <li><span>01</span><div><strong>Secure admin authentication</strong><small>Roles, sessions and audit events</small></div></li>
            <li><span>02</span><div><strong>Knowledge review workflow</strong><small>Approve or reject pending legal records</small></div></li>
            <li><span>03</span><div><strong>User management</strong><small>Search, suspend and inspect user activity</small></div></li>
          </ol>
        </article>
      </section>
    </>
  );
}

function ModulePlaceholder({ page }) {
  const item = navigation.find((entry) => entry.id === page);
  return (
    <section className="module-placeholder">
      <div>{item?.icon || "⚖"}</div>
      <span className="eyebrow">Admin module</span>
      <h1>{item?.label}</h1>
      <p>The dedicated {item?.label.toLowerCase()} workflow will be connected here without mixing its APIs with the CoVakeel user application.</p>
      <span className="module-chip">Structure ready</span>
    </section>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/dashboard");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load admin data.");
      setDashboard(result);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDashboard(); }, []);

  return (
    <div className="admin-shell">
      <Sidebar activePage={activePage} onNavigate={setActivePage} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="admin-main">
        <header className="admin-header">
          <button className="mobile-menu" type="button" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}>☰</button>
          <div><strong>{navigation.find((item) => item.id === activePage)?.label}</strong><small>CoVakeel Admin</small></div>
          <div className="header-status"><StatusBadge status={error ? "offline" : loading ? "pending" : "online"} /><span className="admin-avatar small">A</span></div>
        </header>
        <div className="admin-content">
          {activePage === "overview" && <Overview dashboard={dashboard} loading={loading} error={error} onRefresh={loadDashboard} />}
          {activePage === "knowledge" && <KnowledgeBase />}
          {!['overview', 'knowledge'].includes(activePage) && <ModulePlaceholder page={activePage} />}
        </div>
      </main>
    </div>
  );
}
