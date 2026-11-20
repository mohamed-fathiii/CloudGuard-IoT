
import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeEvent } from "../../lib/risk/event-normalizer.ts";

// A valid event used as our test baseline
const validEvent = {
  sourceType: "simulated_iot",
  sourceId: "sensor-001",
  eventType: "UNUSUAL_ACTIVITY",
  severity: "medium",
  description: "Unusual activity detected.",
  occurredAt: "2026-11-20T10:30:00Z",
  metadata: {
    temperature: 38.5,
  },
};

test("should accept a valid security event", () => {
  const result = normalizeEvent(validEvent);

  assert.equal(result.success, true);

  if (result.success) {
    assert.equal(result.event.sourceId, "sensor-001");
    assert.equal(result.event.severity, "medium");
    assert.ok(result.event.occurredAt instanceof Date);
  }
});

test("should reject an invalid source type", () => {
  const result = normalizeEvent({
    ...validEvent,
    sourceType: "unknown_source",
  });

  assert.equal(result.success, false);
});

test("should reject an empty source ID", () => {
  const result = normalizeEvent({
    ...validEvent,
    sourceId: "   ",
  });

  assert.equal(result.success, false);
});

test("should reject an invalid severity", () => {
  const result = normalizeEvent({
    ...validEvent,
    severity: "extreme",
  });

  assert.equal(result.success, false);
});

test("should reject an invalid timestamp", () => {
  const result = normalizeEvent({
    ...validEvent,
    occurredAt: "not-a-date",
  });

  assert.equal(result.success, false);
});

test("should reject a non-object payload", () => {
  const result = normalizeEvent(null);

  assert.equal(result.success, false);
});

test("should use eventType when description is empty", () => {
  const result = normalizeEvent({
    ...validEvent,
    description: "   ",
  });

  assert.equal(result.success, true);

  if (result.success) {
    assert.equal(result.event.description, "UNUSUAL_ACTIVITY");
  }
});
