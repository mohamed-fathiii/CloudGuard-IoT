/**
 * ================================================================
 *  /api/v1/devices
 * ================================================================
 *  GET  — قائمة الأجهزة (pagination + filters مطابقة للـ Frontend)
 *  POST — تسجيل جهاز جديد
 *
 *  Query params (من Frontend/src/lib/api/services.ts):
 *    search, status, risk, simulationState, sort, page, pageSize
 */

import type { NextRequest } from "next/server";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { device, securityEvent, incident } from "@/db/schema";
import { insertDeviceSchema, deviceFiltersSchema } from "@/db/validators";
import { ok, created, paginated, validationFail, fail } from "@/lib/envelope";
import { withErrorHandling, jsonError } from "@/lib/api-error";
import { audit } from "@/lib/audit";
import { levelForScore } from "@/lib/risk-engine";

export const dynamic = "force-dynamic";

/* ================================================================
   GET /api/v1/devices
   ================================================================ */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = deviceFiltersSchema.safeParse(params);
  if (!parsed.success) return validationFail(parsed.error.flatten());

  const { page, pageSize, search, status, risk, simulationState, sort } = parsed.data;

  /* ---- الفلاتر ---- */
  const filters: SQL[] = [];

  if (search) {
    const like = `%${search}%`;
    const cond = or(
      ilike(device.deviceName, like),
      ilike(device.model, like),
      ilike(device.location, like),
      ilike(device.manufacturer, like),
    );
    if (cond) filters.push(cond);
  }

  /* status = ALL يعني بدون فلتر (الـ Frontend بيبعت ALL) */
  if (status && status !== "ALL") {
    filters.push(eq(device.status, status));
  }

  /* simulationState: OPERATIONAL / QUARANTINED
     مش عمود في الـ schema الرسمي (86 عمود ثابتة) →
     بنشتقه من device.status: COMPROMISED = QUARANTINED. شوف DECISIONS-NEEDED #3 */
  if (simulationState && simulationState !== "ALL") {
    if (simulationState === "QUARANTINED") {
      filters.push(eq(device.status, "COMPROMISED"));
    } else {
      filters.push(sql`${device.status} <> 'COMPROMISED'`);
    }
  }

  /* risk: مستوى مطلوب — بنفلتر على أعلى تقييم للجهاز (subquery) */
  if (risk && risk !== "ALL") {
    const [min, max] =
      risk === "CRITICAL" ? [75, 100] : risk === "HIGH" ? [50, 74] : risk === "MEDIUM" ? [25, 49] : [0, 24];
    filters.push(sql`coalesce((
      select max(ra.risk_score) from risk_assessment ra
      join security_event se on se.event_id = ra.event_id
      where se.device_id = ${device.deviceId}
    ), 0) between ${min} and ${max}`);
  }

  const where = filters.length ? and(...filters) : undefined;

  /* ---- الترتيب ---- */
  const orderBy =
    sort === "name-asc"
      ? [asc(device.deviceName)]
      : sort === "name-desc"
        ? [desc(device.deviceName)]
        : sort === "seen-desc"
          ? [desc(device.lastSeenAt)]
          : [desc(device.updatedAt)];

  /* ---- البيانات + العدّادات المحسوبة ---- */
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(device)
    .where(where);

  const rows = await db
    .select({
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      deviceType: device.deviceType,
      manufacturer: device.manufacturer,
      model: device.model,
      ipAddress: device.ipAddress,
      macAddress: device.macAddress,
      firmwareVersion: device.firmwareVersion,
      location: device.location,
      status: device.status,
      environment: device.environment,
      isSimulated: device.isSimulated,
      lastSeenAt: device.lastSeenAt,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
      /* أعلى درجة خطورة على أحداث الجهاز */
      riskScore: sql<number>`coalesce((
        select max(ra.risk_score)
        from risk_assessment ra
        join security_event se on se.event_id = ra.event_id
        where se.device_id = ${device.deviceId}
      ), 0)::int`,
      incidentCount: sql<number>`(
        select count(distinct ie.incident_id)::int
        from incident_event ie
        join security_event se2 on se2.event_id = ie.event_id
        where se2.device_id = ${device.deviceId}
      )`,
    })
    .from(device)
    .where(where)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  /* ---- Mapper: نضيف الحقول المشتقة اللي الـ Frontend بيستخدمها ---- */
  const items = rows.map((r) => {
    return {
      id: r.deviceId,
      deviceName: r.deviceName,
      deviceType: r.deviceType,
      manufacturer: r.manufacturer,
      model: r.model,
      ipAddress: r.ipAddress,
      macAddress: r.macAddress,
      firmwareVersion: r.firmwareVersion,
      location: r.location,
      status: r.status,
      environment: r.environment,
      isSimulated: r.isSimulated,
      /* مشتق من status — مفيش عمود مخصص في الـ schema الرسمي */
      simulationState: r.status === "COMPROMISED" ? "QUARANTINED" : "OPERATIONAL",
      lastSeenAt: r.lastSeenAt,
      riskScore: r.riskScore,
      riskLevel: levelForScore(r.riskScore),
      incidentCount: r.incidentCount,
      /* UI-only: مش في الـ backend (شوف docs/API-CONTRACT.md §4) */
      topicNamespace: null,
      baseline: null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  });

  return paginated(items, total, page, pageSize);
});

/* ================================================================
   POST /api/v1/devices
   ================================================================ */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  if (!body) return fail("VALIDATION_ERROR", "JSON غير صالح في الـ body");

  const parsed = insertDeviceSchema.safeParse(body);
  if (!parsed.success) return validationFail(parsed.error.flatten());

  try {
    const [row] = await db.insert(device).values(parsed.data).returning();

    await audit({
      actorType: "USER",
      actorId: (body.actorId as string) ?? "api",
      action: "CREATE_DEVICE",
      entityType: "DEVICE",
      entityId: row.deviceId,
      details: { deviceName: row.deviceName, deviceType: row.deviceType },
    });

    return created(
      {
        id: row.deviceId,
        deviceName: row.deviceName,
        deviceType: row.deviceType,
        status: row.status,
        environment: row.environment,
        isSimulated: row.isSimulated,
        riskScore: 0,
        riskLevel: "LOW",
        createdAt: row.createdAt,
      },
      "تم تسجيل الجهاز.",
    );
  } catch (e) {
    return jsonError(e);
  }
});
