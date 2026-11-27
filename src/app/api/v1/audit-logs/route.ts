/**
 * ================================================================
 *  GET /api/v1/audit-logs   (append-only — قراءة فقط)
 * ================================================================
 *  مفيش POST/PATCH/DELETE: الجدول بيتكتب من الـ services بس.
 */

import type { NextRequest } from "next/server";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { zPagination } from "@/db/validators";
import { paginated, validationFail } from "@/lib/envelope";
import { withErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

const filtersSchema = zPagination.extend({
  search: z.string().optional(),
  actorType: z.string().optional(),
  actorId: z.string().optional(),
  entityType: z.string().optional(),
  action: z.string().optional(),
});

export const GET = withErrorHandling(async (req: NextRequest) => {
  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = filtersSchema.safeParse(params);
  if (!parsed.success) return validationFail(parsed.error.flatten());

  const { page, pageSize, search, actorType, actorId, entityType, action } = parsed.data;

  const filters: SQL[] = [];
  if (actorType && actorType !== "ALL") filters.push(eq(auditLog.actorType, actorType));
  if (actorId) filters.push(eq(auditLog.actorId, actorId));
  if (entityType && entityType !== "ALL") filters.push(eq(auditLog.entityType, entityType));
  if (action) filters.push(eq(auditLog.action, action));
  if (search) {
    const like = `%${search}%`;
    const cond = or(ilike(auditLog.actorId, like), ilike(auditLog.action, like));
    if (cond) filters.push(cond);
  }

  const where = filters.length ? and(...filters) : undefined;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(auditLog)
    .where(where);

  const rows = await db
    .select()
    .from(auditLog)
    .where(where)
    .orderBy(desc(auditLog.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const items = rows.map((r) => ({
    id: r.auditId,
    createdAt: r.createdAt,
    actorType: r.actorType,
    actorId: r.actorId,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    /* UI: outcome مش عمود في الـ schema — نستنتجه من الـ action */
    outcome: /REJECT|FAIL|DENIED/.test(r.action) ? "DENIED" : "SUCCESS",
    details: r.details,
    ipAddress: r.ipAddress,
  }));

  return paginated(items, total, page, pageSize);
});
