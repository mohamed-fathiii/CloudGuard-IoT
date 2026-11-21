import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateScenario,
  runAllScenarios,
  SCENARIO_IDS,
} from "../../lib/risk/simulator.ts";
import { normalizeEvent } from "../../lib/risk/event-normalizer.ts";

test("all required scenarios are defined", () => {
  assert.equal(SCENARIO_IDS.length, 10);
  assert.deepEqual(runAllScenarios({ seed: 1 }).map((scenario) => scenario.scenario), SCENARIO_IDS);
});

test("generated events are compatible with the existing normalizer", () => {
  for (const scenario of runAllScenarios()) {
    for (const raw of scenario.events) {
      const result = normalizeEvent(raw);
      assert.equal(result.success, true, `${scenario.scenario}: ${JSON.stringify(result)}`);
      assert.equal(result.success && result.event.sourceId, raw.sourceId);
    }
  }
});

test("scenarios are reproducible with a fixed seed", () => {
  assert.deepEqual(
    generateScenario("normal_operation", { seed: 7 }),
    generateScenario("normal_operation", { seed: 7 })
  );
  const payloadOf = (seed: number) =>
    generateScenario("normal_operation", { seed }).events.find(
      (event) => event.metadata?.payloadSizeBytes !== undefined
    )?.metadata?.payloadSizeBytes;
  const first = payloadOf(1);
  const second = payloadOf(2);
  assert.notEqual(first, second);
});

test("simulator supports multiple devices and consistent timestamps", () => {
  const scenario = generateScenario("combined_multi_stage", { deviceCount: 3 });
  const devices = new Set(scenario.events.map((event) => event.sourceId));
  assert.equal(devices.size, 3);

  const times = scenario.events.map((event) => Date.parse(event.occurredAt));
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  for (const event of scenario.events) {
    assert.match(event.eventId ?? "", /^combined_multi_stage-sensor-/);
    assert.equal(event.sourceType, "simulated_iot");
  }
});

test("normal operation declares no expected rules or incidents", () => {
  const scenario = generateScenario("normal_operation");
  assert.deepEqual(scenario.expected.ruleIds, []);
  assert.equal(scenario.expected.minIncidents, 0);
});

test("unknown scenarios and invalid start times are rejected", () => {
  assert.throws(() => generateScenario("unknown" as never));
  assert.throws(() => generateScenario("normal_operation", { startTime: "not-a-date" }));
});
