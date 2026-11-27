/**
 * ================================================================
 *  Risk Engine v1.0 — مطابق لحدود الـ Physical Schema
 * ================================================================
 *  الحدود (مهم — تختلف عن اللي في الـ Frontend D-07):
 *    LOW       0–24
 *    MEDIUM   25–49
 *    HIGH     50–74
 *    CRITICAL 75–100
 *
 *  المصدر: Database-Design/Physical-Schema.docx
 *          ck_risk_assessment_level_matches_score
 *
 *  ⚠️ لو الفريق حسم الحدود على 0-29/30-59/60-79/80-100 (زي الـ Frontend)،
 *     التغيير بيحصل في مكانين بس: `RISK_BANDS` في schema.ts و`levelForScore`.
 *
 *  المخرج بيطابق أعمدة risk_assessment:
 *    risk_score (smallint)  risk_level (varchar)  explanation (text)
 *    factors (jsonb)        confidence_score       scoring_model_version
 */

import type { NewRiskAssessment, SecurityEvent, Severity } from "@/db/schema";

/* ---------- حدود الدرجة → المستوى ---------- */
export function levelForScore(score: number): Severity {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  if (s >= 75) return "CRITICAL";
  if (s >= 50) return "HIGH";
  if (s >= 25) return "MEDIUM";
  return "LOW";
}

/* ---------- أوزان القواعد (event_type من المفردات الرسمية) ---------- */
const BASE_WEIGHT: Record<string, number> = {
  MALWARE_DETECTED: 40,
  DATA_EXFILTRATION: 38,
  PRIVILEGE_ESCALATION: 35,
  UNAUTHORIZED_ACCESS: 32,
  FIRMWARE_TAMPERING: 30,
  FAILED_LOGIN: 22,
  PORT_SCAN: 20,
  ANOMALOUS_TRAFFIC: 20,
  CONFIGURATION_CHANGE: 15,
  OTHER: 12,
};

export interface RiskFactor {
  ruleId: string;
  label: string;
  points: number;
  detail: string;
}

export interface RiskInput {
  eventType: string;
  severity: Severity;              // اللي جاي من الحدث نفسه
  detectedAt: Date;
  createdAt: Date;                 // وقت التخزين — الفرق يكشف التأخير
  sourceIp?: string | null;
  destinationIp?: string | null;
  rawPayload?: Record<string, unknown> | null;
  deviceIsSimulated?: boolean;
  deviceLastSeenAt?: Date | null;
}

export interface RiskResult {
  riskScore: number;
  riskLevel: Severity;
  confidenceScore: number;
  scoringModelVersion: string;
  explanation: string;
  factors: { summary: string; factors: RiskFactor[]; baseScore: number };
}

/* ---------- المحرّك ---------- */
export function computeRisk(input: RiskInput): RiskResult {
  const factors: RiskFactor[] = [];
  let score = BASE_WEIGHT[input.eventType] ?? BASE_WEIGHT.OTHER;

  factors.push({
    ruleId: "BASE_EVENT_TYPE",
    label: `نوع الحدث ${input.eventType}`,
    points: score,
    detail: `الوزن الأساسي لنوع الحدث من جدول الأوزان`,
  });

  /* 1) خطورة الحدث المعلنة */
  const severityBoost: Record<Severity, number> = { LOW: 0, MEDIUM: 6, HIGH: 14, CRITICAL: 22 };
  const sev = severityBoost[input.severity] ?? 0;
  if (sev > 0) {
    score += sev;
    factors.push({
      ruleId: "DECLARED_SEVERITY",
      label: `الخطورة المعلنة ${input.severity}`,
      points: sev,
      detail: "زيادة حسب severity المرفقة مع الحدث",
    });
  }

  /* 2) تأخر الاستلام — مؤشر replay / tampering */
  const delaySec = (input.createdAt.getTime() - input.detectedAt.getTime()) / 1000;
  if (delaySec > 300) {
    const pts = Math.min(18, Math.round(delaySec / 60) * 3);
    score += pts;
    factors.push({
      ruleId: "DELAYED_INGEST",
      label: "تأخر الاستلام",
      points: pts,
      detail: `${Math.round(delaySec)} ثانية بين detected_at و created_at (الحد 300s)`,
    });
  } else if (delaySec < -60) {
    score += 15;
    factors.push({
      ruleId: "FUTURE_TIMESTAMP",
      label: "وقت مستقبلي",
      points: 15,
      detail: "الحدث بوقت مستقبلي — ساعة الجهاز متلاعب بها",
    });
  }

  /* 3) اتجاه الشبكة: مصدر خارجي → هدف داخلي */
  const isPrivate = (ip?: string | null) =>
    !ip || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.)/.test(ip);

  if (input.sourceIp && !isPrivate(input.sourceIp)) {
    score += 12;
    factors.push({
      ruleId: "EXTERNAL_SOURCE",
      label: "مصدر خارجي",
      points: 12,
      detail: `${input.sourceIp} خارج نطاق RFC1918`,
    });
  }
  if (input.sourceIp && input.destinationIp && !isPrivate(input.sourceIp) && isPrivate(input.destinationIp)) {
    score += 8;
    factors.push({
      ruleId: "INBOUND_TO_INTERNAL",
      label: "دخول للشبكة الداخلية",
      points: 8,
      detail: "حركة من الإنترنت لهدف داخلي",
    });
  }

  /* 4) محتوى الـ payload */
  const payload = input.rawPayload ?? {};
  if (payload.duplicate === true || payload.replayDetected === true) {
    score += 14;
    factors.push({
      ruleId: "REPLAY_SIGNAL",
      label: "إشارة إعادة إرسال",
      points: 14,
      detail: "raw_payload فيه duplicate/replayDetected = true",
    });
  }
  if (payload.signatureValid === false) {
    score += 12;
    factors.push({
      ruleId: "INVALID_SIGNATURE",
      label: "توقيع غير صالح",
      points: 12,
      detail: "signatureValid = false في الـ payload",
    });
  }

  /* 5) الجهاز مش متصل من فترة → بيانات قديمة تُعاد */
  if (input.deviceLastSeenAt) {
    const silentMin = (Date.now() - input.deviceLastSeenAt.getTime()) / 60000;
    if (silentMin > 60) {
      score += 6;
      factors.push({
        ruleId: "STALE_DEVICE",
        label: "جهاز صامت",
        points: 6,
        detail: `آخر ظهور ${Math.round(silentMin)} دقيقة`,
      });
    }
  }

  /* 6) تخفيف: بيئة محاكاة */
  if (input.deviceIsSimulated) {
    score = Math.round(score * 0.9);
    factors.push({
      ruleId: "SIMULATION_DAMPING",
      label: "تخفيف بيئة محاكاة",
      points: -Math.round(score * 0.1),
      detail: "الجهاز is_simulated = true → خفض 10% لتقليل الضوضاء",
    });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const riskLevel = levelForScore(score);

  /* الثقة: أعلى لما القواعد المتفعلة أكتر */
  const confidence = Math.min(99, 55 + factors.length * 7);

  const summary = `الدرجة ${score}/100 (${riskLevel}). ${factors.length} قاعدة متفعلة: ${factors
    .map((f) => `${f.ruleId}(${f.points > 0 ? "+" : ""}${f.points})`)
    .join("، ")}`;

  return {
    riskScore: score,
    riskLevel,
    confidenceScore: confidence,
    scoringModelVersion: "v1.0",
    explanation: summary,
    factors: { summary, factors, baseScore: BASE_WEIGHT[input.eventType] ?? BASE_WEIGHT.OTHER },
  };
}

/** Convenience: من صف security_event لـ row جاهز لـ risk_assessment */
export function assessEvent(
  event: SecurityEvent,
  device?: { isSimulated?: boolean; lastSeenAt?: Date | null } | null,
): Omit<NewRiskAssessment, "assessmentId"> {
  const r = computeRisk({
    eventType: event.eventType,
    severity: event.severity as Severity,
    detectedAt: event.detectedAt,
    createdAt: event.createdAt,
    sourceIp: event.sourceIp,
    destinationIp: event.destinationIp,
    rawPayload: (event.rawPayload as Record<string, unknown> | null) ?? null,
    deviceIsSimulated: device?.isSimulated,
    deviceLastSeenAt: device?.lastSeenAt ?? null,
  });

  return {
    eventId: event.eventId,
    riskScore: r.riskScore,
    riskLevel: r.riskLevel,
    confidenceScore: String(r.confidenceScore), // decimal بيتبعت نص
    scoringModelVersion: r.scoringModelVersion,
    explanation: r.explanation,
    factors: r.factors,
  };
}

/* ---------- Playbook: خطورة → إجراءات مقترحة ---------- */
export const RESPONSE_PLAYBOOK: Record<Severity, Array<{ actionType: string; description: string }>> = {
  LOW: [{ actionType: "NOTIFY_ADMIN", description: "إخطار المسؤول — لا إجراء تلقائي" }],
  MEDIUM: [
    { actionType: "NOTIFY_ADMIN", description: "إخطار المسؤول" },
    { actionType: "BLOCK_IP", description: "حجب مصدر الحركة المشبوه" },
  ],
  HIGH: [
    { actionType: "NOTIFY_ADMIN", description: "إخطار المسؤول" },
    { actionType: "ISOLATE_DEVICE", description: "عزل الجهاز عن الشبكة (محاكاة)" },
  ],
  CRITICAL: [
    { actionType: "ISOLATE_DEVICE", description: "عزل الجهاز فوراً (محاكاة)" },
    { actionType: "REVOKE_CREDENTIALS", description: "إبطال شهادات الجهاز" },
    { actionType: "NOTIFY_ADMIN", description: "إخطار المسؤول بأقصى أولوية" },
  ],
};

/** الحوادث بتتفتح لـ HIGH/CRITICAL فقط — تقليل الضوضاء */
export function shouldOpenIncident(level: Severity): boolean {
  return level === "HIGH" || level === "CRITICAL";
}
