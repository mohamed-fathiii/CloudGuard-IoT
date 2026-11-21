# R4 — Abnormal Payload Size

## Proposed Data Contract

**Owner:** M4 — Detection & Risk Engine  
**Rule ID:** R4  
**Status:** Proposed — Not Yet Integrated  
**Version:** 1.0

### 1. Purpose

R4 detects incoming messages whose actual payload size exceeds the configured maximum size.

The rule operates on a trusted payload-size measurement supplied by the ingestion layer. It does not calculate the size itself.

### 2. Data Ownership

The MQTT Broker or trusted ingestion layer is responsible for:

- Receiving the raw MQTT payload.
- Measuring its actual size in bytes before parsing or decoding it.
- Adding the measured size to the normalized event metadata.
- Ensuring that the measurement cannot be overridden by device-supplied metadata.

The IoT device must not be trusted to report its own payload size.

### 3. Proposed Metadata Field

| Property                   | Specification                      |
| -------------------------- | ---------------------------------- |
| Field                      | `metadata.payloadSizeBytes`        |
| Type                       | Number (non-negative safe integer) |
| Unit                       | Bytes                              |
| Required for R4 evaluation | Yes                                |
| Source                     | Trusted ingestion layer            |
| Device-controlled          | No                                 |

Example:

```json
{
  "sourceType": "simulated_iot",
  "sourceId": "sensor-001",
  "eventType": "MQTT_MESSAGE_RECEIVED",
  "occurredAt": "2026-11-20T08:00:00Z",
  "metadata": {
    "payloadSizeBytes": 5200
  }
}
```

This is a proposed internal event example, not an existing API contract.

### 4. Measurement Requirements

- Measure the raw payload in bytes.
- Calculate the size before JSON parsing or text decoding.
- Do not use string character count as a substitute for byte length.
- Do not accept a device-provided `payloadSizeBytes` as authoritative.
- Preserve the measured value when constructing the normalized event.

### 5. Detection Logic

Initial configuration:

```typescript
maxPayloadSizeBytes: 4096;
```

Detection condition:

```typescript
payloadSizeBytes > maxPayloadSizeBytes;
```

Expected behavior:

| Payload size | Expected result     |
| -----------: | ------------------- |
|         1024 | No finding          |
|         4096 | No finding          |
|         4097 | R4 triggered        |
|         5200 | R4 triggered        |
|      Missing | Not evaluated       |
|     Negative | Invalid measurement |
|      Decimal | Invalid measurement |
|  Non-numeric | Invalid measurement |

The 4096-byte threshold is provisional and must be configurable and reviewed against actual device and topic requirements.

### 6. Finding Specification

When triggered:

- Rule ID: `R4`
- Title: `Abnormal Payload Size`
- Severity: `high`
- Description: Includes the measured payload size and configured limit.

### 7. Missing or Invalid Measurements

A missing or invalid measurement must not be interpreted as a normal-sized payload.

R4 must not generate a finding based on an invalid measurement. The ingestion layer should separately report or reject the invalid event according to the system's validation policy.

### 8. Security Considerations

- The measured size must originate from a trusted ingestion component.
- Device-supplied size claims must not override the trusted measurement.
- The ingestion layer should enforce its own maximum accepted message size to protect resources before M4 evaluates the event.
- R4 is a detection rule, not a replacement for broker-level message-size limits.

### 9. Implementation Status

| Component                  | Status          |
| -------------------------- | --------------- |
| R4 detection logic         | Implemented     |
| R4 unit tests              | Passed          |
| Metadata contract          | Proposed        |
| MQTT ingestion measurement | Not implemented |
| Simulator integration      | Implemented     |
| End-to-end R4 test         | Passed          |

**Important:** Passing unit tests confirms the rule's current logic. It does not confirm that payload sizes are measured or supplied securely in the live ingestion pipeline.
