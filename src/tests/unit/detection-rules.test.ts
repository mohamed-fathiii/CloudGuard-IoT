
import { test } from "node:test";
import assert from "node:assert/strict";
import { runDetectionRules } from "../../lib/risk/rules.ts";
import type { NormalizedSecurityEvent } from "../../lib/risk/types.ts";
import {
  repeatedAuthenticationRule,
  unauthorizedCommandRule,
  abnormalPayloadRule,
  abnormalConnectionFrequencyRule,
  unauthorizedTopicAccessRule,
  schemaViolationRule,
  clientIdentityMismatchRule,
  excessiveMqttMessagesRule,
} from "../../lib/risk/rule-implementations.ts";
// Create a reusable test event
function createEvent(
  overrides: Partial<NormalizedSecurityEvent> = {}
): NormalizedSecurityEvent {
  return {
    eventId: "event-current",
    sourceType: "simulated_iot",
    sourceId: "sensor-001",
    eventType: "AUTHENTICATION_ATTEMPT",
    severity: "medium",
    description: "Authentication attempt",
    occurredAt: new Date("2026-11-20T10:05:00Z"),
    metadata: {
      clientId: "client-001",
      authenticationResult: "failed",
    },
    ...overrides,
  };
}

// Generate historical failed authentication events
function createFailedAttempts(
  count: number,
  clientId = "client-001"
): NormalizedSecurityEvent[] {
  return Array.from({ length: count }, (_, index) =>
    createEvent({
      eventId: `event-${index}`,
      occurredAt: new Date(
        `2026-11-20T10:${String(index).padStart(2, "0")}:00Z`
      ),
      metadata: {
        clientId,
        authenticationResult: "failed",
      },
    })
  );
}

// R2 Tests

test("R2 should not trigger after only 4 failed attempts", () => {
  const currentEvent = createEvent();

  const result = repeatedAuthenticationRule.evaluate({
    event: currentEvent,
    recentEvents: createFailedAttempts(3),
  });

  assert.equal(result.length, 0);
});

test("R2 should trigger after 5 failed attempts", () => {
  const currentEvent = createEvent();

  const result = repeatedAuthenticationRule.evaluate({
    event: currentEvent,
    recentEvents: createFailedAttempts(4),
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].ruleId, "R2");
  assert.equal(result[0].severity, "medium");
});

test("R2 should not mix attempts from different clients", () => {
  const currentEvent = createEvent();

  const result = repeatedAuthenticationRule.evaluate({
    event: currentEvent,
    recentEvents: createFailedAttempts(4, "another-client"),
  });

  assert.equal(result.length, 0);
});

test("R2 should ignore attempts outside the 5-minute window", () => {
  const currentEvent = createEvent();

  const oldEvents = Array.from({ length: 4 }, (_, index) =>
    createEvent({
      eventId: `old-${index}`,
      occurredAt: new Date("2026-11-20T09:50:00Z"),
    })
  );

  const result = repeatedAuthenticationRule.evaluate({
    event: currentEvent,
    recentEvents: oldEvents,
  });

  assert.equal(result.length, 0);
});

test("R2 should ignore successful authentication attempts", () => {
  const currentEvent = createEvent({
    metadata: {
      clientId: "client-001",
      authenticationResult: "success",
    },
  });

  const result = repeatedAuthenticationRule.evaluate({
    event: currentEvent,
    recentEvents: createFailedAttempts(4),
  });

  assert.equal(result.length, 0);
});

// R3 Tests

test("R3 should detect an unauthorized command", () => {
  const event = createEvent({
    eventType: "COMMAND_EXECUTION",
    metadata: {
      command: "DISABLE_ALARM",
      authorizationResult: "denied",
    },
  });

  const result = unauthorizedCommandRule.evaluate({
    event,
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].ruleId, "R3");
  assert.equal(result[0].severity, "high");
});

test("R3 should ignore an authorized command", () => {
  const event = createEvent({
    eventType: "COMMAND_EXECUTION",
    metadata: {
      command: "READ_SENSOR",
      authorizationResult: "allowed",
    },
  });

  const result = unauthorizedCommandRule.evaluate({
    event,
  });

  assert.equal(result.length, 0);
});

test("Engine should collect findings from triggered rules", () => {
  const event = createEvent({
    eventType: "COMMAND_EXECUTION",
    metadata: {
      command: "DISABLE_ALARM",
      authorizationResult: "denied",
    },
  });

  const result = runDetectionRules(
    { event },
    [unauthorizedCommandRule]
  );

  assert.equal(result.findings.length, 1);
  assert.deepEqual(result.triggeredRules, ["R3"]);
});

test("Engine should skip disabled rules", () => {
  const event = createEvent({
    eventType: "COMMAND_EXECUTION",
    metadata: {
      command: "DISABLE_ALARM",
      authorizationResult: "denied",
    },
  });

  const disabledRule = {
    ...unauthorizedCommandRule,
    enabled: false,
  };

  const result = runDetectionRules(
    { event },
    [disabledRule]
  );

  assert.equal(result.findings.length, 0);
  assert.deepEqual(result.triggeredRules, []);
});

test("Engine should execute multiple rules", () => {
  const event = createEvent({
    eventType: "COMMAND_EXECUTION",
    metadata: {
      command: "DISABLE_ALARM",
      authorizationResult: "denied",
    },
  });

  const result = runDetectionRules(
    { event },
    [
      unauthorizedCommandRule,
      repeatedAuthenticationRule,
    ]
  );

  assert.equal(result.findings.length, 1);
  assert.deepEqual(result.triggeredRules, ["R3"]);
});

test("R4 should ignore a normal payload size", () => {
  const event = createEvent({
    metadata: {
      payloadSizeBytes: 1024,
    },
  });

  const result = abnormalPayloadRule.evaluate({ event });

  assert.equal(result.length, 0);
});

test("R4 should detect a payload exceeding 4096 bytes", () => {
  const event = createEvent({
    metadata: {
      payloadSizeBytes: 5000,
    },
  });

  const result = abnormalPayloadRule.evaluate({ event });

  assert.equal(result.length, 1);
  assert.equal(result[0].ruleId, "R4");
  assert.equal(result[0].severity, "high");
});

test("R4 should ignore a payload exactly at the configured limit", () => {
  const event = createEvent({
    metadata: {
      payloadSizeBytes: 4096,
    },
  });

  const result = abnormalPayloadRule.evaluate({ event });

  assert.equal(result.length, 0);
});

test("R4 should ignore negative payload sizes", () => {
  const event = createEvent({
    metadata: {
      payloadSizeBytes: -100,
    },
  });

  const result = abnormalPayloadRule.evaluate({ event });

  assert.equal(result.length, 0);
});

test("R4 should ignore non-numeric payload sizes", () => {
  const event = createEvent({
    metadata: {
      payloadSizeBytes: "5000",
    },
  });

  const result = abnormalPayloadRule.evaluate({ event });

  assert.equal(result.length, 0);
});
// R5: Abnormal Connection Frequency

function createConnectionAttempts(
  count: number,
  clientId = "client-001"
): NormalizedSecurityEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    ...createEvent(),
    eventId: `connection-${index}`,
    eventType: "CONNECTION_ATTEMPT",
    occurredAt: new Date(
      Date.parse("2026-11-20T10:00:00Z") +
      index * 5000
    ),
    metadata: {
      clientId,
    },
  }));
}

test("R5 should not trigger after 10 connection attempts", () => {
  const events = createConnectionAttempts(9);

  const currentEvent = {
    ...createEvent(),
    eventId: "connection-current",
    eventType: "CONNECTION_ATTEMPT",
    occurredAt: new Date("2026-11-20T10:00:45Z"),
    metadata: { clientId: "client-001" },
  };

  const findings = abnormalConnectionFrequencyRule.evaluate({
    event: currentEvent,
    recentEvents: events,
  });

  assert.equal(findings.length, 0);
});

test("R5 should trigger after 11 connection attempts", () => {
  const events = createConnectionAttempts(10);

  const currentEvent = {
    ...createEvent(),
    eventId: "connection-current",
    eventType: "CONNECTION_ATTEMPT",
    occurredAt: new Date("2026-11-20T10:00:50Z"),
    metadata: { clientId: "client-001" },
  };

  const findings = abnormalConnectionFrequencyRule.evaluate({
    event: currentEvent,
    recentEvents: events,
  });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, "R5");
  assert.equal(findings[0].severity, "high");
});

test("R5 should not mix connection attempts from different clients", () => {
  const events = createConnectionAttempts(10, "client-002");

  const currentEvent = {
    ...createEvent(),
    eventId: "connection-current",
    eventType: "CONNECTION_ATTEMPT",
    occurredAt: new Date("2026-11-20T10:00:50Z"),
    metadata: { clientId: "client-001" },
  };

  const findings = abnormalConnectionFrequencyRule.evaluate({
    event: currentEvent,
    recentEvents: events,
  });

  assert.equal(findings.length, 0);
});

test("R5 should ignore attempts outside the 60-second window", () => {
  const events = createConnectionAttempts(10);

  const currentEvent = {
    ...createEvent(),
    eventId: "connection-current",
    eventType: "CONNECTION_ATTEMPT",
    occurredAt: new Date("2026-11-20T10:02:00Z"),
    metadata: { clientId: "client-001" },
  };

  const findings = abnormalConnectionFrequencyRule.evaluate({
    event: currentEvent,
    recentEvents: events,
  });

  assert.equal(findings.length, 0);
});

test("R5 should ignore regular MQTT messages", () => {
  const events = createConnectionAttempts(15);

  const currentEvent = {
    ...createEvent(),
    eventId: "mqtt-message-001",
    eventType: "MQTT_MESSAGE_RECEIVED",
    occurredAt: new Date("2026-11-20T10:00:50Z"),
    metadata: { clientId: "client-001" },
  };

  const findings = abnormalConnectionFrequencyRule.evaluate({
    event: currentEvent,
    recentEvents: events,
  });

  assert.equal(findings.length, 0);
});
// R6: Unauthorized Topic Access

function createTopicAccessEvent(
  overrides: Partial<NormalizedSecurityEvent> = {}
): NormalizedSecurityEvent {
  return {
    ...createEvent(),
    eventId: "topic-access-001",
    eventType: "MQTT_TOPIC_ACCESS",
    metadata: {
      clientId: "sensor-001",
      topic: "admin/security/commands",
      accessType: "publish",
      authorizationResult: "denied",
    },
    ...overrides,
  };
}

test("R6 should detect unauthorized publish access", () => {
  const findings = unauthorizedTopicAccessRule.evaluate({
    event: createTopicAccessEvent(),
  });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, "R6");
  assert.equal(findings[0].severity, "high");
});

test("R6 should detect unauthorized subscribe access", () => {
  const event = createTopicAccessEvent({
    metadata: {
      clientId: "sensor-001",
      topic: "admin/security/commands",
      accessType: "subscribe",
      authorizationResult: "denied",
    },
  });

  const findings = unauthorizedTopicAccessRule.evaluate({
    event,
  });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, "R6");
});

test("R6 should ignore authorized topic access", () => {
  const event = createTopicAccessEvent({
    metadata: {
      clientId: "sensor-001",
      topic: "building/temperature",
      accessType: "publish",
      authorizationResult: "allowed",
    },
  });

  const findings = unauthorizedTopicAccessRule.evaluate({
    event,
  });

  assert.equal(findings.length, 0);
});

test("R6 should ignore events unrelated to MQTT topic access", () => {
  const event = createTopicAccessEvent({
    eventType: "MQTT_MESSAGE_RECEIVED",
  });

  const findings = unauthorizedTopicAccessRule.evaluate({
    event,
  });

  assert.equal(findings.length, 0);
});

test("R6 should ignore invalid access types", () => {
  const event = createTopicAccessEvent({
    metadata: {
      clientId: "sensor-001",
      topic: "admin/security/commands",
      accessType: "delete",
      authorizationResult: "denied",
    },
  });

  const findings = unauthorizedTopicAccessRule.evaluate({
    event,
  });

  assert.equal(findings.length, 0);
});// R7: Schema Violation

function createSchemaViolationEvent(
  overrides: Partial<NormalizedSecurityEvent> = {}
): NormalizedSecurityEvent {
  return {
    ...createEvent(),
    eventId: "schema-event-001",
    eventType: "SCHEMA_VALIDATION",
    metadata: {
      clientId: "sensor-001",
      schemaId: "temperature-sensor",
      schemaVersion: "1.0",
      validationResult: "invalid",
      validationErrors: [
        {
          field: "temperature",
          expected: "number",
          actual: "string",
        },
      ],
    },
    ...overrides,
  };
}

test("R7 should detect an invalid schema event", () => {
  const findings = schemaViolationRule.evaluate({
    event: createSchemaViolationEvent(),
  });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, "R7");
  assert.equal(findings[0].severity, "medium");
});

test("R7 should ignore valid schema events", () => {
  const event = createSchemaViolationEvent({
    metadata: {
      clientId: "sensor-001",
      schemaId: "temperature-sensor",
      schemaVersion: "1.0",
      validationResult: "valid",
      validationErrors: [],
    },
  });

  const findings = schemaViolationRule.evaluate({
    event,
  });

  assert.equal(findings.length, 0);
});

test("R7 should ignore events without validation errors", () => {
  const event = createSchemaViolationEvent({
    metadata: {
      clientId: "sensor-001",
      schemaId: "temperature-sensor",
      schemaVersion: "1.0",
      validationResult: "invalid",
      validationErrors: [],
    },
  });

  const findings = schemaViolationRule.evaluate({
    event,
  });

  assert.equal(findings.length, 0);
});

test("R7 should ignore events without schema identification", () => {
  const event = createSchemaViolationEvent({
    metadata: {
      validationResult: "invalid",
      validationErrors: [
        {
          field: "temperature",
          expected: "number",
          actual: "string",
        },
      ],
    },
  });

  const findings = schemaViolationRule.evaluate({
    event,
  });

  assert.equal(findings.length, 0);
});

test("R7 should ignore unrelated event types", () => {
  const event = createSchemaViolationEvent({
    eventType: "MQTT_MESSAGE_RECEIVED",
  });

  const findings = schemaViolationRule.evaluate({
    event,
  });

  assert.equal(findings.length, 0);
});


// R8: Client Identity Mismatch

function createIdentityMismatchEvent(
  overrides: Partial<NormalizedSecurityEvent> = {}
): NormalizedSecurityEvent {
  return {
    ...createEvent(),
    eventId: "identity-event-001",
    eventType: "IDENTITY_CHECK",
    metadata: {
      clientId: "sensor-002",
      authenticatedClientId: "sensor-001",
    },
    ...overrides,
  };
}

test("R8 should detect a client identity mismatch", () => {
  const findings = clientIdentityMismatchRule.evaluate({
    event: createIdentityMismatchEvent(),
  });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, "R8");
  assert.equal(findings[0].severity, "high");
});

test("R8 should ignore matching identities", () => {
  const event = createIdentityMismatchEvent({
    metadata: {
      clientId: "sensor-001",
      authenticatedClientId: "sensor-001",
    },
  });

  const findings = clientIdentityMismatchRule.evaluate({ event });

  assert.equal(findings.length, 0);
});

test("R8 should ignore events without authenticated identity", () => {
  const event = createIdentityMismatchEvent({
    metadata: {
      clientId: "sensor-002",
    },
  });

  const findings = clientIdentityMismatchRule.evaluate({ event });

  assert.equal(findings.length, 0);
});

test("R8 should ignore events without claimed identity", () => {
  const event = createIdentityMismatchEvent({
    metadata: {
      authenticatedClientId: "sensor-001",
    },
  });

  const findings = clientIdentityMismatchRule.evaluate({ event });

  assert.equal(findings.length, 0);
});

test("R8 should ignore unrelated event types", () => {
  const event = createIdentityMismatchEvent({
    eventType: "MQTT_MESSAGE_RECEIVED",
  });

  const findings = clientIdentityMismatchRule.evaluate({ event });

  assert.equal(findings.length, 0);
});

// R1: Excessive MQTT Messages

function createMqttMessageEvent(
  overrides: Partial<NormalizedSecurityEvent> = {}
): NormalizedSecurityEvent {
  return {
    ...createEvent(),
    eventId: "mqtt-event-001",
    eventType: "MQTT_MESSAGE_RECEIVED",
    metadata: {
      clientId: "sensor-001",
    },
    ...overrides,
  };
}

test("R1 should not trigger after 100 MQTT messages", () => {
  const currentEvent = createMqttMessageEvent();

  const recentEvents = Array.from({ length: 99 }, (_, index) => ({
    ...createMqttMessageEvent(),
    eventId: `mqtt-${index}`,
    occurredAt: new Date(
      currentEvent.occurredAt.getTime() - (index + 1) * 100
    ),
  }));

  const findings = excessiveMqttMessagesRule.evaluate({
    event: currentEvent,
    recentEvents,
  });

  assert.equal(findings.length, 0);
});

test("R1 should trigger after exceeding 100 MQTT messages", () => {
  const currentEvent = createMqttMessageEvent();

  const recentEvents = Array.from({ length: 100 }, (_, index) => ({
    ...createMqttMessageEvent(),
    eventId: `mqtt-${index}`,
    occurredAt: new Date(
      currentEvent.occurredAt.getTime() - (index + 1) * 100
    ),
  }));

  const findings = excessiveMqttMessagesRule.evaluate({
    event: currentEvent,
    recentEvents,
  });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, "R1");
  assert.equal(findings[0].severity, "medium");
});

test("R1 should not mix messages from different clients", () => {
  const currentEvent = createMqttMessageEvent();

  const recentEvents = Array.from({ length: 100 }, (_, index) => ({
    ...createMqttMessageEvent({
      metadata: {
        clientId: "sensor-002",
      },
    }),
    eventId: `other-client-${index}`,
  }));

  const findings = excessiveMqttMessagesRule.evaluate({
    event: currentEvent,
    recentEvents,
  });

  assert.equal(findings.length, 0);
});

test("R1 should ignore messages outside the 60-second window", () => {
  const currentEvent = createMqttMessageEvent();

  const recentEvents = Array.from({ length: 100 }, (_, index) => ({
    ...createMqttMessageEvent(),
    eventId: `old-mqtt-${index}`,
    occurredAt: new Date(
      currentEvent.occurredAt.getTime() - 61_000
    ),
  }));

  const findings = excessiveMqttMessagesRule.evaluate({
    event: currentEvent,
    recentEvents,
  });

  assert.equal(findings.length, 0);
});

test("R1 should ignore unrelated event types", () => {
  const event = createMqttMessageEvent({
    eventType: "CONNECTION_ATTEMPT",
  });

  const findings = excessiveMqttMessagesRule.evaluate({
    event,
  });

  assert.equal(findings.length, 0);
});
