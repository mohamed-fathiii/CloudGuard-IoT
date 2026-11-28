/**
 * fix-smoke.mjs — إصلاح ترتيب اختبارات smoke.mjs (تشغيل لمرة واحدة)
 *
 * المشكلة: smoke.mjs بيحاول يحذف حادث عنده response_action،
 *         والـ FK معمول ON DELETE RESTRICT → يفشل الاختبار.
 *
 * الإصلاح: نختبر RESTRICT الأول (متوقع يرفض)، وبعدها نشيل الإجراءات
 *          عشان اختبار CASCADE ينجح.
 *
 * التشغيل (من جذر المشروع ~/CloudGuard-IoT):
 *     node fix-smoke.mjs              ← يصلح scripts/smoke.mjs
 *     node fix-smoke.mjs --dry-run    ← يعرض اللي هيتغير بدون كتابة
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const PATH = "scripts/smoke.mjs";
const dry = process.argv.includes("--dry-run");

if (!existsSync(PATH)) {
  console.error(`✖ مش لاقي ${PATH}`);
  console.error("   شغّل الأمر من جذر المشروع:  cd ~/CloudGuard-IoT");
  process.exit(1);
}

let src = readFileSync(PATH, "utf8");

/* لو متصلح قبل كده */
if (src.includes("fk_response_action_incident (RESTRICT)")) {
  console.log("✔ الملف متصلح بالفعل — مفيش حاجة تتعمل.");
  console.log("   الخطوة التالية:  npm run db:smoke");
  process.exit(0);
}

const MARKER = "delete from incident where incident_id = ${ids.incident}";
const lines = src.split("\n");

/* نلاقي أول سطر فيه MARKER و**_مش_** جوه try (يعني الحذف المباشر) */
let target = -1;
for (let i = 0; i < lines.length; i++) {
  if (!lines[i].includes(MARKER)) continue;
  /* لو السطر اللي فوقه فيه "try {" يبقى ده مش الهدف */
  const prev = (lines[i - 1] ?? "").trim();
  if (prev.startsWith("try")) continue;
  target = i;
  break;
}

if (target === -1) {
  console.error("✖ مش لاقي سطر الحذف المباشر.");
  console.error(`   ابحث يدويًا عن: ${MARKER}`);
  process.exit(1);
}

const INSERT = [
  "  /* لازم نشيل الإجراءات الأول — FK معمول ON DELETE RESTRICT */",
  "  await sql`delete from response_action where incident_id = ${ids.incident}`;",
];

if (dry) {
  console.log(`─── dry run — هتتضاف ${INSERT.length} سطور قبل السطر ${target + 1} ───`);
  INSERT.forEach((l) => console.log("+ " + l));
  console.log("\n(مفيش أي كتابة — شيل --dry-run للتطبيق)");
  process.exit(0);
}

lines.splice(target, 0, ...INSERT);
writeFileSync(PATH, lines.join("\n"), "utf8");

console.log("✔ تم الإصلاح");
console.log(`  اتضافت ${INSERT.length} سطور قبل السطر ${target + 1} من ${PATH}`);
console.log("\nالخطوة التالية:");
console.log("  npm run db:smoke");
