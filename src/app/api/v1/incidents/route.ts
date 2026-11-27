/**
 * ================================================================
 *  /api/v1/incidents
 * ================================================================
 *  GET   — قائمة الحوادث (فلاتر Frontend)
 *  POST  — فتح حادث يدوي + ربط أحداث بـ incident_event
 *  PATCH — تحديث الحالة/التعيين (مع closed_at تلقائي)
 */

import type { NextRequest } from "next/server";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { incident, incidentEvent } from "@/db/schema";
import {
  insertIncidentSchema,
  updateIncidentSchema,
  incidentFiltersSchema,
  linkIncidentEventSchema,
} from "@/db/validators";
import { ok, created, paginated, validationFail, fail } from "@/lib/envelope";
import { withErrorHandling } from "@/lib/api-error";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/* ================================================================
   GET /api/v1/incidents
   ================================================================ */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = incidentFiltersSchema.safeParse(params);
  if (!parsed.success) return validationFail(parsed.error.flatten());

  const { page, pageSize, search, status, severity, assignedTo, sort } = parsed.data;

  const filters: SQL[] = [];
  if (search) {
    const like = `%${search}%`;
    const cond = or(ilike(incident.title, like), ilike(incident.description, like));
    if (cond) filters.push(cond);
  }
  if (status && status !== "ALL") filters.push(eq(incident.status, status));
  if (severity && severity !== "ALL") filters.push(eq(incident.severity, severity));
  if (assignedTo) filters.push(eq(incident.assignedTo, assignedTo));

  const where = filters.length ? and(...filters) : undefined;

  const orderBy =
    sort === "opened-asc"
      ? [asc(incident.openedAt)]
      : sort === "risk-desc"
        ? [desc(incident.riskScore)]
        : [desc(incident.openedAt)];

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(incident)
    .where(where);

  const rows = await db
    .select({
      incidentId: incident.incidentId,
      title: incident.title,
      description: incident.description,
      severity: incident.severity,
      status: incident.status,
      riskScore: incident.riskScore,
      assignedTo: incident.assignedTo,
      openedAt: incident.openedAt,
      closedAt: incident.closedAt,
      updatedAt: incident.updatedAt,
      eventIds: sql<string[]>`coalesce((
        select array_agg(ie.event_id::text) from incident_event ie
        where ie.incident_id = ${incident.incidentId}
      ), '{}')`,
      deviceId: sql<string | null>`(
        select se.device_id from incident_event ie
        join security_event se on se.event_id = ie.event_id
        where ie.incident_id = ${incident.incidentId} and se.device_id is not null
        limit 1
      )`,
      approvalPending: sql<boolean>`exists(
        select 1 from response_action ra
        where ra.incident_id = ${incident.incidentId} and ra.status = 'PENDING'
      )`,
    })
    .from(incident)
    .where(where)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const items = rows.map((r) => ({
    id: r.incidentId,
    title: r.title,
    description: r.description ?? "",
    deviceId: r.deviceId,
    severity: r.severity,
    status: r.status,
    riskScore: r.riskScore,
    openedAt: r.openedAt,
    updatedAt: r.updatedAt,
    closedAt: r.closedAt,
    assignedTo: r.assignedTo,
    relatedEventIds: r.eventIds ?? [],
    approvalPending: r.approvalPending,
    /* الـ notes/timeline UI-only — الـ Frontend بيبنيها من التفاصيل */
    notes: [],
    timeline: [],
  }));

  return paginated(items, total, page, pageSize);
});

/* ================================================================
   POST /api/v1/incidents
   ================================================================ */
const createIncidentBody = insertIncidentSchema.extend({
  eventIds: z.array(z.string().uuid()).default([]),
  actorId: z.string().max(100).default("api"),
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  if (!body) return fail("VALIDATION_ERROR", "JSON غير صالح");

  const parsed = createIncidentBody.safeParse(body);
  if (!parsed.success) return validationFail(parsed.error.flatten());

  const { eventIds, actorId, ...incidentData } = parsed.data;

  const [created_] = await db.insert(incident).values(incidentData).returning();

  if (eventIds.length) {
    await db
      .insert(incidentEvent)
      .values(
        eventIds.map((eventId) => ({
          incidentId: created_.incidentId,
          eventId,
          correlationReason: "ربط يدوي من الـ API",
          linkedBy: actorId,
        })),
      )
      .onConflictDoNothing();
  }

  await audit({
    actorType: "USER",
    actorId,
    action: "CREATE_INCIDENT",
    entityType: "INCIDENT",
    entityId: created_.incidentId,
    details: { title: created_.title, severity: created_.severity, linkedEvents: eventIds.length },
  });

  return created(
    {
      id: created_.incidentId,
      title: created_.title,
      severity: created_.severity,
      status: created_.status,
      riskScore: created_.riskScore,
      openedAt: created_.openedAt,
      assignedTo: created_.assignedTo,
      relatedEventIds: eventIds,
    },
    "تم فتح الحادث.",
  );
});

/* ================================================================
   PATCH /api/v1/incidents
   ================================================================ */
export const PATCH = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  if (!body) return fail("VALIDATION_ERROR", "JSON غير صالح");

  const idParsed = z.object({ id: z.string().uuid(), actorId: z.string().default("api") }).safeParse(body);
  if (!idParsed.success) return validationFail(idParsed.error.flatten());

  const { id, actorId, ...rest } = body as Record<string, unknown>;
  const parsed = updateIncidentSchema.safeParse(rest);
  if (!parsed.success) return validationFail(parsed.error.flatten());

  const changes = parsed.data;

  const [updated] = await db
    .update(incident)
    .set({
      ...(changes.title !== undefined ? { title: changes.title } : {}),
      ...(changes.description !== undefined ? { description: changes.description } : {}),
      ...(changes.severity !== undefined ? { severity: changes.severity } : {}),
      ...(changes.status !== undefined ? { status: changes.status } : {}),
      ...(changes.riskScore !== undefined ? { riskScore: changes.riskScore } : {}),
      ...(changes.assignedTo !== undefined ? { assignedTo: changes.assignedTo } : {}),
      ...("closedAt" in changes ? { closedAt: changes.closedAt as Date | null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(incident.incidentId, String(id)))
    .returning();

  if (!updated) return fail("NOT_FOUND", "الحادث غير موجود");

  await audit({
    actorType: "USER",
    actorId: String(actorId),
    action: "UPDATE_INCIDENT",
    entityType: "INCIDENT",
    entityId: updated.incidentId,
    details: { status: updated.status, assignedTo: updated.assignedTo },
  });

  return ok(
    {
      id: updated.incidentId,
      title: updated.title,
      description: updated.description,
      severity: updated.severity,
      status: updated.status,
      riskScore: updated.riskScore,
      assignedTo: updated.assignedTo,
      openedAt: updated.openedAt,
      closedAt: updated.closedAt,
      updatedAt: updated.updatedAt,
    },
    "تم تحديث الحادث.",
  );
});
