/**
 * Feature extraction shared by the M4 pipeline and the Python ML module.
 * Ordering must stay identical to ai/ml/feature_schema.py.
 */

import type { NormalizedSecurityEvent } from "./types.ts";

export const ML_FEATURE_NAMES = [
  "mqtt_messages_per_minute",
  "failed_auth_attempts",
  "connection_attempts_per_minute",
  "average_payload_size",
  "max_payload_size",
  "unique_topics_accessed",
  "unauthorized_access_attempts",
  "event_frequency",
  "connection_failure_ratio",
] as const;

export type MlFeatureVector = Record<(typeof ML_FEATURE_NAMES)[number], number>;

export function extractMlFeatures(
  events: NormalizedSecurityEvent[],
  options: { windowMs: number; now: Date }
): MlFeatureVector {
  const nowMs = options.now.getTime();
  const relevant = events.filter((event) => {
    const time = event.occurredAt.getTime();
    return time >= nowMs - options.windowMs && time <= nowMs;
  });

  const minutes = options.windowMs / 60_000;
  const mqttCount = relevant.filter(
    (event) => event.eventType === "MQTT_MESSAGE_RECEIVED"
  ).length;
  const failedAuthCount = relevant.filter(
    (event) => event.metadata.authenticationResult === "failed"
  ).length;
  const connectionEvents = relevant.filter(
    (event) => event.eventType === "CONNECTION_ATTEMPT"
  );
  const payloads = relevant
    .map((event) => event.metadata.payloadSizeBytes)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value) && value >= 0
    );
  const topics = new Set(
    relevant
      .map((event) => event.metadata.topic)
      .filter((topic): topic is string => typeof topic === "string" && topic.length > 0)
  );
  const unauthorizedCount = relevant.filter(
    (event) => event.metadata.authorizationResult === "denied"
  ).length;
  const failedConnections = connectionEvents.filter(
    (event) => event.metadata.authenticationResult === "failed"
  ).length;

  return {
    mqtt_messages_per_minute: mqttCount / minutes,
    failed_auth_attempts: failedAuthCount,
    connection_attempts_per_minute: connectionEvents.length / minutes,
    average_payload_size:
      payloads.length === 0
        ? 0
        : payloads.reduce((sum, value) => sum + value, 0) / payloads.length,
    max_payload_size: payloads.length === 0 ? 0 : Math.max(...payloads),
    unique_topics_accessed: topics.size,
    unauthorized_access_attempts: unauthorizedCount,
    event_frequency: relevant.length / minutes,
    connection_failure_ratio:
      connectionEvents.length === 0 ? 0 : failedConnections / connectionEvents.length,
  };
}
