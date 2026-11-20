
import {
  type EventSource,
  type EventSeverity,
  type NormalizedSecurityEvent,
} from "./types.ts";

// Possible values received from external systems
const VALID_SOURCES: EventSource[] = [
  "simulated_iot",
  "aws",
  "cloud",
  "unknown",
];

const VALID_SEVERITIES: EventSeverity[] = [
  "low",
  "medium",
  "high",
  "critical",
];

// Result returned by the normalizer
export type NormalizationResult =
  | {
      success: true;
      event: NormalizedSecurityEvent;
    }
  | {
      success: false;
      errors: string[];
    };

// Check whether a value is a plain object
function isObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

// Normalize and validate an incoming security event
export function normalizeEvent(
  input: unknown
): NormalizationResult {
  const errors: string[] = [];

  if (!isObject(input)) {
    return {
      success: false,
      errors: ["Event payload must be an object."],
    };
  }

  // Validate source type
  const sourceType = input.sourceType;

  if (
    typeof sourceType !== "string" ||
    !VALID_SOURCES.includes(sourceType as EventSource)
  ) {
    errors.push("Invalid or missing sourceType.");
  }

  // Validate source ID
  const sourceId =
    typeof input.sourceId === "string"
      ? input.sourceId.trim()
      : "";

  if (!sourceId) {
    errors.push("sourceId is required.");
  }

  // Validate event type
  const eventType =
    typeof input.eventType === "string"
      ? input.eventType.trim()
      : "";

  if (!eventType) {
    errors.push("eventType is required.");
  }

  // Validate severity
  const severity = input.severity;

  if (
    typeof severity !== "string" ||
    !VALID_SEVERITIES.includes(severity as EventSeverity)
  ) {
    errors.push("Invalid or missing severity.");
  }

  // Validate timestamp
  const occurredAt =
    typeof input.occurredAt === "string"
      ? new Date(input.occurredAt)
      : new Date(NaN);

  if (Number.isNaN(occurredAt.getTime())) {
    errors.push("occurredAt must be a valid date.");
  }

  // Validate optional description
  if (
    input.description !== undefined &&
    typeof input.description !== "string"
  ) {
    errors.push("description must be a string.");
  }

  // Validate optional metadata
  let metadata: Record<string, unknown> = {};

  if (input.metadata !== undefined) {
    if (!isObject(input.metadata)) {
      errors.push("metadata must be an object.");
    } else {
      metadata = input.metadata;
    }
  }

  // Return all validation errors together
  if (errors.length > 0) {
    return {
      success: false,
      errors,
    };
  }

  // Build the standardized event
  const event: NormalizedSecurityEvent = {
    sourceType: sourceType as EventSource,
    sourceId,
    eventType,
    severity: severity as EventSeverity,
    description:
      typeof input.description === "string" &&
      input.description.trim().length > 0
        ? input.description.trim()
        : eventType,
    occurredAt,
    metadata,
  };

  return {
    success: true,
    event,
  };
}
