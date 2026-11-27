/**
 * ================================================================
 *  POST /api/v1/response-actions/{actionId}/approve
 * ================================================================
 *  الموافقة على إجراء → COMPLETED + تسجيل في audit_log.
 *  لو الإجراء ISOLATE_DEVICE → حالة الجهاز المحاكاة تتحول QUARANTINED.
 *
 *  Body: { performedBy: string, mode?: "DRY_RUN" | "EXECUTED", comment?: string }
 *
 *  ملاحظة أمنية: `mode=DRY_RUN` هو الافتراضي. التنفيذ الحقيقي يحتاج
 *  تمرير "EXECUTED" صريح، وبيتسجل في الوصف والـ audit.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { approveActionSchema } from "@/db/validators";
import { ok, validationFail, fail } from "@/lib/envelope";
import { withErrorHandling, jsonError } from "@/lib/api-error";
import { approveAction } from "@/lib/incidents";

export const dynamic = "force-dynamic";

export const POST = withErrorHandling(
  async (req: NextRequest, ctx: { params: Promise<{ actionId: string }> }) => {
    const { actionId } = await ctx.params;

    const idOk = z.string().uuid().safeParse(actionId);
    if (!idOk.success) return fail("VALIDATION_ERROR", "actionId لازم يكون UUID صالح");

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const parsed = approveActionSchema.safeParse(body);
    if (!parsed.success) return validationFail(parsed.error.flatten());

    try {
      const updated = await approveAction({
        actionId,
        performedBy: parsed.data.performedBy,
        mode: parsed.data.mode,
        comment: parsed.data.comment,
      });

      return ok(
        {
          id: updated.actionId,
          incidentId: updated.incidentId,
          actionType: updated.actionType,
          status: updated.status,
          execution: parsed.data.mode,
          performedBy: updated.performedBy,
          completedAt: updated.completedAt,
          description: updated.description,
        },
        `تمت الموافقة وتنفيذ الإجراء (${parsed.data.mode}).`,
      );
    } catch (e) {
      /* الـ service بيرمي "NOT_FOUND:" أو "CONFLICT:" — نحوّلهم لأكواد العقد */
      const msg = e instanceof Error ? e.message : "unknown";
      if (msg.startsWith("NOT_FOUND:")) return fail("NOT_FOUND", msg.slice(10).trim());
      if (msg.startsWith("CONFLICT:")) return fail("CONFLICT", msg.slice(9).trim());
      return jsonError(e);
    }
  },
);
