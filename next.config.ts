import type { NextConfig } from "next";

/**
 * الإعداد ده مبني على طريقة نشر الفريق الفعلية:
 *   EC2 (Ubuntu + nginx) → Frontend على :3100 → API تحت /api/v1
 *
 * على الـ EC2 الـ Frontend بيستخدم `NEXT_PUBLIC_API_BASE_URL=/api/v1` (نسبي)،
 * فالـ API على نفس الأصل → **مفيش CORS خالص**. ده الأفضل واللي هيشتغل هناك.
 *
 * CORS موجود بس عشان الـ dev المحلي (Frontend 3100 → API 3000)،
 * ومكانه `src/middleware.ts` — مش هنا. سبب مهم: لو الهيدر اتحط في
 * مكانين، المتصفح بيشوف قيمتين لـ Access-Control-Allow-Origin ويرفض
 * الطلب. مصدر واحد بس للحقيقة.
 */

const nextConfig: NextConfig = {
  // postgres-js لازم يفضل server-only (مش بيتـbundle)
  serverExternalPackages: ["postgres"],

  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
