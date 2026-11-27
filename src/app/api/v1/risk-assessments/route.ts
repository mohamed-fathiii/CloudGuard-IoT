/**
 * ================================================================
 *  /api/v1/risk-assessments
 * ================================================================
 *  GET — التقييمات (الـ Frontend بيستخدمها في شرح الدرجة)
 *  POST — إعادة تقييم حدث بيد محلل (score يتم حسابه من المحرّك)
 */

import type { NextRequest } from "next/server";
import { and, desc, eq, gte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { riskAssessment, securityEvent } from "@/db/schema";
import { insertRiskAssessmentSchema, zPagination } from "@/db/validators";
import { created, paginated, validationFail, fail } from "@/lib/envelope";
import { withErrorHandling, jsonError } from "@/lib/api-error";
import { assessEvent } from "@/lib/risk-engine";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const filtersSchema = zPagination.extend({
  eventId: z.string().uuid().optional(),
  riskLevel: z.string().optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
});

export const GET = withErrorHandling(async (req: NextRequest) => {
  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = filtersSchema.safeParse(params);
  if (!parsed.success) return validationFail(parsed.error.flatten());

  const { page, pageSize, eventId, riskLevel, minScore } = parsed.data;

  const filters: SQL[] = [];
  if (eventId) filters.push(eq(riskAssessment.eventId, eventId));
  if (riskLevel && riskLevel !== "ALL") filters.push(eq(riskAssessment.riskLevel, riskLevel));
  if (minScore !== undefined) filters.push(gte(riskAssessment.riskScore, minScore));

  const where = filters.length ? and(...filters) : undefined;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(riskAssessment)
    .where(where);

  const rows = await db
    .select({
      assessmentId: riskAssessment.assessmentId,
      eventId: riskAssessment.eventId,
      riskScore: riskAssessment.riskScore,
      riskLevel: riskAssessment.riskLevel,
      confidenceScore: riskAssessment.confidenceScore,
      scoringModelVersion: riskAssessment.scoringModelVersion,
      explanation: riskAssessment.explanation,
      factors: riskAssessment.factors,
      assessedAt: riskAssessment.assessedAt,
      eventType: securityEvent.eventType,
      eventTitle: securityEvent.title,
      eventSeverity: securityEvent.severity,
    })
    .from(riskAssessment)
    .leftJoin(securityEvent, eq(securityEvent.eventId, riskAssessment.eventId))
    .where(where)
    .orderBy(desc(riskAssessment.assessedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const items = rows.map((r) => ({
    id: r.assessmentId,
    eventId: r.eventId,
    eventType: r.eventType,
    eventTitle: r.eventTitle,
    eventSeverity: r.eventSeverity,
    riskScore: r.riskScore,
    riskLevel: r.riskLevel,
    confidenceScore: r.confidenceScore ? Number(r.confidenceScore) : null,
    scoringModelVersion: r.scoringModelVersion,
    explanation: r.explanation,
    factors: (r.factors as { factors?: unknown[] } | null)?.factors ?? [],
    assessedAt: r.assessedAt,
  }));

  return paginated(items, total, page, pageSize);
});

/**
 * POST — إعادة تقييم حدث موجود.
 * ملاحظة: مش بنقبل score جاهز من العميل — المحرّك هو اللي يحسبه.
 * ده يمنع التلاعب في الدرجات من الـ Frontend.
 */
const reAssessBody = z.object({
  eventId: z.string().uuid(),
  actorId: z.string().max(100).default("api"),
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  if (!body) return fail("VALIDATION_ERROR", "JSON غير صالح");

  const parsed = reAssessBody.safeParse(body);
  if (!parsed.success) return validationFail(parsed.error.flatten());

  const [event] = await db
    .select()
    .from(securityEvent)
    .where(eq(securityEvent.eventId, parsed.data.eventId))
    .limit(1);

  if (!event) return fail("NOT_FOUND", "الحدث غير موجود");

  const row = assessEvent(event);
  const [saved] = await db.insert(riskAssessment).values(row).returning();

  await audit({
    actorType: "USER",
    actorId: parsed.data.actorId,
    action: "RE_ASSESS_EVENT",
    entityType: "RISK_ASSESSMENT",
    entityId: saved.assessmentId,
    details: { eventId: event.eventId, riskScore: saved.riskScore, riskLevel: saved.riskLevel },
  });

  return created(
    {
      id: saved.assessmentId,
      eventId: saved.eventId,
      riskScore: saved.riskScore,
      riskLevel: saved.riskLevel,
      confidenceScore: saved.confidenceScore ? Number(saved.confidenceScore) : null,
      scoringModelVersion: saved.scoringModelVersion,
      explanation: saved.explanation,
      factors: (saved.factors as { factors?: unknown[] }).factors ?? [],
      assessedAt: saved.assessedAt,
    },
    "تم إعادة تقييم الحدث.",
  );
});
