
import type {
  DetectionFinding,
  RiskAssessment,
  RiskLevel,
} from "./types.ts";

// Risk scoring configuration
export const RISK_SCORING_CONFIG = {
  severityWeights: {
    low: 10,
    medium: 20,
    high: 35,
    critical: 50,
  },
  halfLifeMinutes: 30,
  maxScore: 100,
  thresholds: {
    medium: 25,
    high: 50,
    critical: 75,
  },
} as const;

// Calculate time decay
function calculateDecay(
  detectedAt: Date,
  assessedAt: Date
): number {
  const ageMs = Math.max(
    0,
    assessedAt.getTime() - detectedAt.getTime()
  );

  const ageMinutes = ageMs / (1000 * 60);

  return Math.pow(
    0.5,
    ageMinutes / RISK_SCORING_CONFIG.halfLifeMinutes
  );
}

// Determine risk level
function getRiskLevel(score: number): RiskLevel {
  const thresholds = RISK_SCORING_CONFIG.thresholds;

  if (score >= thresholds.critical) return "critical";
  if (score >= thresholds.high) return "high";
  if (score >= thresholds.medium) return "medium";

  return "low";
}

// Remove duplicate findings
function deduplicateFindings(
  findings: DetectionFinding[]
): DetectionFinding[] {
  const seen = new Set<string>();

  return findings.filter((finding) => {
    // Keep findings without eventId to avoid false deduplication
    if (!finding.eventId) {
      return true;
    }

    const identity = `${finding.ruleId}:${finding.eventId}`;

    if (seen.has(identity)) {
      return false;
    }

    seen.add(identity);
    return true;
  });
}

// Main scoring function
export function calculateRiskScore(
  findings: DetectionFinding[],
  assessedAt: Date = new Date()
): RiskAssessment {
  const uniqueFindings = deduplicateFindings(findings);

  let totalScore = 0;
  const reasons: string[] = [];

  for (const finding of uniqueFindings) {
    const basePoints =
      RISK_SCORING_CONFIG.severityWeights[finding.severity];

    const decay = calculateDecay(
      finding.detectedAt,
      assessedAt
    );

    const contribution = basePoints * decay;
    totalScore += contribution;

    reasons.push(
      `${finding.ruleId} (${finding.severity}): ` +
      `${contribution.toFixed(2)} risk points - ${finding.title}`
    );
  }

  const cappedScore = Math.min(
    RISK_SCORING_CONFIG.maxScore,
    totalScore
  );

  const finalScore = Number(cappedScore.toFixed(2));

  if (uniqueFindings.length === 0) {
    reasons.push("No security findings detected.");
  }

  if (totalScore > RISK_SCORING_CONFIG.maxScore) {
    reasons.push("Risk score capped at 100.");
  }

  return {
    score: finalScore,
    level: getRiskLevel(finalScore),
    reasons,
    findings: uniqueFindings,
    assessedAt,
  };
}
