import { NextResponse } from "next/server";
import { db } from "@/db";
import { devices, securityEvents, incidents } from "@/db/schema";

export async function GET() {
  try {
    const allDevices = await db.select().from(devices);
    const allEvents = await db.select().from(securityEvents);
    const allIncidents = await db.select().from(incidents);

    const onlineDevices = allDevices.filter((d) => d.status === "ONLINE").length;
    const criticalIncidents = allIncidents.filter((i) => i.severity === "CRITICAL" && i.status !== "CLOSED").length;
    const avgRisk =
      allDevices.length > 0
        ? Math.round(allDevices.reduce((acc, d) => acc + d.riskScore, 0) / allDevices.length)
        : 0;

    return NextResponse.json(
      {
        success: true,
        data: {
          totalDevices: allDevices.length,
          onlineDevices,
          offlineDevices: allDevices.length - onlineDevices,
          totalEvents: allEvents.length,
          criticalIncidents,
          averageRiskScore: avgRisk,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}