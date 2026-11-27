/**
 * ================================================================
 *  GET /api/v1/health
 * ================================================================
 *  تشخيص شامل: اتصال + الجداول + القيود + عدد الصفوف + الـ latency.
 *  ده أول endpoint تعرضه للجنة وللفريق.
 */

import { sql } from "drizzle-orm";
import { db, client } from "@/db";
import { ok, fail } from "@/lib/envelope";
import { unwrapError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

const EXPECTED_TABLES = [
  "audit_log",
  "cloud_resource",
  "device",
  "incident",
  "incident_event",
  "response_action",
  "risk_assessment",
  "security_event",
];

export async function GET() {
  const t0 = performance.now();

  try {
    const versionRows = await db.execute<{ version: string }>(sql`select version()`);
    const vRow = Array.isArray(versionRows) ? versionRows[0] : (versionRows as { rows?: unknown[] }).rows?.[0];

    const tablesRows = await db.execute<{ tablename: string }>(sql`
      select tablename from pg_tables where schemaname = 'public' order by tablename
    `);
    const found = (Array.isArray(tablesRows) ? tablesRows : []).map((r) => r.tablename);
    const missing = EXPECTED_TABLES.filter((t) => !found.includes(t));

    const counts = await db.execute<{ t: string; n: number }>(sql`
      select 'device' as t, count(*)::int as n from device
      union all select 'cloud_resource', count(*)::int from cloud_resource
      union all select 'security_event', count(*)::int from security_event
      union all select 'risk_assessment', count(*)::int from risk_assessment
      union all select 'incident', count(*)::int from incident
      union all select 'incident_event', count(*)::int from incident_event
      union all select 'response_action', count(*)::int from response_action
      union all select 'audit_log', count(*)::int from audit_log
    `);
    const countRows = Array.isArray(counts) ? counts : [];

    const constraintRows = await db.execute<{ contype: string; n: number }>(sql`
      select contype::text as contype, count(*)::int as n
      from pg_constraint where connamespace = 'public'::regnamespace
      group by contype
    `);
    const cRows = Array.isArray(constraintRows) ? constraintRows : [];
    const byType = (t: string) => cRows.find((r) => r.contype === t)?.n ?? 0;

    return ok(
      {
        status: missing.length === 0 ? "OK" : "DEGRADED",
        database: {
          connected: true,
          engine: (vRow as { version?: string })?.version?.split(",")[0] ?? "unknown",
          latencyMs: Math.round(performance.now() - t0),
        },
        schema: {
          expectedTables: EXPECTED_TABLES.length,
          foundTables: found.length,
          missing,
          tables: found,
          constraints: {
            check: byType("c"),
            foreignKey: byType("f"),
            primaryKey: byType("p"),
            unique: byType("u"),
          },
        },
        rowCounts: Object.fromEntries(countRows.map((c) => [c.t, c.n])),
        timestamp: new Date().toISOString(),
      },
      "CloudGuard M2 API is running.",
    );
  } catch (e) {
    const { message, code, hint } = unwrapError(e);
    return fail(
      code,
      hint ? `${message} — ${hint}` : message,
      [{ hint }],
    );
  }
}

/** POST — يقفل الـ pool (للاختبار) */
export async function POST() {
  await client.end({ timeout: 5 });
  return ok({ closed: true }, "Connection pool closed.");
}
