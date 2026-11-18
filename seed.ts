import { db } from "./src/db";
import { devices, securityEvents } from "./src/db/schema";

async function main() {
  console.log("Seeding database...");

  // إضافة جهاز تجريبي
  await db.insert(devices).values({
    id: "SIM-07",
    name: "Simulator Device 07",
    status: "ONLINE",
    riskScore: 15,
  }).onConflictDoNothing();

  // إضافة حدث تجريبي
  await db.insert(securityEvents).values({
    id: "evt-001",
    deviceId: "SIM-07",
    eventType: "UNAUTHORIZED_TOPIC",
    topic: "cloudguard/devices/SIM-07/commands",
    payloadSize: 1024,
    sourceType: "SIMULATOR",
    timestamp: new Date(),
  }).onConflictDoNothing();

  console.log("Seeding completed successfully!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error seeding database:", err);
  process.exit(1);
});