/**
 * ================================================================
 *  preflight.mjs — فحص شامل قبل أي محاولة اتصال بالـ RDS
 * ================================================================
 *  التشغيل:   node scripts/preflight.mjs
 *         أو  npm run preflight
 *
 *  بيفحص 5 حاجات بالترتيب وبيقولك المشكلة فين بالظبط:
 *    1) إصدار Node
 *    2) المكتبات متسطبة فعلاً؟
 *    3) ملف .env موجود و DATABASE_URL سليم؟
 *    4) البورت 22 على الباستيون مفتوح؟
 *    5) البورت 5432 (هدف الـ tunnel) قابل للوصول؟
 *
 *  مفيش أي dependencies — بيشتغل حتى لو npm install نصفّه فشل.
 */

import { existsSync, readFileSync } from "node:fs";
import { connect } from "node:net";
import { resolve } from "node:path";

const ROOT = process.cwd();

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

const ok = (m) => console.log(`${C.green}  ✔${C.reset} ${m}`);
const bad = (m) => console.log(`${C.red}  ✖${C.reset} ${m}`);
const warn = (m) => console.log(`${C.yellow}  !${C.reset} ${m}`);
const info = (m) => console.log(`${C.dim}    ${m}${C.reset}`);
const head = (n, m) => console.log(`\n${C.bold}${C.cyan}[${n}] ${m}${C.reset}`);

let problems = 0;
const blockers = [];

/* ================================================================
   1) Node
   ================================================================ */
head(1, "إصدار Node.js");

const [maj, min] = process.versions.node.split(".").map(Number);
const nodeOk = maj > 20 || (maj === 20 && min >= 6);

if (nodeOk) ok(`Node v${process.versions.node}`);
else {
  bad(`Node v${process.versions.node} — المشروع محتاج >= 20.6`);
  info("نزّل LTS من https://nodejs.org وأعد تشغيل التيرمنال");
  problems++;
  blockers.push("NODE_VERSION");
}

/* ================================================================
   2) المكتبات
   ================================================================ */
head(2, "المكتبات (node_modules)");

const REQUIRED = [
  ["next", "next"],
  ["react", "react"],
  ["react-dom", "react-dom"],
  ["drizzle-orm", "drizzle-orm"],
  ["drizzle-kit", "drizzle-kit"],
  ["postgres", "postgres"],
  ["zod", "zod"],
  ["tsx", "tsx"],
  ["typescript", "typescript"],
];

const missing = [];
for (const [label, dir] of REQUIRED) {
  if (existsSync(resolve(ROOT, "node_modules", dir))) ok(label);
  else {
    bad(`${label} — مش متسطب`);
    missing.push(label);
  }
}

if (missing.length) {
  problems++;
  blockers.push("DEPS");
  info(`شغّل: npm install`);
  info(`ولو لسه ناقص: npm install ${missing.join(" ")}`);
} else {
  /* عدد الحزم — للمعلومة */
  try {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, "node_modules/.package-lock.json"), "utf8"));
    const count = Object.keys(pkg.packages ?? {}).length;
    info(`عدد الحزم المتسطبة: ${count}`);
    if (count < 200) {
      warn("العدد قليل جداً لمشروع Next.js — غالباً الـ install ما كملش");
      info("الحل: rm -r node_modules ثم npm install تاني");
    }
  } catch {
    info("(مش قادر أقرأ عدّاد الحزم — مش مشكلة)");
  }
}

/* ================================================================
   3) .env
   ================================================================ */
head(3, "ملف البيئة (.env)");

let dbHost = null;
let dbPort = 5432;

if (!existsSync(resolve(ROOT, ".env"))) {
  bad(".env مش موجود");
  info("الحل: copy .env.example .env   ثم عدّل DATABASE_URL");
  problems++;
  blockers.push("ENV_MISSING");
} else {
  ok(".env موجود");

  const raw = readFileSync(resolve(ROOT, ".env"), "utf8");
  const line = raw
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith("DATABASE_URL"));

  if (!line) {
    bad("DATABASE_URL مش موجود جوه .env");
    problems++;
    blockers.push("ENV_URL");
  } else {
    const value = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

    if (value.includes("PUT_REAL_PASSWORD") || value.includes("الباسورد")) {
      bad("DATABASE_URL لسه فيه النص الافتراضي — حط الباسورد الحقيقي");
      problems++;
      blockers.push("ENV_PASSWORD");
    } else {
      ok("DATABASE_URL متعرّف");
    }

    /* استخراج الهوست والبورت */
    try {
      const m = value.match(/@([^/:?]+)(?::(\d+))?\//);
      if (m) {
        dbHost = m[1];
        dbPort = m[2] ? Number(m[2]) : 5432;
        info(`الهوست: ${dbHost}:${dbPort}`);
      } else {
        warn("مش قادر أقرأ الهوست من الـ URL — راجع الصيغة");
      }
    } catch {
      /* ignore */
    }

    /* فحص الـ @ غير المُرمّز */
    const afterScheme = value.replace(/^postgres(ql)?:\/\//, "");
    const atCount = (afterScheme.match(/@/g) || []).length;
    if (atCount > 1) {
      warn("الـ URL فيه أكتر من @ — الباسورد غالباً فيه @ لازم يبقى %40");
    }
    if (value.includes(" ") && !value.startsWith('"')) {
      warn("الـ URL فيه مسافة — حُطّه بين علامتي تنصيص");
    }
  }
}

/* ================================================================
   4) البورت 22 على الباستيون
   ================================================================ */
head(4, "البورت 22 على الباستيون (13.48.2.127)");

function probe(host, port, timeout = 6000) {
  return new Promise((res) => {
    const started = Date.now();
    const sock = connect({ host, port });
    let done = false;

    const finish = (result) => {
      if (done) return;
      done = true;
      try {
        sock.destroy();
      } catch {
        /* ignore */
      }
      res({ ...result, ms: Date.now() - started });
    };

    sock.setTimeout(timeout);
    sock.once("connect", () => finish({ open: true }));
    sock.once("timeout", () => finish({ open: false, reason: "timeout" }));
    sock.once("error", (e) => finish({ open: false, reason: e.code || e.message }));
  });
}

const bastion = await probe("13.48.2.127", 22);

if (bastion.open) {
  ok(`البورت مفتوح (${bastion.ms}ms) — الـ tunnel هيعمل`);
} else {
  bad(`البورت مقفول — ${bastion.reason} (${bastion.ms}ms)`);
  problems++;
  blockers.push("BASTION_22");
}

/* ================================================================
   5) هدف قاعدة البيانات
   ================================================================ */
head(5, "هدف قاعدة البيانات");

if (!dbHost) {
  warn("مفيش هوست معروف — اتخطّى");
} else if (dbHost === "127.0.0.1" || dbHost === "localhost") {
  const r = await probe(dburiHostSafe(dbHost), dbPort, 4000);
  if (r.open) {
    ok(`127.0.0.1:${dbPort} متاح — الـ tunnel شغال`);
  } else {
    bad(`127.0.0.1:${dbPort} مقفول — الـ tunnel مش شغال`);
    info("شغّل في تاب تيرمنال تاني:");
    info("ssh -i \"D:\\PDF\\DEPI_Project\\cloudguard-bastion-key.pem\" -N \\");
    info("    -L 5432:cloudguard-db1.c7uy2kk4edth.eu-north-1.rds.amazonaws.com:5432 \\");
    info("    ec2-user@13.48.2.127");
    problems++;
    blockers.push("TUNNEL");
  }
} else {
  const r = await probe(dbHost, dbPort, 6000);
  if (r.open) ok(`${dbHost}:${dbPort} متاح`);
  else {
    bad(`${dbHost}:${dbPort} — ${r.reason}`);
    info("لو ده عنوان RDS مباشر (10.0.1.x) من لابتوبك: مش هيتاح أبداً.");
    info("استخدم 127.0.0.1 مع الـ tunnel.");
    problems++;
    blockers.push("REMOTE_DB");
  }
}

function dburiHostSafe(h) {
  return h.replace(/[[\]]/g, "") || "127.0.0.1";
}

/* ================================================================
   الخلاصة
   ================================================================ */
console.log("\n" + "─".repeat(56));

if (problems === 0) {
  console.log(`${C.green}${C.bold}✅ كل الفحوصات عدّت — ابدأ:${C.reset}`);
  console.log("   npm run db:check   ثم   npm run db:push");
} else {
  console.log(`${C.yellow}${C.bold}⚠  ${problems} مشكلة محتاجة حل:${C.reset}\n`);

  const advice = {
    NODE_VERSION: "نزّل Node 20 LTS من nodejs.org وأعد فتح التيرمنال",
    DEPS: "npm install  (لو فشل: امسح node_modules وأعد المحاولة)",
    ENV_MISSING: "copy .env.example .env",
    ENV_URL: "ضيف سطر DATABASE_URL=\"postgresql://postgres:PASS@127.0.0.1:5432/postgres\"",
    ENV_PASSWORD: "بدّل PUT_REAL_PASSWORD بباسورد الـ RDS (و @ يبقى %40)",
    BASTION_22: "الـ Security Group مقفول → استخدم Session Manager من الكونسول، أو أضف قاعدة SSH لـ My IP",
    TUNNEL: "شغّل الـ SSH tunnel في تاب تيرمنال منفصل وسيبه مفتوح",
    REMOTE_DB: "غيّر الهوست لـ 127.0.0.1 واستخدم الـ tunnel",
  };

  [...new Set(blockers)].forEach((b, i) => {
    console.log(`  ${i + 1}. ${advice[b] ?? b}`);
  });
}

console.log("─".repeat(56) + "\n");
process.exit(problems === 0 ? 0 : 1);
