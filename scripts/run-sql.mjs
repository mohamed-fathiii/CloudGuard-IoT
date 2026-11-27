/**
 * run-sql.mjs — تشغيل ملف SQL على RDS من غير pgAdmin
 * التشغيل:  npm run db:sql -- scripts/verify.sql
 *
 * مفيد لو pgAdmin مش راضي يتصل أو محتاج تعمل screenshots بسرعة
 * من الـ terminal نفسه.
 */

import postgres from "postgres";
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("الاستخدام: npm run db:sql -- scripts/verify.sql");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✖ DATABASE_URL مش موجود");
  process.exit(1);
}

const isLocal = /(^|@)(localhost|127\.0\.0\.1|::1)(:|\/|$)/.test(url);
const sql = postgres(url, { ssl: isLocal ? false : "require", max: 1 });

const raw = readFileSync(file, "utf8");

/* 1) نشيل التعليقات الكتلية الأول (فيها فواصل منقوطة بتلخبط التقسيم)
   2) نشيل تعليقات السطر
   3) نقسّم على ; في آخر السطر */
const source = raw
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*--.*$/gm, "");

const statements = source
  .split(/;\s*$/m)
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

try {
  let i = 0;
  for (const stmt of statements) {
    i++;
    const clean = stmt.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (!clean) continue;
    try {
      const rows = await sql.unsafe(clean);
      console.log(`\n${"─".repeat(70)}\n[${i}] ${clean.split("\n")[0].slice(0, 68)}`);
      console.table(rows.slice(0, 50));
      if (rows.length > 50) console.log(`... و ${rows.length - 50} صف كمان`);
    } catch (e) {
      // بعض الـ queries مش بترجع صفوف (DDL) — طبيعي
      if (!/no results returned/i.test(e.message)) {
        console.log(`\n[${i}] ⚠ ${e.message}`);
      }
    }
  }
  console.log(`\n${"─".repeat(70)}\n✔ خلص (${i} statement)`);
} finally {
  await sql.end({ timeout: 5 });
}
