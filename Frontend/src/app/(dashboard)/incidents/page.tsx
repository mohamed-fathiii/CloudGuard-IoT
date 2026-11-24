"use client";

import { useState } from "react";
import { IncidentTable } from "@/components/Tables";
import { ErrorBanner, Panel, PanelHead, StateBlock } from "@/components/ui";
import { useResource } from "@/hooks/useResource";
import { listIncidents } from "@/lib/api/services";

export default function IncidentsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [severity, setSeverity] = useState("ALL");

  const { data, loading, error, reload } = useResource(
    () => listIncidents({ search, status, severity }),
    [search, status, severity],
  );

  function clear() { setSearch(""); setStatus("ALL"); setSeverity("ALL"); }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">CORRELATED INVESTIGATIONS</div>
          <h2>Incidents</h2>
          <p>Events grouped within the 15-minute correlation window and tracked through response.</p>
        </div>
        <div className="page-actions"><button className="btn btn-quiet" onClick={clear}>Clear filters</button></div>
      </div>

      <Panel>
        <div className="filter-row">
          <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, ID, device…" aria-label="Search incidents" />
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by incident status">
            <option value="ALL">Any status</option>
            {["OPEN", "INVESTIGATING", "CONTAINED", "RESOLVED", "CLOSED", "FALSE_POSITIVE"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="select" value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Filter by severity">
            <option value="ALL">Any severity</option>
            {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="filter-spacer" />
          <span className="toolbar-note">{data?.length ?? 0} incidents</span>
        </div>
        <PanelHead title="Incident register" subtitle="Open a case for evidence, timeline and response control" />
        <ErrorBanner error={error} onRetry={reload} />
        {loading && !data ? <StateBlock kind="loading" /> : data && data.length > 0 ? <IncidentTable incidents={data} /> : <StateBlock kind="empty" title="No incidents match these filters" action={<button className="btn" onClick={clear}>Clear filters</button>} />}
      </Panel>
    </div>
  );
}
