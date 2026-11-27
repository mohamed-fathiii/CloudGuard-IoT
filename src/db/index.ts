/**
 * ============================================================
 *  DB Client — Amazon RDS PostgreSQL عبر Drizzle ORM
 * ============================================================
 *  القرارات المهمة:
 *
 *  1) `ssl` شرطي:
 *     - localhost/127.0.0.1 (SSH Tunnel) → false
 *     - RDS مباشرة → "require"
 *     لو ثبّتنا "require" هنا، كل query عبر الـ tunnel هيفشل
 *     بـ self-signed certificate.
 *
 *  2) caching في globalThis:
 *     Next.js dev بيعمل hot-reload للملف عشرات المرات.
 *     من غير cache → pool جديد كل مرة → max_connections على RDS.
 *
 *  3) تمرير `schema` للـ drizzle:
 *     بدونها كل `db.query.*` relations بتكون غير متاحة.
 *
 *  4) مفيش dotenv هنا:
 *     Next.js بيقرأ .env / .env.local لوحده.
 *     (drizzle-kit محتاج dotenv، وده في drizzle.config.ts)
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "[db] DATABASE_URL مش معرّف. ضيفه في .env في روت المشروع (شوف .env.example).",
  );
}

/** هل بنتكلم مع DB محلية عبر tunnel؟ */
const isLocal =
  /(^|@)(localhost|127\.0\.0\.1|::1)(:|\/|$)/.test(connectionString);

const globalForDb = globalThis as unknown as {
  __cloudguardSql?: ReturnType<typeof postgres>;
};

export const client =
  globalForDb.__cloudguardSql ??
  postgres(connectionString, {
    ssl: isLocal ? false : "require",
    // RDS db.t3.micro عنده ~80 connection — متستهلكهمش كله
    max: process.env.NODE_ENV === "production" ? 10 : 5,
    idle_timeout: 20,
    connect_timeout: 15,
    // لو الـ tunnel قِطع، postgres-js يحاول تاني بدل ما يرمي فوراً
    max_lifetime: 60 * 30,
    onnotice:
      process.env.NODE_ENV === "production" ? undefined : (notice) => console.log(notice),
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__cloudguardSql = client;
}

export const db = drizzle(client, {
  schema,
  logger: process.env.DRIZZLE_LOG === "true",
});

/** إغلاق نظيف — استخدمها في السكربتات (seed/migrate) */
export async function closeDb() {
  await client.end({ timeout: 5 });
}

export type DB = typeof db;
export * as tables from "./schema";
