/**
 * smoke.mjs — اختبار حقيقي على RDS بعد الـ push
 * بيثبت إن الجداول والقيود شغالة فعلاً (مش موجودة بس).
 *
 * التشغيل: npm run db:smoke
 * بيكتب صفوف ببادئة smoke_ ويمسحها في الآخر.
 */

import postgres from "postgres";
import { randomUUID } from "node:crypto";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✖ DATABASE_URL مش موجود");
  process.exit(1);
}

const isLocal = /(^|@)(localhost|127\.0\.0\.1|::1)(:|\/|$)/.test(url);
const sql = postgres(url, { ssl: isLocal ? false : "require", max: 1 });

const T = `smoke_${Date.now().toString(36)}`;
const ids = {
  device: randomUUID(),
  resource: randomUUID(),
  event: randomUUID(),
  assessment: randomUUID(),
  incident: randomUUID(),
  action: randomUUID(),
};

const results = [];
const ok = (m) => { results.push(`✔ ${m}`); console.log(`✔ ${m}`); };
const bad = (m) => { results.push(`✖ ${m}`); console.log(`✖ ${m}`); };

try {
  console.log(`→ Smoke test — البادئة ${T}\n`);

  /* 1) device */
  await sql`insert into device (device_id, device_name, device_type, status, environment)
            values (${ids.device}, ${T + "_device"}, 'SENSOR', 'ONLINE', 'SIMULATION')`;
  ok("device insert");

  /* 2) cloud_resource */
  await sql`insert into cloud_resource (resource_id, resource_name, resource_type, provider_resource_id, region)
            values (${ids.resource}, ${T + "_rds"}, 'RDS', ${T + "_arn"}, 'eu-north-1')`;
  ok("cloud_resource insert");

  /* 3) unique على cloud_resource.provider_resource_id */
  try {
    await sql`insert into cloud_resource (resource_name, resource_type, provider_resource_id, region)
              values (${T + "_dup"}, 'RDS', ${T + "_arn"}, 'eu-north-1')`;
    bad("uq_cloud_resource_provider_id مش شغال");
  } catch { ok("uq_cloud_resource_provider_id يمنع التكرار"); }

  /* 4) security_event — IOT_DEVICE بـ device_id */
  await sql`insert into security_event (event_id, source_type, device_id, event_type, severity, title, detected_at)
            values (${ids.event}, 'IOT_DEVICE', ${ids.device}, 'UNAUTHORIZED_ACCESS', 'HIGH', ${T + " event"}, now() - interval '20 minutes')`;
  ok("security_event insert (IOT_DEVICE + device_id)");

  /* 5) القاعدة المركزية: IOT_DEVICE بـ resource_id → لازم يرفض */
  try {
    await sql`insert into security_event (source_type, device_id, resource_id, event_type, severity, title)
              values ('IOT_DEVICE', ${ids.device}, ${ids.resource}, 'PORT_SCAN', 'LOW', ${T + "_bad"})`;
    bad("ck_security_event_source_link مش شغال (قبل IOT_DEVICE + resource_id)");
  } catch (e) {
    /source_link|check/i.test(e.message)
      ? ok("ck_security_event_source_link يمنع IOT_DEVICE مع resource_id")
      : bad(`خطأ غير متوقع: ${e.message.slice(0, 80)}`);
  }

  /* 6) SYSTEM بدون أي FK → مسموح */
  await sql`insert into security_event (source_type, event_type, severity, title)
            values ('SYSTEM', 'CONFIGURATION_CHANGE', 'LOW', ${T + "_sys"})`;
  ok("source_type=SYSTEM بدون device/resource مقبول");

  /* 7) risk_assessment — التطابق score/level */
  await sql`insert into risk_assessment (assessment_id, event_id, risk_score, risk_level, explanation, factors)
            values (${ids.assessment}, ${ids.event}, 82, 'CRITICAL', 'smoke test', '{"factors":[]}'::jsonb)`;
  ok("risk_assessment insert (82 → CRITICAL)");

  try {
    await sql`insert into risk_assessment (event_id, risk_score, risk_level, explanation)
              values (${ids.event}, 82, 'LOW', 'mismatch')`;
    bad("ck_risk_assessment_level_matches_score مش شغال");
  } catch { ok("ck_risk_assessment_level_matches_score يمنع 82/LOW"); }

  /* 8) incident + incident_event */
  await sql`insert into incident (incident_id, title, severity, status, risk_score, opened_at)
            values (${ids.incident}, ${T + " incident"}, 'CRITICAL', 'OPEN', 82, now())`;
  await sql`insert into incident_event (incident_id, event_id, correlation_reason, linked_by)
            values (${ids.incident}, ${ids.event}, 'smoke', 'SYSTEM')`;
  ok("incident + incident_event insert");

  try {
    await sql`insert into incident_event (incident_id, event_id) values (${ids.incident}, ${ids.event})`;
    bad("pk_incident_event مش شغال (سمح بتكرار الربط)");
  } catch { ok("pk_incident_event يمنع ربط نفس الحدث مرتين"); }

  /* 9) closure consistency */
  try {
    await sql`update incident set status = 'CLOSED' where incident_id = ${ids.incident}`;
    bad("ck_incident_closure_consistency مش شغال (CLOSED بدون closed_at)");
  } catch { ok("ck_incident_closure_consistency يمنع CLOSED بدون closed_at"); }

  /* 10) response_action */
  await sql`insert into response_action (action_id, incident_id, action_type, description, status)
            values (${ids.action}, ${ids.incident}, 'ISOLATE_DEVICE', 'smoke isolate', 'PENDING')`;
  ok("response_action insert (PENDING)");

  try {
    await sql`insert into response_action (incident_id, action_type, description)
              values (${ids.incident}, 'NOT_A_REAL_ACTION', 'bad')`;
    bad("ck_response_action_type مش شغال");
  } catch { ok("ck_response_action_type يمنع action_type غير معروف"); }

  /* 11) audit_log */
  await sql`insert into audit_log (actor_type, actor_id, action, entity_type, entity_id, details)
            values ('SYSTEM', 'smoke', 'SMOKE_TEST', 'AUDIT_LOG', ${randomUUID()}, '{}'::jsonb)`;
  ok("audit_log insert");

  /* 12) cascade: حذف الحادث يحذف incident_event */
  await sql`delete from incident where incident_id = ${ids.incident}`;
  const [{ n }] = await sql`select count(*)::int as n from incident_event where incident_id = ${ids.incident}`;
  n === 0 ? ok("ON DELETE CASCADE (incident → incident_event)") : bad("CASCADE مش شغال");

  /* 13) restrict: حذف الجهاز مرفوض لأن فيه أحداث */
  try {
    await sql`delete from device where device_id = ${ids.device}`;
    bad("fk_security_event_device (RESTRICT) مش شغال");
  } catch { ok("ON DELETE RESTRICT يمنع حذف جهاز له أحداث"); }

  /* تنظيف */
  console.log("\n→ تنضيف...");
  await sql`delete from audit_log where actor_id = 'smoke'`;
  await sql`delete from response_action where action_id = ${ids.action}`;
  await sql`delete from risk_assessment where assessment_id = ${ids.assessment}`;
  await sql`delete from security_event where title like ${T + "%"}`;
  await sql`delete from cloud_resource where provider_resource_id = ${T + "_arn"}`;
  await sql`delete from device where device_id = ${ids.device}`;
  console.log("✔ نضيف");

  const failed = results.filter((r) => r.startsWith("✖"));
  console.log("\n" + "=".repeat(52));
  console.log(failed.length === 0 ? `✅ ${results.length} اختبار — كلهم نجحوا` : `🔴 ${failed.length} فشل من ${results.length}`);
  console.log("=".repeat(52));
  if (failed.length) process.exitCode = 1;
} catch (e) {
  console.error("\n✖ Smoke test فشل:", e.message);
  if (/relation .* does not exist/i.test(e.message)) console.error("  → الجداول مش موجودة. شغّل: npm run db:push");
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
