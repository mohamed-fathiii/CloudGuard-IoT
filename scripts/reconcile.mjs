/**
 * reconcile.mjs — دروب كامل للـ 8 جداول + أي جدول legacy
 * ⚠️ بيمسح كل البيانات. للـ dev فقط.
 * التشغيل: npm run db:clean
 */

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✖ DATABASE_URL مش موجود");
  process.exit(1);
}

const isLocal = /(^|@)(localhost|127\.0\.0\.1|::1)(:|\/|$)/.test(url);
const sql = postgres(url, { ssl: isLocal ? false : "require", max: 1 });

/* الترتيب: الأبناء قبل الآباء (الـ CASCADE بيسهل، بس للوضوح) */
const TABLES = [
  "audit_log",
  "response_action",
  "incident_event",
  "incident",
  "risk_assessment",
  "security_event",
  "cloud_resource",
  "device",
  /* أي بقايا من schema قديم */
  "devices_legacy",
  "security_events_legacy",
  "risk_assessments_legacy",
  "incidents_legacy",
  "response_actions_legacy",
  "audit_logs_legacy",
  "audit_logs",
  "response_actions",
  "incidents",
  "risk_assessments",
  "security_events",
  "cloud_resources",
  "users",
];

try {
  console.log(`→ دروب ${TABLES.length} جدول محتمل...\n`);
  for (const t of TABLES) {
    await sql.unsafe(`drop table if exists "${t}" cascade`);
  }
  await sql.unsafe(`drop schema if exists drizzle cascade`);

  const rows = await sql`select tablename from pg_tables where schemaname='public' order by 1`;
  console.log("الجداول المتبقية:", rows.length ? rows.map((r) => r.tablename).join(", ") : "(مفيش)");
  console.log("\n✔ نضيف. الخطوة التالية: npm run db:push");
} catch (e) {
  console.error("✖ فشل:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
