/**
 * ================================================================
 *  /api/v1/security-events
 * ================================================================
 *  GET  — قائمة الأحداث (فلاتر Frontend + التقييم مضمّن)
 *  POST — استقبال حدث → تقييم فوري → فتح حادث لو HIGH/CRITICAL
 *
 *  الرد بيحتوي `riskScore`, `severity`, `riskLevel`, `factors`, `explanation`
 *  وهي نفس الأسماء اللي `SecurityEvent` interface في الـ Frontend بيستخدمها.
 */

import type { NextRequest } from "next/server";
import { and, asc, desc, eq, gte, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { securityEvent, riskAssessment, device, cloudResource } from "@/db/schema";
import { insertSecurityEventSchema, eventFiltersSchema } from "@/db/validators";
import { ok, created, paginated, validationFail, fail } from "@/lib/envelope";
import { withErrorHandling, jsonError } from "@/lib/api-error";
import { computeRisk, levelForScore } from "@/lib/risk-engine";
import { openIncidentFromAssessment } from "@/lib/incidents";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/* ================================================================
   GET /api/v1/security-events
   ================================================================ */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = eventFiltersSchema.safeParse(params);
  if (!parsed.success) return validationFail(parsed.error.flatten());

  const { page, pageSize, search, severity, sourceType, deviceId, resourceId, minScore, range, sort } =
    parsed.data;

  const filters: SQL[] = [];

  if (search) {
    const like = `%${search}%`;
    const cond = or(
      ilike(securityEvent.title, like),
      ilike(securityEvent.description, like),
      ilike(securityEvent.eventType, like),
    );
    if (cond) filters.push(cond);
  }

  if (severity && severity !== "ALL") filters.push(eq(securityEvent.severity, severity));
  if (sourceType && sourceType !== "ALL") filters.push(eq(securityEvent.sourceType, sourceType));
  if (deviceId) filters.push(eq(securityEvent.deviceId, deviceId));
  if (resourceId) filters.push(eq(securityEvent.resourceId, resourceId));

  if (range) {
    const minutes = range === "24h" ? 1440 : range === "7d" ? 10080 : 43200;
    filters.push(
      sql`${securityEvent.detectedAt} >= now() - (${minutes} || ' minutes')::interval`,
    );
  }

  /* minScore: بنفلتر على أعلى تقييم للحدث */
  if (minScore !== undefined) {
    filters.push(sql`coalesce((
      select max(ra.risk_score) from risk_assessment ra
      where ra.event_id = ${securityEvent.eventId}
    ), 0) >= ${minScore}`);
  }

  const where = filters.length ? and(...filters) : undefined;

  const orderBy =
    sort === "score-desc"
      ? [desc(sql`coalesce((select max(ra.risk_score) from risk_assessment ra where ra.event_id = ${securityEvent.eventId}), 0)`)]
      : sort === "score-asc"
        ? [asc(sql`coalesce((select max(ra.risk_score) from risk_assessment ra where ra.event_id = ${securityEvent.eventId}), 0)`)]
        : [desc(securityEvent.detectedAt)];

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(securityEvent)
    .where(where);

  const rows = await db
    .select({
      eventId: securityEvent.eventId,
      sourceType: securityEvent.sourceType,
      deviceId: securityEvent.deviceId,
      resourceId: securityEvent.resourceId,
      eventType: securityEvent.eventType,
      severity: securityEvent.severity,
      title: securityEvent.title,
      description: securityEvent.description,
      sourceIp: securityEvent.sourceIp,
      destinationIp: securityEvent.destinationIp,
      rawPayload: securityEvent.rawPayload,
      detectedAt: securityEvent.detectedAt,
      createdAt: securityEvent.createdAt,
      deviceName: device.deviceName,
      resourceName: cloudResource.resourceName,
      /* آخر تقييم للحدث */
      riskScore: sql<number>`coalesce((
        select ra.risk_score from risk_assessment ra
        where ra.event_id = ${securityEvent.eventId}
        order by ra.assessed_at desc limit 1
      ), 0)::int`,
      riskLevel: sql<string | null>`(
        select ra.risk_level from risk_assessment ra
        where ra.event_id = ${securityEvent.eventId}
        order by ra.assessed_at desc limit 1
      )`,
      explanation: sql<string | null>`(
        select ra.explanation from risk_assessment ra
        where ra.event_id = ${securityEvent.eventId}
        order by ra.assessed_at desc limit 1
      )`,
      factors: sql<unknown>`(
        select ra.factors from risk_assessment ra
        where ra.event_id = ${securityEvent.eventId}
        order by ra.assessed_at desc limit 1
      )`,
      incidentId: sql<string | null>`(
        select ie.incident_id from incident_event ie
        where ie.event_id = ${securityEvent.eventId} limit 1
      )`,
    })
    .from(securityEvent)
    .leftJoin(device, eq(device.deviceId, securityEvent.deviceId))
    .leftJoin(cloudResource, eq(cloudResource.resourceId, securityEvent.resourceId))
    .where(where)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const items = rows.map((r) => ({
    id: r.eventId,
    eventType: r.eventType,
    title: r.title,
    description: r.description,
    sourceType: r.sourceType,
    deviceId: r.deviceId,
    deviceName: r.deviceName,
    resourceId: r.resourceId,
    resourceName: r.resourceName,
    sourceIp: r.sourceIp,
    destinationIp: r.destinationIp,
    detectedAt: r.detectedAt,
    createdAt: r.createdAt,
    riskScore: r.riskScore,
    riskLevel: r.riskLevel ?? levelForScore(r.riskScore),
    severity: r.severity,
    explanation: r.explanation ?? "",
    factors: (r.factors as { factors?: unknown[] } | null)?.factors ?? [],
    incidentId: r.incidentId,
    /* UI-only: كل حدث استقبلناه اتقيّم فوراً */
    processingState: r.riskLevel ? "PROCESSED" : "PROCESSING",
    simulated: true,
  }));

  return paginated(items, total, page, pageSize);
});

/* ================================================================
   POST /api/v1/security-events
   ================================================================ */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  if (!body) return fail("VALIDATION_ERROR", "JSON غير صالح");

  const parsed = insertSecurityEventSchema.safeParse(body);
  if (!parsed.success) return validationFail(parsed.error.flatten());

  const input = parsed.data;

  /* تحقق من وجود الجهاز/المورد قبل الإدخال — رسالة أوضح من FK error */
  let deviceRow: { deviceId: string; deviceName: string; isSimulated: boolean; lastSeenAt: Date | null } | null = null;
  if (input.deviceId) {
    const [d] = await db
      .select({
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        isSimulated: device.isSimulated,
        lastSeenAt: device.lastSeenAt,
      })
      .from(device)
      .where(eq(device.deviceId, input.deviceId))
      .limit(1);
    if (!d) return fail("NOT_FOUND", "الجهاز غير موجود — deviceId غير صالح");
    deviceRow = d;
  }

  if (input.resourceId) {
    const [r] = await db
      .select({ resourceId: cloudResource.resourceId })
      .from(cloudResource)
      .where(eq(cloudResource.resourceId, input.resourceId))
      .limit(1);
    if (!r) return fail("NOT_FOUND", "المورد السحابي غير موجود — resourceId غير صالح");
  }

  /* 1) تسجيل الحدث */
  const [event] = await db
    .insert(securityEvent)
    .values({ ...input, detectedAt: input.detectedAt ?? new Date() })
    .returning();

  /* 2) التقييم الفوري */
  const risk = computeRisk({
    eventType: event.eventType,
    severity: event.severity as never,
    detectedAt: event.detectedAt,
    createdAt: event.createdAt,
    sourceIp: event.sourceIp,
    destinationIp: event.destinationIp,
    rawPayload: event.rawPayload as Record<string, unknown> | null,
    deviceIsSimulated: deviceRow?.isSimulated,
    deviceLastSeenAt: deviceRow?.lastSeenAt ?? null,
  });

  const [assessment] = await db
    .insert(riskAssessment)
    .values({
      eventId: event.eventId,
      riskScore: risk.riskScore,
      riskLevel: risk.riskLevel,
      confidenceScore: String(risk.confidenceScore),
      scoringModelVersion: risk.scoringModelVersion,
      explanation: risk.explanation,
      factors: risk.factors,
    })
    .returning();

  /* 3) تصعيد: HIGH/CRITICAL → حادث + إجراءات */
  let incidentResult = null;
  if (risk.riskLevel === "HIGH" || risk.riskLevel === "CRITICAL") {
    incidentResult = await openIncidentFromAssessment({
      eventId: event.eventId,
      assessmentId: assessment.assessmentId,
      deviceId: event.deviceId,
      resourceId: event.resourceId,
      riskLevel: risk.riskLevel,
      riskScore: risk.riskScore,
      title: `${risk.riskLevel} — ${event.eventType}: ${deviceRow?.deviceName ?? "مورد سحابي"}`,
      explanation: risk.explanation,
    });
  }

  await audit({
    actorType: "SYSTEM",
    actorId: "risk-engine",
    action: "INGEST_SECURITY_EVENT",
    entityType: "SECURITY_EVENT",
    entityId: event.eventId,
    details: {
      eventType: event.eventType,
      riskScore: risk.riskScore,
      riskLevel: risk.riskLevel,
      incidentId: incidentResult?.incident.incidentId ?? null,
    },
  });

  return created(
    {
      id: event.eventId,
      eventType: event.eventType,
      severity: event.severity,
      title: event.title,
      detectedAt: event.detectedAt,
      riskScore: risk.riskScore,
      riskLevel: risk.riskLevel,
      explanation: risk.explanation,
      factors: risk.factors.factors,
      incidentId: incidentResult?.incident.incidentId ?? null,
      decision: incidentResult ? "INCIDENT_OPENED" : "LOGGED_ONLY",
    },
    incidentResult
      ? "الحدث اتقيّم وفتح حادث تلقائياً."
      : "الحدث اتقيّم واتسجل (بدون حادث — أقل من HIGH).",
  );
});
