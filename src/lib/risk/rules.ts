
import type {
  NormalizedSecurityEvent,
  DetectionFinding,
} from "./types.ts";

// Context provided to detection rules
export interface DetectionContext {
  event: NormalizedSecurityEvent;

  // Optional historical information for behavior analysis
  recentEvents?: NormalizedSecurityEvent[];

  // Optional device baseline
  baseline?: Record<string, unknown>;
}

// Contract that every detection rule must follow
export interface DetectionRule {
  id: string;
  title: string;
  description: string;
  enabled: boolean;

  evaluate(
    context: DetectionContext
  ): DetectionFinding[];
}

// Detection engine result
export interface DetectionResult {
  findings: DetectionFinding[];
  triggeredRules: string[];
}

// Execute all enabled detection rules
export function runDetectionRules(
  context: DetectionContext,
  rules: DetectionRule[]
): DetectionResult {
  const findings: DetectionFinding[] = [];
  const triggeredRules: string[] = [];

  for (const rule of rules) {
    if (!rule.enabled) {
      continue;
    }

    const ruleFindings = rule.evaluate(context);

    if (ruleFindings.length > 0) {
      findings.push(...ruleFindings);
      triggeredRules.push(rule.id);
    }
  }

  return {
    findings,
    triggeredRules,
  };
}
