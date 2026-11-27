/**
 * ================================================================
 *  Error handling — تحويل أخطاء Drizzle/Postgres لرسائل مفهومة
 * ================================================================
 *  المشكلة: Drizzle بيلفّ خطأ postgres.js في DrizzleQueryError فرسالته
 *  بتبقى "Failed query: select version()" — والسبب الحقيقي
 *  (ECONNREFUSED / ETIMEDOUT / password) بيضيع.
 *
 *  الحل: نمشي على سلسلة `cause` ونجمع أول رسالة مفيدة،
 *  ونحوّل كود Postgres لـ ErrorCode من عقد الـ Frontend.
 */

import { fail, type ErrorCode } from "./envelope";

interface Details {
  message: string;
  pgCode?: string;
  code: ErrorCode;
  hint?: string;
}

const PG_CONSTRAINT_HINTS: Record<string, string> = {
  ck_security_event_source_link:
    "قاعدة الربط: IOT_DEVICE يتطلب device_id فقط، CLOUD_RESOURCE يتطلب resource_id فقط، SYSTEM بدون أي منهما.",
  ck_risk_assessment_level_matches_score:
    "risk_level لازم يطابق risk_score: 0-24 LOW / 25-49 MEDIUM / 50-74 HIGH / 75-100 CRITICAL.",
  ck_incident_closure_consistency:
    "الحالة RESOLVED/CLOSED/FALSE_POSITIVE تتطلب closed_at، وأي حالة تانية تتطلب closed_at = NULL.",
  uq_device_device_name: "اسم الجهاز مستخدم بالفعل — device_name UNIQUE.",
  uq_device_mac_address: "عنوان MAC مستخدم بالفعل.",
  uq_cloud_resource_provider_id: "الـ provider_resource_id (ARN) مسجّل بالفعل.",
  pk_incident_event: "الحدث مربوط بالحادث ده بالفعل.",
  fk_response_action_incident: "الإجراء لازم يكون مربوط بحادث موجود.",
};

function classify(msg: string, pgCode?: string): { code: ErrorCode; hint?: string } {
  const m = msg.toLowerCase();

  if (pgCode === "ECONNREFUSED" || m.includes("econnrefused"))
    return {
      code: "DATABASE_UNAVAILABLE",
      hint: "الـ SSH Tunnel مش شغال على 127.0.0.1:5432. شغّله في ترمنال منفصل وأعد المحاولة.",
    };
  if (pgCode === "ETIMEDOUT" || m.includes("etimedout"))
    return {
      code: "DATABASE_UNAVAILABLE",
      hint: "مش واصل للهوست. لو DATABASE_URL فيه 10.0.1.202 غيّرها لـ 127.0.0.1 واستخدم الـ tunnel.",
    };
  if (m.includes("password authentication failed"))
    return {
      code: "DATABASE_UNAVAILABLE",
      hint: "باسورد غلط في DATABASE_URL. راجع الباسورد، ولو فيه @ لازم URL-encode (%40).",
    };
  if (m.includes("self-signed certificate") || m.includes("ssl"))
    return {
      code: "DATABASE_UNAVAILABLE",
      hint: "SSL مفعّل على اتصال محلي — الكود بيكشف 127.0.0.1 ويحط ssl=false تلقائياً.",
    };
  if (m.includes("relation") && m.includes("does not exist"))
    return { code: "INTERNAL_ERROR", hint: "الجداول مش موجودة. شغّل: npm run db:push" };
  if (m.includes("remaining connection slots"))
    return {
      code: "DATABASE_UNAVAILABLE",
      hint: "استهلكت connections الـ RDS. اتأكد إنك بتستخدم النسخة اللي فيها globalThis cache.",
    };

  /* أخطاء القيود — نطلّع اسم القيد بالظبط */
  if (pgCode === "23505" || m.includes("duplicate key"))
    return { code: "CONFLICT", hint: "قيمة مكررة — فيه unique constraint اتحقق." };
  if (pgCode === "23503" || m.includes("foreign key"))
    return { code: "VALIDATION_ERROR", hint: "الـ id المرجعي مش موجود." };
  if (pgCode === "23514" || m.includes("check constraint") || m.includes("violates check"))
    return { code: "VALIDATION_ERROR", hint: "قيمة مرفوضة بسبب CHECK constraint." };
  if (pgCode === "23502" || m.includes("not-null"))
    return { code: "VALIDATION_ERROR", hint: "عمود مطلوب فاضي (NOT NULL)." };

  return { code: "INTERNAL_ERROR" };
}

export function unwrapError(e: unknown): Details {
  const messages: string[] = [];
  let cur: unknown = e;
  let pgCode: string | undefined;
  let constraintName: string | undefined;

  for (let depth = 0; cur && depth < 5; depth++) {
    const c = cur as {
      message?: string;
      code?: string;
      constraint?: string;
      cause?: unknown;
      errors?: unknown[];
    };
    if (c.message) messages.push(c.message);
    if (c.code) pgCode = c.code;
    if (c.constraint) constraintName = c.constraint;
    if (Array.isArray(c.errors) && c.errors.length) {
      const first = c.errors[0] as { message?: string; code?: string; constraint?: string };
      if (first?.message) messages.push(first.message);
      if (first?.code) pgCode = first.code;
      if (first?.constraint) constraintName = first.constraint;
    }
    cur = c.cause;
  }

  const joined = messages.join(" | ");
  const { code, hint } = classify(joined, pgCode);

  /* خد أقرب hint لاسم القيد لو موجود */
  const constraintHint = constraintName
    ? PG_CONSTRAINT_HINTS[constraintName]
    : Object.entries(PG_CONSTRAINT_HINTS).find(([name]) => joined.includes(name))?.[1];

  const root =
    [...messages].reverse().find((m) => !m.startsWith("Failed query")) ??
    messages[0] ??
    "unknown error";

  return {
    message: root,
    pgCode,
    code,
    hint: constraintHint ?? hint,
  };
}

/** رد خطأ بنفس عقد الـ Frontend */
export function jsonError(e: unknown) {
  const { message, code, hint, pgCode } = unwrapError(e);
  const body = hint ? `${message} — ${hint}` : message;
  return fail(code, body, pgCode ? [{ pgCode }] : []);
}

/** غلاف للـ handlers */
export function withErrorHandling<A extends unknown[], R>(
  handler: (...args: A) => Promise<R>,
) {
  return async (...args: A): Promise<R | ReturnType<typeof fail>> => {
    try {
      return await handler(...args);
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.error("[api]", e);
      return jsonError(e);
    }
  };
}
