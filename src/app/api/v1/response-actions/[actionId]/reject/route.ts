/**
 * POST /api/v1/response-actions/{actionId}/reject
 * Body: { performedBy: string, comment?: string }
 * PENDING → CANCELLED + audit
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, validationFail, fail } from "@/lib/envelope";
import { withErrorHandling, jsonError } from "@/lib/api-error";
import { rejectAction } from "@/lib/incidents";

export const dynamic = "force-dynamic";

const rejectSchema = z.object({
  performedBy: z.string().min(1, "لازم تحدد مين رفض").max(100),
  comment: z.string().max(500).optional(),
});

export const POST = withErrorHandling(
  async (req: NextRequest, ctx: { params: Promise<{ actionId: string }> }) => {
    const { actionId } = await ctx.params;

    if (!z.string().uuid().safeParse(actionId).success) {
      return fail("VALIDATION_ERROR", "actionId لازم يكون UUID صالح");
    }

    const body = await req.json().catch(() => null);
    const parsed = rejectSchema.safeParse(body);
    if (!parsed.success) return validationFail(parsed.error.flatten());

    try {
      const updated = await rejectAction({
        actionId,
        performedBy: parsed.data.performedBy,
        comment: parsed.data.comment,
      });

      return ok(
        {
          id: updated.actionId,
          incidentId: updated.incidentId,
          actionType: updated.actionType,
          status: updated.status,
          performedBy: updated.performedBy,
          description: updated.description,
        },
        "تم رفض الإجراء.",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      if (msg.startsWith("NOT_FOUND:")) return fail("NOT_FOUND", msg.slice(10).trim());
      if (msg.startsWith("CONFLICT:")) return fail("CONFLICT", msg.slice(9).trim());
      return jsonError(e);
    }
  },
);
