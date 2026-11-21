/**
 * Optional AI integration. Disabled by default; never throws into the rules
 * pipeline. AI findings and scores are kept separate from rule-based risk.
 */

import type { RiskLevel } from "./types.ts";

export interface AiRawPrediction {
  anomaly: boolean;
  anomalyScore: number;
  modelVersion: string;
  predictedAt: string;
  features: Record<string, number>;
}

export type AiInferenceFn = (input: {
  deviceId: string;
  features: Record<string, number>;
}) => AiRawPrediction | Promise<AiRawPrediction>;

export interface AiFinding {
  kind: "ai_anomaly";
  modelVersion: string;
  anomalyScore: number;
  predictedAt: string;
  features: Record<string, number>;
  explanation: string;
  detectedAt: Date;
}

export interface AiAssessment {
  enabled: boolean;
  available: boolean;
  findings: AiFinding[];
  error?: string;
}

export interface AiDetectorConfig {
  enabled?: boolean;
  timeoutMs?: number;
  infer?: AiInferenceFn;
}

const DISABLED: AiAssessment = {
  enabled: false,
  available: false,
  findings: [],
};

export class OptionalAiDetector {
  private readonly enabled: boolean;
  private readonly timeoutMs: number;
  private readonly infer?: AiInferenceFn;

  constructor(config: AiDetectorConfig = {}) {
    this.enabled = config.enabled === true;
    this.timeoutMs = config.timeoutMs ?? 2000;
    this.infer = config.infer;
  }

  async assess(input: {
    deviceId: string;
    features: Record<string, number>;
  }): Promise<AiAssessment> {
    if (!this.enabled || !this.infer) {
      return { ...DISABLED };
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`AI inference timed out after ${this.timeoutMs}ms.`)),
          this.timeoutMs
        );
      });
      const prediction = await Promise.race([this.infer(input), timeout]);
      clearTimeout(timer);

      if (
        typeof prediction.anomaly !== "boolean" ||
        !Number.isFinite(prediction.anomalyScore) ||
        typeof prediction.modelVersion !== "string"
      ) {
        throw new Error("AI inference returned an invalid prediction.");
      }

      return {
        enabled: true,
        available: true,
        findings: prediction.anomaly
          ? [
              {
                kind: "ai_anomaly",
                modelVersion: prediction.modelVersion,
                anomalyScore: prediction.anomalyScore,
                predictedAt: prediction.predictedAt,
                features: prediction.features,
                explanation:
                  "Isolation Forest flagged this device window as anomalous " +
                  `relative to normal training data (raw score ${prediction.anomalyScore.toFixed(4)}).`,
                detectedAt: new Date(),
              },
            ]
          : [],
      };
    } catch (error) {
      clearTimeout(timer);
      return {
        enabled: true,
        available: false,
        findings: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Hybrid policy: AI may raise the reported level by one step when the device
 * baseline is reliable and the model reported an anomaly. The numeric rule
 * score is never modified by AI; rule detection remains authoritative.
 */
export function hybridRiskLevel(
  ruleLevel: RiskLevel,
  ai: AiAssessment,
  baselineReliable: boolean
): RiskLevel {
  const order: RiskLevel[] = ["low", "medium", "high", "critical"];
  if (!ai.enabled || !ai.available || !baselineReliable || ai.findings.length === 0) {
    return ruleLevel;
  }

  const index = order.indexOf(ruleLevel);
  return order[Math.min(index + 1, order.length - 1)];
}
