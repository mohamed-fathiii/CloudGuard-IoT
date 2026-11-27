/**
 * ================================================================
 *  GET /api/v1/response-actions/{actionId}
 * ================================================================
 *  الـ Frontend بينادي ده عبر `getResponse(id)` في `services.ts`.
 *  بيرجّع الإجراء + الحادث اللي ينتمي له + الجهاز/المورد المستهدف.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { responseAction, incident } from "@/db/schema";
import { ok, fail } from "@/lib/envelope";
import { withErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(
  async (_req: NextRequest, ctx: { params: Promise<{ actionId: string }> }) => {
    const { actionId } = await ctx.params;

    if (!z.string().uuid().safeParse(actionId).success) {
      return fail("VALIDATION_ERROR", "actionId لازم يكون UUID صالح");
    }

    const [row] = await db
      .select({
        action: responseAction,
        incidentTitle: incident.title,
        incidentSeverity: incident.severity,
        incidentStatus: incident.status,
      })
      .from(responseAction)
      .leftJoin(incident, eq(incident.incidentId, responseAction.incidentId))
      .where(eq(responseAction.actionId, actionId))
      .limit(1);

    if (!row) return fail("NOT_FOUND", "الإجراء غير موجود.");

    const a = row.action;

    return ok({
      id: a.actionId,
      incidentId: a.incidentId,
      incident: {
        id: a.incidentId,
        title: row.incidentTitle,
        severity: row.incidentSeverity,
        status: row.incidentStatus,
      },
      actionType: a.actionType,
      description: a.description,
      status: a.status,
      isAutomated: a.isAutomated,
      performedBy: a.performedBy,
      /* مفيش عمود approved_by / approved_at في الـ schema الرسمي (11 عمود
         للإجراء) — الموافقة بتتسجل في audit_log وبتظهر منه. */
      approvedBy: a.status === "COMPLETED" || a.status === "CANCELLED" ? a.performedBy : null,
      approvedAt: a.status === "COMPLETED" || a.status === "CANCELLED" ? a.updatedAt : null,
      startedAt: a.startedAt,
      completedAt: a.completedAt,
      /* مفيش أعمدة result / error_message — الحالة نفسها هي النتيجة */
      result: a.status === "COMPLETED" ? "SUCCESS" : a.status === "FAILED" ? "FAILURE" : null,
      errorMessage: null,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      /* الـ Frontend بيستخدم targetType/targetId — مش أعمدة في الـ schema،
         فبنشتقهم من نوع الإجراء (شوف docs/API-CONTRACT.md §4) */
      targetType: a.actionType.startsWith("ISOLATE") || a.actionType.startsWith("REINSTATE")
        ? "DEVICE"
        : "INCIDENT",
      targetId: a.incidentId,
    });
  },
);
