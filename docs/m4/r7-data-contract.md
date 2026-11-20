# R7 — Schema Violation

**Owner:** M4 — Detection & Risk Engine  
**Rule ID:** R7  
**Status:** Proposed — Not Yet Integrated

## 1. Purpose

Detects incoming IoT events that violate the expected data schema for their device or message type.

## 2. Required Event Data

| Field                     | Description                |
| ------------------------- | -------------------------- |
| eventType                 | SCHEMA_VALIDATION          |
| metadata.clientId         | Verified client identity   |
| metadata.topic            | MQTT topic                 |
| metadata.schemaId         | Expected schema identifier |
| metadata.schemaVersion    | Schema version             |
| metadata.validationResult | valid or invalid           |
| metadata.validationErrors | Validation error details   |

## 3. Example Event

```json
{
  "sourceType": "simulated_iot",
  "sourceId": "sensor-001",
  "eventType": "SCHEMA_VALIDATION",
  "occurredAt": "2026-11-20T08:00:00Z",
  "metadata": {
    "clientId": "sensor-001",
    "topic": "building/temperature",
    "schemaId": "temperature-sensor",
    "schemaVersion": "1.0",
    "validationResult": "invalid",
    "validationErrors": [
      {
        "field": "temperature",
        "expected": "number",
        "actual": "string"
      }
    ]
  }
}
```

This is a proposed internal event contract, not an existing API contract.

## 4. Validation Responsibilities

The trusted ingestion or validation layer is responsible for:

- Selecting the expected schema.
- Validating the incoming payload.
- Recording the schema ID and version.
- Producing validation errors.
- Passing the validation result to M4.

M4 consumes the trusted validation result and generates a detection finding.

## 5. Trust Requirements

- Device-supplied validation results must not be trusted.
- Schema definitions must come from a trusted registry or configuration.
- Schema version must be identifiable.
- Validation must happen before the event is accepted as valid application data.
- Validation errors must not contain secrets or sensitive payload content.

## 6. Detection Logic

Trigger R7 when:

- eventType equals SCHEMA_VALIDATION.
- validationResult equals invalid.
- schemaId and schemaVersion are present.
- At least one validation error is recorded.

## 7. Severity

Medium.

Severity may be adjusted later according to the violation type and risk policy.

## 8. Implementation Status

| Component             | Status          |
| --------------------- | --------------- |
| R7 detection logic    | Not implemented |
| R7 unit tests         | Not implemented |
| Data contract         | Proposed        |
| Schema registry       | Not implemented |
| Ingestion validation  | Not implemented |
| Simulator integration | Not implemented |
