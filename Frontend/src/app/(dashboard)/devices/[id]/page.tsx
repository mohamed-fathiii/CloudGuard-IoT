"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SensitiveActionDialog } from "@/components/ConfirmDialog";
import { EventTable, IncidentTable } from "@/components/Tables";
import { ErrorBanner, KeyValue, Panel, PanelHead, RiskValue, SeverityChip, StateBlock, StatusChip } from "@/components/ui";
import { useResource } from "@/hooks/useResource";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { createResponse, getDevice, listEvents, listIncidents, toError } from "@/lib/api/services";
import { formatDate, humanize } from "@/lib/format";
import type { ExecutionType, ResponseAction } from "@/lib/types";

export default function DeviceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { session, can } = useAuth();
  const { notify } = useToast();
  const [action, setAction] = useState<ResponseAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const { data, loading, error, reload } = useResource(async () => {
    const [device, eventPage, incidents] = await Promise.all([
      getDevice(id),
      listEvents({ search: id, pageSize: 5 }),
      listIncidents({ search: id }),
    ]);
    return { device, events: eventPage.items, incidents };
  }, [id]);

  if (loading && !data) return <div className="page"><Panel><StateBlock kind="loading" /></Panel></div>;
  if (error) return <div className="page"><ErrorBanner error={error} onRetry={reload} /></div>;
  if (!data?.device) return <div className="page"><Panel><StateBlock kind="empty" title="Device not found" description={`No device with ID ${id} exists in this dataset.`} action={<Link href="/devices" className="btn">Back to devices</Link>} /></Panel></div>;

  const device = data.device;
  const topEvent = [...data.events].sort((a, b) => b.riskScore - a.riskScore)[0];
  const incidentId = data.incidents[0]?.id ?? "INC-UNASSIGNED";

  async function confirmAction(execution: ExecutionType) {
    if (!action) return;
    setBusy(true); setActionError("");
    try {
      const record = await createResponse({
        incidentId,
        targetId: device.id,
        actionType: action === "DRY_RUN" ? "DRY_RUN" : action,
        execution,
        requestedBy: session?.user.email ?? "demo",
        authorizedBy: session?.user.email ?? "demo",
      });
      notify(`${record.id} recorded · ${humanize(record.actionType)} (${humanize(record.execution)}).`);
      setAction(null);
      reload();
    } catch (cause) {
      setActionError(toError(cause).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="back-bar"><Link href="/devices" className="table-link">← All devices</Link></div>
      <div className="page-head">
        <div>
          <div className="eyebrow">DEVICE · {device.id}</div>
          <h2>{device.deviceName}</h2>
          <div className="chip-row">
            <StatusChip status={device.status} />
            <span className={`chip ${device.simulationState === "QUARANTINED" ? "high" : "neutral"}`}>{humanize(device.simulationState)}</span>
            <SeverityChip level={device.riskLevel} />
            {device.isSimulated && <span className="chip plain">SIMULATED</span>}
          </div>
        </div>
        <div className="page-actions">
          {can("respond") ? (
            <>
              <button className="btn" onClick={() => { setAction(device.simulationState === "QUARANTINED" ? "REINSTATE_DEVICE" : "ISOLATE_DEVICE"); setActionError(""); }}>
                {device.simulationState === "QUARANTINED" ? "Reinstate device…" : "Isolate device…"}
              </button>
              <button className="btn" onClick={() => { setAction("DRY_RUN"); setActionError(""); }}>Run dry run</button>
            </>
          ) : <span className="toolbar-note">Read-only for the Viewer role.</span>}
        </div>
      </div>

      <div className="grid-main">
        <div className="stack">
          <Panel>
            <PanelHead title="Device overview" subtitle="Canonical device fields" />
            <div className="panel-body">
              <KeyValue rows={[
                { label: "Device ID", value: <span className="mono">{device.id}</span> },
                { label: "Device type", value: humanize(device.deviceType) },
                { label: "Model", value: device.model },
                { label: "Status", value: <StatusChip status={device.status} /> },
                { label: "Environment", value: humanize(device.environment) },
                { label: "Simulated", value: device.isSimulated ? "Yes" : "No" },
                { label: "Firmware", value: <span className="mono">{device.firmwareVersion}</span> },
                { label: "Location", value: device.location },
                { label: "Last seen", value: <span className="num">{formatDate(device.lastSeenAt)}</span> },
                { label: "Topic namespace", value: <span className="mono">{device.topicNamespace}</span> },
              ]} />
            </div>
          </Panel>

          <Panel>
            <PanelHead title="Observed baseline" subtitle="Sample values used by the prototype rule engine" />
            <div className="panel-body">
              {device.baseline.messageRate === 0 ? (
                <p className="muted" style={{ fontSize: 12 }}>No baseline has been observed for this newly registered device.</p>
              ) : (
                <KeyValue rows={[
                  { label: "Message rate", value: `${device.baseline.messageRate} / min` },
                  { label: "Payload size", value: `${device.baseline.payloadSize} bytes` },
                  { label: "Reconnect rate", value: `${device.baseline.reconnectRate} / window` },
                  { label: "Observation window", value: device.baseline.observedWindow },
                  { label: "Allowed topics", value: <div className="topic-list">{device.baseline.allowedTopics.map((t) => <div key={t} className="mono">{t}</div>)}</div> },
                ]} />
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHead title="Related security events" subtitle={`Latest ${data.events.length} events for this device`} action={<Link href={`/events?q=${encodeURIComponent(device.id)}`} className="table-link">All events →</Link>} />
            {data.events.length > 0 ? <EventTable events={data.events} compact /> : <StateBlock kind="empty" title="No events for this device" />}
          </Panel>
        </div>

        <div className="stack">
          <Panel>
            <PanelHead title="Risk position" subtitle="Canonical bands: 0–29 / 30–59 / 60–79 / 80–100" />
            <div className="panel-body">
              <div className="risk-hero"><RiskValue score={device.riskScore} /><span className="chip">{device.riskLevel}</span></div>
              {topEvent ? (
                <>
                  <div className="explanation" style={{ marginTop: 14 }}>{topEvent.explanation}</div>
                  <Link href={`/events/${topEvent.id}`} className="table-link" style={{ display: "inline-block", marginTop: 12 }}>Inspect highest-scoring event →</Link>
                </>
              ) : <p className="muted" style={{ fontSize: 12 }}>No scored event is available for this device.</p>}
            </div>
          </Panel>

          <Panel>
            <PanelHead title="Response controls" subtitle="Simulated, allowlisted and audited" />
            <div className="panel-body stack" style={{ gap: 10 }}>
              <div className="notice info">Isolation replaces the device policy with deny-all in simulation. It is reversible and logged; no real cloud resource is touched.</div>
              <div className="safeguard-row"><span><span className="safeguard-mark">✓</span> Allowlist check</span><span><span className="safeguard-mark">✓</span> Typed confirmation</span></div>
              {actionError && <div className="notice danger" role="alert">{actionError}</div>}
            </div>
          </Panel>

          <Panel>
            <PanelHead title="Related incidents" subtitle="Cases containing this device" />
            {data.incidents.length > 0 ? <IncidentTable incidents={data.incidents} /> : <StateBlock kind="empty" title="No related incidents" />}
          </Panel>
        </div>
      </div>

      {action && (
        <SensitiveActionDialog
          action={action}
          target={device.id}
          incidentId={incidentId}
          allowExecution={can("approve")}
          busy={busy}
          onCancel={() => setAction(null)}
          onConfirm={confirmAction}
        />
      )}
    </div>
  );
}
