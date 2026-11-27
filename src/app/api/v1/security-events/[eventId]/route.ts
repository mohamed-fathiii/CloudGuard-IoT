/**
 * ================================================================
 *  GET /api/v1/security-events/{eventId}
 * ================================================================
 *  الـ Frontend بينادي ده من `events/[id]/page.tsx` عبر `getEvent(id)`.
 *
 *  بيرجّع: الحدث + تقييماته + الحوادث المرتبطة + الإجراءات.
 *  مصدر البيانات: `getEventTimeline()` في `src/lib/incidents.ts`.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/envelope";
import { withErrorHandling } from "@/lib/api-error";
import { getEventTimeline } from "@/lib/incidents";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(
  async (_req: NextRequest, ctx: { params: Promise<{ eventId: string }> }) => {
    const { eventId } = await ctx.params;

    if (!z.string().uuid().safeParse(eventId).success) {
      return fail("VALIDATION_ERROR", "eventId لازم يكون UUID صالح");
    }

    const data = await getEventTimeline(eventId);
    if (!data) return fail("NOT_FOUND", "الحدث غير موجود.");

    const { event, assessments, incidents, actions } = data;
    const latest = assessments
      .slice()
      .sort((a, b) => +new Date(b.assessedAt) - +new Date(a.assessedAt))[0];

    return ok({
      id: event.eventId,
      eventType: event.eventType,
      title: event.title,
      description: event.description,
      severity: event.severity,
      sourceType: event.sourceType,
      deviceId: event.deviceId,
      resourceId: event.resourceId,
      sourceIp: event.sourceIp,
      detectedAt: event.detectedAt,
      eventTimestamp: event.detectedAt,
      /* مفيش عمود status على الحدث — الحالة بتتشتق من وجود تقييم/حادث */
      status: incidents.length ? "CORRELATED" : latest ? "ASSESSED" : "NEW",
      rawPayload: event.rawPayload,
      riskScore: latest?.riskScore ?? 0,
      riskLevel: latest?.riskLevel ?? "LOW",
      confidence: latest?.confidenceScore ?? null,
      factors: latest?.factors ?? [],
      /* التفاصيل الكاملة للـ forensics */
      assessments,
      incidents: incidents.map((i) => ({
        id: i.incidentId,
        title: i.title,
        severity: i.severity,
        status: i.status,
        riskScore: i.riskScore,
      })),
      actions: actions.map((a) => ({
        id: a.actionId,
        incidentId: a.incidentId,
        actionType: a.actionType,
        status: a.status,
        isAutomated: a.isAutomated,
      })),
    });
  },
);
