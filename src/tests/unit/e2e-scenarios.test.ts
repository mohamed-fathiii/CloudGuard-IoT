import { test } from "node:test";
import assert from "node:assert/strict";
import { IncidentStore } from "../../lib/risk/correlation.ts";
import { DetectionPipeline } from "../../lib/risk/pipeline.ts";
import { generateScenario, highestRiskLevel, SCENARIO_IDS } from "../../lib/risk/simulator.ts";
import type { RiskLevel } from "../../lib/risk/types.ts";

async function run(scenarioId: (typeof SCENARIO_IDS)[number], seed = 42) {
  const simulation = generateScenario(scenarioId, { seed });
  const pipeline = new DetectionPipeline();
  const store = new IncidentStore({ windowMs: 60_000 });
  const observed = new Set<string>();
  const foreignDevices = new Set<string>();
  const target = simulation.events[0].sourceId;
  const riskLevels: RiskLevel[] = [];

  for (const rawEvent of simulation.events) {
    const result = await pipeline.assess(rawEvent);
    assert.equal(result.success, true);
    riskLevels.push(result.risk!.level);
    for (const finding of result.risk!.findings) {
      observed.add(finding.ruleId);
      if (result.event!.sourceId !== target) foreignDevices.add(result.event!.sourceId);
    }
    if (result.risk!.findings.length > 0) {
      store.ingest([{ event: result.event!, findings: result.risk!.findings }]);
    }
  }

  return {
    simulation,
    observed,
    foreignDevices,
    incidents: store.list(),
    peakRisk: highestRiskLevel(riskLevels),
  };
}

for (const scenarioId of SCENARIO_IDS) {
  test(`end-to-end lifecycle: ${scenarioId}`, async () => {
    const result = await run(scenarioId);

    assert.deepEqual(
      [...result.observed].sort(),
      [...result.simulation.expected.ruleIds].sort(),
      `rules for ${scenarioId}`
    );
    assert.ok(result.incidents.length >= result.simulation.expected.minIncidents);
    if (result.simulation.expected.foreignDeviceMustStayClean) {
      assert.equal(result.foreignDevices.size, 0);
    }

    const acceptable: RiskLevel[] =
      result.simulation.expected.maxRiskLevelAtLeast === "low"
        ? ["low", "medium", "high", "critical"]
        : result.simulation.expected.maxRiskLevelAtLeast === "medium"
          ? ["medium", "high", "critical"]
          : ["high", "critical"];
    assert.ok(acceptable.includes(result.peakRisk), `peak risk ${result.peakRisk}`);

    for (const incident of result.incidents) {
      assert.match(incident.incidentId, /^inc-[0-9a-f]{8}$/);
      assert.ok(incident.timeline.length > 0);
      assert.ok(incident.correlationReasons.length > 0);
      assert.equal(incident.deviceId, "simulated_iot:sensor-001");
    }
  });
}

test("multi-stage scenario produces one explainable incident with a full timeline", async () => {
  const result = await run("combined_multi_stage");
  assert.equal(result.incidents.length, 1);
  assert.ok(result.incidents[0].timeline.length >= 4);
  assert.ok(
    result.incidents[0].correlationReasons.some((reason) => reason.includes("correlationId"))
  );
  assert.equal(result.incidents[0].status, "updated");
});

test("end-to-end results are deterministic across repeated runs", async () => {
  const first = await run("combined_multi_stage", 99);
  const second = await run("combined_multi_stage", 99);
  assert.deepEqual(
    first.incidents.map((incident) => incident.incidentId),
    second.incidents.map((incident) => incident.incidentId)
  );
  assert.deepEqual(first.incidents[0].timeline, second.incidents[0].timeline);
});
