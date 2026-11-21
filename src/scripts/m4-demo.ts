/**
 * Local M4 demonstration: simulator -> normalization/detection/risk -> incident.
 * Run: node src/scripts/m4-demo.ts [seed]
 */

import { IncidentStore } from "../lib/risk/correlation.ts";
import { DetectionPipeline } from "../lib/risk/pipeline.ts";
import {
  generateScenario,
  highestRiskLevel,
  SCENARIO_IDS,
  type ScenarioId,
} from "../lib/risk/simulator.ts";
import type { RiskLevel } from "../lib/risk/types.ts";

async function runScenario(scenario: ScenarioId, seed: number): Promise<boolean> {
  const simulation = generateScenario(scenario, { seed });
  const pipeline = new DetectionPipeline();
  const store = new IncidentStore({ windowMs: 60_000 });
  const findingsByDevice = new Map<string, string[]>();
  const riskLevels: RiskLevel[] = [];
  const correlated: Parameters<typeof store.ingest>[0] = [];

  console.log(`\n=== ${scenario}: ${simulation.description}`);
  console.log(`Device activity: ${simulation.events.length} events from ${
    new Set(simulation.events.map((event) => event.sourceId)).size
  } device(s)`);

  for (const rawEvent of simulation.events) {
    const result = await pipeline.assess(rawEvent);
    if (!result.success || !result.event || !result.risk) {
      throw new Error(`Normalization failed in ${scenario}: ${result.errors.join("; ")}`);
    }
    riskLevels.push(result.risk.level);
    if (result.risk.findings.length > 0) {
      const rules = findingsByDevice.get(result.event.sourceId) ?? [];
      findingsByDevice.set(result.event.sourceId, [
        ...rules,
        ...result.risk.findings.map((finding) => finding.ruleId),
      ]);
      correlated.push({ event: result.event, findings: result.risk.findings });
    }
  }

  const incidents = store.ingest(correlated);
  const observedRules = new Set(
    [...findingsByDevice.values()].flat()
  );
  const expectedRules = new Set(simulation.expected.ruleIds);
  const maxRisk = highestRiskLevel(riskLevels);
  const foreignFindings = [...findingsByDevice.keys()].filter(
    (device) => device !== simulation.events[0].sourceId
  );

  console.log(
    `Detection: ${observedRules.size === 0 ? "no findings" : [...observedRules].sort().join(", ")}`
  );
  console.log(`Risk assessment (peak): ${maxRisk}`);
  console.log(
    `Correlated incidents: ${incidents.length}` +
      (incidents.length > 0
        ? ` -> ${incidents.map((incident) => `${incident.incidentId} (${incident.severity}, ${incident.timeline.length} events)`).join(", ")}`
        : "")
  );
  for (const incident of incidents) {
    for (const reason of incident.correlationReasons) {
      console.log(`  reason: ${reason}`);
    }
  }

  const missing = [...expectedRules].filter((rule) => !observedRules.has(rule));
  const unexpected = [...observedRules].filter((rule) => !expectedRules.has(rule));
  const ok =
    missing.length === 0 &&
    unexpected.length === 0 &&
    incidents.length >= simulation.expected.minIncidents &&
    (maxRisk === "low" ||
      ["medium", "high", "critical"].indexOf(maxRisk) >=
        ["medium", "high", "critical"].indexOf(simulation.expected.maxRiskLevelAtLeast)) &&
    (!simulation.expected.foreignDeviceMustStayClean || foreignFindings.length === 0);

  if (!ok) {
    console.error(
      `FAILED ${scenario}: missing=[${missing}] unexpected=[${unexpected}] ` +
        `incidents=${incidents.length} risk=${maxRisk} foreign=[${foreignFindings}]`
    );
  }
  return ok;
}

async function main(): Promise<void> {
  const seed = Number(process.argv[2] ?? 42);
  let passed = 0;
  for (const scenario of SCENARIO_IDS) {
    if (await runScenario(scenario, Number.isFinite(seed) ? seed : 42)) {
      passed += 1;
    }
  }
  console.log(`\n${passed}/${SCENARIO_IDS.length} scenarios passed.`);
  if (passed !== SCENARIO_IDS.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
