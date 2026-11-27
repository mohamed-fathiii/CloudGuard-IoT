/**
 * ================================================================
 *  Seed — بيانات مطابقة للمفردات الرسمية + سيناريو كامل
 * ================================================================
 *  التشغيل: npm run db:seed
 *  idempotent: بيستخدم onConflictDoNothing على الـ unique keys.
 *
 *  السيناريو: 10 أجهزة IoT في مصنع ذكي + 6 موارد AWS حقيقية من حسابك
 *  (RDS / Bastion / EIP / SG / IoT Thing) + 8 أحداث أمنية بتقييمات
 *  + حوادث HIGH/CRITICAL + إجراءات استجابة PENDING.
 *
 *  ملاحظة: كل البيانات "SIMULATION" — مفيش أي اتصال حقيقي بـ AWS،
 *  والحقول الممنوعة (مفاتيح/باسوردات) مش موجودة عمداً.
 */

import { eq } from "drizzle-orm";
import { db, closeDb } from "./index";
import {
  device,
  cloudResource,
  securityEvent,
  riskAssessment,
  incident,
  incidentEvent,
  responseAction,
  auditLog,
} from "./schema";
import { computeRisk } from "@/lib/risk-engine";
import { RESPONSE_PLAYBOOK } from "@/lib/risk-engine";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

async function main() {
  console.log("🌱 Seeding CloudGuard IoT (physical schema)...\n");

  /* ================= 1) cloud_resource ================= */
  const resourceRows = await db
    .insert(cloudResource)
    .values([
      {
        resourceName: "cloudguard-db1",
        resourceType: "RDS",
        provider: "AWS",
        providerResourceId: "arn:aws:rds:eu-north-1:123456789012:db:cloudguard-db1",
        region: "eu-north-1",
        environment: "SIMULATION",
        status: "ACTIVE",
        tags: { subnet: "private", engine: "postgresql", privateIp: "10.0.1.202", port: 5432 },
        lastScannedAt: minutesAgo(12),
      },
      {
        resourceName: "CloudGuard-Bastion-1A",
        resourceType: "EC2",
        provider: "AWS",
        providerResourceId: "arn:aws:ec2:eu-north-1:123456789012:instance/i-0f0ef15fc517cfddf",
        region: "eu-north-1",
        environment: "SIMULATION",
        status: "ACTIVE",
        tags: { role: "bastion", instanceId: "i-0f0ef15fc517cfddf", publicIp: "13.48.2.127" },
        lastScannedAt: minutesAgo(20),
      },
      {
        resourceName: "cloudguard-eip",
        resourceType: "OTHER",
        provider: "AWS",
        providerResourceId: "arn:aws:ec2:eu-north-1:123456789012:elastic-ip/eipalloc-0a1b2c3d4e5f",
        region: "eu-north-1",
        environment: "SIMULATION",
        status: "ACTIVE",
        tags: { note: "Elastic IP بيتكلف فلوس لو مش مربوط بـ instance شغال", publicIp: "13.48.2.127" },
        lastScannedAt: minutesAgo(20),
      },
      {
        resourceName: "CloudGuard-EC2-SG",
        resourceType: "VPC",
        provider: "AWS",
        providerResourceId: "arn:aws:ec2:eu-north-1:123456789012:security-group/sg-0abc123def456",
        region: "eu-north-1",
        environment: "SIMULATION",
        status: "ACTIVE",
        tags: { kind: "security-group", openPorts: "22,5432" },
        lastScannedAt: minutesAgo(30),
      },
      {
        resourceName: "cloudguard-vpc-main",
        resourceType: "VPC",
        provider: "AWS",
        providerResourceId: "arn:aws:ec2:eu-north-1:123456789012:vpc/vpc-0aa11bb22cc33dd44",
        region: "eu-north-1",
        environment: "SIMULATION",
        status: "ACTIVE",
        tags: { cidr: "10.0.0.0/16", privateSubnet: "10.0.1.0/24" },
        lastScannedAt: minutesAgo(30),
      },
      {
        resourceName: "cloudguard-iot-things",
        resourceType: "OTHER",
        provider: "AWS",
        providerResourceId: "arn:aws:iot:eu-north-1:123456789012:thinggroup/cloudguard-sensors",
        region: "eu-north-1",
        environment: "SIMULATION",
        status: "ACTIVE",
        tags: { protocol: "MQTT", thingGroup: "cloudguard-sensors" },
        lastScannedAt: minutesAgo(15),
      },
    ])
    .onConflictDoNothing({ target: cloudResource.providerResourceId })
    .returning();

  const allResources = resourceRows.length ? resourceRows : await db.select().from(cloudResource);
  const rds = allResources.find((r) => r.resourceType === "RDS")!;
  const bastion = allResources.find((r) => r.resourceName === "CloudGuard-Bastion-1A")!;
  console.log(`✔ cloud_resource: ${allResources.length}`);

  /* ================= 2) device ================= */
  const deviceSeed = [
    { deviceName: "Edge Gateway 01", deviceType: "GATEWAY", model: "CG-GW-200", location: "Factory A — Line 1", status: "ONLINE", fw: "1.4.2" },
    { deviceName: "Temp Sensor 01", deviceType: "SENSOR", model: "TS-100", location: "Factory A — Line 1", status: "ONLINE", fw: "1.3.9" },
    { deviceName: "Temp Sensor 02", deviceType: "SENSOR", model: "TS-100", location: "Factory A — Line 2", status: "ONLINE", fw: "1.3.9" },
    { deviceName: "Cam North Gate", deviceType: "CAMERA", model: "CAM-4K", location: "North Gate", status: "COMPROMISED", fw: "2.0.1" },
    { deviceName: "Cam South Dock", deviceType: "CAMERA", model: "CAM-4K", location: "South Dock", status: "ONLINE", fw: "2.0.1" },
    { deviceName: "Smart Lock Store", deviceType: "SMART_LOCK", model: "SL-9", location: "Store Room", status: "ONLINE", fw: "1.1.0" },
    { deviceName: "Actuator Valve 01", deviceType: "ACTUATOR", model: "AV-30", location: "Factory A — Line 3", status: "MAINTENANCE", fw: "0.9.4" },
    { deviceName: "Temp Sensor 03", deviceType: "SENSOR", model: "TS-100", location: "Factory B — Line 1", status: "OFFLINE", fw: "1.2.0" },
    { deviceName: "Edge Gateway 02", deviceType: "GATEWAY", model: "CG-GW-200", location: "Factory B — Line 1", status: "ONLINE", fw: "1.4.2" },
    { deviceName: "Legacy Sensor 09", deviceType: "SENSOR", model: "TS-50", location: "Warehouse", status: "DECOMMISSIONED", fw: "0.8.1" },
  ] as const;

  await db
    .insert(device)
    .values(
      deviceSeed.map((d, i) => ({
        deviceName: d.deviceName,
        deviceType: d.deviceType,
        manufacturer: i % 2 === 0 ? "CloudGuard" : "AcmeIoT",
        model: d.model,
        ipAddress: `10.0.2.${10 + i}`,
        macAddress: `02:00:00:00:0${Math.floor(i / 10)}:${(10 + i).toString(16).padStart(2, "0")}`,
        firmwareVersion: d.fw,
        location: d.location,
        status: d.status,
        environment: "SIMULATION" as const,
        isSimulated: true,
        lastSeenAt: minutesAgo(i * 7 + 2),
      })),
    )
    .onConflictDoNothing({ target: device.deviceName });

  const allDevices = await db.select().from(device);
  const dev = (name: string) => allDevices.find((d) => d.deviceName === name)!;
  console.log(`✔ device: ${allDevices.length}`);

  /* ================= 3) security_event ================= */
  type EvtSeed = {
    title: string;
    eventType: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    sourceType: "IOT_DEVICE" | "CLOUD_RESOURCE" | "SYSTEM";
    deviceName?: string;
    resourceName?: string;
    sourceIp?: string;
    destinationIp?: string;
    detectedOffsetMin: number;
    ingestDelayMin: number;
    description: string;
    rawPayload?: Record<string, unknown>;
  };

  const eventSeed: EvtSeed[] = [
    {
      title: "Replay attack suspected on Cam North Gate",
      eventType: "UNAUTHORIZED_ACCESS",
      severity: "CRITICAL",
      sourceType: "IOT_DEVICE",
      deviceName: "Cam North Gate",
      sourceIp: "41.33.180.22",
      destinationIp: "10.0.2.13",
      detectedOffsetMin: 240,
      ingestDelayMin: 18,
      description: "تكرار nonce مع توقيع صالح — إعادة إرسال رسائل مسجّلة",
      rawPayload: { duplicate: true, replayDetected: true, nonce: "0000000000", seq: 812 },
    },
    {
      title: "Firmware signature mismatch on Edge Gateway 01",
      eventType: "FIRMWARE_TAMPERING",
      severity: "HIGH",
      sourceType: "IOT_DEVICE",
      deviceName: "Edge Gateway 01",
      detectedOffsetMin: 90,
      ingestDelayMin: 3,
      description: "هاش الـ firmware مختلف عن الموقّع المعتمد",
      rawPayload: { signatureValid: false, expectedHash: "a1b2", actualHash: "ffff" },
    },
    {
      title: "Repeated failed logins on Bastion host",
      eventType: "FAILED_LOGIN",
      severity: "HIGH",
      sourceType: "CLOUD_RESOURCE",
      resourceName: "CloudGuard-Bastion-1A",
      sourceIp: "185.220.101.5",
      destinationIp: "13.48.2.127",
      detectedOffsetMin: 55,
      ingestDelayMin: 5,
      description: "214 محاولة دخول فاشلة في 5 دقايق على بورت 22",
      rawPayload: { attempts: 214, windowSec: 300, port: 22 },
    },
    {
      title: "Port scan detected against RDS endpoint",
      eventType: "PORT_SCAN",
      severity: "MEDIUM",
      sourceType: "CLOUD_RESOURCE",
      resourceName: "cloudguard-db1",
      sourceIp: "102.44.9.13",
      destinationIp: "10.0.1.202",
      detectedOffsetMin: 130,
      ingestDelayMin: 2,
      description: "مسح لـ 1000 بورت على الـ RDS endpoint",
      rawPayload: { portsScanned: 1000, durationSec: 40 },
    },
    {
      title: "Anomalous traffic volume on Temp Sensor 02",
      eventType: "ANOMALOUS_TRAFFIC",
      severity: "MEDIUM",
      sourceType: "IOT_DEVICE",
      deviceName: "Temp Sensor 02",
      detectedOffsetMin: 40,
      ingestDelayMin: 1,
      description: "معدل الرسائل 8 أضعاف الـ baseline",
      rawPayload: { messagesPerMin: 480, baseline: 60 },
    },
    {
      title: "Security group ingress rule changed",
      eventType: "CONFIGURATION_CHANGE",
      severity: "MEDIUM",
      sourceType: "CLOUD_RESOURCE",
      resourceName: "CloudGuard-EC2-SG",
      detectedOffsetMin: 300,
      ingestDelayMin: 4,
      description: "تم فتح بورت 5432 على 0.0.0.0/0 ثم إغلاقه",
      rawPayload: { port: 5432, cidr: "0.0.0.0/0", reverted: true },
    },
    {
      title: "Privilege escalation attempt on Edge Gateway 02",
      eventType: "PRIVILEGE_ESCALATION",
      severity: "HIGH",
      sourceType: "IOT_DEVICE",
      deviceName: "Edge Gateway 02",
      detectedOffsetMin: 25,
      ingestDelayMin: 2,
      description: "محاولة الوصول لصلاحيات root عبر exploit في الـ agent",
      rawPayload: { targetUid: 0, technique: "T1068" },
    },
    {
      title: "Offline sensor heartbeat silence",
      eventType: "OTHER",
      severity: "LOW",
      sourceType: "IOT_DEVICE",
      deviceName: "Temp Sensor 03",
      detectedOffsetMin: 600,
      ingestDelayMin: 1,
      description: "لا يوجد heartbeat منذ 10 ساعات",
      rawPayload: { silenceSec: 36000 },
    },
  ];

  const createdEvents: Array<{
    eventId: string;
    riskScore: number;
    riskLevel: string;
    severity: string;
    deviceId: string | null;
    title: string;
  }> = [];

  for (const seed of eventSeed) {
    const detectedAt = minutesAgo(seed.detectedOffsetMin);
    const createdAt = minutesAgo(seed.detectedOffsetMin - seed.ingestDelayMin);

    const [evt] = await db
      .insert(securityEvent)
      .values({
        sourceType: seed.sourceType,
        deviceId: seed.deviceName ? dev(seed.deviceName).deviceId : null,
        resourceId: seed.resourceName ? allResources.find((r) => r.resourceName === seed.resourceName)!.resourceId : null,
        eventType: seed.eventType,
        severity: seed.severity,
        title: seed.title,
        description: seed.description,
        sourceIp: seed.sourceIp,
        destinationIp: seed.destinationIp,
        rawPayload: seed.rawPayload,
        detectedAt,
        createdAt,
      })
      .returning();

    const d = seed.deviceName ? dev(seed.deviceName) : null;
    const risk = computeRisk({
      eventType: evt.eventType,
      severity: evt.severity as never,
      detectedAt: evt.detectedAt,
      createdAt: evt.createdAt,
      sourceIp: evt.sourceIp,
      destinationIp: evt.destinationIp,
      rawPayload: evt.rawPayload as Record<string, unknown> | null,
      deviceIsSimulated: d?.isSimulated,
      deviceLastSeenAt: d?.lastSeenAt ?? null,
    });

    await db.insert(riskAssessment).values({
      eventId: evt.eventId,
      riskScore: risk.riskScore,
      riskLevel: risk.riskLevel,
      confidenceScore: String(risk.confidenceScore),
      scoringModelVersion: risk.scoringModelVersion,
      explanation: risk.explanation,
      factors: risk.factors,
    });

    createdEvents.push({
      eventId: evt.eventId,
      riskScore: risk.riskScore,
      riskLevel: risk.riskLevel,
      severity: evt.severity,
      deviceId: evt.deviceId,
      title: evt.title,
    });
  }
  console.log(`✔ security_event + risk_assessment: ${createdEvents.length}`);

  /* ================= 4) incident + incident_event ================= */
  const escalations = createdEvents.filter((e) => e.riskLevel === "HIGH" || e.riskLevel === "CRITICAL");
  const createdIncidents: Array<{ incidentId: string; severity: string }> = [];

  for (const [idx, evt] of escalations.entries()) {
    const [inc] = await db
      .insert(incident)
      .values({
        title: `${evt.riskLevel} — ${evt.title}`.slice(0, 200),
        description: `حادث مولّد آلياً من حدث بدرجة ${evt.riskScore}/100.`,
        severity: evt.riskLevel as never,
        status: idx === 0 ? "INVESTIGATING" : "OPEN",
        riskScore: evt.riskScore,
        assignedTo: idx === 0 ? "analyst@example.com" : null,
        openedAt: minutesAgo(20 - idx),
      })
      .returning();

    await db
      .insert(incidentEvent)
      .values({
        incidentId: inc.incidentId,
        eventId: evt.eventId,
        correlationReason: `تصعيد آلي: درجة ${evt.riskScore}`,
        linkedBy: "SYSTEM",
      })
      .onConflictDoNothing();

    createdIncidents.push({ incidentId: inc.incidentId, severity: evt.riskLevel });
  }
  console.log(`✔ incident: ${createdIncidents.length} (+ incident_event)`);

  /* ================= 5) response_action ================= */
  let actionCount = 0;
  for (const inc of createdIncidents) {
    const playbook = RESPONSE_PLAYBOOK[inc.severity as "HIGH" | "CRITICAL"];
    await db.insert(responseAction).values(
      playbook.map((p) => ({
        incidentId: inc.incidentId,
        actionType: p.actionType,
        description: p.description,
        status: "PENDING" as const,
        isAutomated: false,
        performedBy: "SYSTEM",
      })),
    );
    actionCount += playbook.length;
  }
  console.log(`✔ response_action: ${actionCount}`);

  /* ================= 6) audit_log ================= */
  await db.insert(auditLog).values([
    {
      actorType: "SYSTEM",
      actorId: "seed-script",
      action: "SEED_EXECUTED",
      entityType: "OTHER",
      details: { devices: allDevices.length, resources: allResources.length, events: createdEvents.length },
    },
    {
      actorType: "SYSTEM",
      actorId: "risk-engine",
      action: "RISK_ENGINE_RUN",
      entityType: "RISK_ASSESSMENT",
      details: { modelVersion: "v1.0", count: createdEvents.length },
    },
    {
      actorType: "USER",
      actorId: "admin@example.com",
      action: "LOGIN",
      entityType: "OTHER",
      details: { note: "دخول تجريبي من حساب demo" },
      ipAddress: "127.0.0.1",
    },
    {
      actorType: "SYSTEM",
      actorId: "cost-monitor",
      action: "COST_WARNING",
      entityType: "CLOUD_RESOURCE",
      details: { message: "تأكد إن مفيش NAT Gateway شغال — أكبر بند تكلفة" },
    },
  ]);
  console.log("✔ audit_log: 4");

  /* ================= ملخص ================= */
  const counts = {
    device: allDevices.length,
    cloud_resource: allResources.length,
    security_event: createdEvents.length,
    incident: createdIncidents.length,
    response_action: actionCount,
  };

  console.log("\n" + "=".repeat(52));
  console.log("✅ Seed complete");
  console.log("=".repeat(52));
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(18)} ${v}`);
  console.log("=".repeat(52));
  console.log("\nالخطوة التالية: npm run dev ثم افتح http://localhost:3000/api/v1/health");
}

main()
  .catch((e) => {
    console.error("\n✖ Seed failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
