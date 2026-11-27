/**
 * ================================================================
 *  GET /api/v1/incidents/{incidentId}
 * ================================================================
 *  تفاصيل حادث كاملة:
 *  - الحدث/الأحداث المرتبطة (incident_event)
 *  - تقييم كل حدث (risk_assessment)
 *  - إجراءات الاستجابة (response_action)
 *  - timeline مبني من التواريخ الفعلية
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { incident, INCIDENT_STATUS_VALUES } from "@/db/schema";
import { ok, fail, validationFail } from "@/lib/envelope";
import { withErrorHandling, jsonError } from "@/lib/api-error";
import { audit } from "@/lib/audit";
import { getIncidentDetail, getIncidentNotes } from "@/lib/incidents";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(
  async (_req: NextRequest, ctx: { params: Promise<{ incidentId: string }> }) => {
    const { incidentId } = await ctx.params;

    if (!z.string().uuid().safeParse(incidentId).success) {
      return fail("VALIDATION_ERROR", "incidentId لازم يكون UUID صالح");
    }

    const detail = await getIncidentDetail(incidentId);
    if (!detail) return fail("NOT_FOUND", "الحادث غير موجود");

    /* ملاحظات التحقيق من audit_log — مفيش جدول منفصل */
    const incidentNotes = await getIncidentNotes(incidentId);

    /* ---- timeline: بناء من التواريخ الفعلية ---- */
    const timeline: Array<{ id: string; at: string; label: string; detail: string }> = [
      {
        id: `open-${detail.incidentId}`,
        at: detail.openedAt.toISOString(),
        label: "Incident Opened",
        detail: `${detail.severity} — risk score ${detail.riskScore}`,
      },
      ...detail.events.map((e) => ({
        id: `evt-${e.eventId}`,
        at: e.detectedAt.toISOString(),
        label: `Event: ${e.eventType}`,
        detail: `${e.title} (score ${e.riskScore})`,
      })),
      ...detail.actions
        .filter((a) => a.startedAt)
        .map((a) => ({
          id: `act-${a.actionId}`,
          at: a.startedAt!.toISOString(),
          label: `Action: ${a.actionType}`,
          detail: `${a.status}${a.isAutomated ? " (automated)" : ""}`,
        })),
      ...incidentNotes.map((n) => ({
        id: `note-${n.id}`,
        at: new Date(n.createdAt).toISOString(),
        label: "Note added",
        detail: n.body,
      })),
    ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

    return ok({
      id: detail.incidentId,
      title: detail.title,
      description: detail.description ?? "",
      severity: detail.severity,
      status: detail.status,
      riskScore: detail.riskScore,
      assignedTo: detail.assignedTo,
      openedAt: detail.openedAt,
      closedAt: detail.closedAt,
      updatedAt: detail.updatedAt,
      deviceId: detail.events.find((e) => e.deviceId)?.deviceId ?? null,
      relatedEventIds: detail.events.map((e) => e.eventId),
      events: detail.events.map((e) => ({
        id: e.eventId,
        eventType: e.eventType,
        title: e.title,
        severity: e.severity,
        detectedAt: e.detectedAt,
        deviceId: e.deviceId,
        deviceName: e.deviceName,
        riskScore: e.riskScore,
        riskLevel: e.riskLevel,
        correlationReason: e.correlationReason,
      })),
      actions: detail.actions.map((a) => ({
        id: a.actionId,
        actionType: a.actionType,
        description: a.description,
        status: a.status,
        isAutomated: a.isAutomated,
        performedBy: a.performedBy,
        startedAt: a.startedAt,
        completedAt: a.completedAt,
        createdAt: a.createdAt,
      })),
      approvalPending: detail.actions.some((a) => a.status === "PENDING"),
      timeline,
      notes: incidentNotes,
    });
  },
);


const CLOSED = new Set(["RESOLVED", "CLOSED", "FALSE_POSITIVE"]);

const patchSchema = z.object({
  status: z.enum(INCIDENT_STATUS_VALUES).optional(),
  assignedTo: z.string().max(100).nullable().optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  actor: z.string().max(100).optional(),
  performedBy: z.string().max(100).optional(),
});

export const PATCH = withErrorHandling(
  async (req: NextRequest, ctx: { params: Promise<{ incidentId: string }> }) => {
    const { incidentId } = await ctx.params;

    if (!z.string().uuid().safeParse(incidentId).success) {
      return fail("VALIDATION_ERROR", "incidentId لازم يكون UUID صالح");
    }

    const body = await req.json().catch(() => null);
    if (!body) return fail("VALIDATION_ERROR", "JSON غير صالح في الـ body");

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return validationFail(parsed.error.flatten());

    const { status, assignedTo, severity, actor, performedBy } = parsed.data;
    const who = performedBy ?? actor ?? "api";

    if (status === undefined && assignedTo === undefined && severity === undefined) {
      return fail("VALIDATION_ERROR", "مفيش أي حقل للتحديث (status / assignedTo / severity).");
    }

    try {
      const [updated] = await db
        .update(incident)
        .set({
          ...(status !== undefined ? { status } : {}),
          ...(severity !== undefined ? { severity } : {}),
          ...(assignedTo !== undefined ? { assignedTo } : {}),
          /* القيد: الحالة المغلقة لازم closed_at، والمفتوحة لازم NULL */
          ...(status !== undefined ? { closedAt: CLOSED.has(status) ? new Date() : null } : {}),
          updatedAt: new Date(),
        })
        .where(eq(incident.incidentId, incidentId))
        .returning();

      if (!updated) return fail("NOT_FOUND", "الحادث غير موجود.");

      await audit({
        actorType: "USER",
        actorId: who,
        action: "UPDATE_INCIDENT",
        entityType: "INCIDENT",
        entityId: incidentId,
        details: {
          status: updated.status,
          severity: updated.severity,
          assignedTo: updated.assignedTo,
          closedAt: updated.closedAt,
        },
      });

      /* نرجّع التفاصيل كاملة — نفس شكل GET /incidents/{id} */
      const detail = await getIncidentDetail(incidentId);
      return ok(detail ?? updated, `تم تحديث الحادث → ${updated.status}.`);
    } catch (e) {
      return jsonError(e);
    }
  },
);
