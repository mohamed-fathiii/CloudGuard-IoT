"use client";

import { useState } from "react";
import { AuditTable } from "@/components/Tables";
import { ErrorBanner, Panel, PanelHead, StateBlock } from "@/components/ui";
import { useResource } from "@/hooks/useResource";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { listAudit } from "@/lib/api/services";
import { downloadCsv } from "@/lib/csv";
import { formatDate } from "@/lib/format";

export default function AuditLogsPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState("ALL");
  const [action, setAction] = useState("ALL");

  const { data, loading, error, reload } = useResource(
    () => (can("viewAudit") ? listAudit({ search, outcome, action }) : Promise.resolve([])),
    [can("viewAudit"), search, outcome, action],
  );

  if (!can("viewAudit")) {
    return (
      <div className="page">
        <div className="page-head"><div><div className="eyebrow">SECURITY AUDIT</div><h2>Audit Log</h2><p>Append-only record of security-sensitive operations.</p></div></div>
        <Panel><StateBlock kind="denied" description="The Administrator role is required to read the audit log. Switch roles from the user menu to inspect this view." /></Panel>
      </div>
    );
  }

  function clear() { setSearch(""); setOutcome("ALL"); setAction("ALL"); }

  function exportRows() {
    if (!data?.length) { notify("No rows to export.", "error"); return; }
    downloadCsv("cloudguard-audit-demo.csv",
      ["ID", "Created at", "Actor", "Action", "Entity type", "Entity ID", "Outcome", "Details"],
      data.map((a) => [a.id, formatDate(a.createdAt), a.actorId, a.action, a.entityType, a.entityId, a.outcome, a.details]));
    notify("Demo audit log exported as CSV.");
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">SECURITY AUDIT</div>
          <h2>Audit Log</h2>
          <p>Append-only record of security-sensitive operations and permission denials.</p>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={exportRows}>Export CSV</button>
          <button className="btn btn-quiet" onClick={clear}>Clear filters</button>
        </div>
      </div>

      <div className="notice info" style={{ marginBottom: 16 }}>
        Audit entries are immutable in the proposed design. This demo adds entries in memory only; the backend will persist them with UPDATE/DELETE revoked for the application role.
      </div>

      <Panel>
        <div className="filter-row">
          <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search actor, action, entity…" aria-label="Search audit log" />
          <select className="select" value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label="Filter by outcome">
            <option value="ALL">Any outcome</option>
            <option value="SUCCESS">Success</option>
            <option value="DENIED">Denied</option>
            <option value="FAILURE">Failure</option>
          </select>
          <select className="select" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter by action">
            <option value="ALL">Any action</option>
            {["LOGIN", "APPROVE_RESPONSE", "REQUEST_RESPONSE", "CREATE_INCIDENT", "UPDATE_INCIDENT", "CREATE_DEVICE", "UPDATE_SETTINGS", "INVITE_USER", "RESCAN_CLOUD_RESOURCES"].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <div className="filter-spacer" />
          <span className="toolbar-note">{data?.length ?? 0} entries</span>
        </div>
        <PanelHead title="Audit entries" subtitle="Newest first" />
        <ErrorBanner error={error} onRetry={reload} />
        {loading && !data ? <StateBlock kind="loading" /> : data && data.length > 0 ? <AuditTable entries={data} /> : <StateBlock kind="empty" title="No audit entries match these filters" action={<button className="btn" onClick={clear}>Clear filters</button>} />}
      </Panel>
    </div>
  );
}
