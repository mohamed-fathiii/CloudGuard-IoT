/**
 * Deterministic, offline IoT scenario generator. Produces raw events that
 * satisfy the existing normalizer contract; no network traffic is generated.
 */

import type { EventSeverity, RawSecurityEvent, RiskLevel } from "./types.ts";

export type ScenarioId =
  | "normal_operation"
  | "mqtt_flood"
  | "failed_authentication"
  | "unauthorized_command"
  | "abnormal_payload"
  | "abnormal_connection_frequency"
  | "unauthorized_topic_access"
  | "identity_mismatch"
  | "schema_violation"
  | "combined_multi_stage";

export const SCENARIO_IDS: readonly ScenarioId[] = [
  "normal_operation",
  "mqtt_flood",
  "failed_authentication",
  "unauthorized_command",
  "abnormal_payload",
  "abnormal_connection_frequency",
  "unauthorized_topic_access",
  "identity_mismatch",
  "schema_violation",
  "combined_multi_stage",
];

export interface SimulationOptions {
  seed?: number;
  startTime?: string;
  deviceCount?: number;
}

export interface ExpectedOutcome {
  ruleIds: string[];
  minIncidents: number;
  maxRiskLevelAtLeast: RiskLevel;
  foreignDeviceMustStayClean: boolean;
}

export interface SimulationScenario {
  scenario: ScenarioId;
  description: string;
  events: RawSecurityEvent[];
  expected: ExpectedOutcome;
}

const RISK_RANK: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fixed-seed generator; identical options always produce identical events. */
export function generateScenario(
  scenario: ScenarioId,
  options: SimulationOptions = {}
): SimulationScenario {
  if (!SCENARIO_IDS.includes(scenario)) {
    throw new Error(`Unknown scenario: ${scenario}`);
  }

  const seed = options.seed ?? 42;
  const startMs = Date.parse(options.startTime ?? "2026-11-20T08:00:00Z");
  if (!Number.isFinite(startMs)) {
    throw new Error("Invalid startTime.");
  }
  const deviceCount = Math.max(1, options.deviceCount ?? 2);
  const devices = Array.from({ length: deviceCount }, (_, index) => `sensor-${String(index + 1).padStart(3, "0")}`);
  const target = devices[0];
  const random = mulberry32(seed + SCENARIO_IDS.indexOf(scenario) * 7919);
  const events: RawSecurityEvent[] = [];

  const add = (
    eventType: string,
    atSecond: number,
    metadata: Record<string, unknown>,
    severity: EventSeverity = "low",
    device = target
  ) => {
    events.push({
      eventId: `${scenario}-${device}-${events.length}`,
      sourceType: "simulated_iot",
      sourceId: device,
      eventType,
      severity,
      occurredAt: new Date(startMs + atSecond * 1000).toISOString(),
      description: `${eventType} for ${device}`,
      metadata: { clientId: device, ...metadata },
    });

    // Keep chronological order and sequential IDs across all devices.
    events.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
    events.forEach((event, index) => {
      event.eventId = `${scenario}-${event.sourceId}-${index}`;
    });
  };

  // Low-volume legitimate background traffic on every device, including the
  // target. This keeps device identity separation visible in every scenario.
  for (const device of devices) {
    add("CONNECTION_ATTEMPT", 0, { authenticationResult: "success" }, "low", device);
    for (let index = 0; index < 3; index += 1) {
      add(
        "MQTT_MESSAGE_RECEIVED",
        2 + index * 4,
        {
          topic: "building/temperature",
          payloadSizeBytes: 100 + Math.floor(random() * 100),
        },
        "low",
        device
      );
    }
  }

  const expectation = (
    ruleIds: string[],
    minIncidents: number,
    maxRiskLevelAtLeast: RiskLevel,
    foreignDeviceMustStayClean = ruleIds.length > 0
  ): ExpectedOutcome => ({ ruleIds, minIncidents, maxRiskLevelAtLeast, foreignDeviceMustStayClean });

  switch (scenario) {
    case "normal_operation":
      return {
        scenario,
        description: "Normal telemetry from all simulated devices.",
        events,
        expected: expectation([], 0, "low", false),
      };

    case "mqtt_flood": {
      for (let index = 0; index < 105; index += 1) {
        add(
          "MQTT_MESSAGE_RECEIVED",
          20 + index * 0.3,
          { topic: "building/temperature", payloadSizeBytes: 200 },
          "medium"
        );
      }
      return {
        scenario,
        description: "Target device floods the broker with MQTT messages.",
        events,
        expected: expectation(["R1"], 1, "low"),
      };
    }

    case "failed_authentication": {
      for (let index = 0; index < 5; index += 1) {
        add(
          "AUTHENTICATION_ATTEMPT",
          20 + index * 10,
          { authenticationResult: "failed" },
          "medium"
        );
      }
      return {
        scenario,
        description: "Repeated failed authentication from the target device.",
        events,
        expected: expectation(["R2"], 1, "low"),
      };
    }

    case "unauthorized_command": {
      add(
        "COMMAND_EXECUTION",
        20,
        { command: "DISABLE_ALARM", authorizationResult: "denied" },
        "high"
      );
      return {
        scenario,
        description: "Authorization service rejects a device command.",
        events,
        expected: expectation(["R3"], 1, "medium"),
      };
    }

    case "abnormal_payload": {
      add(
        "MQTT_MESSAGE_RECEIVED",
        20,
        { topic: "building/temperature", payloadSizeBytes: 5200 },
        "high"
      );
      return {
        scenario,
        description: "Trusted ingestion reports an oversized payload.",
        events,
        expected: expectation(["R4"], 1, "medium"),
      };
    }

    case "abnormal_connection_frequency": {
      for (let index = 0; index < 11; index += 1) {
        add("CONNECTION_ATTEMPT", 20 + index, { authenticationResult: "success" }, "high");
      }
      return {
        scenario,
        description: "Target device opens too many connections in one minute.",
        events,
        expected: expectation(["R5"], 1, "medium"),
      };
    }

    case "unauthorized_topic_access": {
      add(
        "MQTT_TOPIC_ACCESS",
        20,
        {
          topic: "admin/security/commands",
          accessType: "publish",
          authorizationResult: "denied",
        },
        "high"
      );
      return {
        scenario,
        description: "Broker denies access to an administrative MQTT topic.",
        events,
        // R3 also fires: the existing rule matches any denied authorization result.
        expected: expectation(["R3", "R6"], 1, "high"),
      };
    }

    case "identity_mismatch": {
      add(
        "IDENTITY_CHECK",
        20,
        { clientId: "sensor-999", authenticatedClientId: target },
        "high"
      );
      return {
        scenario,
        description: "Claimed identity differs from the authenticated identity.",
        events,
        expected: expectation(["R8"], 1, "medium"),
      };
    }

    case "schema_violation": {
      add(
        "SCHEMA_VALIDATION",
        20,
        {
          topic: "building/temperature",
          schemaId: "temperature-sensor",
          schemaVersion: "1.0",
          validationResult: "invalid",
          validationErrors: [{ field: "temperature", expected: "number", actual: "string" }],
        },
        "medium"
      );
      return {
        scenario,
        description: "Trusted validation reports a schema violation.",
        events,
        expected: expectation(["R7"], 1, "low"),
      };
    }

    case "combined_multi_stage": {
      const correlationId = "multistage-1";
      for (let index = 0; index < 5; index += 1) {
        add(
          "AUTHENTICATION_ATTEMPT",
          20 + index * 2,
          { authenticationResult: "failed", correlationId },
          "medium"
        );
      }
      add(
        "MQTT_TOPIC_ACCESS",
        31,
        {
          topic: "admin/security/commands",
          accessType: "publish",
          authorizationResult: "denied",
          correlationId,
        },
        "high"
      );
      add(
        "COMMAND_EXECUTION",
        33,
        { command: "DISABLE_ALARM", authorizationResult: "denied", correlationId },
        "high"
      );
      for (let index = 0; index < 11; index += 1) {
        add(
          "CONNECTION_ATTEMPT",
          35 + index,
          { authenticationResult: "success", correlationId },
          "high"
        );
      }
      return {
        scenario,
        description: "Multi-stage activity: failed logins, denied topic access, denied command and connection burst.",
        events,
        expected: expectation(["R2", "R3", "R5", "R6"], 1, "high"),
      };
    }
  }
}

export function runAllScenarios(options: SimulationOptions = {}): SimulationScenario[] {
  return SCENARIO_IDS.map((scenario) => generateScenario(scenario, options));
}

/** Highest risk rank for a set of levels; used by demo assertions. */
export function highestRiskLevel(levels: RiskLevel[]): RiskLevel {
  return levels.reduce<RiskLevel>(
    (highest, level) => (RISK_RANK[level] > RISK_RANK[highest] ? level : highest),
    "low"
  );
}
