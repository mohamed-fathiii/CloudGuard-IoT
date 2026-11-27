/**
 * healthcheck.mjs — تشخيص شامل قبل/بعد الـ push
 * التشغيل: npm run db:check
 */

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✖ DATABASE_URL مش موجود. شغّل: npm run db:check (بيقرأ .env)");
  process.exit(1);
}

const isLocal = /(^|@)(localhost|127\.0\.0\.1|::1)(:|\/|$)/.test(url);
const safeUrl = url.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");

console.log("→ DATABASE_URL:", safeUrl);
console.log("→ الوضع:", isLocal ? "محلي عبر SSH Tunnel (SSL مقفول)" : "اتصال مباشر بـ RDS (SSL مطلوب)");
console.log("");

const sql = postgres(url, {
  ssl: isLocal ? false : "require",
  max: 1,
  connect_timeout: 12,
});

/* الأسماء المفردة — مطابقة للـ Physical Schema */
const EXPECTED = [
  "audit_log",
  "cloud_resource",
  "device",
  "incident",
  "incident_event",
  "response_action",
  "risk_assessment",
  "security_event",
];

const t0 = Date.now();

try {
  const [info] = await sql`select now() as now, version() as version, current_setting('TimeZone') as tz`;
  console.log(`✔ الاتصال ناجح — ${Date.now() - t0}ms`);
  console.log("   server time :", info.now.toISOString());
  console.log("   engine      :", info.version.split(",")[0]);
  console.log("   timezone    :", info.tz);
  console.log("");

  const rows = await sql`
    select tablename from pg_tables where schemaname = 'public' order by tablename
  `;
  const found = rows.map((r) => r.tablename);
  const missing = EXPECTED.filter((t) => !found.includes(t));
  const extra = found.filter((t) => !EXPECTED.includes(t) && !t.endsWith("_legacy"));

  console.log(`   الجداول (${EXPECTED.length - missing.length}/${EXPECTED.length}):`);
  for (const t of EXPECTED) console.log(`     ${found.includes(t) ? "✔" : "✖"} ${t}`);
  if (extra.length) {
    console.log(`\n   ⚠ جداول زيادة (من schema قديم؟): ${extra.join(", ")}`);
    console.log("     → شغّل: npm run db:clean   (بيمسح كل حاجة)");
  }

  if (missing.length === 0) {
    const counts = {};
    for (const t of EXPECTED) {
      const [{ n }] = await sql.unsafe(`select count(*)::int as n from "${t}"`);
      counts[t] = n;
    }
    console.log("\n   عدد الصفوف:");
    for (const [t, n] of Object.entries(counts)) console.log(`     ${t.padEnd(18)} ${n}`);

    const [constraints] = await sql`
      select
        count(*) filter (where contype='c')::int as checks,
        count(*) filter (where contype='f')::int as fks,
        count(*) filter (where contype='p')::int as pks,
        count(*) filter (where contype='u')::int as uniques
      from pg_constraint where connamespace = 'public'::regnamespace
    `;
    const [{ idx }] = await sql`
      select count(*)::int as idx from pg_indexes
      where schemaname='public' and indexname not like '%_pkey'
    `;
    const [{ cols }] = await sql`
      select count(*)::int as cols from information_schema.columns where table_schema='public'
    `;
    const [{ bad }] = await sql`
      select count(*)::int as bad from information_schema.columns
      where table_schema='public' and data_type='timestamp without time zone'
    `;

    console.log("\n   القيود والفهارس:");
    console.log(`     columns          ${cols}`);
    console.log(`     check constraints ${constraints.checks}`);
    console.log(`     foreign keys      ${constraints.fks}`);
    console.log(`     primary keys      ${constraints.pks}`);
    console.log(`     unique            ${constraints.uniques}`);
    console.log(`     indexes (non-PK)  ${idx}`);
    console.log(
      bad === 0
        ? "     ✔ كل الأوقات with time zone"
        : `     🔴 ${bad} عمود timestamp بدون time zone`,
    );

    /* فحص القاعدة المركزية للـ source_link */
    const [link] = await sql`
      select count(*)::int as violations from security_event
      where (source_type='IOT_DEVICE' and (device_id is null or resource_id is not null))
         or (source_type='CLOUD_RESOURCE' and (resource_id is null or device_id is not null))
         or (source_type='SYSTEM' and (device_id is not null or resource_id is not null))
    `;
    console.log(
      link.violations === 0
        ? "     ✔ ck_security_event_source_link محقق"
        : `     🔴 ${link.violations} صف يخالف source_link`,
    );
  }

  if (missing.length) {
    console.log(`\n✖ جداول ناقصة: ${missing.join(", ")}`);
    console.log("  → شغّل: npm run db:push");
    process.exitCode = 1;
  } else {
    console.log("\n✅ الـ schema مطابق للتصميم الرسمي");
  }
} catch (e) {
  console.error("\n✖ فشل الاتصال:", e.message);
  const m = e.message || "";
  if (m.includes("ECONNREFUSED")) {
    console.error("  السبب: الـ SSH Tunnel مش شغال على 127.0.0.1:5432");
    console.error("  الحل  : ssh -i <key.pem> -N -L 5432:<rds-endpoint>:5432 ec2-user@13.48.2.127");
  } else if (m.includes("ETIMEDOUT")) {
    console.error("  السبب: مش واصل للهوست — لو DATABASE_URL فيه 10.0.1.202 غيّرها لـ 127.0.0.1");
  } else if (m.includes("password authentication failed")) {
    console.error("  السبب: باسورد غلط (أو @ مش URL-encoded → %40)");
  } else if (m.toLowerCase().includes("ssl") || m.includes("self-signed")) {
    console.error("  السبب: SSL على اتصال محلي — الكود بيحط ssl=false تلقائياً لـ 127.0.0.1");
  }
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
