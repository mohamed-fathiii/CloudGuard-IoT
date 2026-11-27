/**
 * export-csv.mjs — snapshot كامل للفريق (M3/M4) من غير tunnel
 * التشغيل: npm run db:export
 * المخرجات: exports/<table>.csv + _summary.md + _schema.json + _foreign_keys.json
 */

import postgres from "postgres";
import { mkdirSync, writeFileSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✖ DATABASE_URL مش موجود");
  process.exit(1);
}

const isLocal = /(^|@)(localhost|127\.0\.0\.1|::1)(:|\/|$)/.test(url);
const sql = postgres(url, { ssl: isLocal ? false : "require", max: 1 });

const OUT = "exports";
mkdirSync(OUT, { recursive: true });

const TABLES = [
  "device",
  "cloud_resource",
  "security_event",
  "risk_assessment",
  "incident",
  "incident_event",
  "response_action",
  "audit_log",
];

function toCsv(rows) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return v.toISOString();
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

const summary = [
  "# CloudGuard IoT — Data Snapshot (M2)",
  "",
  `> generated: ${new Date().toISOString()}`,
  "> المرجع: `Database-Design/Physical-Schema.docx` — 8 جداول مفردة",
  "",
  "| Table | Rows |",
  "|---|---|",
];

try {
  for (const table of TABLES) {
    const rows = await sql.unsafe(`select * from "${table}" order by 1`);
    writeFileSync(`${OUT}/${table}.csv`, toCsv(rows), "utf8");
    summary.push(`| ${table} | ${rows.length} |`);
    console.log(`✔ ${table.padEnd(18)} ${rows.length} صف`);
  }

  const cols = await sql`
    select table_name, column_name, data_type, is_nullable, column_default
    from information_schema.columns where table_schema='public'
    order by table_name, ordinal_position
  `;
  writeFileSync(`${OUT}/_schema.json`, JSON.stringify(cols, null, 2), "utf8");

  const fks = await sql`
    select tc.table_name, kcu.column_name, ccu.table_name as references, rc.delete_rule
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
    join information_schema.constraint_column_usage ccu on tc.constraint_name = ccu.constraint_name
    join information_schema.referential_constraints rc on tc.constraint_name = rc.constraint_name
    where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public'
    order by tc.table_name
  `;
  writeFileSync(`${OUT}/_foreign_keys.json`, JSON.stringify(fks, null, 2), "utf8");

  const checks = await sql`
    select conrelid::regclass::text as table, conname, pg_get_constraintdef(oid) as def
    from pg_constraint where contype='c' and connamespace='public'::regnamespace
    order by 1, 2
  `;
  writeFileSync(`${OUT}/_check_constraints.json`, JSON.stringify(checks, null, 2), "utf8");

  summary.push(
    "",
    `**Columns:** ${cols.length}`,
    `**Foreign keys:** ${fks.length}`,
    `**CHECK constraints:** ${checks.length}`,
    "",
    "## العلاقات",
    "",
    "| From | Column | → To | On Delete |",
    "|---|---|---|---|",
    ...fks.map((f) => `| ${f.table_name} | ${f.column_name} | ${f.references} | ${f.delete_rule} |`),
    "",
    "## CHECK constraints",
    "",
    "| Table | Constraint |",
    "|---|---|",
    ...checks.map((c) => `| ${c.table} | ${c.conname} |`),
  );

  writeFileSync(`${OUT}/_summary.md`, summary.join("\n"), "utf8");
  console.log(`\n✔ ${OUT}/_summary.md + _schema.json + _foreign_keys.json + _check_constraints.json`);
} catch (e) {
  console.error("✖ فشل:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
