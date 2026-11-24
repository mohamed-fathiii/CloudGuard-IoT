"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ErrorBanner, KeyValue, Panel, PanelHead, RiskValue, SeverityChip, StateBlock, StatusChip } from "@/components/ui";
import { useResource } from "@/hooks/useResource";
import { getEvent } from "@/lib/api/services";
import { formatDate, humanize } from "@/lib/format";

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: event, loading, error, reload } = useResource(() => getEvent(params.id), [params.id]);

  if (loading && !event) return <div className="page"><Panel><StateBlock kind="loading" /></Panel></div>;
  if (error) return <div className="page"><ErrorBanner error={error} onRetry={reload} /></div>;
  if (!event) return <div className="page"><Panel><StateBlock kind="empty" title="Event not found" description={`No event with ID ${params.id} exists in this dataset.`} action={<Link href="/events" className="btn">Back to events</Link>} /></Panel></div>;

  return (
    <div className="page">
      <div className="back-bar"><Link href="/events" className="table-link">← All events</Link></div>
      <div className="page-head">
        <div>
          <div className="eyebrow">EVENT · {event.id}</div>
          <h2>{event.title}</h2>
          <div className="chip-row">
            <SeverityChip level={event.severity} />
            <StatusChip status={event.processingState} />
            <span className="chip plain">{humanize(event.sourceType)}</span>
            {event.simulated && <span className="chip plain">SIMULATED</span>}
          </div>
        </div>
        <div className="page-actions">
          {event.incidentId && <Link href={`/incidents/${event.incidentId}`} className="btn btn-primary">View related incident</Link>}
        </div>
      </div>

      <div className="grid-main">
        <div className="stack">
          <Panel>
            <PanelHead title="Why this score" subtitle="Rule and baseline contributions recorded by the prototype engine" />
            <div className="panel-body">
              <div className="explanation">{event.explanation}</div>
              <div style={{ marginTop: 16 }}>
                {event.factors.map((factor) => (
                  <div className="factor" key={`${factor.ruleId}-${factor.label}`}>
                    <span className="mono dim" style={{ width: 42, fontSize: 10 }}>{factor.ruleId}</span>
                    <span style={{ flex: 1 }}>
                      <span className="strong">{factor.label}</span>
                      <span className="dim" style={{ display: "block", fontSize: 11, marginTop: 2 }}>{factor.detail}</span>
                    </span>
                    <span className="factor-points">+{factor.points}</span>
                  </div>
                ))}
              </div>
              <div className="dim" style={{ fontSize: 10, marginTop: 14, lineHeight: 1.7 }}>
                Score from the prototype rule-based engine; a triage aid, not a probability of compromise. Severity bands: Low 0–29 · Medium 30–59 · High 60–79 · Critical 80–100.
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHead title="Event record" subtitle="Fields available from the proposed API contract" />
            <div className="panel-body">
              <KeyValue rows={[
                { label: "Event ID", value: <span className="mono">{event.id}</span> },
                { label: "Detected at", value: <span className="num">{formatDate(event.detectedAt)}</span> },
                { label: "Event type", value: <span className="mono">{event.eventType}</span> },
                { label: "Rule ID", value: <span className="mono">{event.ruleId}</span> },
                { label: "Source type", value: humanize(event.sourceType) },
                { label: "Device", value: <span className="mono">{event.deviceId ?? "—"}</span> },
                { label: "Cloud resource", value: <span className="mono">{event.resourceId ?? "—"}</span> },
                { label: "Severity", value: <SeverityChip level={event.severity} /> },
                { label: "Processing state", value: <StatusChip status={event.processingState} /> },
              ]} />
            </div>
          </Panel>
        </div>

        <div className="stack">
          <Panel>
            <PanelHead title="Risk score" subtitle="0–100 triage output" />
            <div className="panel-body">
              <div className="risk-hero"><RiskValue score={event.riskScore} /><span className="chip">{event.severity}</span></div>
              <p className="muted" style={{ fontSize: 12, lineHeight: 1.7, marginTop: 14 }}>{event.description}</p>
            </div>
          </Panel>

          <Panel>
            <PanelHead title="Recommended handling" subtitle="Prototype guidance" />
            <div className="panel-body stack" style={{ gap: 10 }}>
              <div className="notice info">Preserve the event evidence, review related detections within the 15-minute correlation window, and escalate to an incident when rules repeat on the same identity.</div>
              <div className="toolbar-note">No automated action is taken from this page. Response actions are raised from device or incident detail after typed confirmation.</div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
