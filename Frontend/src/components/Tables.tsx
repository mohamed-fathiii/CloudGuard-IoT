"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RiskValue, SeverityChip, StatusChip } from "./ui";
import { formatDate, humanize } from "@/lib/format";
import type { AuditEntry, Device, Incident, ResponseRecord, SecurityEvent } from "@/lib/types";

function useRowNavigation() {
  const router = useRouter();
  return (href: string) => router.push(href);
}

function Row({ href, children }: { href: string; children: React.ReactNode }) {
  const go = useRowNavigation();
  return (
    <tr
      className="row-hover"
      tabIndex={0}
      onClick={() => go(href)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(href); } }}
      aria-label={`Open ${href}`}
    >
      {children}
    </tr>
  );
}

export function EventTable({ events, compact = false }: { events: SecurityEvent[]; compact?: boolean }) {
  return (
    <div className="table-scroll">
      <table className="data">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Device / Source</th>
            <th>Event</th>
            <th>Risk</th>
            <th>Severity</th>
            {!compact && <th>State</th>}
            <th><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <Row href={`/events/${event.id}`} key={event.id}>
              <td className="num">{formatDate(event.detectedAt)}</td>
              <td className="strong">{event.deviceId ?? event.resourceId ?? event.sourceType}</td>
              <td>{event.title}</td>
              <td><RiskValue score={event.riskScore} /></td>
              <td><SeverityChip level={event.severity} /></td>
              {!compact && <td><StatusChip status={event.processingState} /></td>}
              <td><Link href={`/events/${event.id}`} className="table-link" onClick={(e) => e.stopPropagation()}>View</Link></td>
            </Row>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DeviceTable({ devices }: { devices: Device[] }) {
  return (
    <div className="table-scroll">
      <table className="data">
        <thead>
          <tr>
            <th>Device</th>
            <th>Type</th>
            <th>Status</th>
            <th>Simulation</th>
            <th>Risk</th>
            <th>Last seen</th>
            <th><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {devices.map((device) => (
            <Row href={`/devices/${device.id}`} key={device.id}>
              <td>
                <div className="strong">{device.deviceName}</div>
                <div className="dim mono" style={{ fontSize: 10 }}>{device.id}</div>
              </td>
              <td>{humanize(device.deviceType)}</td>
              <td><StatusChip status={device.status} /></td>
              <td><span className={`chip ${device.simulationState === "QUARANTINED" ? "high" : "neutral"}`}>{humanize(device.simulationState)}</span></td>
              <td><RiskValue score={device.riskScore} /></td>
              <td className="num">{formatDate(device.lastSeenAt)}</td>
              <td><Link href={`/devices/${device.id}`} className="table-link" onClick={(e) => e.stopPropagation()}>Open</Link></td>
            </Row>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function IncidentTable({ incidents }: { incidents: Incident[] }) {
  return (
    <div className="table-scroll">
      <table className="data">
        <thead>
          <tr><th>Incident</th><th>Device</th><th>Severity</th><th>Status</th><th>Score</th><th>Opened</th><th><span className="sr-only">Open</span></th></tr>
        </thead>
        <tbody>
          {incidents.map((incident) => (
            <Row href={`/incidents/${incident.id}`} key={incident.id}>
              <td>
                <div className="strong">{incident.title}</div>
                <div className="dim mono" style={{ fontSize: 10 }}>{incident.id}</div>
              </td>
              <td className="mono">{incident.deviceId}</td>
              <td><SeverityChip level={incident.severity} /></td>
              <td><StatusChip status={incident.status} />{incident.approvalPending && <div className="dim" style={{ fontSize: 10, marginTop: 4 }}>Approval pending</div>}</td>
              <td><RiskValue score={incident.riskScore} /></td>
              <td className="num">{formatDate(incident.openedAt)}</td>
              <td><Link href={`/incidents/${incident.id}`} className="table-link" onClick={(e) => e.stopPropagation()}>Open</Link></td>
            </Row>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ResponseTable({ responses, onSelect }: { responses: ResponseRecord[]; onSelect?: (record: ResponseRecord) => void }) {
  return (
    <div className="table-scroll">
      <table className="data">
        <thead>
          <tr><th>ID</th><th>Action</th><th>Incident</th><th>Authorized by</th><th>Execution</th><th>Status</th><th>Recovery</th><th>Time</th><th><span className="sr-only">Details</span></th></tr>
        </thead>
        <tbody>
          {responses.map((record) => (
            <tr key={record.id}>
              <td className="id">{record.id}</td>
              <td className="strong">{humanize(record.actionType)}</td>
              <td><Link className="table-link" href={`/incidents/${record.incidentId}`}>{record.incidentId}</Link></td>
              <td>{record.authorizedBy}</td>
              <td><StatusChip status={record.execution} /></td>
              <td><StatusChip status={record.status} /></td>
              <td><StatusChip status={record.recovery} /></td>
              <td className="num">{formatDate(record.timestamp)}</td>
              <td>{onSelect && <button className="btn btn-sm btn-quiet" onClick={() => onSelect(record)}>Details</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AuditTable({ entries }: { entries: AuditEntry[] }) {
  return (
    <div className="table-scroll">
      <table className="data">
        <thead><tr><th>ID</th><th>Timestamp</th><th>Actor</th><th>Action</th><th>Entity</th><th>Outcome</th><th>Details</th></tr></thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className="id">{entry.id}</td>
              <td className="num">{formatDate(entry.createdAt)}</td>
              <td>{entry.actorId}</td>
              <td className="strong mono" style={{ fontSize: 11 }}>{entry.action}</td>
              <td><span className="dim mono" style={{ fontSize: 10 }}>{humanize(entry.entityType)}</span><br /><span className="mono" style={{ fontSize: 10 }}>{entry.entityId}</span></td>
              <td><StatusChip status={entry.outcome} /></td>
              <td className="muted">{entry.details}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
