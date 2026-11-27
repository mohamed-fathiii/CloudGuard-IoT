/**
 * ================================================================
 *  CloudGuard IoT — Physical Schema (Drizzle ORM + PostgreSQL 16)
 * ================================================================
 *
 *  ⚠️ المرجع الحاكم: `Database-Design/Physical-Schema.docx` + `ERD_Dgram.pdf`
 *     اللي الفريق عملهم وموجودين على GitHub.
 *     الملف ده **مرآة أمينة** للتصميم ده — مش اجتهاد شخصي.
 *
 *  8 جداول · 86 عمود · مفردات مسيطر عليها (UPPER_SNAKE_CASE)
 *
 *  الاختلافات الجوهرية عن أي schema سابق:
 *   - الأسماء **مفردة**: device / security_event / audit_log (مش devices...)
 *   - PKs كلها `uuid` بـ `gen_random_uuid()` (مش text prefixed)
 *   - `security_event` مالهاش device_id إجباري: source_type بيحدد
 *     (IOT_DEVICE → device_id، CLOUD_RESOURCE → resource_id، SYSTEM → الاتنين NULL)
 *     وده محمي بـ CHECK constraint اسمه ck_security_event_source_link
 *   - `incident_event` جدول ربط M:N بين incident و security_event
 *   - `risk_assessment` مش unique على event_id (الـ ERD مفيهوش UK)
 *     لأن النظام قد يعيد التقييم بموديل أحدث
 *   - مفيش جدول users في النطاق (assigned_to / performed_by / actor_id نصوص)
 *     → ده قرار موثّق في Data-Dictionary بعنوان "no User FK in this scope"
 *
 *  ترتيب الـ insert الإجباري:
 *  device → cloud_resource → security_event → risk_assessment
 *         → incident → incident_event → response_action → audit_log
 */

import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  smallint,
  decimal,
  jsonb,
  timestamp,
  inet,
  macaddr,
  index,
  uniqueIndex,
  primaryKey,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/* ================================================================
   1) المفردات المسيطر عليها (Controlled Vocabularies)
   نسخة TypeScript مطابقة حرفياً للـ Data-Dictionary — تُستخدم
   في الـ validators وتُعيد نفس القيم للـ API.
   ================================================================ */

export const SEVERITY_VALUES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type Severity = (typeof SEVERITY_VALUES)[number];

/** حدود الـ risk_level الرسمية من الـ Physical Schema (ليست 0-29/30-59) */
export const RISK_BANDS: ReadonlyArray<{ level: Severity; min: number; max: number }> = [
  { level: "LOW", min: 0, max: 24 },
  { level: "MEDIUM", min: 25, max: 49 },
  { level: "HIGH", min: 50, max: 74 },
  { level: "CRITICAL", min: 75, max: 100 },
];

export const DEVICE_TYPE_VALUES = ["SENSOR", "CAMERA", "GATEWAY", "ACTUATOR", "SMART_LOCK", "OTHER"] as const;
export const DEVICE_STATUS_VALUES = ["ONLINE", "OFFLINE", "COMPROMISED", "MAINTENANCE", "DECOMMISSIONED"] as const;
export const ENVIRONMENT_VALUES = ["DEVELOPMENT", "TESTING", "STAGING", "PRODUCTION", "SIMULATION"] as const;
export const CLOUD_RESOURCE_TYPE_VALUES = ["EC2", "S3", "IAM", "LAMBDA", "RDS", "VPC", "CLOUDFRONT", "OTHER"] as const;
export const CLOUD_STATUS_VALUES = ["ACTIVE", "INACTIVE", "TERMINATED", "ERROR"] as const;
export const SOURCE_TYPE_VALUES = ["IOT_DEVICE", "CLOUD_RESOURCE", "SYSTEM"] as const;
export const EVENT_TYPE_VALUES = [
  "UNAUTHORIZED_ACCESS", "FAILED_LOGIN", "MALWARE_DETECTED", "ANOMALOUS_TRAFFIC", "PORT_SCAN",
  "PRIVILEGE_ESCALATION", "CONFIGURATION_CHANGE", "DATA_EXFILTRATION", "FIRMWARE_TAMPERING", "OTHER",
] as const;
export const INCIDENT_STATUS_VALUES = ["OPEN", "INVESTIGATING", "CONTAINED", "RESOLVED", "CLOSED", "FALSE_POSITIVE"] as const;
export const RESPONSE_STATUS_VALUES = ["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED"] as const;
export const ACTION_TYPE_VALUES = [
  "ISOLATE_DEVICE", "BLOCK_IP", "TERMINATE_RESOURCE", "REVOKE_CREDENTIALS", "QUARANTINE_FILE",
  "NOTIFY_ADMIN", "RESTART_DEVICE", "PATCH_FIRMWARE", "OTHER",
] as const;
export const ACTOR_TYPE_VALUES = ["USER", "SYSTEM", "DEVICE", "SERVICE"] as const;
export const AUDIT_ENTITY_VALUES = [
  "DEVICE", "CLOUD_RESOURCE", "SECURITY_EVENT", "RISK_ASSESSMENT", "INCIDENT",
  "INCIDENT_EVENT", "RESPONSE_ACTION", "AUDIT_LOG", "OTHER",
] as const;

export type DeviceTypeValue = (typeof DEVICE_TYPE_VALUES)[number];
export type IncidentStatus = (typeof INCIDENT_STATUS_VALUES)[number];
export type ResponseStatus = (typeof RESPONSE_STATUS_VALUES)[number];
export type ActionTypeValue = (typeof ACTION_TYPE_VALUES)[number];

/* ================================================================
   Helper: SQL array للـ CHECK constraints
   ================================================================ */
const inList = (values: readonly string[]) =>
  sql.raw(`(${values.map((v) => `'${v}'`).join(", ")})`);

/* ================================================================
   1) device
   ================================================================ */
export const device = pgTable(
  "device",
  {
    deviceId: uuid("device_id").primaryKey().defaultRandom(),
    deviceName: varchar("device_name", { length: 100 }).notNull(),
    deviceType: varchar("device_type", { length: 30 }).notNull(),
    manufacturer: varchar("manufacturer", { length: 100 }),
    model: varchar("model", { length: 100 }),
    ipAddress: inet("ip_address"),
    macAddress: macaddr("mac_address"),
    firmwareVersion: varchar("firmware_version", { length: 50 }),
    location: varchar("location", { length: 150 }),
    status: varchar("status", { length: 20 }).notNull().default("OFFLINE"),
    environment: varchar("environment", { length: 20 }).notNull().default("SIMULATION"),
    isSimulated: boolean("is_simulated").notNull().default(true),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_device_device_name").on(t.deviceName),
    uniqueIndex("uq_device_mac_address").on(t.macAddress),
    check("ck_device_type", sql`${t.deviceType} IN ${inList(DEVICE_TYPE_VALUES)}`),
    check("ck_device_status", sql`${t.status} IN ${inList(DEVICE_STATUS_VALUES)}`),
    check("ck_device_environment", sql`${t.environment} IN ${inList(ENVIRONMENT_VALUES)}`),
    index("idx_device_status").on(t.status),
    index("idx_device_environment").on(t.environment),
    index("idx_device_type").on(t.deviceType),
    index("idx_device_last_seen_at").on(t.lastSeenAt),
  ],
);

/* ================================================================
   2) cloud_resource
   ================================================================ */
export const cloudResource = pgTable(
  "cloud_resource",
  {
    resourceId: uuid("resource_id").primaryKey().defaultRandom(),
    resourceName: varchar("resource_name", { length: 150 }).notNull(),
    resourceType: varchar("resource_type", { length: 50 }).notNull(),
    provider: varchar("provider", { length: 20 }).notNull().default("AWS"),
    providerResourceId: varchar("provider_resource_id", { length: 255 }).notNull(),
    region: varchar("region", { length: 50 }).notNull(),
    environment: varchar("environment", { length: 20 }).notNull().default("SIMULATION"),
    status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
    tags: jsonb("tags").$type<Record<string, unknown>>().notNull().default({}),
    lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_cloud_resource_provider_id").on(t.providerResourceId),
    check("ck_cloud_resource_type", sql`${t.resourceType} IN ${inList(CLOUD_RESOURCE_TYPE_VALUES)}`),
    check("ck_cloud_resource_provider", sql`${t.provider} IN ('AWS')`),
    check("ck_cloud_resource_environment", sql`${t.environment} IN ${inList(ENVIRONMENT_VALUES)}`),
    check("ck_cloud_resource_status", sql`${t.status} IN ${inList(CLOUD_STATUS_VALUES)}`),
    check("ck_cloud_resource_tags_object", sql`jsonb_typeof(${t.tags}) = 'object'`),
    index("idx_cloud_resource_type").on(t.resourceType),
    index("idx_cloud_resource_region").on(t.region),
    index("idx_cloud_resource_status").on(t.status),
    index("idx_cloud_resource_environment").on(t.environment),
  ],
);

/* ================================================================
   3) security_event
   ================================================================ */
export const securityEvent = pgTable(
  "security_event",
  {
    eventId: uuid("event_id").primaryKey().defaultRandom(),
    sourceType: varchar("source_type", { length: 20 }).notNull(),
    deviceId: uuid("device_id").references(() => device.deviceId, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    resourceId: uuid("resource_id").references(() => cloudResource.resourceId, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    eventType: varchar("event_type", { length: 60 }).notNull(),
    severity: varchar("severity", { length: 10 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    sourceIp: inet("source_ip"),
    destinationIp: inet("destination_ip"),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>(),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("ck_security_event_source_type", sql`${t.sourceType} IN ${inList(SOURCE_TYPE_VALUES)}`),
    check("ck_security_event_type", sql`${t.eventType} IN ${inList(EVENT_TYPE_VALUES)}`),
    check("ck_security_event_severity", sql`${t.severity} IN ${inList(SEVERITY_VALUES)}`),
    /* القاعدة المركزية: الـ source_type بيحدد أنهي FK يمتلئ */
    check(
      "ck_security_event_source_link",
      sql`(
        (${t.sourceType} = 'IOT_DEVICE'     AND ${t.deviceId} IS NOT NULL AND ${t.resourceId} IS NULL) OR
        (${t.sourceType} = 'CLOUD_RESOURCE' AND ${t.resourceId} IS NOT NULL AND ${t.deviceId} IS NULL) OR
        (${t.sourceType} = 'SYSTEM'         AND ${t.deviceId} IS NULL AND ${t.resourceId} IS NULL)
      )`,
    ),
    index("idx_security_event_device_id").on(t.deviceId),
    index("idx_security_event_resource_id").on(t.resourceId),
    index("idx_security_event_severity").on(t.severity),
    index("idx_security_event_type").on(t.eventType),
    index("idx_security_event_source_type").on(t.sourceType),
    index("idx_security_event_detected_at").on(t.detectedAt),
  ],
);

/* ================================================================
   4) risk_assessment
   ================================================================ */
export const riskAssessment = pgTable(
  "risk_assessment",
  {
    assessmentId: uuid("assessment_id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => securityEvent.eventId, { onDelete: "cascade", onUpdate: "cascade" }),
    riskScore: smallint("risk_score").notNull(),
    riskLevel: varchar("risk_level", { length: 10 }).notNull(),
    confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }),
    scoringModelVersion: varchar("scoring_model_version", { length: 20 }).notNull().default("v1.0"),
    explanation: text("explanation").notNull(),
    factors: jsonb("factors").$type<Record<string, unknown>>().notNull().default({}),
    assessedAt: timestamp("assessed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("ck_risk_assessment_score", sql`${t.riskScore} BETWEEN 0 AND 100`),
    check(
      "ck_risk_assessment_confidence",
      sql`${t.confidenceScore} IS NULL OR ${t.confidenceScore} BETWEEN 0 AND 100`,
    ),
    check("ck_risk_assessment_level", sql`${t.riskLevel} IN ${inList(SEVERITY_VALUES)}`),
    /* الـ risk_level لازم يطابق الـ risk_score — نفس الحدود اللي في الـ Physical Schema */
    check(
      "ck_risk_assessment_level_matches_score",
      sql`(
        (${t.riskScore} BETWEEN 0  AND 24  AND ${t.riskLevel} = 'LOW') OR
        (${t.riskScore} BETWEEN 25 AND 49  AND ${t.riskLevel} = 'MEDIUM') OR
        (${t.riskScore} BETWEEN 50 AND 74  AND ${t.riskLevel} = 'HIGH') OR
        (${t.riskScore} BETWEEN 75 AND 100 AND ${t.riskLevel} = 'CRITICAL')
      )`,
    ),
    check("ck_risk_assessment_factors_object", sql`jsonb_typeof(${t.factors}) = 'object'`),
    index("idx_risk_assessment_event_id").on(t.eventId),
    index("idx_risk_assessment_level").on(t.riskLevel),
    index("idx_risk_assessment_assessed_at").on(t.assessedAt),
  ],
);

/* ================================================================
   5) incident
   ================================================================ */
export const incident = pgTable(
  "incident",
  {
    incidentId: uuid("incident_id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    severity: varchar("severity", { length: 10 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("OPEN"),
    riskScore: smallint("risk_score").notNull().default(0),
    assignedTo: varchar("assigned_to", { length: 100 }),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("ck_incident_severity", sql`${t.severity} IN ${inList(SEVERITY_VALUES)}`),
    check("ck_incident_status", sql`${t.status} IN ${inList(INCIDENT_STATUS_VALUES)}`),
    check("ck_incident_risk_score", sql`${t.riskScore} BETWEEN 0 AND 100`),
    check("ck_incident_closed_at_valid", sql`${t.closedAt} IS NULL OR ${t.closedAt} >= ${t.openedAt}`),
    /* حالة مغلقة ⟺ closed_at موجود */
    check(
      "ck_incident_closure_consistency",
      sql`(
        (${t.status} IN ('RESOLVED','CLOSED','FALSE_POSITIVE') AND ${t.closedAt} IS NOT NULL) OR
        (${t.status} NOT IN ('RESOLVED','CLOSED','FALSE_POSITIVE') AND ${t.closedAt} IS NULL)
      )`,
    ),
    index("idx_incident_status").on(t.status),
    index("idx_incident_severity").on(t.severity),
    index("idx_incident_opened_at").on(t.openedAt),
    index("idx_incident_assigned_to").on(t.assignedTo),
  ],
);

/* ================================================================
   6) incident_event  (M:N بين incident و security_event)
   ================================================================ */
export const incidentEvent = pgTable(
  "incident_event",
  {
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incident.incidentId, { onDelete: "cascade", onUpdate: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => securityEvent.eventId, { onDelete: "cascade", onUpdate: "cascade" }),
    correlationReason: text("correlation_reason"),
    linkedBy: varchar("linked_by", { length: 100 }),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "pk_incident_event", columns: [t.incidentId, t.eventId] }),
    index("idx_incident_event_event_id").on(t.eventId),
  ],
);

/* ================================================================
   7) response_action
   ================================================================ */
export const responseAction = pgTable(
  "response_action",
  {
    actionId: uuid("action_id").primaryKey().defaultRandom(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incident.incidentId, { onDelete: "restrict", onUpdate: "cascade" }),
    actionType: varchar("action_type", { length: 50 }).notNull(),
    description: text("description").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
    isAutomated: boolean("is_automated").notNull().default(false),
    performedBy: varchar("performed_by", { length: 100 }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("ck_response_action_type", sql`${t.actionType} IN ${inList(ACTION_TYPE_VALUES)}`),
    check("ck_response_action_status", sql`${t.status} IN ${inList(RESPONSE_STATUS_VALUES)}`),
    check(
      "ck_response_action_times",
      sql`${t.completedAt} IS NULL OR ${t.startedAt} IS NULL OR ${t.completedAt} >= ${t.startedAt}`,
    ),
    index("idx_response_action_incident_id").on(t.incidentId),
    index("idx_response_action_status").on(t.status),
    index("idx_response_action_type").on(t.actionType),
  ],
);

/* ================================================================
   8) audit_log  (append-only)
   ================================================================ */
export const auditLog = pgTable(
  "audit_log",
  {
    auditId: uuid("audit_id").primaryKey().defaultRandom(),
    actorType: varchar("actor_type", { length: 20 }).notNull(),
    actorId: varchar("actor_id", { length: 100 }).notNull(),
    action: varchar("action", { length: 100 }).notNull(),
    /* polymorphic — مقصود بدون FK للحفاظ على التاريخ */
    entityType: varchar("entity_type", { length: 50 }),
    entityId: uuid("entity_id"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    ipAddress: inet("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("ck_audit_log_actor_type", sql`${t.actorType} IN ${inList(ACTOR_TYPE_VALUES)}`),
    check(
      "ck_audit_log_entity_type",
      sql`${t.entityType} IS NULL OR ${t.entityType} IN ${inList(AUDIT_ENTITY_VALUES)}`,
    ),
    check("ck_audit_log_details_object", sql`jsonb_typeof(${t.details}) = 'object'`),
    index("idx_audit_log_actor").on(t.actorType, t.actorId),
    index("idx_audit_log_entity").on(t.entityType, t.entityId),
    index("idx_audit_log_created_at").on(t.createdAt),
  ],
);

/* ================================================================
   Relations — للاستعلامات المتداخلة db.query.*
   ================================================================ */
export const deviceRelations = relations(device, ({ many }) => ({
  securityEvents: many(securityEvent),
}));

export const cloudResourceRelations = relations(cloudResource, ({ many }) => ({
  securityEvents: many(securityEvent),
}));

export const securityEventRelations = relations(securityEvent, ({ one, many }) => ({
  device: one(device, { fields: [securityEvent.deviceId], references: [device.deviceId] }),
  resource: one(cloudResource, {
    fields: [securityEvent.resourceId],
    references: [cloudResource.resourceId],
  }),
  riskAssessments: many(riskAssessment),
  incidentLinks: many(incidentEvent),
}));

export const riskAssessmentRelations = relations(riskAssessment, ({ one }) => ({
  event: one(securityEvent, {
    fields: [riskAssessment.eventId],
    references: [securityEvent.eventId],
  }),
}));

export const incidentRelations = relations(incident, ({ many }) => ({
  eventLinks: many(incidentEvent),
  responseActions: many(responseAction),
}));

export const incidentEventRelations = relations(incidentEvent, ({ one }) => ({
  incident: one(incident, {
    fields: [incidentEvent.incidentId],
    references: [incident.incidentId],
  }),
  event: one(securityEvent, {
    fields: [incidentEvent.eventId],
    references: [securityEvent.eventId],
  }),
}));

export const responseActionRelations = relations(responseAction, ({ one }) => ({
  incident: one(incident, {
    fields: [responseAction.incidentId],
    references: [incident.incidentId],
  }),
}));

/* ================================================================
   Inferred Types
   ================================================================ */
export type Device = typeof device.$inferSelect;
export type NewDevice = typeof device.$inferInsert;
export type CloudResource = typeof cloudResource.$inferSelect;
export type NewCloudResource = typeof cloudResource.$inferInsert;
export type SecurityEvent = typeof securityEvent.$inferSelect;
export type NewSecurityEvent = typeof securityEvent.$inferInsert;
export type RiskAssessment = typeof riskAssessment.$inferSelect;
export type NewRiskAssessment = typeof riskAssessment.$inferInsert;
export type Incident = typeof incident.$inferSelect;
export type NewIncident = typeof incident.$inferInsert;
export type IncidentEvent = typeof incidentEvent.$inferSelect;
export type NewIncidentEvent = typeof incidentEvent.$inferInsert;
export type ResponseAction = typeof responseAction.$inferSelect;
export type NewResponseAction = typeof responseAction.$inferInsert;
export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;

/* للـ API layer */
export { type AnyPgColumn };
