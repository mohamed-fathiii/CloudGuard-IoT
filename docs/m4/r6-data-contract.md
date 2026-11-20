# R6 — Unauthorized Topic Access

**Owner:** M4 — Detection & Risk Engine
**Rule ID:** R6
**Status:** Proposed — Not Yet Integrated

## 1. Purpose

Detects attempts by clients to access MQTT topics
they are not authorized to publish to or subscribe to.

## 2. Required Event Data

| Field                        | Description               |
| ---------------------------- | ------------------------- |
| eventType                    | MQTT_TOPIC_ACCESS         |
| metadata.clientId            | Verified client identity  |
| metadata.topic               | MQTT topic being accessed |
| metadata.accessType          | publish or subscribe      |
| metadata.authorizationResult | denied                    |

## 3. Example Event

{
"sourceType": "simulated_iot",
"sourceId": "sensor-001",
"eventType": "MQTT_TOPIC_ACCESS",
"occurredAt": "2026-11-20T08:00:00Z",
"metadata": {
"clientId": "sensor-001",
"topic": "admin/security/commands",
"accessType": "publish",
"authorizationResult": "denied"
}
}

This is a proposed internal event contract,
not an existing API contract.

## 4. Trust Requirements

- Client identity must come from trusted broker
  or authentication context.
- Authorization result must come from the broker
  or trusted authorization service.
- Device-supplied authorization results must not
  be trusted.
- The topic and access type must reflect the
  actual broker access attempt.

## 5. Detection Logic

Trigger R6 when:

- eventType equals MQTT_TOPIC_ACCESS.
- authorizationResult equals denied.
- clientId, topic, and accessType are valid.

## 6. Severity

High.

## 7. Implementation Status

| Component             | Status          |
| --------------------- | --------------- |
| R6 detection logic    | Not implemented |
| R6 unit tests         | Not implemented |
| Data contract         | Proposed        |
| MQTT ACL integration  | Not implemented |
| Simulator integration | Not implemented |
