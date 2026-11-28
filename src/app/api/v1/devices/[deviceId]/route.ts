/**
 * ================================================================
 *  GET /api/v1/devices/{deviceId}
 * ================================================================
 *  الـ Frontend بينادي ده من `Frontend/src/app/(dashboard)/devices/[id]/page.tsx`
 *  عبر `getDevice(id)` في `services.ts`.
 *
 *  بيرجّع نفس شكل عنصر القائمة (`Device` interface) بالظبط،
 *  عشان صفحة التفاصيل ما تحتاجش mapper مختلف.
 *
 *  بيرجّع 404 لو مش موجود — الـ `getDevice` في الـ Frontend بيمسك 404
 *  ويرجّع null بدل ما يرمي (شوف services.ts:263).
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { device } from "@/db/schema";
import { ok, fail } from "@/lib/envelope";
import { withErrorHandling } from "@/lib/api-error";
import { levelForScore } from "@/lib/risk-engine";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(
  async (_req: NextRequest, ctx: { params: Promise<{ deviceId: string }> }) => {
    const { deviceId } = await ctx.params;

    if (!z.string().uuid().safeParse(deviceId).success) {
      return fail("VALIDATION_ERROR", "deviceId لازم يكون UUID صالح");
    }

    const [row] = await db
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
        riskScore: sql<number>`coalesce((
          select max(ra.risk_score)
          from risk_assessment ra
          join security_event se on se.event_id = ra.event_id
          where se.device_id = ${device}.${device.deviceId}
        ), 0)::int`,
        incidentCount: sql<number>`(
          select count(distinct ie.incident_id)::int
          from incident_event ie
          join security_event se2 on se2.event_id = ie.event_id
          where se2.device_id = ${device}.${device.deviceId}
        )`,
        eventCount: sql<number>`(
          select count(*)::int from security_event se3
          where se3.device_id = ${device}.${device.deviceId}
        )`,
      })
      .from(device)
      .where(eq(device.deviceId, deviceId))
      .limit(1);

    if (!row) {
      /* null-safe: الـ Frontend بيمسك 404 ويرجّع null */
      return fail("NOT_FOUND", "الجهاز غير موجود.");
    }

    return ok({
      id: row.deviceId,
      deviceName: row.deviceName,
      deviceType: row.deviceType,
      manufacturer: row.manufacturer,
      model: row.model,
      ipAddress: row.ipAddress,
      macAddress: row.macAddress,
      firmwareVersion: row.firmwareVersion,
      location: row.location,
      status: row.status,
      environment: row.environment,
      isSimulated: row.isSimulated,
      /* مشتق — مفيش عمود simulation_state في الـ schema الرسمي (86 عمود) */
      simulationState: row.status === "COMPROMISED" ? "QUARANTINED" : "OPERATIONAL",
      lastSeenAt: row.lastSeenAt,
      riskScore: row.riskScore,
      riskLevel: levelForScore(row.riskScore),
      incidentCount: row.incidentCount,
      eventCount: row.eventCount,
      /* UI-only — مش في الـ backend (شوف docs/API-CONTRACT.md §4) */
      topicNamespace: null,
      baseline: null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  },
);
