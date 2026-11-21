/**
 * Optional AI bridge demo. Run from the repository root after training:
 *   python -m ml.evaluate --ml-dir ai   (see ai/README.md)
 *   node src/scripts/m4-ai-demo.ts
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";
import { OptionalAiDetector } from "../lib/risk/ai-integration.ts";
import { DeviceBaselineEngine } from "../lib/risk/baseline.ts";
import { DetectionPipeline } from "../lib/risk/pipeline.ts";
import { generateScenario } from "../lib/risk/simulator.ts";

const runProcess = promisify(execFile);
const aiDir = path.resolve(process.cwd(), "ai");
const modelPath = path.join(aiDir, "artifacts", "model.joblib");

async function infer(input: { deviceId: string; features: Record<string, number> }) {
  const { stdout } = await runProcess(
    "python",
    [
      path.join(aiDir, "predict.py"),
      "--model",
      modelPath,
      "--features",
      JSON.stringify(input.features),
    ],
    { cwd: aiDir, timeout: 3000 }
  );
  const result = JSON.parse(stdout);
  return {
    anomaly: result.anomaly === true,
    anomalyScore: result.anomaly_score,
    modelVersion: result.model_version,
    predictedAt: result.predicted_at,
    features: result.features,
  };
}

async function main(): Promise<void> {
  const available = fs.existsSync(modelPath);
  console.log(`AI model artifact: ${available ? "found" : "missing"} (${modelPath})`);
  const ai = new OptionalAiDetector({
    enabled: true,
    timeoutMs: 4000,
    infer: available ? infer : undefined,
  });
  // Short warmup only for this demo so the hybrid policy is visible.
  const pipeline = new DetectionPipeline({
    ai,
    baseline: new DeviceBaselineEngine({ minSamples: 5 }),
  });
  const scenario = generateScenario("combined_multi_stage", { seed: 42 });
  const last = scenario.events.at(-1)!;
  let result;
  for (const raw of scenario.events) result = await pipeline.assess(raw);

  console.log(`Events replayed: ${scenario.events.length} (last: ${last.eventType})`);
  console.log(`AI available: ${result!.ai.available}${result!.ai.error ? ` (${result!.ai.error})` : ""}`);
  console.log(`Rule-based risk score: ${result!.risk!.score} (${result!.risk!.level})`);
  console.log(`Hybrid reported level: ${result!.hybridLevel}`);
  console.log(
    `AI findings: ${
      result!.ai.findings.length === 0
        ? "none"
        : result!.ai.findings.map((finding) => `${finding.modelVersion} score=${finding.anomalyScore}`).join(", ")
    }`
  );
  console.log("Rule scoring is unchanged; AI evidence is reported separately.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
