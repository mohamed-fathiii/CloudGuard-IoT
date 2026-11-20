
import test from "node:test";
import assert from "node:assert/strict";

import { calculateRiskScore } from "../../lib/risk/score.ts";

import type { DetectionFinding } from "../../lib/risk/types.ts";

const assessedAt = new Date("2026-11-20T12:00:00.000Z");

function createFinding(
  ruleId: string,
  severity: DetectionFinding["severity"],
  eventId: string,
  detectedAt: Date = assessedAt
): DetectionFinding {
  return {
    ruleId,
    title: `Test finding ${ruleId}`,
    description: "Test security finding",
    severity,
    detectedAt,
    eventId,
  };
}

test("Low severity should produce 10 points", () => {
  const result = calculateRiskScore(
    [createFinding("R1", "low", "event-1")],
    assessedAt
  );

  assert.equal(result.score, 10);
  assert.equal(result.level, "low");
});

test("Medium severity should produce 20 points", () => {
  const result = calculateRiskScore(
    [createFinding("R2", "medium", "event-2")],
    assessedAt
  );

  assert.equal(result.score, 20);
  assert.equal(result.level, "low");
});

test("High severity should produce 35 points", () => {
  const result = calculateRiskScore(
    [createFinding("R3", "high", "event-3")],
    assessedAt
  );

  assert.equal(result.score, 35);
  assert.equal(result.level, "medium");
});

test("Critical severity should produce 50 points", () => {
  const result = calculateRiskScore(
    [createFinding("R4", "critical", "event-4")],
    assessedAt
  );

  assert.equal(result.score, 50);
  assert.equal(result.level, "high");
});

test("Risk score should decay by half after 30 minutes", () => {
  const detectedAt = new Date(
    assessedAt.getTime() - 30 * 60 * 1000
  );

  const result = calculateRiskScore(
    [createFinding("R1", "medium", "event-5", detectedAt)],
    assessedAt
  );

  assert.equal(result.score, 10);
});

test("Duplicate findings should not increase risk score", () => {
  const finding = createFinding("R3", "high", "event-6");

  const result = calculateRiskScore(
    [finding, { ...finding }],
    assessedAt
  );

  assert.equal(result.score, 35);
  assert.equal(result.findings.length, 1);
});

test("Risk score should never exceed 100", () => {
  const findings = [
    createFinding("R1", "critical", "event-7"),
    createFinding("R2", "critical", "event-8"),
    createFinding("R3", "critical", "event-9"),
  ];

  const result = calculateRiskScore(findings, assessedAt);

  assert.equal(result.score, 100);
  assert.equal(result.level, "critical");
});

test("Empty findings should return zero risk", () => {
  const result = calculateRiskScore([], assessedAt);

  assert.equal(result.score, 0);
  assert.equal(result.level, "low");
  assert.equal(result.findings.length, 0);
});

test("Future findings should not receive extra points", () => {
  const futureDate = new Date(
    assessedAt.getTime() + 60 * 1000
  );

  const result = calculateRiskScore(
    [createFinding("R4", "high", "event-10", futureDate)],
    assessedAt
  );

  assert.equal(result.score, 35);
});

test("Risk assessment should include explainable reasons", () => {
  const result = calculateRiskScore(
    [createFinding("R3", "high", "event-11")],
    assessedAt
  );

  assert.ok(
    result.reasons.some((reason) => reason.includes("R3"))
  );
});
test("Findings without eventId should not be deduplicated", () => {
  const finding1 = createFinding("R3", "high", "");
  const finding2 = createFinding("R3", "high", "");

  const result = calculateRiskScore(
    [finding1, finding2],
    assessedAt
  );

  assert.equal(result.findings.length, 2);
  assert.equal(result.score, 70);
});