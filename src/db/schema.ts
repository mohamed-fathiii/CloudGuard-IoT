import { pgTable, text, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";

// 1. جدول الأجهزة (Devices)
export const devices = pgTable("devices", {
  id: text("id").primaryKey(), // مثل SIM-07
  name: text("name").notNull(),
  status: text("status").notNull().default("ONLINE"), 
  riskScore: integer("risk_score").notNull().default(0),
  lastSeen: timestamp("last_seen").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 2. جدول الأحداث الأمنية (Security Events)
export const securityEvents = pgTable("security_events", {
  id: text("id").primaryKey(), // evt-001
  deviceId: text("device_id").notNull().references(() => devices.id),
  eventType: text("event_type").notNull(),
  topic: text("topic"),
  payloadSize: integer("payload_size"),
  sourceType: text("source_type").notNull(),
  correlationId: text("correlation_id"),
  timestamp: timestamp("timestamp").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 3. جدول تقييم الخطورة (Risk Assessments)
export const riskAssessments = pgTable("risk_assessments", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => securityEvents.id),
  riskScore: integer("risk_score").notNull(),
  severity: text("severity").notNull(), // LOW, MEDIUM, HIGH, CRITICAL
  triggeredRules: jsonb("triggered_rules").notNull(),
  explanation: jsonb("explanation").notNull(),
  assessedAt: timestamp("assessed_at").defaultNow().notNull(),
});

// 4. جدول الحوادث الأمنية (Incidents)
export const incidents = pgTable("incidents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull().default("OPEN"),
  severity: text("severity").notNull(),
  deviceId: text("device_id").references(() => devices.id),
  assignedAnalyst: text("assigned_analyst"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 5. جدول الاستجابة والإجراءات (Response Actions)
export const responseActions = pgTable("response_actions", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").notNull().references(() => incidents.id),
  deviceId: text("device_id").notNull().references(() => devices.id),
  action: text("action").notNull(),
  status: text("status").notNull().default("PENDING_APPROVAL"),
  mode: text("mode").notNull().default("DRY_RUN"),
  requestedBy: text("requested_by").notNull(),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 6. جدول سجل العمليات (Audit Logs)
export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  actor: text("actor").notNull(),
  actionType: text("action_type").notNull(),
  target: text("target").notNull(),
  details: jsonb("details"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});