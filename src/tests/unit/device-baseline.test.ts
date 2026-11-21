import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DeviceBaselineEngine,
  observationFromEvents,
  type DeviceObservation,
} from "../../lib/risk/baseline.ts";
import type { NormalizedSecurityEvent } from "../../lib/risk/types.ts";

function sequence(count: number, value: number): DeviceObservation[] {
  return Array.from({ length: count }, () => ({ mqttMessagesPerMinute: value }));
}

function event(overrides: Partial<NormalizedSecurityEvent> = {}): NormalizedSecurityEvent {
  return {
    sourceType: "simulated_iot",
    sourceId: "sensor-001",
    eventType: "MQTT_MESSAGE_RECEIVED",
    severity: "low",
    description: "MQTT message",
    occurredAt: new Date("2026-11-20T10:00:30Z"),
    metadata: { topic: "building/temperature", payloadSizeBytes: 100 },
    ...overrides,
  };
}

test("baseline starts uninitialized with no invented values", () => {
  const engine = new DeviceBaselineEngine();
  const baseline = engine.get("sensor-001");

  assert.equal(baseline.status, "uninitialized");
  assert.equal(baseline.samples, 0);
  assert.equal(baseline.lastUpdatedAt, null);
  for (const stats of Object.values(baseline.features)) {
    assert.equal(stats.mean, null);
    assert.equal(stats.stdDev, null);
  }
});

test("baseline moves from learning to established at the minimum sample count", () => {
  const engine = new DeviceBaselineEngine({ minSamples: 3 });

  for (const observation of sequence(2, 10)) engine.observe("sensor-001", observation);
  assert.equal(engine.get("sensor-001").status, "learning");

  engine.observe("sensor-001", { mqttMessagesPerMinute: 10 });
  assert.equal(engine.get("sensor-001").status, "established");
  assert.equal(engine.get("sensor-001").samples, 3);
});

test("baseline computes mean, standard deviation, min and max", () => {
  const engine = new DeviceBaselineEngine({ minSamples: 3 });
  for (const value of [8, 10, 12]) {
    engine.observe("sensor-001", { mqttMessagesPerMinute: value });
  }

  const stats = engine.get("sensor-001").features.mqttMessagesPerMinute;
  assert.equal(stats.mean, 10);
  assert.equal(Number(stats.stdDev.toFixed(4)), 1.633);
  assert.equal(stats.min, 8);
  assert.equal(stats.max, 12);
});

test("baselines are kept separate per device", () => {
  const engine = new DeviceBaselineEngine({ minSamples: 1 });
  engine.observe("sensor-001", { mqttMessagesPerMinute: 5 });
  engine.observe("sensor-002", { mqttMessagesPerMinute: 500 });

  assert.equal(
    engine.get("sensor-001").features.mqttMessagesPerMinute.mean,
    5
  );
  assert.equal(
    engine.get("sensor-002").features.mqttMessagesPerMinute.mean,
    500
  );
});

test("invalid observations are ignored safely", () => {
  const engine = new DeviceBaselineEngine({ minSamples: 2 });
  engine.observe("sensor-001", {
    mqttMessagesPerMinute: 10,
    averagePayloadSizeBytes: -5,
    connectionAttemptsPerMinute: Number.NaN,
    failedAuthenticationAttempts: "many" as unknown as number,
  });

  const baseline = engine.get("sensor-001");
  assert.equal(baseline.samples, 1);
  assert.equal(baseline.features.mqttMessagesPerMinute.samples, 1);
  assert.equal(baseline.features.averagePayloadSizeBytes.samples, 0);
  assert.equal(baseline.rejectedObservations, 3);
  assert.throws(() => engine.observe("", { mqttMessagesPerMinute: 1 }));
});

test("confirmed malicious activity never updates the baseline", () => {
  const engine = new DeviceBaselineEngine({ minSamples: 2 });
  engine.observe("sensor-001", { mqttMessagesPerMinute: 10 });
  engine.observe(
    "sensor-001",
    { mqttMessagesPerMinute: 9000 },
    { confirmedMalicious: true }
  );

  assert.equal(engine.get("sensor-001").samples, 1);
  assert.equal(engine.get("sensor-001").features.mqttMessagesPerMinute.max, 10);
  assert.equal(engine.get("sensor-001").rejectedObservations, 1);
});

test("implausible values are capped before an established baseline exists", () => {
  const engine = new DeviceBaselineEngine({ minSamples: 2, maxFeatureValue: 100 });
  engine.observe("sensor-001", { mqttMessagesPerMinute: 9000 });

  assert.equal(engine.get("sensor-001").features.mqttMessagesPerMinute.samples, 0);
  assert.equal(engine.get("sensor-001").rejectedObservations, 1);
});

test("outliers are clipped once the baseline is established", () => {
  const engine = new DeviceBaselineEngine({ minSamples: 3, outlierSigma: 1 });
  for (const value of [10, 10, 10]) {
    engine.observe("sensor-001", { mqttMessagesPerMinute: value });
  }
  engine.observe("sensor-001", { mqttMessagesPerMinute: 1000 });

  assert.equal(engine.get("sensor-001").features.mqttMessagesPerMinute.mean, 10);
});

test("deviations are explainable and only reported for established baselines", () => {
  const engine = new DeviceBaselineEngine({ minSamples: 3 });

  assert.match(
    engine.describeDeviations("sensor-001", { mqttMessagesPerMinute: 100 })[0],
    /No established baseline/
  );

  for (const value of [10, 10, 10, 10]) {
    engine.observe("sensor-001", { mqttMessagesPerMinute: value });
  }

  assert.deepEqual(
    engine.describeDeviations("sensor-001", { mqttMessagesPerMinute: 10 }),
    []
  );
  const deviations = engine.describeDeviations("sensor-001", {
    mqttMessagesPerMinute: 100,
  });
  assert.equal(deviations.length, 1);
  assert.match(deviations[0], /mqttMessagesPerMinute=100/);
  assert.match(deviations[0], /differs from normal 10/);
});

test("observationFromEvents derives rates, payloads and topics from events", () => {
  const now = new Date("2026-11-20T10:01:00Z");
  const events = [
    event({ occurredAt: new Date("2026-11-20T10:00:20Z") }),
    event({
      occurredAt: new Date("2026-11-20T10:00:40Z"),
      metadata: { topic: "admin/commands", payloadSizeBytes: 300 },
    }),
    event({
      eventType: "CONNECTION_ATTEMPT",
      occurredAt: new Date("2026-11-20T10:00:50Z"),
      metadata: { authenticationResult: "failed" },
    }),
    event({
      occurredAt: new Date("2026-11-19T10:00:50Z"),
      metadata: { topic: "old/topic", payloadSizeBytes: 9000 },
    }),
  ];

  const observation = observationFromEvents(events, { windowMs: 60_000, now });
  assert.deepEqual(observation, {
    mqttMessagesPerMinute: 2,
    connectionAttemptsPerMinute: 1,
    failedAuthenticationAttempts: 1,
    averagePayloadSizeBytes: 200,
    uniqueTopicsAccessed: 2,
  });
  assert.equal(
    observationFromEvents(events, {
      windowMs: 60_000,
      now: new Date("2026-11-21T10:01:00Z"),
    }),
    null
  );
});

test("context is serializable and contains no raw observations", () => {
  const engine = new DeviceBaselineEngine({ minSamples: 1 });
  engine.observe("sensor-001", { mqttMessagesPerMinute: 7 });
  const context = engine.getContext("sensor-001");

  assert.equal(JSON.parse(JSON.stringify(context)).deviceId, "sensor-001");
  assert.deepEqual(Object.keys(context), [
    "deviceId",
    "status",
    "samples",
    "windowMs",
    "features",
  ]);
});
