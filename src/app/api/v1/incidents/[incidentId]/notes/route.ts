/**
 * ================================================================
 *  POST /api/v1/incidents/{incidentId}/notes
 * ================================================================
 *  الـ Frontend بينادي ده عبر `addIncidentNote(id, author, body)`.
 *
 *  ⚠️ مفيش جدول `incident_note` في الـ ERD الرسمي (86 عمود ثابتة).
 *  فالحل: الملاحظة بتتسجل في `audit_log` (append-only) كـ
 *  `action = 'ADD_INCIDENT_NOTE'`، وبتظهر في الـ timeline
 *  اللي بيبنيه `GET /incidents/{id}` من نفس الجدول.
 *
 *  كده الـ Frontend بيشوف الملاحظة فوراً من غير أي جدول جديد،
 *  وسجل التدقيق بيفضل هو المصدر الوحيد للحقيقة.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { incident } from "@/db/schema";
import { ok, fail, validationFail } from "@/lib/envelope";
import { withErrorHandling, jsonError } from "@/lib/api-error";
import { audit } from "@/lib/audit";
import { getIncidentDetail } from "@/lib/incidents";

export const dynamic = "force-dynamic";

const noteSchema = z.object({
  author: z.string().min(1, "اسم الكاتب مطلوب").max(100),
  body: z.string().min(1, "نص الملاحظة مطلوب").max(2000),
});

export const POST = withErrorHandling(
  async (req: NextRequest, ctx: { params: Promise<{ incidentId: string }> }) => {
    const { incidentId } = await ctx.params;

    if (!z.string().uuid().safeParse(incidentId).success) {
      return fail("VALIDATION_ERROR", "incidentId لازم يكون UUID صالح");
    }

    const payload = await req.json().catch(() => null);
    const parsed = noteSchema.safeParse(payload);
    if (!parsed.success) return validationFail(parsed.error.flatten());

    const [exists] = await db
      .select({ incidentId: incident.incidentId })
      .from(incident)
      .where(eq(incident.incidentId, incidentId))
      .limit(1);

    if (!exists) return fail("NOT_FOUND", "الحادث غير موجود.");

    try {
      await audit({
        actorType: "USER",
        actorId: parsed.data.author,
        action: "ADD_INCIDENT_NOTE",
        entityType: "INCIDENT",
        entityId: incidentId,
        details: { note: parsed.data.body },
      });

      /* نرجّع الحادث كامل — الـ Frontend بيستبدل الحالة بالرد ده */
      const detail = await getIncidentDetail(incidentId);
      if (!detail) return fail("NOT_FOUND", "الحادث غير موجود.");

      return ok(detail, "تمت إضافة الملاحظة.");
    } catch (e) {
      return jsonError(e);
    }
  },
);
