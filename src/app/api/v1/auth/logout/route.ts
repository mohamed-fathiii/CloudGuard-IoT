/**
 * POST /api/v1/auth/logout — مؤقت (M1 هيمسحه مع Auth.js)
 * الـ Frontend بيستخدم localStorage مش cookie session، فمفيش حاجة نمسحها
 * server-side. بنسجل الحدث في الـ audit وبنرجّع نجاح.
 */

import type { NextRequest } from "next/server";
import { ok } from "@/lib/envelope";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  await audit({
    actorType: "USER",
    actorId: (body as { email?: string })?.email ?? "unknown",
    action: "LOGOUT",
    entityType: "OTHER",
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    details: { note: "M2 temporary auth" },
  });

  return ok({ loggedOut: true }, "تم تسجيل الخروج.");
}
