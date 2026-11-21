import { test } from "node:test";
import assert from "node:assert/strict";
import { DetectionPipeline } from "../../lib/risk/pipeline.ts";
import { DeviceBaselineEngine } from "../../lib/risk/baseline.ts";
import { OptionalAiDetector, hybridRiskLevel } from "../../lib/risk/ai-integration.ts";
import type { DetectionRule } from "../../lib/risk/rules.ts";
import type { RawSecurityEvent } from "../../lib/risk/types.ts";

function raw(overrides: Partial<RawSecurityEvent> = {}): RawSecurityEvent {
  return {
    sourceType: "simulated_iot",
    sourceId: "sensor-001",
    eventType: "MQTT_MESSAGE_RECEIVED",
    severity: "low",
    occurredAt: "2026-11-20T10:00:00Z",
    metadata: { clientId: "sensor-001", payloadSizeBytes: 100 },
    ...overrides,
  };
}

test("pipeline rejects invalid events without throwing", async () => {
  const result = await new DetectionPipeline().assess({ eventType: "X" });
  assert.equal(result.success, false);
  assert.ok(result.errors.length > 0);
  assert.equal(result.risk, null);
});

test("pipeline normalizes an event and returns zero risk when no rule fires", async () => {
  const result = await new DetectionPipeline().assess(raw());
  assert.equal(result.success, true);
  assert.equal(result.event?.sourceId, "sensor-001");
  assert.equal(result.event?.occurredAt.toISOString(), "2026-11-20T10:00:00.000Z");
  assert.equal(result.risk?.score, 0);
  assert.equal(result.risk?.level, "low");
  assert.deepEqual(result.risk?.reasons, ["No security findings detected."]);
  assert.equal(result.baseline?.status, "learning");
  assert.equal(result.ai.enabled, false);
});

test("pipeline supplies recent event context to rules", async () => {
  const results: number[] = [];
  const spyRule: DetectionRule = {
    id: "SPY",
    title: "spy",
    description: "spy",
    enabled: true,
    evaluate: (context) => {
      results.push(context.recentEvents?.length ?? 0);
      return [];
    },
  };
  const pipeline = new DetectionPipeline({ rules: [spyRule] });

  await pipeline.assess(raw());
  await pipeline.assess(raw({ occurredAt: "2026-11-20T10:00:10Z" }));

  assert.deepEqual(results, [0, 1]);
});

test("pipeline gives rules baseline context without changing rule outcomes", async () => {
  const statuses: string[] = [];
  const rule: DetectionRule = {
    id: "CTX",
    title: "context",
    description: "context",
    enabled: true,
    evaluate: (context) => {
      statuses.push((context.baseline as { status: string }).status);
      return [];
    },
  };
  const baseline = new DeviceBaselineEngine({ minSamples: 2 });
  const pipeline = new DetectionPipeline({ rules: [rule], baseline });

  await pipeline.assess(raw());
  const second = await pipeline.assess(raw({ occurredAt: "2026-11-20T10:00:10Z" }));

  assert.deepEqual(statuses, ["uninitialized", "learning"]);
  assert.equal(second.baseline?.status, "established");
});

test("pipeline uses explicit recent events for count-based rules", async () => {
  const pipeline = new DetectionPipeline({ contextWindowMs: 300_000 });
  const history = Array.from({ length: 4 }, (_, index) => ({
    ...raw({
      eventType: "AUTHENTICATION_ATTEMPT",
      occurredAt: `2026-11-20T10:0${index}:00Z`,
      metadata: { clientId: "sensor-001", authenticationResult: "failed" },
    }),
  })).map((event, index) => ({
    ...event,
    eventId: `history-${index}`,
    severity: "low" as const,
    description: "auth",
    occurredAt: new Date(event.occurredAt),
    metadata: event.metadata ?? {},
  }));

  const result = await pipeline.assess(
    raw({
      eventType: "AUTHENTICATION_ATTEMPT",
      occurredAt: "2026-11-20T10:04:00Z",
      metadata: { clientId: "sensor-001", authenticationResult: "failed" },
    }),
    { recentEvents: history }
  );

  assert.deepEqual(result.risk?.findings.map((finding) => finding.ruleId), ["R2"]);
  assert.ok(result.risk!.score > 0);
  assert.match(result.risk!.reasons[0], /R2 \(medium\)/);
});

test("event identifiers are deterministic across equal runs", async () => {
  const first = await new DetectionPipeline().assess(raw());
  const second = await new DetectionPipeline().assess(raw());
  assert.equal(first.event?.eventId, second.event?.eventId);
  assert.equal(first.event?.eventId, "evt-sensor-001-0");
});

test("AI disabled mode leaves risk and level untouched", async () => {
  const ai = new OptionalAiDetector({ enabled: false });
  const result = await new DetectionPipeline({ ai }).assess(raw());
  assert.equal(result.ai.enabled, false);
  assert.deepEqual(result.ai.findings, []);
  assert.equal(result.hybridLevel, result.risk?.level);
});

test("AI service failures never break rule-based detection", async () => {
  const ai = new OptionalAiDetector({
    enabled: true,
    timeoutMs: 20,
    infer: () => {
      throw new Error("service down");
    },
  });
  const result = await new DetectionPipeline({ ai }).assess(raw());
  assert.equal(result.success, true);
  assert.equal(result.ai.available, false);
  assert.match(result.ai.error ?? "", /service down/);
  assert.equal(result.hybridLevel, "low");
});

test("AI timeout is bounded", async () => {
  const ai = new OptionalAiDetector({
    enabled: true,
    timeoutMs: 5,
    infer: () => new Promise(() => {}),
  });
  const result = await new DetectionPipeline({ ai }).assess(raw());
  assert.equal(result.ai.available, false);
  assert.match(result.ai.error ?? "", /timed out/);
});

test("AI anomaly is distinguishable and does not change the risk score", async () => {
  const ai = new OptionalAiDetector({
    enabled: true,
    infer: () => ({
      anomaly: true,
      anomalyScore: -0.7,
      modelVersion: "1.0.0",
      predictedAt: "2026-11-20T10:00:00Z",
      features: { mqtt_messages_per_minute: 900 },
    }),
  });
  const baseline = new DeviceBaselineEngine({ minSamples: 1 });
  const pipeline = new DetectionPipeline({ ai, baseline });
  await pipeline.assess(raw());
  const result = await pipeline.assess(raw({ occurredAt: "2026-11-20T10:00:10Z" }));

  assert.equal(result.risk?.score, 0);
  assert.equal(result.hybridLevel, "medium");
  assert.equal(result.ai.findings[0].kind, "ai_anomaly");
  assert.equal(result.ai.findings[0].modelVersion, "1.0.0");
  assert.equal("ruleId" in result.ai.findings[0], false);
});

test("hybrid escalation requires a reliable baseline", () => {
  const ai = {
    enabled: true,
    available: true,
    findings: [{ kind: "ai_anomaly" as const }],
  } as never;
  assert.equal(hybridRiskLevel("low", ai, false), "low");
  assert.equal(hybridRiskLevel("high", ai, true), "critical");
  assert.equal(hybridRiskLevel("critical", ai, true), "critical");
});
