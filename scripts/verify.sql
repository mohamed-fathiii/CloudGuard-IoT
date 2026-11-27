/* ============================================================
   CloudGuard IoT — M2 Verification (Physical Schema)
   المرجع: Database-Design/Physical-Schema.docx
   شغّله في pgAdmin Query Tool — وخد screenshot لكل قسم
   أو من الترمنال: npm run db:sql -- scripts/verify.sql
   ============================================================ */

/* ── 1) الجداول الثمانية (أسماء مفردة) ── */
SELECT tablename AS "Table"
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- المتوقع: 8 صفوف
-- audit_log, cloud_resource, device, incident, incident_event,
-- response_action, risk_assessment, security_event

/* ── 2) الأعمدة (المتوقع 86 عمود) ── */
SELECT table_name AS "Table", count(*) AS "Columns"
FROM information_schema.columns
WHERE table_schema = 'public'
GROUP BY table_name
ORDER BY table_name;

SELECT count(*) AS "Total Columns"
FROM information_schema.columns
WHERE table_schema = 'public';

/* ── 3) العلاقات ── */
SELECT
  tc.table_name   AS "Table",
  kcu.column_name AS "Column",
  ccu.table_name  AS "References",
  rc.delete_rule  AS "On Delete"
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
ORDER BY tc.table_name;

/* ── 4) الـ CHECK constraints (قلب التصميم) ── */
SELECT
  conrelid::regclass AS "Table",
  conname            AS "Constraint",
  pg_get_constraintdef(oid) AS "Definition"
FROM pg_constraint
WHERE contype = 'c' AND connamespace = 'public'::regnamespace
ORDER BY conrelid::regclass::text, conname;

/* ── 5) الـ Indexes ── */
SELECT tablename AS "Table", indexname AS "Index"
FROM pg_indexes
WHERE schemaname = 'public' AND indexname NOT LIKE '%_pkey'
ORDER BY tablename, indexname;

/* ── 6) كل الأوقات لازم with time zone ── */
SELECT table_name AS "Table", column_name AS "Column", data_type AS "Type"
FROM information_schema.columns
WHERE table_schema = 'public' AND data_type LIKE 'timestamp%'
ORDER BY table_name, column_name;
-- المتوقع: الكل "timestamp with time zone" · صفر "without"

SELECT count(*) AS "timestamps_without_tz"
FROM information_schema.columns
WHERE table_schema = 'public' AND data_type = 'timestamp without time zone';

/* ── 7) عدد الصفوف (بعد الـ seed) ── */
SELECT 'device' AS "table", count(*) FROM device
UNION ALL SELECT 'cloud_resource', count(*) FROM cloud_resource
UNION ALL SELECT 'security_event', count(*) FROM security_event
UNION ALL SELECT 'risk_assessment', count(*) FROM risk_assessment
UNION ALL SELECT 'incident', count(*) FROM incident
UNION ALL SELECT 'incident_event', count(*) FROM incident_event
UNION ALL SELECT 'response_action', count(*) FROM response_action
UNION ALL SELECT 'audit_log', count(*) FROM audit_log;

/* ══════════════ صور العرض للجنة ══════════════ */

-- 7أ) ملخص الجداول (Screenshot #1)
SELECT
  c.relname AS "Table",
  (SELECT count(*) FROM information_schema.columns ic
    WHERE ic.table_name = c.relname AND ic.table_schema = 'public') AS "Cols",
  (SELECT count(*) FROM pg_indexes pi WHERE pi.tablename = c.relname) AS "Idx",
  (SELECT count(*) FROM pg_constraint pc
    WHERE pc.conrelid = c.oid AND pc.contype = 'c') AS "Checks",
  (SELECT count(*) FROM pg_constraint pc
    WHERE pc.conrelid = c.oid AND pc.contype = 'f') AS "FKs",
  pg_size_pretty(pg_total_relation_size(c.oid)) AS "Size"
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

-- 7ب) السلسلة الكاملة: جهاز → حدث → تقييم → حادث → إجراءات (Screenshot #2)
SELECT
  d.device_name   AS "Device",
  se.event_type   AS "Event",
  se.severity     AS "Event Sev",
  ra.risk_score   AS "Score",
  ra.risk_level   AS "Level",
  i.severity      AS "Incident Sev",
  i.status        AS "Incident Status",
  (SELECT count(*) FROM response_action x WHERE x.incident_id = i.incident_id) AS "Actions",
  (SELECT count(*) FROM response_action x WHERE x.incident_id = i.incident_id AND x.status='PENDING') AS "Pending"
FROM security_event se
LEFT JOIN device d ON d.device_id = se.device_id
LEFT JOIN risk_assessment ra ON ra.event_id = se.event_id
LEFT JOIN incident_event ie ON ie.event_id = se.event_id
LEFT JOIN incident i ON i.incident_id = ie.incident_id
ORDER BY ra.risk_score DESC NULLS LAST;

-- 7ج) تحقق القاعدة المركزية: source_type ⟷ (device_id / resource_id)
SELECT
  source_type,
  count(*) FILTER (WHERE device_id IS NOT NULL)   AS "with_device",
  count(*) FILTER (WHERE resource_id IS NOT NULL) AS "with_resource",
  count(*) FILTER (WHERE device_id IS NULL AND resource_id IS NULL) AS "with_neither",
  count(*) AS "total"
FROM security_event
GROUP BY source_type
ORDER BY source_type;
-- المتوقع: IOT_DEVICE → with_device فقط، CLOUD_RESOURCE → with_resource فقط، SYSTEM → with_neither
