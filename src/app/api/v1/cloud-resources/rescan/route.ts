/**
 * ================================================================
 *  POST /api/v1/cloud-resources/rescan
 * ================================================================
 *  الـ Frontend بينادي ده من زر "Rescan" عبر `rescanCloudResources(actor)`.
 *
 *  ⚠️ **مفيش أي اتصال بـ AWS هنا — عن قصد.**
 *  الـ NFR-SEC-03 والـ Scope بيقولوا إن كل الإجراءات على موارد
 *  allowlisted ومحاكاة. السكربت بيعمل:
 *    1) يحدّث `last_scanned_at` لكل مورد (بيثبت إن العملية حصلت)
 *    2) يسجّل العملية في `audit_log`
 *    3) يرجّع القائمة كاملة
 *
 *  لو M4 عايز ربط AWS حقيقي، ده مكانه — بس محتاج IAM role
 *  least-privilege (NFR-SEC-01) وتوثيق في Architecture.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { cloudResource } from "@/db/schema";
import { ok } from "@/lib/envelope";
import { withErrorHandling } from "@/lib/api-error";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const rescanSchema = z.object({
  actor: z.string().min(1).max(100).optional(),
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const payload = await req.json().catch(() => ({}));
  const parsed = rescanSchema.safeParse(payload ?? {});
  const actor = parsed.success ? (parsed.data.actor ?? "api") : "api";

  const now = new Date();

  /* تحديث واحد لكل الصفوف — مفيش استدعاء AWS */
  await db.update(cloudResource).set({ lastScannedAt: now, updatedAt: now });

  const rows = await db.select().from(cloudResource);

  await audit({
    actorType: "USER",
    actorId: actor,
    action: "RESCAN_CLOUD_RESOURCES",
    entityType: "OTHER",
    details: {
      resourceCount: rows.length,
      mode: "SIMULATED",
      note: "No AWS API call was made — simulated rescan per project scope.",
    },
  });

  return ok(
    rows.map((r) => ({
      id: r.resourceId,
      resourceName: r.resourceName,
      resourceType: r.resourceType,
      provider: r.provider,
      providerResourceId: r.providerResourceId,
      region: r.region,
      environment: r.environment,
      status: r.status,
      /* كل الموارد في الـ MVP محاكاة — نفس منطق GET /cloud-resources */
      simulated: true,
      lastScannedAt: r.lastScannedAt,
    })),
    `تم تحديث ${rows.length} مورد (محاكاة — بدون استدعاء AWS).`,
  );
});
