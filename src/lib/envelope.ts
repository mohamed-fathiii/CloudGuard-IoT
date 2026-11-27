/**
 * ================================================================
 *  Response Envelope — العقد اللي الـ Frontend مستنيه حرفياً
 * ================================================================
 *  المصدر: Frontend/docs/API-INTEGRATION.md §2
 *
 *  success:
 *  { "success": true, "message": "...", "data": {} }
 *
 *  paginated:
 *  { "success": true, "message": "...", "data": { items, total, page, pageSize } }
 *
 *  error:
 *  { "success": false, "message": "...", "error": { "code": "...", "details": [] } }
 *
 *  الـ Frontend (`src/lib/api/client.ts`) بيفكّ الـ envelope لوحده،
 *  وكمان بيقبل الـ payload الخام — بس الأفضل نلتزم بالـ envelope.
 */

import { NextResponse } from "next/server";

export interface PagePayload<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function ok<T>(data: T, message = "Operation completed successfully.", status = 200) {
  return NextResponse.json({ success: true, message, data }, { status });
}

export function created<T>(data: T, message = "Created successfully.") {
  return ok(data, message, 201);
}

export function paginated<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
  message = "Operation completed successfully.",
) {
  return NextResponse.json({
    success: true,
    message,
    data: { items, total, page, pageSize } satisfies PagePayload<T>,
  });
}

/** أكواد الأخطاء الموحّدة — الـ Frontend بيتعامل معاها في `toError()` */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "FORBIDDEN"
  | "UNAUTHORIZED"
  | "DATABASE_UNAVAILABLE"
  | "INTERNAL_ERROR";

const HTTP_FOR: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 422,
  NOT_FOUND: 404,
  CONFLICT: 409,
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
  DATABASE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

export function fail(
  code: ErrorCode,
  message: string,
  details: unknown[] = [],
  httpStatus?: number,
) {
  return NextResponse.json(
    {
      success: false,
      message,
      error: { code, details: Array.isArray(details) ? details : [details] },
    },
    { status: httpStatus ?? HTTP_FOR[code] },
  );
}

/** من أخطاء Zod لـ VALIDATION_ERROR بشكل مقروء */
export function validationFail(issues: unknown) {
  const flat =
    issues && typeof issues === "object" && "fieldErrors" in issues
      ? Object.entries((issues as { fieldErrors: Record<string, string[]> }).fieldErrors).flatMap(
          ([field, msgs]) => (msgs ?? []).map((m) => ({ field, message: m })),
        )
      : [{ field: "_", message: "بيانات غير صالحة" }];
  return fail("VALIDATION_ERROR", "البيانات المرسلة غير صالحة.", flat);
}
