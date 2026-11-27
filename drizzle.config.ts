import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

/* drizzle-kit بيشتغل بره runtime بتاع Next.js → لازم يحمّل .env بنفسه */
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL مش موجود. شغّل الـ SSH Tunnel وضيفه في .env (شوف .env.example)",
  );
}

const isLocal = /(^|@)(localhost|127\.0\.0\.1|::1)(:|\/|$)/.test(url);

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url,
    ssl: isLocal ? false : "require",
  },
  verbose: true,
  strict: true,
});
