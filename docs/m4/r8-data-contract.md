# R8 – Client Identity Mismatch Data Contract

## Purpose

Detect attempts where a device claims an identity
different from the identity verified by the authentication layer.

## Event Type

IDENTITY_CHECK

## Required Metadata

| Field                 | Type   | Description                                           |
| --------------------- | ------ | ----------------------------------------------------- |
| clientId              | string | Identity claimed by the device                        |
| authenticatedClientId | string | Identity verified by the trusted authentication layer |

## Detection Logic

Trigger R8 when:

- Event type is IDENTITY_CHECK.
- Both identity fields are present and non-empty.
- clientId differs from authenticatedClientId.

## Finding

- Rule ID: R8
- Severity: High
- Title: Client Identity Mismatch

## Trust Requirements

authenticatedClientId MUST be populated by the trusted
authentication layer or MQTT broker.

It MUST NOT be accepted directly from device-supplied metadata.

## Status

Proposed ingestion contract. Detection logic, unit tests and simulator support are implemented;
trusted authentication/broker integration is not implemented.
