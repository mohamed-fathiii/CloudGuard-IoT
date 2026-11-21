/**
 * M4 orchestration service: normalization -> baseline context -> R1-R8 ->
 * risk scoring -> optional AI. Correlation is intentionally a separate step.
 */

import {
  DeviceBaselineEngine,
  observationFromEvents,
  type DeviceBaseline,
} from "./baseline.ts";
import { normalizeEvent } from "./event-normalizer.ts";
import { extractMlFeatures } from "./ml-features.ts";
import { detectionRules } from "./rule-implementations.ts";
import { runDetectionRules, type DetectionRule } from "./rules.ts";
import { calculateRiskScore } from "./score.ts";
import {
  hybridRiskLevel,
  type AiAssessment,
  type OptionalAiDetector,
} from "./ai-integration.ts";
import type {
  NormalizedSecurityEvent,
  RiskAssessment,
  RiskLevel,
} from "./types.ts";

const DISABLED_AI: AiAssessment = {
  enabled: false,
  available: false,
  findings: [],
};

export interface PipelineConfig {
  baseline?: DeviceBaselineEngine;
  rules?: DetectionRule[];
  ai?: OptionalAiDetector;
  contextWindowMs?: number;
  maxHistory?: number;
}

export interface PipelineOptions {
  recentEvents?: NormalizedSecurityEvent[];
  now?: Date;
}

export interface SecurityAssessment {
  success: boolean;
  errors: string[];
  event: NormalizedSecurityEvent | null;
  risk: RiskAssessment | null;
  baseline: DeviceBaseline | null;
  baselineDeviations: string[];
  ai: AiAssessment;
  hybridLevel: RiskLevel | null;
}

export class DetectionPipeline {
  private readonly baseline: DeviceBaselineEngine;
  private readonly rules: DetectionRule[];
  private readonly ai?: OptionalAiDetector;
  private readonly contextWindowMs: number;
  private readonly maxHistory: number;
  private readonly history = new Map<string, NormalizedSecurityEvent[]>();
  private sequence = 0;

  constructor(config: PipelineConfig = {}) {
    this.baseline = config.baseline ?? new DeviceBaselineEngine();
    this.rules = config.rules ?? detectionRules;
    this.ai = config.ai;
    this.contextWindowMs = config.contextWindowMs ?? this.baseline.get("").windowMs;
    this.maxHistory = config.maxHistory ?? 500;
  }

  /** Deterministic for a given sequence of input events. */
  async assess(
    input: unknown,
    options: PipelineOptions = {}
  ): Promise<SecurityAssessment> {
    const failure: SecurityAssessment = {
      success: false,
      errors: [],
      event: null,
      risk: null,
      baseline: null,
      baselineDeviations: [],
      ai: DISABLED_AI,
      hybridLevel: null,
    };

    const normalized = normalizeEvent(input);
    if (!normalized.success) {
      return { ...failure, errors: normalized.errors };
    }

    const event: NormalizedSecurityEvent = {
      ...normalized.event,
      eventId:
        typeof (input as { eventId?: unknown }).eventId === "string" &&
        (input as { eventId: string }).eventId.trim().length > 0
          ? (input as { eventId: string }).eventId.trim()
          : `evt-${normalized.event.sourceId}-${this.sequence}`,
    };
    this.sequence += 1;

    const now = options.now ?? event.occurredAt;
    const recentEvents =
      options.recentEvents ?? this.history.get(event.sourceId) ?? [];
    const windowEvents = [...recentEvents, event];
    const observation = observationFromEvents(windowEvents, {
      windowMs: this.contextWindowMs,
      now,
    });

    // Compare against the baseline before this event is learned from.
    const deviations = observation
      ? this.baseline.describeDeviations(event.sourceId, observation)
      : [];
    const baselineBefore = this.baseline.get(event.sourceId);

    const detection = runDetectionRules(
      {
        event,
        recentEvents,
        baseline: this.baseline.getContext(event.sourceId),
      },
      this.rules
    );

    if (observation) {
      this.baseline.observe(event.sourceId, observation, {
        confirmedMalicious: detection.findings.length > 0,
        observedAt: now,
      });
    }

    const risk = calculateRiskScore(detection.findings, now);
    const ai = this.ai
      ? await this.ai.assess({
          deviceId: event.sourceId,
          features: extractMlFeatures(windowEvents, {
            windowMs: this.contextWindowMs,
            now,
          }),
        })
      : DISABLED_AI;

    const stored = [...(this.history.get(event.sourceId) ?? []), event];
    this.history.set(event.sourceId, stored.slice(-this.maxHistory));

    return {
      success: true,
      errors: [],
      event,
      risk,
      baseline: this.baseline.get(event.sourceId),
      baselineDeviations: deviations,
      ai,
      hybridLevel: hybridRiskLevel(
        risk.level,
        ai,
        baselineBefore.status === "established"
      ),
    };
  }
}
