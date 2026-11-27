/**
 * ================================================================
 *  /api/v1/response-actions
 * ================================================================
 *  GET  — قائمة الإجراءات (الفلاتر اللي الـ Frontend بيبعتها)
 *  POST — إنشاء إجراء جديد (PENDING دائماً — الموافقة في مسار تاني)
 *
 *  الموافقة/الرفض: POST /api/v1/response-actions/{id}/approve|reject
 */

import type { NextRequest } from "next/server";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { responseAction, incident } from "@/db/schema";
import { insertResponseActionSchema, zPagination } from "@/db/validators";
import { created, paginated, validationFail, fail } from "@/lib/envelope";
import { withErrorHandling, jsonError } from "@/lib/api-error";
import { audit } from "@/lib/audit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const filtersSchema = zPagination.extend({
  search: z.string().optional(),
  status: z.string().optional(),
  actionType: z.string().optional(),
  incidentId: z.string().uuid().optional(),
});

export const GET = withErrorHandling(async (req: NextRequest) => {
  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = filtersSchema.safeParse(params);
  if (!parsed.success) return validationFail(parsed.error.flatten());

  const { page, pageSize, search, status, actionType, incidentId } = parsed.data;

  const filters: SQL[] = [];
  if (status && status !== "ALL") filters.push(eq(responseAction.status, status));
  if (actionType && actionType !== "ALL") filters.push(eq(responseAction.actionType, actionType));
  if (incidentId) filters.push(eq(responseAction.incidentId, incidentId));
  if (search) {
    const like = `%${search}%`;
    const cond = or(ilike(responseAction.description, like), ilike(responseAction.performedBy, like));
    if (cond) filters.push(cond);
  }

  const where = filters.length ? and(...filters) : undefined;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(responseAction)
    .where(where);

  const rows = await db
    .select({
      actionId: responseAction.actionId,
      incidentId: responseAction.incidentId,
      actionType: responseAction.actionType,
      description: responseAction.description,
      status: responseAction.status,
      isAutomated: responseAction.isAutomated,
      performedBy: responseAction.performedBy,
      startedAt: responseAction.startedAt,
      completedAt: responseAction.completedAt,
      createdAt: responseAction.createdAt,
      incidentTitle: incident.title,
      incidentSeverity: incident.severity,
    })
    .from(responseAction)
    .leftJoin(incident, eq(incident.incidentId, responseAction.incidentId))
    .where(where)
    .orderBy(desc(responseAction.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const items = rows.map((r) => ({
    id: r.actionId,
    incidentId: r.incidentId,
    incidentTitle: r.incidentTitle,
    incidentSeverity: r.incidentSeverity,
    actionType: r.actionType,
    description: r.description,
    status: r.status,
    isAutomated: r.isAutomated,
    performedBy: r.performedBy,
    /* UI: التمييز بين تنفيذ حقيقي و dry run — مستخرج من الوصف */
    execution: /DRY_RUN/.test(r.description) ? "DRY_RUN" : "EXECUTED",
    timestamp: r.completedAt ?? r.startedAt ?? r.createdAt,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    createdAt: r.createdAt,
  }));

  return paginated(items, total, page, pageSize);
});

const createBody = insertResponseActionSchema.extend({
  actorId: z.string().max(100).default("api"),
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  if (!body) return fail("VALIDATION_ERROR", "JSON غير صالح");

  const parsed = createBody.safeParse(body);
  if (!parsed.success) return validationFail(parsed.error.flatten());

  const { actorId, ...data } = parsed.data;

  /* كل إجراء جديد PENDING — مفيش تنفيذ من غير موافقة */
  const [row] = await db
    .insert(responseAction)
    .values({ ...data, status: "PENDING", isAutomated: false })
    .returning();

  await audit({
    actorType: "USER",
    actorId,
    action: "REQUEST_RESPONSE_ACTION",
    entityType: "RESPONSE_ACTION",
    entityId: row.actionId,
    details: { actionType: row.actionType, incidentId: row.incidentId },
  });

  return created(
    {
      id: row.actionId,
      incidentId: row.incidentId,
      actionType: row.actionType,
      description: row.description,
      status: row.status,
      isAutomated: row.isAutomated,
      createdAt: row.createdAt,
    },
    "تم إنشاء الإجراء — بانتظار الموافقة.",
  );
});
