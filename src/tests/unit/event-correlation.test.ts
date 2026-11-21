import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IncidentStore,
  correlateEvents,
  type CorrelatedEvent,
} from "../../lib/risk/correlation.ts";
import type {
  DetectionFinding,
  EventSeverity,
  NormalizedSecurityEvent,
} from "../../lib/risk/types.ts";

const config = { windowMs: 60_000 };

function event(
  id: string,
  occurredAt: string,
  device = "sensor-001",
  metadata: Record<string, unknown> = {}
): NormalizedSecurityEvent {
  return {
    eventId: id,
    sourceType: "simulated_iot",
    sourceId: device,
    eventType: "AUTHENTICATION_ATTEMPT",
    severity: "medium",
    description: `event ${id}`,
    occurredAt: new Date(occurredAt),
    metadata,
  };
}

function correlated(
  id: string,
  occurredAt: string,
  ruleId = "R2",
  device = "sensor-001",
  severity: EventSeverity = "high",
  metadata: Record<string, unknown> = {}
): CorrelatedEvent {
  const normalized = event(id, occurredAt, device, metadata);
  const finding: DetectionFinding = {
    ruleId,
    title: ruleId,
    description: `${ruleId} finding on ${id}`,
    severity,
    detectedAt: normalized.occurredAt,
    eventId: id,
  };
  return { event: normalized, findings: [finding] };
}

test("empty input produces no incidents", () => {
  assert.deepEqual(correlateEvents([], config), []);
});

test("events without findings do not create incidents", () => {
  assert.deepEqual(correlateEvents([{ event: event("e1", "2026-11-20T10:00:00Z"), findings: [] }], config), []);
});

test("related events on one device are correlated with a timeline and reasons", () => {
  const incidents = correlateEvents(
    [
      correlated("e1", "2026-11-20T10:00:00Z"),
      correlated("e2", "2026-11-20T10:00:30Z", "R3"),
    ],
    config
  );

  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].timeline.length, 2);
  assert.deepEqual(incidents[0].timeline.map((entry) => entry.ruleIds), [["R2"], ["R3"]]);
  assert.equal(incidents[0].severity, "high");
  assert.match(incidents[0].correlationReasons[0], /same device/);
  assert.ok(incidents[0].correlationReasons.some((reason) => reason.includes("R2, R3")));
  assert.equal(incidents[0].status, "open");
});

test("unrelated devices are never merged", () => {
  const incidents = correlateEvents(
    [
      correlated("e1", "2026-11-20T10:00:00Z", "R2", "sensor-001"),
      correlated("e2", "2026-11-20T10:00:10Z", "R2", "sensor-002"),
    ],
    config
  );

  assert.equal(incidents.length, 2);
  assert.notEqual(incidents[0].incidentId, incidents[1].incidentId);
});

test("events outside the time window form separate incidents", () => {
  const incidents = correlateEvents(
    [
      correlated("e1", "2026-11-20T10:00:00Z"),
      correlated("e2", "2026-11-20T10:03:00Z"),
      correlated("e3", "2026-11-20T10:03:10Z"),
    ],
    config
  );

  assert.equal(incidents.length, 2);
  assert.deepEqual(
    [...incidents]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((incident) => incident.timeline.length),
    [1, 2]
  );
});

test("duplicate events are counted once", () => {
  const first = correlated("e1", "2026-11-20T10:00:00Z");
  const incidents = correlateEvents([first, { ...first }], config);
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].findings.length, 1);
});

test("expired events are dropped relative to the reference time", () => {
  const incidents = correlateEvents(
    [correlated("old", "2026-11-20T09:00:00Z")],
    { ...config, referenceTime: new Date("2026-11-20T10:00:00Z") }
  );
  assert.deepEqual(incidents, []);
});

test("shared correlationId links events beyond the time window", () => {
  const incidents = correlateEvents(
    [
      correlated("e1", "2026-11-20T10:00:00Z", "R6", "sensor-001", "high", { correlationId: "session-7" }),
      correlated("e2", "2026-11-20T10:10:00Z", "R5", "sensor-001", "high", { correlationId: "session-7" }),
    ],
    config
  );

  assert.equal(incidents.length, 1);
  assert.ok(incidents[0].correlationReasons.some((reason) => reason.includes("session-7")));
});

test("incident identifiers are stable across identical runs", () => {
  const first = correlateEvents([correlated("e1", "2026-11-20T10:00:00Z")], config);
  const second = correlateEvents([correlated("e1", "2026-11-20T10:00:00Z")], config);
  assert.equal(first[0].incidentId, second[0].incidentId);
});

test("incident store tracks creation and updates without losing original data", () => {
  const store = new IncidentStore(config);
  const first = correlated("e1", "2026-11-20T10:00:00Z", "R2", "sensor-001", "high", { correlationId: "s1" });
  const second = correlated("e2", "2026-11-20T10:00:10Z", "R3", "sensor-001", "critical", { correlationId: "s1" });

  const created = store.ingest([first]);
  assert.equal(created[0].status, "open");
  assert.equal(created[0].revision, 1);

  const updated = store.ingest([second]);
  assert.equal(updated.length, 1);
  assert.equal(updated[0].incidentId, created[0].incidentId);
  assert.equal(updated[0].status, "updated");
  assert.equal(updated[0].revision, 2);
  assert.equal(updated[0].createdAt, created[0].createdAt);
  assert.equal(updated[0].timeline.length, 2);
  assert.equal(updated[0].findings.length, 2);
  assert.equal(updated[0].severity, "critical");
  assert.equal(store.get(created[0].incidentId)?.revision, 2);
});

test("multiple simultaneous incidents are tracked independently", () => {
  const store = new IncidentStore(config);
  const affected = store.ingest([
    correlated("e1", "2026-11-20T10:00:00Z", "R2", "sensor-001"),
    correlated("e2", "2026-11-20T10:00:01Z", "R6", "sensor-002"),
  ]);

  assert.equal(affected.length, 2);
  assert.equal(store.list().length, 2);
  assert.notEqual(affected[0].deviceId, affected[1].deviceId);
});
