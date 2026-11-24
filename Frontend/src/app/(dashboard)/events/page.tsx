"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EventTable } from "@/components/Tables";
import { ErrorBanner, Pager, Panel, PanelHead, StateBlock } from "@/components/ui";
import { useResource } from "@/hooks/useResource";
import { listEvents } from "@/lib/api/services";
import { downloadCsv } from "@/lib/csv";
import { formatDate } from "@/lib/format";
import { useToast } from "@/context/ToastContext";

function EventsContent() {
  const params = useSearchParams();
  const { notify } = useToast();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [severity, setSeverity] = useState("ALL");
  const [processingState, setProcessingState] = useState("ALL");
  const [sourceType, setSourceType] = useState("ALL");
  const [deviceId, setDeviceId] = useState("ALL");
  const [minScore, setMinScore] = useState("0");
  const [range, setRange] = useState("ALL");
  const [sort, setSort] = useState("time-desc");
  const [page, setPage] = useState(1);

  useEffect(() => { setSearch(params.get("q") ?? ""); }, [params]);

  const { data, loading, error, reload } = useResource(
    () => listEvents({ search, severity, processingState, sourceType, deviceId, minScore, range, sort, page, pageSize: 10 }),
    [search, severity, processingState, sourceType, deviceId, minScore, range, sort, page],
  );

  function clear() {
    setSearch(""); setSeverity("ALL"); setProcessingState("ALL"); setSourceType("ALL"); setDeviceId("ALL");
    setMinScore("0"); setRange("ALL"); setSort("time-desc"); setPage(1);
  }

  function exportRows() {
    if (!data?.items.length) { notify("No rows to export.", "error"); return; }
    downloadCsv(
      "cloudguard-events-demo.csv",
      ["ID", "Detected at", "Device", "Event type", "Rule", "Risk score", "Severity", "State"],
      data.items.map((e) => [e.id, formatDate(e.detectedAt), e.deviceId ?? e.resourceId ?? "", e.title, e.ruleId, e.riskScore, e.severity, e.processingState]),
    );
    notify("Demo event page exported as CSV.");
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">SECURITY MONITORING</div>
          <h2>Security Events</h2>
          <p>Searchable, filterable stream of rule-engine detections from simulated device activity.</p>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={exportRows}>Export CSV</button>
          <button className="btn btn-quiet" onClick={clear}>Clear filters</button>
        </div>
      </div>

      <Panel>
        <div className="filter-row">
          <input className="input" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search ID, device, rule…" aria-label="Search events" />
          <select className="select" value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1); }} aria-label="Filter by severity">
            <option value="ALL">Any severity</option>
            <option value="LOW">Low · 0–29</option>
            <option value="MEDIUM">Medium · 30–59</option>
            <option value="HIGH">High · 60–79</option>
            <option value="CRITICAL">Critical · 80–100</option>
          </select>
          <select className="select" value={minScore} onChange={(e) => { setMinScore(e.target.value); setPage(1); }} aria-label="Minimum risk score">
            <option value="0">Any risk score</option>
            <option value="30">Score 30+</option>
            <option value="60">Score 60+</option>
            <option value="80">Score 80+</option>
          </select>
          <select className="select" value={processingState} onChange={(e) => { setProcessingState(e.target.value); setPage(1); }} aria-label="Filter by processing state">
            <option value="ALL">Any state</option>
            <option value="PROCESSED">Processed</option>
            <option value="PROCESSING">Processing</option>
            <option value="FAILED">Failed</option>
          </select>
          <select className="select" value={sourceType} onChange={(e) => { setSourceType(e.target.value); setPage(1); }} aria-label="Filter by source type">
            <option value="ALL">Any source</option>
            <option value="IOT_DEVICE">IoT device</option>
            <option value="CLOUD_RESOURCE">Cloud resource</option>
            <option value="SYSTEM">System</option>
          </select>
          <select className="select" value={deviceId} onChange={(e) => { setDeviceId(e.target.value); setPage(1); }} aria-label="Filter by device">
            <option value="ALL">Any device</option>
            {["ESP32-01", "ESP32-02", "ESP32-03", "SIM-05", "SIM-06", "SIM-07", "SIM-08"].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className="select" value={range} onChange={(e) => { setRange(e.target.value); setPage(1); }} aria-label="Time range">
            <option value="ALL">All recorded time</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort events">
            <option value="time-desc">Newest first</option>
            <option value="score-desc">Score: high to low</option>
            <option value="score-asc">Score: low to high</option>
          </select>
        </div>
        <PanelHead title={`${data?.total ?? 0} matching events`} subtitle="Select a row to inspect the detection evidence" />
        <ErrorBanner error={error} onRetry={reload} />
        {loading && !data ? <StateBlock kind="loading" /> : data && data.items.length > 0 ? (
          <>
            <EventTable events={data.items} />
            <Pager page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
          </>
        ) : <StateBlock kind="empty" title="No events match these filters" action={<button className="btn" onClick={clear}>Clear filters</button>} />}
      </Panel>
    </div>
  );
}

export default function EventsPage() {
  return <Suspense fallback={<div className="page"><Panel><StateBlock kind="loading" /></Panel></div>}><EventsContent /></Suspense>;
}
