/**
 * ================================================================
 *  Incident Service — منطق العمل
 * ================================================================
 *  المسؤوليات:
 *   1) فتح حادث من تقييم خطورة + ربط الحدث في incident_event
 *   2) توليد إجراءات الاستجابة من الـ playbook (PENDING — مش تلقائي)
 *   3) تحديث حالة الجهاز المحاكاة: status = COMPROMISED
 *   4) الموافقة/الرفض على الإجراءات + الـ audit
 *
 *  قاعدة الأمان الأساسية (من API-INTEGRATION.md §6):
 *  "require approval before execution" — محدش بينفذ تلقائي غير
 *  العزل لهدف simulated وبـ score ≥ 85، وده مطبق في `maybeAutoIsolate`.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  incident,
  incidentEvent,
  responseAction,
  securityEvent,
  device,
  riskAssessment,
  auditLog,
  type Severity,
} from "@/db/schema";
import { RESPONSE_PLAYBOOK } from "@/lib/risk-engine";
import { audit } from "@/lib/audit";

/** السقف اللي فوقه العزل التلقائي مسموح (وبس لجهاز simulated) */
export const AUTO_ISOLATE_THRESHOLD = 85;

/**
 * يفتح حادث من تقييم + يربط الحدث + يولّد إجراءات PENDING.
 */
export async function openIncidentFromAssessment(args: {
  eventId: string;
  assessmentId: string;
  deviceId: string | null;
  resourceId: string | null;
  riskLevel: Severity;
  riskScore: number;
  title: string;
  explanation: string;
}) {
  const [created] = await db
    .insert(incident)
    .values({
      title: args.title.slice(0, 200),
      description: args.explanation,
      severity: args.riskLevel,
      status: "OPEN",
      riskScore: args.riskScore,
      assignedTo: null,
    })
    .returning();

  /* ربط الحدث — duplicate محمي بالـ composite PK */
  await db
    .insert(incidentEvent)
    .values({
      incidentId: created.incidentId,
      eventId: args.eventId,
      correlationReason: `تقييم آلي ${args.assessmentId} بدرجة ${args.riskScore}`,
      linkedBy: "SYSTEM",
    })
    .onConflictDoNothing();

  /* توليد الإجراءات من الـ playbook — كلها PENDING */
  const playbook = RESPONSE_PLAYBOOK[args.riskLevel];
  const actions = await db
    .insert(responseAction)
    .values(
      playbook.map((p) => ({
        incidentId: created.incidentId,
        actionType: p.actionType,
        description: p.description,
        status: "PENDING" as const,
        isAutomated: false,
        performedBy: "SYSTEM",
      })),
    )
    .returning();

  /* العزل التلقائي: بس لجهاز simulated وبدرجة ≥ 85 */
  const auto = await maybeAutoIsolate({
    deviceId: args.deviceId,
    riskScore: args.riskScore,
    incidentId: created.incidentId,
  });

  return { incident: created, actions, autoIsolated: auto };
}

/**
 * المسار الوحيد اللي ممكن ينفذ إجراء من غير موافقة بشرية:
 *  1) target جهاز موجود و is_simulated = true
 *  2) risk_score ≥ 85
 *  3) النتيجة بتتسجل في audit_log بـ actorId = SYSTEM
 */
export async function maybeAutoIsolate(args: {
  deviceId: string | null;
  riskScore: number;
  incidentId: string;
}): Promise<boolean> {
  if (!args.deviceId) return false;
  if (args.riskScore < AUTO_ISOLATE_THRESHOLD) return false;

  const [d] = await db
    .select({ deviceId: device.deviceId, isSimulated: device.isSimulated })
    .from(device)
    .where(eq(device.deviceId, args.deviceId))
    .limit(1);

  if (!d || !d.isSimulated) return false;

  /* حالة العزل المحاكاة = device.status = 'COMPROMISED'
     (مفيش عمود simulation_state في الـ schema الرسمي — شوف DECISIONS-NEEDED #3) */
  await db
    .update(device)
    .set({ status: "COMPROMISED", updatedAt: new Date() })
    .where(eq(device.deviceId, args.deviceId));

  /* نسجل إجراء العزل كـ COMPLETED + isAutomated = true */
  await db.insert(responseAction).values({
    incidentId: args.incidentId,
    actionType: "ISOLATE_DEVICE",
    description: `عزل تلقائي لجهاز محاكاة بدرجة ${args.riskScore} (≥ ${AUTO_ISOLATE_THRESHOLD})`,
    status: "COMPLETED",
    isAutomated: true,
    performedBy: "SYSTEM",
    startedAt: new Date(),
    completedAt: new Date(),
  });

  await audit({
    actorType: "SYSTEM",
    actorId: "auto-response",
    action: "AUTO_ISOLATE_DEVICE",
    entityType: "DEVICE",
    entityId: args.deviceId,
    details: { riskScore: args.riskScore, threshold: AUTO_ISOLATE_THRESHOLD, mode: "SIMULATED" },
  });

  return true;
}

/**
 * الموافقة على إجراء — PENDING → IN_PROGRESS → COMPLETED.
 * الـ `mode` بيحدد إذا كان تنفيذ حقيقي ولا dry run، وده بيتسجل في الوصف.
 */
export async function approveAction(args: {
  actionId: string;
  performedBy: string;
  mode: "DRY_RUN" | "EXECUTED";
  comment?: string;
}) {
  const [existing] = await db
    .select()
    .from(responseAction)
    .where(eq(responseAction.actionId, args.actionId))
    .limit(1);

  if (!existing) throw new Error("NOT_FOUND: الإجراء غير موجود");
  if (existing.status !== "PENDING") {
    throw new Error(`CONFLICT: حالة الإجراء ${existing.status} — الموافقة متاحة لـ PENDING فقط`);
  }

  const note = args.comment ? ` | ملاحظة: ${args.comment}` : "";
  const [updated] = await db
    .update(responseAction)
    .set({
      status: "COMPLETED",
      performedBy: args.performedBy,
      startedAt: new Date(),
      completedAt: new Date(),
      description: `${existing.description} | نُفّذ بواسطة ${args.performedBy} (${args.mode})${note}`,
      updatedAt: new Date(),
    })
    .where(eq(responseAction.actionId, args.actionId))
    .returning();

  /* لو الإجراء عزل → نحدّث حالة الجهاز المحاكاة المرتبط بالحادث */
  if (existing.actionType === "ISOLATE_DEVICE") {
    const linked = await db
      .select({ deviceId: securityEvent.deviceId })
      .from(incidentEvent)
      .innerJoin(securityEvent, eq(securityEvent.eventId, incidentEvent.eventId))
      .where(eq(incidentEvent.incidentId, existing.incidentId));

    for (const row of linked) {
      if (!row.deviceId) continue;
      await db
        .update(device)
        .set({ status: "COMPROMISED", updatedAt: new Date() })
        .where(eq(device.deviceId, row.deviceId));
    }
  }

  await audit({
    actorType: "USER",
    actorId: args.performedBy,
    action: "APPROVE_RESPONSE_ACTION",
    entityType: "RESPONSE_ACTION",
    entityId: args.actionId,
    details: { actionType: existing.actionType, mode: args.mode, comment: args.comment ?? null },
  });

  return updated;
}

/** الرفض — PENDING → CANCELLED */
export async function rejectAction(args: { actionId: string; performedBy: string; comment?: string }) {
  const [existing] = await db
    .select()
    .from(responseAction)
    .where(eq(responseAction.actionId, args.actionId))
    .limit(1);

  if (!existing) throw new Error("NOT_FOUND: الإجراء غير موجود");
  if (existing.status !== "PENDING") {
    throw new Error(`CONFLICT: حالة الإجراء ${existing.status} — الرفض متاح لـ PENDING فقط`);
  }

  const [updated] = await db
    .update(responseAction)
    .set({
      status: "CANCELLED",
      performedBy: args.performedBy,
      description: `${existing.description} | مرفوض بواسطة ${args.performedBy}${
        args.comment ? `: ${args.comment}` : ""
      }`,
      updatedAt: new Date(),
    })
    .where(eq(responseAction.actionId, args.actionId))
    .returning();

  await audit({
    actorType: "USER",
    actorId: args.performedBy,
    action: "REJECT_RESPONSE_ACTION",
    entityType: "RESPONSE_ACTION",
    entityId: args.actionId,
    details: { actionType: existing.actionType, comment: args.comment ?? null },
  });

  return updated;
}

/* ================================================================
   استعلامات القراءة
   ================================================================ */

/** حادث بكل تفاصيله: الأحداث المرتبطة + تقييماتها + الإجراءات */
export async function getIncidentDetail(incidentId: string) {
  const [row] = await db.select().from(incident).where(eq(incident.incidentId, incidentId)).limit(1);
  if (!row) return null;

  const links = await db
    .select({
      eventId: securityEvent.eventId,
      eventType: securityEvent.eventType,
      title: securityEvent.title,
      severity: securityEvent.severity,
      detectedAt: securityEvent.detectedAt,
      deviceId: securityEvent.deviceId,
      deviceName: device.deviceName,
      correlationReason: incidentEvent.correlationReason,
      riskScore: sql<number>`coalesce((select ra.risk_score from risk_assessment ra where ra.event_id = ${securityEvent.eventId} order by ra.assessed_at desc limit 1), 0)::int`,
      riskLevel: sql<string | null>`(select ra.risk_level from risk_assessment ra where ra.event_id = ${securityEvent.eventId} order by ra.assessed_at desc limit 1)`,
    })
    .from(incidentEvent)
    .innerJoin(securityEvent, eq(securityEvent.eventId, incidentEvent.eventId))
    .leftJoin(device, eq(device.deviceId, securityEvent.deviceId))
    .where(eq(incidentEvent.incidentId, incidentId));

  const actions = await db
    .select()
    .from(responseAction)
    .where(eq(responseAction.incidentId, incidentId));

  return { ...row, events: links, actions };
}

/** سلسلة كاملة: حدث → تقييم → حادث → إجراءات (للـ forensics) */
export async function getEventTimeline(eventId: string) {
  const [event] = await db.select().from(securityEvent).where(eq(securityEvent.eventId, eventId)).limit(1);
  if (!event) return null;

  const assessments = await db
    .select()
    .from(riskAssessment)
    .where(eq(riskAssessment.eventId, eventId));

  const links = await db
    .select({ incidentId: incidentEvent.incidentId, correlationReason: incidentEvent.correlationReason })
    .from(incidentEvent)
    .where(eq(incidentEvent.eventId, eventId));

  const incidentIds = links.map((l) => l.incidentId);
  const incidents = incidentIds.length
    ? await db.select().from(incident).where(inArray(incident.incidentId, incidentIds))
    : [];

  const actions = incidentIds.length
    ? await db.select().from(responseAction).where(inArray(responseAction.incidentId, incidentIds))
    : [];

  return { event, assessments, incidents, actions };
}

/** إغلاق الحادث — لازم closed_at (CHECK في الداتابيز) */
export async function closeIncident(args: {
  incidentId: string;
  status: "RESOLVED" | "CLOSED" | "FALSE_POSITIVE";
  performedBy: string;
}) {
  const [updated] = await db
    .update(incident)
    .set({ status: args.status, closedAt: new Date(), updatedAt: new Date() })
    .where(eq(incident.incidentId, args.incidentId))
    .returning();

  await audit({
    actorType: "USER",
    actorId: args.performedBy,
    action: `CLOSE_INCIDENT_${args.status}`,
    entityType: "INCIDENT",
    entityId: args.incidentId,
    details: { status: args.status },
  });

  return updated;
}

/**
 * ملاحظات التحقيق — مفيش جدول `incident_note` في الـ ERD الرسمي،
 * فالملاحظات بتتخزن كسجلات `audit_log` بـ action = 'ADD_INCIDENT_NOTE'.
 * append-only بطبيعتها، ومحدش يقدر يعدّلها أو يمسحها — وده مطلوب
 * في FR-13 / NFR-SEC-04.
 */
export async function getIncidentNotes(incidentId: string) {
  const rows = await db
    .select({
      id: auditLog.auditId,
      author: auditLog.actorId,
      details: auditLog.details,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityType, "INCIDENT"),
        eq(auditLog.entityId, incidentId),
        eq(auditLog.action, "ADD_INCIDENT_NOTE"),
      ),
    )
    .orderBy(auditLog.createdAt);

  return rows.map((r) => ({
    id: r.id,
    author: r.author ?? "unknown",
    body: typeof r.details?.note === "string" ? r.details.note : "",
    createdAt: r.createdAt,
  }));
}
