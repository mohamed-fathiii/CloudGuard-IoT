"use client";

import Link from "next/link";
import { Metric, Panel, PanelHead, SeverityChip, StateBlock } from "@/components/ui";
import { DistributionBars, StackedSeverityBar, TrendChart } from "@/components/Charts";
import { EventTable, IncidentTable } from "@/components/Tables";
import { ErrorBanner } from "@/components/ui";
import { useResource } from "@/hooks/useResource";
import { getDashboardSummary, getRecentEvents, getRecentIncidents, listEvents } from "@/lib/api/services";
import { formatDate } from "@/lib/format";

export default function DashboardPage() {
  const { data, loading, error, reload } = useResource(async () => {
    const [summary, recentEvents, recentIncidents, critical] = await Promise.all([
      getDashboardSummary(),
      getRecentEvents(6),
      getRecentIncidents(3),
      listEvents({ severity: "CRITICAL", pageSize: 3 }),
    ]);
    return { summary, recentEvents, recentIncidents, critical: critical.items };
  }, []);

  if (loading && !data) {
    return <div className="page"><Panel><StateBlock kind="loading" /></Panel></div>;
  }
  if (error || !data) {
    return <div className="page"><ErrorBanner error={error} onRetry={reload} /><Panel><StateBlock kind="error" action={<button className="btn" onClick={reload}>Try again</button>} /></Panel></div>;
  }

  const { summary, recentEvents, recentIncidents, critical } = data;
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">MONITORING OVERVIEW</div>
          <h2>Security Overview</h2>
          <p>{today} · Demo data from the prototype rule engine</p>
        </div>
        <div className="page-actions">
          <Link href="/incidents" className="btn">View incidents</Link>
          <Link href="/events" className="btn btn-primary">View all events</Link>
        </div>
      </div>

      <div className="metric-grid">
        <Metric label="Registered devices" value={summary.totalDevices} note={`${summary.simulatedDevices} simulated`} />
        <Metric label="Processed events" value={summary.totalSecurityEvents} note="Prototype rule-engine output" />
        <Metric label="Critical alerts" value={summary.criticalEvents} note="Risk score 80–100" tone="critical" />
        <Metric label="Open incidents" value={summary.openIncidents} note={`${summary.approvalsPending} awaiting approval`} tone="warning" />
      </div>

      <div className="grid-main">
        <div className="stack">
          <Panel>
            <PanelHead title="Security events over time" subtitle="Sampled 24-hour window from the demo dataset" action={<Link href="/events" className="table-link">Event stream →</Link>} />
            <TrendChart data={summary.trend} />
          </Panel>

          <Panel>
            <PanelHead title="Recent security events" subtitle="Newest detections first" action={<Link href="/events" className="table-link">View all →</Link>} />
            <EventTable events={recentEvents} compact />
          </Panel>

          <Panel>
            <PanelHead title="Incidents requiring attention" subtitle="Open and investigating cases" action={<Link href="/incidents" className="table-link">All incidents →</Link>} />
            <IncidentTable incidents={recentIncidents} />
          </Panel>
        </div>

        <div className="stack">
          <Panel>
            <PanelHead title="Critical security alerts" subtitle="Highest scoring detections" />
            <div className="alert-list">
              {critical.length === 0 && <div className="panel-body dim" style={{ fontSize: 12 }}>No critical alerts in this dataset.</div>}
              {critical.map((event) => (
                <Link href={`/events/${event.id}`} className="alert-item" key={event.id}>
                  <span className="alert-mark" aria-hidden="true" />
                  <span>
                    <span className="alert-title"><SeverityChip level={event.severity} /> {event.title}</span>
                    <span className="alert-meta" style={{ display: "block" }}>{formatDate(event.detectedAt)} · score {event.riskScore} · {event.deviceId}</span>
                  </span>
                  <span className="alert-score">{event.riskScore}</span>
                </Link>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelHead title="Risk distribution" subtitle="Devices by risk band" />
            <DistributionBars data={summary.riskDistribution} total={summary.totalDevices} />
          </Panel>

          <Panel>
            <PanelHead title="Severity distribution" subtitle="Events by severity band" />
            <StackedSeverityBar data={summary.severityDistribution} />
          </Panel>

          <Panel>
            <PanelHead title="Device state" subtitle="Canonical status and simulated policy state" />
            <div className="panel-body">
              <div className="dim" style={{ fontSize: 11, marginBottom: 6 }}>Device status</div>
              <DistributionBars data={summary.deviceStatusDistribution} total={summary.totalDevices} />
              <div className="dim" style={{ fontSize: 11, margin: "14px 0 6px" }}>Simulated policy state</div>
              <DistributionBars data={summary.simulationStateDistribution} total={summary.totalDevices} />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
