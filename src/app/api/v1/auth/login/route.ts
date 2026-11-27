/**
 * ================================================================
 *  POST /api/v1/auth/login
 * ================================================================
 *  ⚠️ **مؤقت — لحد ما M1 يسلّم Auth.js.**
 *
 *  الـ Frontend (`services.ts → login`) في وضع real بيبعت:
 *    { email, password }
 *  ومستني رد بشكل `Session`:
 *    { user: { id, name, email, role, active, createdAt }, token, expiresAt }
 *
 *  الـ schema الرسمي **مفيهوش جدول users** (قرار موثّق في Data-Dictionary:
 *  "no User FK in this scope"). فالحسابات هنا من الـ seed accounts
 *  الموثّقة في الـ Frontend نفسه (`DEMO_ACCOUNTS`) — مش من الداتابيز.
 *
 *  ده **مش** بديل عن Auth.js:
 *   - مفيش password hashing
 *   - مفيش session store
 *   - الـ token مجرد علامة، مش JWT موقّع
 *
 *  لما M1 يخلص: يمسح الملف ده ويحط الـ provider بتاعه.
 *  التفاصيل في `docs/DECISIONS-NEEDED.md` §2.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail, validationFail } from "@/lib/envelope";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const ROLE_VALUES = ["ADMINISTRATOR", "SECURITY_ANALYST", "VIEWER"] as const;
type Role = (typeof ROLE_VALUES)[number];

/** نفس الحسابات الموثّقة في Frontend/src/lib/api/services.ts → DEMO_ACCOUNTS */
const ACCOUNTS: Record<string, { password: string; role: Role; name: string }> = {
  "admin@example.com": { password: "demo1234", role: "ADMINISTRATOR", name: "Administrator" },
  "analyst@example.com": { password: "demo1234", role: "SECURITY_ANALYST", name: "Security Analyst" },
  "viewer@example.com": { password: "demo1234", role: "VIEWER", name: "Viewer" },
};

const loginSchema = z.object({
  email: z.string().email("إيميل غير صالح").toLowerCase(),
  password: z.string().min(8, "الباسورد 8 حروف على الأقل"),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return validationFail(parsed.error.flatten());

  const { email, password } = parsed.data;
  const account = ACCOUNTS[email];

  /* رسالة موحّدة — مش بنقول الإيميل موجود ولا لأ */
  if (!account || account.password !== password) {
    await audit({
      actorType: "USER",
      actorId: email,
      action: "LOGIN_FAILED",
      entityType: "OTHER",
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      details: { reason: "INVALID_CREDENTIALS" },
    });

    return fail("UNAUTHORIZED", "الإيميل أو الباسورد غير مقبولين.", [
      { code: "INVALID_CREDENTIALS" },
    ]);
  }

  const issuedAt = Date.now();

  await audit({
    actorType: "USER",
    actorId: email,
    action: "LOGIN",
    entityType: "OTHER",
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    details: { role: account.role, note: "M2 temporary auth — pending M1 Auth.js" },
  });

  return ok(
    {
      user: {
        /* معرّف ثابت لكل دور — مفيش جدول users في الـ schema الرسمي */
        id: `usr-${account.role.toLowerCase().replace(/_/g, "-")}`,
        name: account.name,
        email,
        role: account.role,
        active: true,
        createdAt: new Date(issuedAt).toISOString(),
      },
      token: `m2.${account.role.toLowerCase()}.${issuedAt.toString(36)}`,
      expiresAt: new Date(issuedAt + 8 * 3600_000).toISOString(),
    },
    "تم تسجيل الدخول.",
  );
}
