/**
 * CloudGuard IoT - M4
 * Per-device behavioral baseline. Pure statistics, independent of rules and ML.
 */

import type { NormalizedSecurityEvent } from "./types.ts";

export type BaselineFeature =
  | "mqttMessagesPerMinute"
  | "averagePayloadSizeBytes"
  | "connectionAttemptsPerMinute"
  | "failedAuthenticationAttempts"
  | "uniqueTopicsAccessed";

export const BASELINE_FEATURES: readonly BaselineFeature[] = [
  "mqttMessagesPerMinute",
  "averagePayloadSizeBytes",
  "connectionAttemptsPerMinute",
  "failedAuthenticationAttempts",
  "uniqueTopicsAccessed",
];

export type BaselineStatus = "uninitialized" | "learning" | "established";

export interface DeviceObservation {
  mqttMessagesPerMinute?: number;
  averagePayloadSizeBytes?: number;
  connectionAttemptsPerMinute?: number;
  failedAuthenticationAttempts?: number;
  uniqueTopicsAccessed?: number;
}

export interface FeatureSummary {
  samples: number;
  mean: number | null;
  stdDev: number | null;
  min: number | null;
  max: number | null;
}

export interface DeviceBaseline {
  deviceId: string;
  status: BaselineStatus;
  samples: number;
  windowMs: number;
  minSamples: number;
  lastUpdatedAt: string | null;
  features: Record<BaselineFeature, FeatureSummary>;
  rejectedObservations: number;
}

export interface BaselineConfig {
  windowMs: number;
  minSamples: number;
  outlierSigma: number;
  deviationSigma: number;
  maxFeatureValue: number;
}

export const DEFAULT_BASELINE_CONFIG: BaselineConfig = {
  windowMs: 60 * 1000,
  minSamples: 20,
  outlierSigma: 3,
  deviationSigma: 3,
  maxFeatureValue: 100_000,
};

interface FeatureState {
  samples: number;
  mean: number;
  m2: number;
  min: number;
  max: number;
}

interface DeviceState {
  features: Map<BaselineFeature, FeatureState>;
  samples: number;
  lastUpdatedAt: Date | null;
  rejectedObservations: number;
}

function newFeatureState(): FeatureState {
  return { samples: 0, mean: 0, m2: 0, min: 0, max: 0 };
}

function newDeviceState(): DeviceState {
  return {
    features: new Map(),
    samples: 0,
    lastUpdatedAt: null,
    rejectedObservations: 0,
  };
}

function summarize(state: FeatureState | undefined): FeatureSummary {
  if (!state || state.samples === 0) {
    return { samples: 0, mean: null, stdDev: null, min: null, max: null };
  }

  return {
    samples: state.samples,
    mean: Number(state.mean.toFixed(4)),
    stdDev: Number(Math.sqrt(state.m2 / state.samples).toFixed(4)),
    min: Number(state.min.toFixed(4)),
    max: Number(state.max.toFixed(4)),
  };
}

function isValidValue(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
  );
}

/**
 * Mean, population standard deviation, min and max are updated with Welford's
 * online algorithm; no raw observation history is retained.
 */
export class DeviceBaselineEngine {
  private readonly devices = new Map<string, DeviceState>();
  private readonly config: BaselineConfig;

  constructor(config: Partial<BaselineConfig> = {}) {
    this.config = { ...DEFAULT_BASELINE_CONFIG, ...config };
    if (this.config.minSamples < 1 || this.config.maxFeatureValue <= 0) {
      throw new Error("Invalid baseline configuration.");
    }
  }

  get(deviceId: string): DeviceBaseline {
    const state = this.devices.get(deviceId);
    const samples = state?.samples ?? 0;
    const status: BaselineStatus =
      samples === 0
        ? "uninitialized"
        : samples >= this.config.minSamples
          ? "established"
          : "learning";

    const features = {} as Record<BaselineFeature, FeatureSummary>;
    for (const feature of BASELINE_FEATURES) {
      features[feature] = summarize(state?.features.get(feature));
    }

    return {
      deviceId,
      status,
      samples,
      windowMs: this.config.windowMs,
      minSamples: this.config.minSamples,
      lastUpdatedAt: state?.lastUpdatedAt?.toISOString() ?? null,
      features,
      rejectedObservations: state?.rejectedObservations ?? 0,
    };
  }

  /** Context handed to detection rules; it never mutates R1-R8 decisions. */
  getContext(deviceId: string): Record<string, unknown> {
    const baseline = this.get(deviceId);
    return {
      deviceId: baseline.deviceId,
      status: baseline.status,
      samples: baseline.samples,
      windowMs: baseline.windowMs,
      features: baseline.features,
    };
  }

  /**
   * Updates one device with one observation. Observations from confirmed
   * malicious activity, invalid values and values above the configured cap
   * are rejected. Once established, outliers are clipped to mean +/- 3 sigma
   * so a single burst cannot poison the baseline.
   */
  observe(
    deviceId: string,
    observation: DeviceObservation,
    options: { confirmedMalicious?: boolean; observedAt?: Date } = {}
  ): DeviceBaseline {
    if (typeof deviceId !== "string" || deviceId.trim().length === 0) {
      throw new Error("deviceId is required.");
    }

    const id = deviceId.trim();
    const state = this.devices.get(id) ?? newDeviceState();

    if (options.confirmedMalicious) {
      state.rejectedObservations += 1;
      this.devices.set(id, state);
      return this.get(id);
    }

    const observedAt = options.observedAt ?? new Date();
    const established = state.samples >= this.config.minSamples;
    let accepted = false;

    for (const feature of BASELINE_FEATURES) {
      const raw = observation[feature];
      if (raw === undefined) {
        continue;
      }
      if (!isValidValue(raw) || raw > this.config.maxFeatureValue) {
        state.rejectedObservations += 1;
        continue;
      }

      let value = raw;
      const current = state.features.get(feature);

      if (established && current && current.samples > 0) {
        const stdDev = Math.sqrt(current.m2 / current.samples);
        const limit = this.config.outlierSigma * stdDev;
        value = Math.max(
          Math.max(0, current.mean - limit),
          Math.min(current.mean + limit, value)
        );
      }

      const next = current ? { ...current } : newFeatureState();
      next.samples += 1;
      const delta = value - next.mean;
      next.mean += delta / next.samples;
      next.m2 += delta * (value - next.mean);
      next.min = next.samples === 1 ? value : Math.min(next.min, value);
      next.max = next.samples === 1 ? value : Math.max(next.max, value);
      state.features.set(feature, next);
      accepted = true;
    }

    if (accepted) {
      state.samples += 1;
      state.lastUpdatedAt = observedAt;
    }

    this.devices.set(id, state);
    return this.get(id);
  }

  /** Explain which observed values differ from an established baseline. */
  describeDeviations(
    deviceId: string,
    observation: DeviceObservation
  ): string[] {
    const baseline = this.get(deviceId);
    if (baseline.status !== "established") {
      return [
        `No established baseline for ${deviceId} ` +
        `(${baseline.samples}/${baseline.minSamples} samples required).`,
      ];
    }

    const deviations: string[] = [];
    for (const feature of BASELINE_FEATURES) {
      const value = observation[feature];
      const stats = baseline.features[feature];
      if (!isValidValue(value) || stats.mean === null || stats.stdDev === null) {
        continue;
      }

      const spread = stats.stdDev;
      const distance = Math.abs(value - stats.mean);
      const exceeded =
        spread > 0
          ? distance > this.config.deviationSigma * spread
          : distance > Math.max(1, stats.mean * 0.05);

      if (!exceeded) {
        continue;
      }

      deviations.push(
        spread > 0
          ? `${feature}=${value} is ${(distance / spread).toFixed(2)}σ from normal ` +
            `(mean=${stats.mean}, σ=${stats.stdDev}).`
          : `${feature}=${value} differs from normal ${stats.mean} (no observed variance).`
      );
    }

    return deviations;
  }
}

/**
 * Derives one observation from already-normalized events belonging to one
 * device. Rates use the configured window; absent features stay absent.
 */
export function observationFromEvents(
  events: NormalizedSecurityEvent[],
  options: { windowMs: number; now: Date }
): DeviceObservation | null {
  const nowMs = options.now.getTime();
  const relevant = events.filter((event) => {
    const time = event.occurredAt.getTime();
    return time >= nowMs - options.windowMs && time <= nowMs;
  });

  if (relevant.length === 0) {
    return null;
  }

  const minutes = options.windowMs / 60_000;
  const mqttCount = relevant.filter(
    (event) => event.eventType === "MQTT_MESSAGE_RECEIVED"
  ).length;
  const connectionCount = relevant.filter(
    (event) => event.eventType === "CONNECTION_ATTEMPT"
  ).length;
  const failedAuthCount = relevant.filter(
    (event) => event.metadata.authenticationResult === "failed"
  ).length;
  const payloads = relevant
    .map((event) => event.metadata.payloadSizeBytes)
    .filter(isValidValue);
  const topics = new Set(
    relevant
      .map((event) => event.metadata.topic)
      .filter((topic): topic is string => typeof topic === "string" && topic.length > 0)
  );

  const observation: DeviceObservation = {
    mqttMessagesPerMinute: mqttCount / minutes,
    connectionAttemptsPerMinute: connectionCount / minutes,
    failedAuthenticationAttempts: failedAuthCount,
  };

  if (payloads.length > 0) {
    observation.averagePayloadSizeBytes =
      payloads.reduce((sum, value) => sum + value, 0) / payloads.length;
  }
  if (topics.size > 0) {
    observation.uniqueTopicsAccessed = topics.size;
  }

  return observation;
}
