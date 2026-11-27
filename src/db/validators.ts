/**
 * ================================================================
 *  Zod Validators — مطابقة للمفردات المسيطر عليها في الـ schema
 * ================================================================
 *  الهدف: نرفض البيانات الغلط **قبل** الـ DB، برسالة مفهومة للـ Frontend
 *  بدل رسالة Postgres الخام.
 *
 *  كل الـ enums مستوردة من `schema.ts` — مصدر حقيقة واحد.
 */

import { z } from "zod";
import {
  SEVERITY_VALUES,
  DEVICE_TYPE_VALUES,
  DEVICE_STATUS_VALUES,
  ENVIRONMENT_VALUES,
  CLOUD_RESOURCE_TYPE_VALUES,
  CLOUD_STATUS_VALUES,
  SOURCE_TYPE_VALUES,
  EVENT_TYPE_VALUES,
  INCIDENT_STATUS_VALUES,
  RESPONSE_STATUS_VALUES,
  ACTION_TYPE_VALUES,
  ACTOR_TYPE_VALUES,
  AUDIT_ENTITY_VALUES,
} from "./schema";

/* ---------- primitives ---------- */
export const zUuid = z.string().uuid("لازم يكون UUID صالح");
export const zSeverity = z.enum(SEVERITY_VALUES);
export const zJsonObject = z.record(z.string(), z.unknown()).default({});
export const zDateish = z.coerce.date();

/** pagination المشترك — الـ Frontend بيستخدم page / pageSize */
export const zPagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(10),
});

/* ================================================================
   1) device
   ================================================================ */
export const insertDeviceSchema = z.object({
  deviceName: z.string().trim().min(1, "اسم الجهاز مطلوب").max(100),
  deviceType: z.enum(DEVICE_TYPE_VALUES),
  manufacturer: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  ipAddress: z.ipv4().optional(),
  macAddress: z
    .string()
    .regex(/^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/, "صيغة MAC غير صحيحة")
    .optional(),
  firmwareVersion: z.string().max(50).optional(),
  location: z.string().max(150).optional(),
  status: z.enum(DEVICE_STATUS_VALUES).default("OFFLINE"),
  environment: z.enum(ENVIRONMENT_VALUES).default("SIMULATION"),
  isSimulated: z.boolean().default(true),
  lastSeenAt: zDateish.optional(),
});

export const updateDeviceSchema = insertDeviceSchema.partial();

/* ================================================================
   2) cloud_resource
   ================================================================ */
export const insertCloudResourceSchema = z.object({
  resourceName: z.string().trim().min(1).max(150),
  resourceType: z.enum(CLOUD_RESOURCE_TYPE_VALUES),
  provider: z.literal("AWS").default("AWS"),
  providerResourceId: z
    .string()
    .trim()
    .min(3, "الـ ARN مطلوب")
    .max(255)
    /* حماية: ممنوع أي مفتاح AWS يتحفظ هنا */
    .refine((v) => !/^(AKIA|ASIA)[A-Z0-9]{16}$/.test(v), "ده شكله Access Key مش ARN — ممنوع حفظه"),
  region: z.string().min(3).max(50).default("eu-north-1"),
  environment: z.enum(ENVIRONMENT_VALUES).default("SIMULATION"),
  status: z.enum(CLOUD_STATUS_VALUES).default("ACTIVE"),
  tags: zJsonObject,
  lastScannedAt: zDateish.optional(),
});

/* ================================================================
   3) security_event — القاعدة الذهبية للـ source_link
   ================================================================ */
export const insertSecurityEventSchema = z
  .object({
    sourceType: z.enum(SOURCE_TYPE_VALUES),
    deviceId: zUuid.optional(),
    resourceId: zUuid.optional(),
    eventType: z.enum(EVENT_TYPE_VALUES),
    severity: zSeverity,
    title: z.string().trim().min(1).max(200),
    description: z.string().max(4000).optional(),
    sourceIp: z.ipv4().optional(),
    destinationIp: z.ipv4().optional(),
    rawPayload: zJsonObject.optional(),
    detectedAt: zDateish.optional(),
  })
  .superRefine((v, ctx) => {
    /* نفس منطق ck_security_event_source_link في الداتابيز — بس برسالة أوضح */
    if (v.sourceType === "IOT_DEVICE" && (!v.deviceId || v.resourceId)) {
      ctx.addIssue({
        code: "custom",
        path: ["deviceId"],
        message: "source_type=IOT_DEVICE يتطلب deviceId فقط (وبدون resourceId)",
      });
    }
    if (v.sourceType === "CLOUD_RESOURCE" && (!v.resourceId || v.deviceId)) {
      ctx.addIssue({
        code: "custom",
        path: ["resourceId"],
        message: "source_type=CLOUD_RESOURCE يتطلب resourceId فقط (وبدون deviceId)",
      });
    }
    if (v.sourceType === "SYSTEM" && (v.deviceId || v.resourceId)) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceType"],
        message: "source_type=SYSTEM لا يقبل deviceId ولا resourceId",
      });
    }
  });

/* ================================================================
   4) risk_assessment — تحقق تطابق score/level مطابق للـ CHECK
   ================================================================ */
export function levelForScore(score: number): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}

export const insertRiskAssessmentSchema = z
  .object({
    eventId: zUuid,
    riskScore: z.number().int().min(0).max(100),
    riskLevel: zSeverity.optional(),
    confidenceScore: z.number().min(0).max(100).optional(),
    scoringModelVersion: z.string().max(20).default("v1.0"),
    explanation: z.string().trim().min(1, "شرح التقييم مطلوب — NOT NULL ومش فاضي"),
    factors: zJsonObject,
    assessedAt: zDateish.optional(),
  })
  .transform((v) => ({ ...v, riskLevel: v.riskLevel ?? levelForScore(v.riskScore) }))
  .refine((v) => v.riskLevel === levelForScore(v.riskScore), {
    message: "risk_level مش مطابق لـ risk_score (0-24 LOW / 25-49 MEDIUM / 50-74 HIGH / 75-100 CRITICAL)",
    path: ["riskLevel"],
  });

/* ================================================================
   5) incident
   ================================================================ */
const CLOSED_STATUSES = ["RESOLVED", "CLOSED", "FALSE_POSITIVE"];
export const isClosedStatus = (s: string) => CLOSED_STATUSES.includes(s);

export const insertIncidentSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().max(8000).optional(),
  severity: zSeverity,
  status: z.enum(INCIDENT_STATUS_VALUES).default("OPEN"),
  riskScore: z.number().int().min(0).max(100).default(0),
  assignedTo: z.string().max(100).optional(),
  openedAt: zDateish.optional(),
});

/** لما الحالة تبقى مغلقة، الـ closed_at لازم يتحدد تلقائي (CHECK في الداتابيز) */
export const updateIncidentSchema = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().max(8000).optional(),
    severity: zSeverity.optional(),
    status: z.enum(INCIDENT_STATUS_VALUES).optional(),
    riskScore: z.number().int().min(0).max(100).optional(),
    assignedTo: z.string().max(100).nullable().optional(),
  })
  .transform((v) => ({
    ...v,
    ...(v.status ? { closedAt: isClosedStatus(v.status) ? new Date() : null } : {}),
  }));

/* ================================================================
   6) incident_event
   ================================================================ */
export const linkIncidentEventSchema = z.object({
  incidentId: zUuid,
  eventIds: z.array(zUuid).min(1, "اختار حدث واحد على الأقل"),
  correlationReason: z.string().max(500).optional(),
  linkedBy: z.string().max(100).default("SYSTEM"),
});

/* ================================================================
   7) response_action
   ================================================================ */
export const insertResponseActionSchema = z.object({
  incidentId: zUuid,
  actionType: z.enum(ACTION_TYPE_VALUES),
  description: z.string().trim().min(1, "وصف الإجراء مطلوب").max(2000),
  status: z.enum(RESPONSE_STATUS_VALUES).default("PENDING"),
  isAutomated: z.boolean().default(false),
  performedBy: z.string().max(100).optional(),
});

export const approveActionSchema = z.object({
  performedBy: z.string().min(1, "لازم تحدد مين وافق").max(100),
  mode: z.enum(["DRY_RUN", "EXECUTED"]).default("DRY_RUN"),
  comment: z.string().max(500).optional(),
});

/* ================================================================
   8) audit_log
   ================================================================ */
export const insertAuditLogSchema = z.object({
  actorType: z.enum(ACTOR_TYPE_VALUES).default("SYSTEM"),
  actorId: z.string().min(1).max(100),
  action: z.string().min(2).max(100),
  entityType: z.enum(AUDIT_ENTITY_VALUES).optional(),
  entityId: zUuid.optional(),
  details: zJsonObject,
  ipAddress: z.ipv4().optional(),
});

/* ================================================================
   Filters — مطابقة للـ query params اللي الـ Frontend بيبعتها
   ================================================================ */
export const deviceFiltersSchema = zPagination.extend({
  search: z.string().optional(),
  status: z.string().optional(),          // ALL أو قيمة
  risk: z.string().optional(),            // LOW|MEDIUM|HIGH|CRITICAL|ALL
  simulationState: z.string().optional(),
  sort: z.string().optional(),
});

export const eventFiltersSchema = zPagination.extend({
  search: z.string().optional(),
  severity: z.string().optional(),
  sourceType: z.string().optional(),
  deviceId: zUuid.optional(),
  resourceId: zUuid.optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  range: z.enum(["24h", "7d", "30d"]).optional(),
  sort: z.string().optional(),
});

export const incidentFiltersSchema = zPagination.extend({
  search: z.string().optional(),
  status: z.string().optional(),
  severity: z.string().optional(),
  assignedTo: z.string().optional(),
  sort: z.string().optional(),
});

export type InsertDeviceInput = z.infer<typeof insertDeviceSchema>;
export type InsertSecurityEventInput = z.infer<typeof insertSecurityEventSchema>;
export type InsertIncidentInput = z.infer<typeof insertIncidentSchema>;
export type InsertResponseActionInput = z.infer<typeof insertResponseActionSchema>;
