
import type {
  DetectionFinding,
  EventSeverity,
  NormalizedSecurityEvent,
} from "./types.ts";

import type {
  DetectionContext,
  DetectionRule,
} from "./rules.ts";

// Initial detection configuration
export const DETECTION_CONFIG = {
  excessiveMqttMessages: {
    threshold: 100,
    windowMs: 60 * 1000,
  },

  abnormalPayload: {
    maxPayloadSizeBytes: 4096,
  },

  repeatedAuthentication: {
    threshold: 5,
    windowMs: 5 * 60 * 1000,
  },

  abnormalConnectionFrequency: {
    threshold: 10,
    windowMs: 60 * 1000,
  },
} as const;

// Safely read a string from event metadata
function getMetadataString(
  event: NormalizedSecurityEvent,
  key: string
): string | undefined {
  const value = event.metadata[key];

  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

// Create a standardized detection finding
function createFinding(
  event: NormalizedSecurityEvent,
  ruleId: string,
  title: string,
  description: string,
  severity: EventSeverity
): DetectionFinding {
  return {
    ruleId,
    title,
    description,
    severity,
    detectedAt: new Date(),
    eventId: event.eventId,
  };
}

// R1: Excessive MQTT Messages
export const excessiveMqttMessagesRule: DetectionRule = {
  id: "R1",
  title: "Excessive MQTT Messages",
  description:
    "Detects an unusually high number of MQTT messages from the same client.",
  enabled: true,

  evaluate(context: DetectionContext): DetectionFinding[] {
    const currentEvent = context.event;

    // Only process incoming MQTT message events.
    if (currentEvent.eventType !== "MQTT_MESSAGE_RECEIVED") {
      return [];
    }

    const clientId = getMetadataString(
      currentEvent,
      "clientId"
    );

    if (!clientId) {
      return [];
    }

    const config = DETECTION_CONFIG.excessiveMqttMessages;

    const currentTime = currentEvent.occurredAt.getTime();
    const windowStart = currentTime - config.windowMs;

    // Exclude the current event from history to avoid double counting.
    const historicalEvents = (context.recentEvents ?? []).filter(
      (event) =>
        event !== currentEvent &&
        (!currentEvent.eventId ||
          event.eventId !== currentEvent.eventId)
    );

    // Include the current MQTT message.
    const eventsToAnalyze = [
      ...historicalEvents,
      currentEvent,
    ];

    const mqttMessages = eventsToAnalyze.filter((event) => {
      const eventClientId = getMetadataString(
        event,
        "clientId"
      );

      const eventTime = event.occurredAt.getTime();

      return (
        event.eventType === "MQTT_MESSAGE_RECEIVED" &&
        eventClientId === clientId &&
        eventTime >= windowStart &&
        eventTime <= currentTime
      );
    });

    if (mqttMessages.length <= config.threshold) {
      return [];
    }

    return [
      createFinding(
        currentEvent,
        "R1",
        "Excessive MQTT Messages",
        `Client ${clientId} sent ${mqttMessages.length} MQTT messages within 60 seconds, exceeding the configured limit of ${config.threshold}.`,
        "medium"
      ),
    ];
  },
};

// R2: Repeated Failed Authentication
export const repeatedAuthenticationRule: DetectionRule = {
  id: "R2",
  title: "Repeated Failed Authentication",
  description: "Detects repeated authentication failures from the same client.",
  enabled: true,

  evaluate(context: DetectionContext): DetectionFinding[] {
    const currentEvent = context.event;

    const clientId = getMetadataString(
      currentEvent,
      "clientId"
    );

    const authenticationResult = getMetadataString(
      currentEvent,
      "authenticationResult"
    );

    if (
      !clientId ||
      authenticationResult !== "failed"
    ) {
      return [];
    }

    const windowMs =
      DETECTION_CONFIG.repeatedAuthentication.windowMs;

    const threshold =
      DETECTION_CONFIG.repeatedAuthentication.threshold;

    const currentTime = currentEvent.occurredAt.getTime();
    const windowStart = currentTime - windowMs;

    // Exclude the current event from history to avoid double counting.
    const historicalEvents = (context.recentEvents ?? []).filter(
      (event) =>
        event !== currentEvent &&
        (!currentEvent.eventId ||
          event.eventId !== currentEvent.eventId)
    );

    // Include the current event in the count.
    const eventsToAnalyze = [
      ...historicalEvents,
      currentEvent,
    ];

    const failedAttempts = eventsToAnalyze.filter((event) => {
      const eventClientId = getMetadataString(event, "clientId");

      const result = getMetadataString(
        event,
        "authenticationResult"
      );

      const eventTime = event.occurredAt.getTime();

      return (
        eventClientId === clientId &&
        result === "failed" &&
        eventTime >= windowStart &&
        eventTime <= currentTime
      );
    });

    if (failedAttempts.length < threshold) {
      return [];
    }

    return [
      createFinding(
        currentEvent,
        "R2",
        "Repeated Failed Authentication",
        `Client ${clientId} generated ${failedAttempts.length} failed authentication attempts within 5 minutes.`,
        "medium"
      ),
    ];
  },
};

// R3: Unauthorized Command
export const unauthorizedCommandRule: DetectionRule = {
  id: "R3",
  title: "Unauthorized Command",
  description: "Detects commands rejected by the authorization service.",
  enabled: true,

  evaluate(context: DetectionContext): DetectionFinding[] {
    const event = context.event;

    const authorizationResult = getMetadataString(
      event,
      "authorizationResult"
    );

    if (authorizationResult !== "denied") {
      return [];
    }

    const command =
      getMetadataString(event, "command") ?? "Unknown command";

    return [
      createFinding(
        event,
        "R3",
        "Unauthorized Command",
        `An unauthorized command was rejected: ${command}.`,
        "high"
      ),
    ];
  },
};


// R4: Abnormal Payload Size
export const abnormalPayloadRule: DetectionRule = {
  id: "R4",
  title: "Abnormal Payload Size",
  description: "Detects incoming payloads exceeding the configured size limit.",
  enabled: true,

  evaluate(context: DetectionContext): DetectionFinding[] {
    const event = context.event;
    const payloadSize = event.metadata.payloadSizeBytes;

    if (
      typeof payloadSize !== "number" ||
      !Number.isFinite(payloadSize) ||
      payloadSize < 0
    ) {
      return [];
    }

    const maxSize =
      DETECTION_CONFIG.abnormalPayload.maxPayloadSizeBytes;

    if (payloadSize <= maxSize) {
      return [];
    }

    return [
      createFinding(
        event,
        "R4",
        "Abnormal Payload Size",
        `Payload size (${payloadSize} bytes) exceeded the configured limit (${maxSize} bytes).`,
        "high"
      ),
    ];
  },
};
// R5: Abnormal Connection Frequency
export const abnormalConnectionFrequencyRule: DetectionRule = {
  id: "R5",
  title: "Abnormal Connection Frequency",
  description:
    "Detects unusually frequent connection attempts from the same client.",
  enabled: true,

  evaluate(context: DetectionContext): DetectionFinding[] {
    const currentEvent = context.event;

    // Only process connection attempt events.
    if (currentEvent.eventType !== "CONNECTION_ATTEMPT") {
      return [];
    }

    const clientId = getMetadataString(
      currentEvent,
      "clientId"
    );

    if (!clientId) {
      return [];
    }

    const config =
      DETECTION_CONFIG.abnormalConnectionFrequency;

    const currentTime = currentEvent.occurredAt.getTime();
    const windowStart = currentTime - config.windowMs;

    // Exclude the current event from history to avoid double counting.
    const historicalEvents = (context.recentEvents ?? []).filter(
      (event) =>
        event !== currentEvent &&
        (!currentEvent.eventId ||
          event.eventId !== currentEvent.eventId)
    );

    // Include the current connection attempt.
    const eventsToAnalyze = [
      ...historicalEvents,
      currentEvent,
    ];

    const connectionAttempts = eventsToAnalyze.filter((event) => {
      const eventClientId = getMetadataString(
        event,
        "clientId"
      );

      const eventTime = event.occurredAt.getTime();

      return (
        event.eventType === "CONNECTION_ATTEMPT" &&
        eventClientId === clientId &&
        eventTime >= windowStart &&
        eventTime <= currentTime
      );
    });

    if (connectionAttempts.length <= config.threshold) {
      return [];
    }

    return [
      createFinding(
        currentEvent,
        "R5",
        "Abnormal Connection Frequency",
        `Client ${clientId} generated ${connectionAttempts.length} connection attempts within 60 seconds.`,
        "high"
      ),
    ];
  },
};
// R6: Unauthorized Topic Access
export const unauthorizedTopicAccessRule: DetectionRule = {
  id: "R6",
  title: "Unauthorized Topic Access",
  description:
    "Detects attempts to access MQTT topics rejected by the authorization service.",
  enabled: true,

  evaluate(context: DetectionContext): DetectionFinding[] {
    const event = context.event;

    // Only process MQTT topic access events.
    if (event.eventType !== "MQTT_TOPIC_ACCESS") {
      return [];
    }

    const clientId = getMetadataString(event, "clientId");
    const topic = getMetadataString(event, "topic");
    const accessType = getMetadataString(event, "accessType");
    const authorizationResult = getMetadataString(
      event,
      "authorizationResult"
    );

    if (
      !clientId ||
      !topic ||
      (accessType !== "publish" && accessType !== "subscribe") ||
      authorizationResult !== "denied"
    ) {
      return [];
    }

    return [
      createFinding(
        event,
        "R6",
        "Unauthorized Topic Access",
        `Client ${clientId} was denied ${accessType} access to MQTT topic: ${topic}.`,
        "high"
      ),
    ];
  },
};
// R7: Schema Violation
export const schemaViolationRule: DetectionRule = {
  id: "R7",
  title: "Schema Violation",
  description:
    "Detects incoming events that violate their expected data schema.",
  enabled: true,

  evaluate(context: DetectionContext): DetectionFinding[] {
    const event = context.event;

    // Only process schema validation events.
    if (event.eventType !== "SCHEMA_VALIDATION") {
      return [];
    }

    const schemaId = getMetadataString(event, "schemaId");
    const schemaVersion = getMetadataString(event, "schemaVersion");
    const validationResult = getMetadataString(
      event,
      "validationResult"
    );

    const validationErrors = event.metadata.validationErrors;

    if (
      !schemaId ||
      !schemaVersion ||
      validationResult !== "invalid" ||
      !Array.isArray(validationErrors) ||
      validationErrors.length === 0
    ) {
      return [];
    }

    return [
      createFinding(
        event,
        "R7",
        "Schema Violation",
        `Event violated schema ${schemaId} version ${schemaVersion}. ${validationErrors.length} validation error(s) detected.`,
        "medium"
      ),
    ];
  },
};

// R8: Client Identity Mismatch
export const clientIdentityMismatchRule: DetectionRule = {
  id: "R8",
  title: "Client Identity Mismatch",
  description:
    "Detects a mismatch between the claimed client ID and the authenticated client identity.",
  enabled: true,

  evaluate(context: DetectionContext): DetectionFinding[] {
    const event = context.event;

    // Only process identity verification events.
    if (event.eventType !== "IDENTITY_CHECK") {
      return [];
    }

    const clientId = getMetadataString(event, "clientId");

    const authenticatedClientId = getMetadataString(
      event,
      "authenticatedClientId"
    );

    // Both identities must be available.
    if (!clientId || !authenticatedClientId) {
      return [];
    }

    // No mismatch means no finding.
    if (clientId === authenticatedClientId) {
      return [];
    }

    return [
      createFinding(
        event,
        "R8",
        "Client Identity Mismatch",
        `Claimed client identity (${clientId}) does not match authenticated identity (${authenticatedClientId}).`,
        "high"
      ),
    ];
  },
};


// All currently implemented detection rules
export const detectionRules: DetectionRule[] = [
  excessiveMqttMessagesRule,
  repeatedAuthenticationRule,
  unauthorizedCommandRule,
  abnormalPayloadRule,
  abnormalConnectionFrequencyRule,
  unauthorizedTopicAccessRule,
  schemaViolationRule,
  clientIdentityMismatchRule,
];