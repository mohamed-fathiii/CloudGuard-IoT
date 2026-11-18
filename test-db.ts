import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
console.log("🔗 Connecting with URL:", connectionString ? "Found (Hidden for security)" : "NOT FOUND!");

const sql = postgres(connectionString!, { ssl: 'require', max: 1 });

async function test() {
  try {
    const result = await sql`SELECT NOW()`;
    console.log("✅ Database Connected Successfully at:", result[0].now);
    process.exit(0);
  } catch (err) {
    console.error("❌ Database Connection Failed:", err);
    process.exit(1);
  }
}

test(); 