/**
 * ================================================================
 *  Middleware — CORS preflight + حد أدنى من الحماية
 * ================================================================
 *  الدور الأساسي: يرد على OPTIONS للـ preflight قبل ما يوصل للـ route،
 *  عشان الـ Frontend (3100) يقدر يكلم الـ API (3000) في الـ dev.
 *
 *  في الإنتاج على EC2 (نفس الأصل عبر nginx) الـ middleware ده مش بيتأثر —
 *  المسار نسبي فمفيش preflight أصلاً.
 *
 *  ⚠️ ده **مش** طبقة مصادقة. Authorization الحقيقي مسؤولية M1 (Auth.js)
 *  + الـ route handlers. `AuthContext.can()` في الـ Frontend مش حد أمني.
 */

import { NextResponse, type NextRequest } from "next/server";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3100",
  "http://127.0.0.1:3100",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "http://localhost:3100";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin");

  /* preflight */
  if (req.method === "OPTIONS" && req.nextUrl.pathname.startsWith("/api/")) {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }

  const res = NextResponse.next();
  for (const [k, v] of Object.entries(corsHeaders(origin))) res.headers.set(k, v);
  return res;
}

export const config = {
  matcher: "/api/:path*",
};
