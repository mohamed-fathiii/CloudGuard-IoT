"use client";

import { useState } from "react";
import { ResponseTable } from "@/components/Tables";
import { ErrorBanner, KeyValue, Modal, Panel, PanelHead, StateBlock } from "@/components/ui";
import { useResource } from "@/hooks/useResource";
import { useToast } from "@/context/ToastContext";
import { listResponses } from "@/lib/api/services";
import { downloadCsv } from "@/lib/csv";
import { formatDate, humanize } from "@/lib/format";
import type { ResponseRecord } from "@/lib/types";

export default function ResponseActionsPage() {
  const { notify } = useToast();
  const [search, setSearch] = useState("");
  const [execution, setExecution] = useState("ALL");
  const [actionType, setActionType] = useState("ALL");
  const [selected, setSelected] = useState<ResponseRecord | null>(null);

  const { data, loading, error, reload } = useResource(
    () => listResponses({ search, execution, actionType }),
    [search, execution, actionType],
  );

  function clear() { setSearch(""); setExecution("ALL"); setActionType("ALL"); }

  function exportRows() {
    if (!data?.length) { notify("No rows to export.", "error"); return; }
    downloadCsv("cloudguard-response-demo.csv",
      ["ID", "Incident", "Target", "Action", "Execution", "Status", "Authorized by", "Recovery", "Time"],
      data.map((r) => [r.id, r.incidentId, r.targetId, r.actionType, r.execution, r.status, r.authorizedBy, r.recovery, formatDate(r.timestamp)]));
    notify("Demo response history exported as CSV.");
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">RESPONSE HISTORY</div>
          <h2>Response History</h2>
          <p>Requested actions, authorisation and recovery state. All records are simulated.</p>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={exportRows}>Export CSV</button>
          <button className="btn btn-quiet" onClick={clear}>Clear filters</button>
        </div>
      </div>

      <div className="notice info" style={{ marginBottom: 16 }}>
        Every sensitive action requires authorisation and confirmation. Automatic isolation is never unrestricted; allowlisted simulated targets only.
      </div>

      <Panel>
        <div className="filter-row">
          <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ID, incident, target…" aria-label="Search response actions" />
          <select className="select" value={execution} onChange={(e) => setExecution(e.target.value)} aria-label="Filter by execution">
            <option value="ALL">All executions</option>
            <option value="EXECUTED">Executed</option>
            <option value="DRY_RUN">Dry run</option>
          </select>
          <select className="select" value={actionType} onChange={(e) => setActionType(e.target.value)} aria-label="Filter by action type">
            <option value="ALL">All action types</option>
            <option value="ISOLATE_DEVICE">Isolate device</option>
            <option value="REINSTATE_DEVICE">Reinstate device</option>
            <option value="DRY_RUN">Dry run</option>
          </select>
          <div className="filter-spacer" />
          <span className="toolbar-note">{data?.length ?? 0} actions</span>
        </div>
        <PanelHead title="Execution register" subtitle="Select Details for authorisation and audit information" />
        <ErrorBanner error={error} onRetry={reload} />
        {loading && !data ? <StateBlock kind="loading" /> : data && data.length > 0 ? <ResponseTable responses={data} onSelect={setSelected} /> : <StateBlock kind="empty" title="No response actions match these filters" action={<button className="btn" onClick={clear}>Clear filters</button>} />}
      </Panel>

      {selected && (
        <Modal title={`${selected.id} · ${humanize(selected.actionType)}`} subtitle="Simulated response record" onClose={() => setSelected(null)} footer={<button className="btn" onClick={() => setSelected(null)}>Close</button>}>
          <KeyValue rows={[
            { label: "Action ID", value: <span className="mono">{selected.id}</span> },
            { label: "Incident", value: selected.incidentId },
            { label: "Target", value: <span className="mono">{selected.targetId}</span> },
            { label: "Action type", value: <span className="mono">{selected.actionType}</span> },
            { label: "Execution", value: humanize(selected.execution) },
            { label: "Status", value: <span className="mono">{selected.status}</span> },
            { label: "Requested by", value: selected.requestedBy },
            { label: "Authorized by", value: selected.authorizedBy },
            { label: "Result", value: selected.result },
            { label: "Recovery", value: humanize(selected.recovery) },
            { label: "Time", value: <span className="num">{formatDate(selected.timestamp)}</span> },
            { label: "Allowlist checked", value: selected.allowlistChecked ? "Yes" : "No" },
            { label: "Audited", value: selected.audited ? "Yes" : "No" },
          ]} />
          <div className="notice info">No real cloud or device integration was executed for this record.</div>
        </Modal>
      )}
    </div>
  );
}
