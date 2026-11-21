/**
 * M4 event correlation. Groups findings from one device into incidents using
 * time proximity, device identity and an optional shared correlationId.
 */

import type {
  DetectionFinding,
  EventSeverity,
  NormalizedSecurityEvent,
} from "./types.ts";

export interface CorrelatedEvent {
  event: NormalizedSecurityEvent;
  findings: DetectionFinding[];
}

export interface TimelineEntry {
  eventId: string | null;
  eventType: string;
  occurredAt: string;
  description: string;
  ruleIds: string[];
}

export interface SecurityIncident {
  incidentId: string;
  deviceId: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  status: "open" | "updated";
  severity: EventSeverity;
  severityReason: string;
  findings: DetectionFinding[];
  timeline: TimelineEntry[];
  correlationReasons: string[];
}

export interface CorrelationConfig {
  windowMs: number;
  referenceTime?: Date;
}

const SEVERITY_RANK: Record<EventSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function deviceKey(event: NormalizedSecurityEvent): string {
  return `${event.sourceType}:${event.sourceId}`;
}

function correlationId(event: NormalizedSecurityEvent): string | undefined {
  const value = event.metadata.correlationId;
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function findingIdentity(finding: DetectionFinding): string {
  return `${finding.ruleId}:${finding.eventId ?? ""}:${finding.detectedAt.toISOString()}`;
}

function highestSeverity(findings: DetectionFinding[]): EventSeverity {
  return findings.reduce<EventSeverity>(
    (highest, finding) =>
      SEVERITY_RANK[finding.severity] > SEVERITY_RANK[highest]
        ? finding.severity
        : highest,
    "low"
  );
}

function buildIncident(
  device: string,
  cluster: CorrelatedEvent[],
  config: CorrelationConfig
): SecurityIncident {
  const sorted = [...cluster].sort((a, b) => {
    const delta = a.event.occurredAt.getTime() - b.event.occurredAt.getTime();
    return delta !== 0
      ? delta
      : (a.event.eventId ?? "").localeCompare(b.event.eventId ?? "");
  });

  const sharedId = sorted
    .map((entry) => correlationId(entry.event))
    .find((id): id is string => id !== undefined);
  const firstKey = sharedId ?? sorted[0].event.eventId ?? sorted[0].event.eventType;
  const findings = sorted.flatMap((entry) => entry.findings);
  const severity = highestSeverity(findings);
  const reasons = [`Findings from the same device (${device}).`];
  const ruleIds = [...new Set(findings.map((finding) => finding.ruleId))];

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1].event;
    const current = sorted[index].event;
    const gap = current.occurredAt.getTime() - previous.occurredAt.getTime();
    const sharedId = correlationId(previous);
    if (sharedId && sharedId === correlationId(current)) {
      reasons.push(`Events share correlationId ${sharedId}.`);
    } else {
      reasons.push(`Event occurred ${gap}ms after the previous event (window ${config.windowMs}ms).`);
    }
  }
  if (ruleIds.length > 1) {
    reasons.push(`Rules observed in sequence: ${ruleIds.join(", ")}.`);
  }

  const timeline: TimelineEntry[] = sorted.map((entry) => ({
    eventId: entry.event.eventId ?? null,
    eventType: entry.event.eventType,
    occurredAt: entry.event.occurredAt.toISOString(),
    description: entry.event.description,
    ruleIds: [...new Set(entry.findings.map((finding) => finding.ruleId))],
  }));

  const times = sorted.map((entry) => entry.event.occurredAt.getTime());

  return {
    incidentId: `inc-${stableHash(`${device}|${firstKey}`)}`,
    deviceId: device,
    createdAt: new Date(Math.min(...times)).toISOString(),
    updatedAt: new Date(Math.max(...times)).toISOString(),
    revision: 1,
    status: "open",
    severity,
    severityReason: `Highest finding severity in the incident is ${severity}.`,
    findings,
    timeline,
    correlationReasons: reasons,
  };
}

/** Pure correlation of one batch of events into zero or more incidents. */
export function correlateEvents(
  inputs: CorrelatedEvent[],
  config: CorrelationConfig
): SecurityIncident[] {
  const byDevice = new Map<string, CorrelatedEvent[]>();
  const seen = new Set<string>();
  // Without an explicit reference time, historical batches are not expired.
  const referenceMs = config.referenceTime?.getTime() ?? Number.POSITIVE_INFINITY;

  for (const input of inputs) {
    if (!input?.event || !Array.isArray(input.findings) || input.findings.length === 0) {
      continue;
    }
    const occurredAt = input.event.occurredAt?.getTime();
    if (!Number.isFinite(occurredAt)) {
      continue;
    }
    if (config.referenceTime && referenceMs - occurredAt > config.windowMs) {
      continue;
    }

    const identity =
      input.event.eventId ??
      `${deviceKey(input.event)}|${input.event.eventType}|${occurredAt}`;
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);

    const device = deviceKey(input.event);
    const list = byDevice.get(device) ?? [];
    list.push(input);
    byDevice.set(device, list);
  }

  const incidents: SecurityIncident[] = [];
  for (const [device, entries] of byDevice) {
    entries.sort((a, b) => a.event.occurredAt.getTime() - b.event.occurredAt.getTime());

    let cluster: CorrelatedEvent[] = [];
    const flush = () => {
      if (cluster.length > 0) {
        incidents.push(buildIncident(device, cluster, config));
        cluster = [];
      }
    };

    for (const entry of entries) {
      const previous = cluster.at(-1)?.event;
      if (previous) {
        const gap = entry.event.occurredAt.getTime() - previous.occurredAt.getTime();
        const sharedId = correlationId(previous);
        const related =
          (gap >= 0 && gap <= config.windowMs) ||
          (sharedId !== undefined && sharedId === correlationId(entry.event));
        if (!related) {
          flush();
        }
      }
      cluster.push(entry);
    }
    flush();
  }

  return incidents.sort((a, b) => a.incidentId.localeCompare(b.incidentId));
}

/** Stateful store that tracks incident creation and later updates. */
export class IncidentStore {
  private readonly incidents = new Map<string, SecurityIncident>();
  private readonly config: CorrelationConfig;

  constructor(config: CorrelationConfig) {
    this.config = config;
  }

  ingest(inputs: CorrelatedEvent[]): SecurityIncident[] {
    const incoming = correlateEvents(inputs, this.config);
    const affected: SecurityIncident[] = [];

    for (const incident of incoming) {
      const existing = this.incidents.get(incident.incidentId);
      if (!existing) {
        this.incidents.set(incident.incidentId, incident);
        affected.push(incident);
        continue;
      }

      const findings = [...existing.findings];
      const findingKeys = new Set(findings.map(findingIdentity));
      for (const finding of incident.findings) {
        const key = findingIdentity(finding);
        if (!findingKeys.has(key)) {
          findingKeys.add(key);
          findings.push(finding);
        }
      }

      const timeline = [...existing.timeline];
      const timelineKeys = new Set(
        timeline.map((entry) => `${entry.eventId}|${entry.occurredAt}|${entry.ruleIds.join(",")}`)
      );
      for (const entry of incident.timeline) {
        const key = `${entry.eventId}|${entry.occurredAt}|${entry.ruleIds.join(",")}`;
        if (!timelineKeys.has(key)) {
          timelineKeys.add(key);
          timeline.push(entry);
        }
      }

      const severity = highestSeverity(findings);
      const merged: SecurityIncident = {
        ...existing,
        updatedAt:
          incident.updatedAt > existing.updatedAt ? incident.updatedAt : existing.updatedAt,
        revision: existing.revision + 1,
        status: "updated",
        severity,
        severityReason: `Highest finding severity in the incident is ${severity}.`,
        findings,
        timeline: timeline.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
        correlationReasons: [
          ...existing.correlationReasons,
          ...incident.correlationReasons.filter(
            (reason) => !existing.correlationReasons.includes(reason)
          ),
        ],
      };
      this.incidents.set(existing.incidentId, merged);
      affected.push(merged);
    }

    return affected.sort((a, b) => a.incidentId.localeCompare(b.incidentId));
  }

  get(incidentId: string): SecurityIncident | undefined {
    return this.incidents.get(incidentId);
  }

  list(): SecurityIncident[] {
    return [...this.incidents.values()].sort((a, b) =>
      a.incidentId.localeCompare(b.incidentId)
    );
  }
}
