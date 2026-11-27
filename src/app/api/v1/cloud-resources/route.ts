/**
 * ================================================================
 *  /api/v1/cloud-resources
 * ================================================================
 *  GET  — موارد السحابة
 *  POST — تسجيل مورد جديد (ARN فقط — ممنوع أي مفتاح AWS)
 */

import type { NextRequest } from "next/server";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { cloudResource } from "@/db/schema";
import { insertCloudResourceSchema, zPagination } from "@/db/validators";
import { created, paginated, validationFail, fail } from "@/lib/envelope";
import { withErrorHandling, jsonError } from "@/lib/api-error";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const filtersSchema = zPagination.extend({
  search: z.string().optional(),
  resourceType: z.string().optional(),
  status: z.string().optional(),
  environment: z.string().optional(),
  region: z.string().optional(),
  sort: z.string().optional(),
});

export const GET = withErrorHandling(async (req: NextRequest) => {
  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = filtersSchema.safeParse(params);
  if (!parsed.success) return validationFail(parsed.error.flatten());

  const { page, pageSize, search, resourceType, status, environment, region } = parsed.data;

  const filters: SQL[] = [];
  if (search) {
    const like = `%${search}%`;
    const cond = or(
      ilike(cloudResource.resourceName, like),
      ilike(cloudResource.providerResourceId, like),
      ilike(cloudResource.region, like),
    );
    if (cond) filters.push(cond);
  }
  if (resourceType && resourceType !== "ALL") filters.push(eq(cloudResource.resourceType, resourceType));
  if (status && status !== "ALL") filters.push(eq(cloudResource.status, status));
  if (environment && environment !== "ALL") filters.push(eq(cloudResource.environment, environment));
  if (region) filters.push(eq(cloudResource.region, region));

  const where = filters.length ? and(...filters) : undefined;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(cloudResource)
    .where(where);

  const rows = await db
    .select()
    .from(cloudResource)
    .where(where)
    .orderBy(desc(cloudResource.updatedAt), asc(cloudResource.resourceName))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const items = rows.map((r) => ({
    id: r.resourceId,
    resourceName: r.resourceName,
    resourceType: r.resourceType,
    provider: r.provider,
    providerResourceId: r.providerResourceId,
    region: r.region,
    environment: r.environment,
    status: r.status,
    tags: r.tags,
    lastScannedAt: r.lastScannedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    /* كل الموارد في الـ MVP محاكاة — التصميم بيقول provider = AWS فقط */
    simulated: true,
  }));

  return paginated(items, total, page, pageSize);
});

const createBody = insertCloudResourceSchema.extend({
  actorId: z.string().max(100).default("api"),
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  if (!body) return fail("VALIDATION_ERROR", "JSON غير صالح");

  const parsed = createBody.safeParse(body);
  if (!parsed.success) return validationFail(parsed.error.flatten());

  const { actorId, ...data } = parsed.data;

  try {
    const [row] = await db.insert(cloudResource).values(data).returning();

    await audit({
      actorType: "USER",
      actorId,
      action: "CREATE_CLOUD_RESOURCE",
      entityType: "CLOUD_RESOURCE",
      entityId: row.resourceId,
      details: { resourceName: row.resourceName, resourceType: row.resourceType },
    });

    return created(
      {
        id: row.resourceId,
        resourceName: row.resourceName,
        resourceType: row.resourceType,
        provider: row.provider,
        providerResourceId: row.providerResourceId,
        region: row.region,
        environment: row.environment,
        status: row.status,
        tags: row.tags,
        simulated: true,
        createdAt: row.createdAt,
      },
      "تم تسجيل المورد السحابي.",
    );
  } catch (e) {
    return jsonError(e);
  }
});
