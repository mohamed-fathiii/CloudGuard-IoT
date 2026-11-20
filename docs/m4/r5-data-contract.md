# R5 — Abnormal Connection Frequency

**Owner:** M4 — Detection & Risk Engine
**Rule ID:** R5
**Status:** Proposed — Not Yet Integrated

## 1. Purpose

Detects unusually frequent connection attempts
from the same client within a defined time window.

## 2. Proposed Configuration

- Maximum attempts: 10
- Time window: 60 seconds
- Trigger condition: More than 10 attempts.

These values are provisional and configurable.

## 3. Required Event Data

| Field             | Description                  |
| ----------------- | ---------------------------- |
| eventType         | CONNECTION_ATTEMPT           |
| metadata.clientId | Trusted client identity      |
| occurredAt        | Connection attempt timestamp |

## 4. Event Semantics

Each event represents one actual connection attempt.

MQTT messages sent through an existing connection
must not be counted as new connection attempts.

The ingestion layer is responsible for producing
connection-attempt events.

## 5. Trust Requirements

- Client identity must come from trusted broker
  or authentication context.
- Device-supplied identity must not be trusted
  without verification.
- Connection attempts must not be duplicated.
- Event timestamps must be validated.

## 6. Detection Logic

Group connection attempts by client identity.

Count attempts within the configured rolling
60-second window.

Trigger R5 when the count exceeds 10.

## 7. Expected Severity

High.

## 8. Implementation Status

| Component             | Status          |
| --------------------- | --------------- |
| R5 detection logic    | Not implemented |
| R5 unit tests         | Not implemented |
| Data contract         | Proposed        |
| MQTT integration      | Not implemented |
| Simulator integration | Not implemented |
