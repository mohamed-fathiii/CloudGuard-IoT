import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractMlFeatures,
  ML_FEATURE_NAMES,
} from "../../lib/risk/ml-features.ts";
import type { NormalizedSecurityEvent } from "../../lib/risk/types.ts";

function event(
  eventType: string,
  metadata: Record<string, unknown>,
  second = 0
): NormalizedSecurityEvent {
  return {
    sourceType: "simulated_iot",
    sourceId: "sensor-001",
    eventType,
    severity: "low",
    description: eventType,
    occurredAt: new Date(Date.parse("2026-11-20T10:00:00Z") + second * 1000),
    metadata,
  };
}

test("feature names match the documented schema order", () => {
  assert.deepEqual(ML_FEATURE_NAMES, [
    "mqtt_messages_per_minute",
    "failed_auth_attempts",
    "connection_attempts_per_minute",
    "average_payload_size",
    "max_payload_size",
    "unique_topics_accessed",
    "unauthorized_access_attempts",
    "event_frequency",
    "connection_failure_ratio",
  ]);
});

test("feature extraction computes every declared feature from events", () => {
  const features = extractMlFeatures(
    [
      event("MQTT_MESSAGE_RECEIVED", { topic: "a", payloadSizeBytes: 100 }, 1),
      event("MQTT_MESSAGE_RECEIVED", { topic: "b", payloadSizeBytes: 300 }, 2),
      event("CONNECTION_ATTEMPT", { authenticationResult: "failed" }, 3),
      event("MQTT_TOPIC_ACCESS", { authorizationResult: "denied", topic: "c" }, 4),
    ],
    { windowMs: 60_000, now: new Date("2026-11-20T10:01:00Z") }
  );

  assert.deepEqual(features, {
    mqtt_messages_per_minute: 2,
    failed_auth_attempts: 1,
    connection_attempts_per_minute: 1,
    average_payload_size: 200,
    max_payload_size: 300,
    unique_topics_accessed: 3,
    unauthorized_access_attempts: 1,
    event_frequency: 4,
    connection_failure_ratio: 1,
  });
});

test("feature extraction ignores old events and handles empty windows", () => {
  const options = { windowMs: 60_000, now: new Date("2026-11-20T10:01:00Z") };
  const features = extractMlFeatures(
    [event("MQTT_MESSAGE_RECEIVED", { payloadSizeBytes: 100 }, -120)],
    options
  );
  assert.equal(features.event_frequency, 0);
  assert.equal(features.average_payload_size, 0);
  assert.equal(features.connection_failure_ratio, 0);
  assert.deepEqual(Object.keys(features), [...ML_FEATURE_NAMES]);
});
