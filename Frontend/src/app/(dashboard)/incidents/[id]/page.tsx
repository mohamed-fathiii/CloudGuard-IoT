"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SensitiveActionDialog, SimpleConfirmDialog } from "@/components/ConfirmDialog";
import { EventTable, ResponseTable } from "@/components/Tables";
import { ErrorBanner, KeyValue, Panel, PanelHead, RiskValue, SeverityChip, StateBlock, StatusChip } from "@/components/ui";
import { useResource } from "@/hooks/useResource";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { addIncidentNote, createResponse, getEvent, getIncident, listResponses, setIncidentStatus, toError } from "@/lib/api/services";
import { formatDate, humanize } from "@/lib/format";
import type { ExecutionType, ResponseAction } from "@/lib/types";

type Tab = "Overview" | "Evidence" | "Timeline";
const TABS: Tab[] = ["Overview", "Evidence", "Timeline"];

export default function IncidentDetailPage() {
  const params = useParams<{ id: string }>();
  const { session, can } = useAuth();
  const { notify } = useToast();
  const [tab, setTab] = useState<Tab>("Overview");
  const [action, setAction] = useState<ResponseAction | null>(null);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const { data, loading, error, reload } = useResource(async () => {
    const incident = await getIncident(params.id);
    if (!incident) return { incident: null, events: [], responses: [] };
    const [events, responses] = await Promise.all([
      Promise.all(incident.relatedEventIds.map((eventId) => getEvent(eventId))),
      listResponses({ search: incident.id }),
    ]);
    return { incident, events: events.filter((e): e is NonNullable<typeof e> => e !== null), responses };
  }, [params.id]);

  if (loading && !data) return <div className="page"><Panel><StateBlock kind="loading" /></Panel></div>;
  if (error) return <div className="page"><ErrorBanner error={error} onRetry={reload} /></div>;
  if (!data?.incident) return <div className="page"><Panel><StateBlock kind="empty" title="Incident not found" description={`No incident with ID ${params.id} exists in this dataset.`} action={<Link href="/incidents" className="btn">Back to incidents</Link>} /></Panel></div>;

  const incident = data.incident;
  const actor = session?.user.email ?? "demo";
  const quarantined = incident.status === "CONTAINED";

  async function confirmAction(execution: ExecutionType) {
    if (!action) return;
    setBusy(true); setActionError("");
    try {
      const record = await createResponse({
        incidentId: incident.id, targetId: incident.deviceId, actionType: action === "DRY_RUN" ? "DRY_RUN" : action,
        execution, requestedBy: actor, authorizedBy: actor,
      });
      notify(`${record.id} recorded · ${humanize(record.actionType)} (${humanize(record.execution)}).`);
      setAction(null);
      reload();
    } catch (cause) { setActionError(toError(cause).message); }
    finally { setBusy(false); }
  }

  async function addNote() {
    if (note.trim().length < 4) { notify("Enter a note of at least 4 characters.", "error"); return; }
    setBusy(true);
    try {
      await addIncidentNote(incident.id, actor, note.trim());
      setNote(""); notify("Investigation note added to the demo incident."); reload();
    } catch (cause) { notify(toError(cause).message, "error"); }
    finally { setBusy(false); }
  }

  async function markResolved() {
    setBusy(true);
    try {
      await setIncidentStatus(incident.id, "RESOLVED", actor);
      setResolveOpen(false); notify("Incident status updated to RESOLVED."); reload();
    } catch (cause) { notify(toError(cause).message, "error"); }
    finally { setBusy(false); }
  }

  return (
    <div className="page">
      <div className="back-bar"><Link href="/incidents" className="table-link">← All incidents</Link></div>
      <div className="page-head">
        <div>
          <div className="eyebrow">INCIDENT · {incident.id}</div>
          <h2>{incident.title}</h2>
          <div className="chip-row">
            <SeverityChip level={incident.severity} />
            <StatusChip status={incident.status} />
            {incident.approvalPending && <span className="chip high">APPROVAL PENDING</span>}
          </div>
        </div>
        <div className="page-actions">
          {can("respond") ? (
            <>
              <button className="btn" onClick={() => { setAction(quarantined ? "REINSTATE_DEVICE" : "ISOLATE_DEVICE"); setActionError(""); }}>
                {quarantined ? "Reinstate device…" : "Isolate device…"}
              </button>
              <button className="btn" onClick={() => { setAction("DRY_RUN"); setActionError(""); }}>Run dry run</button>
              {incident.status !== "RESOLVED" && <button className="btn btn-quiet" onClick={() => setResolveOpen(true)}>Mark resolved</button>}
            </>
          ) : <span className="toolbar-note">Read-only for the Viewer role.</span>}
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Incident sections">
        {TABS.map((name) => (
          <button key={name} role="tab" aria-selected={tab === name} className={`tab ${tab === name ? "active" : ""}`} onClick={() => setTab(name)}>{name}</button>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        {tab === "Overview" && (
          <div className="grid-main">
            <div className="stack">
              <Panel>
                <PanelHead title="Summary" subtitle="What was detected and why" />
                <div className="panel-body stack" style={{ gap: 12 }}>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.75 }}>{incident.description}</p>
                  <div className="explanation"><strong>Why detected.</strong> {incident.approvalPending ? "A response is awaiting approval." : "Rule-based correlation grouped the related events within the configured window."}</div>
                  <KeyValue rows={[
                    { label: "Incident ID", value: <span className="mono">{incident.id}</span> },
                    { label: "Device", value: <Link href={`/devices/${incident.deviceId}`} className="table-link mono">{incident.deviceId}</Link> },
                    { label: "Severity", value: <SeverityChip level={incident.severity} /> },
                    { label: "Status", value: <StatusChip status={incident.status} /> },
                    { label: "Risk score", value: <RiskValue score={incident.riskScore} /> },
                    { label: "Opened", value: <span className="num">{formatDate(incident.openedAt)}</span> },
                    { label: "Last updated", value: <span className="num">{formatDate(incident.updatedAt)}</span> },
                    { label: "Assigned to", value: incident.assignedTo ?? "Unassigned" },
                  ]} />
                </div>
              </Panel>

              <Panel>
                <PanelHead title="Response actions" subtitle="Recorded actions for this incident" />
                {data.responses.length > 0 ? <ResponseTable responses={data.responses} /> : <StateBlock kind="empty" title="No response actions yet" />}
              </Panel>
            </div>

            <div className="stack">
              <Panel>
                <PanelHead title="Investigation notes" subtitle="Analyst-added context" />
                <div className="panel-body stack" style={{ gap: 10 }}>
                  {incident.notes.length === 0 && <p className="muted" style={{ fontSize: 12, margin: 0 }}>No notes recorded.</p>}
                  {incident.notes.map((entry) => (
                    <div key={entry.id} className="note-item">
                      <div className="dim mono" style={{ fontSize: 10 }}>{entry.author} · {formatDate(entry.createdAt)}</div>
                      <div style={{ fontSize: 12, marginTop: 4 }}>{entry.body}</div>
                    </div>
                  ))}
                  {can("respond") && (
                    <div className="field">
                      <span className="field-label">Add note</span>
                      <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Record investigation context…" />
                      <button className="btn btn-sm" onClick={addNote} disabled={busy}>{busy ? "Saving…" : "Add note"}</button>
                    </div>
                  )}
                  {actionError && <div className="notice danger" role="alert">{actionError}</div>}
                </div>
              </Panel>

              <Panel>
                <PanelHead title="Recommended response" subtitle="Controlled and simulated" />
                <div className="panel-body stack" style={{ gap: 10 }}>
                  <div className="notice info">Isolation replaces the device policy with deny-all in simulation. It is reversible and logged. Dry run makes no change.</div>
                  <div className="safeguard-row"><span><span className="safeguard-mark">✓</span> Allowlist</span><span><span className="safeguard-mark">✓</span> Cooldown</span><span><span className="safeguard-mark">✓</span> Audited</span></div>
                </div>
              </Panel>
            </div>
          </div>
        )}

        {tab === "Evidence" && (
          <Panel>
            <PanelHead title="Related security events" subtitle={`${data.events.length} events linked to this incident`} action={<Link href="/events" className="table-link">Event stream →</Link>} />
            {data.events.length > 0 ? <EventTable events={data.events} /> : <StateBlock kind="empty" title="No linked events" />}
          </Panel>
        )}

        {tab === "Timeline" && (
          <Panel>
            <PanelHead title="Incident timeline" subtitle="Ordered activity recorded for this case" />
            <div className="panel-body timeline">
              {incident.timeline.map((entry) => (
                <div className="timeline-item" key={entry.id}>
                  <span className="timeline-time">{formatDate(entry.at)}</span>
                  <span className="timeline-dot" aria-hidden="true" />
                  <span className="timeline-text"><strong>{entry.label}</strong><br />{entry.detail}</span>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>

      {action && (
        <SensitiveActionDialog
          action={action} target={incident.deviceId} incidentId={incident.id}
          allowExecution={can("approve")} busy={busy}
          onCancel={() => setAction(null)} onConfirm={confirmAction}
        />
      )}
      {resolveOpen && (
        <SimpleConfirmDialog
          title="Mark incident resolved"
          message="This updates the demo incident status and writes an audit entry. No evidence is removed."
          confirmLabel="Mark resolved" busy={busy}
          onCancel={() => setResolveOpen(false)} onConfirm={markResolved}
        />
      )}
    </div>
  );
}
