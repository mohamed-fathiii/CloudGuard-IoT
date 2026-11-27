# CloudGuard IoT — M2 (Cloud Database & Backend)

> **المرجع الحاكم:** `Database-Design/Physical-Schema.docx` + `ERD_Dgram.pdf` في ريبو الفريق.
> الـ schema هنا **مرآة أمينة** للتصميم ده — مش تصميم بديل.
>
> **8 جداول · 86 عمود · 28 CHECK constraint · 6 foreign key · 31 index · 0 timestamps بدون tz**
> الأرقام دي **مطابقة حرفياً** لـ `Data-Dictionary.docx` (86 field) و`Physical-Schema.docx`.

```
device   cloud_resource   security_event   risk_assessment
incident   incident_event   response_action   audit_log
```

---

## 0. وين المشروع بيتنشر؟

الموقع الحيّ بتاع الفريق: **`http://13.49.223.91/login`** — EC2 + nginx.

```
http://13.49.223.91
        │
   ┌────▼────┐
   │  nginx  │  :80
   └────┬────┘
   ┌────┴──────────────┐
   │ /api/             │ /
┌──▼────────┐    ┌──────▼──────┐
│ Backend   │    │  Frontend   │
│ 127.0.0.1 │    │ 127.0.0.1   │
│   :3000   │    │    :3100    │
└──┬────────┘    └─────────────┘
   │
┌──▼────────────────┐
│ RDS PostgreSQL 16 │  10.0.1.202:5432
└───────────────────┘
```

**الـ API على نفس الأصل** (`/api/v1` نسبي) ⇒ مفيش CORS ولا دومين ولا SSL.
الملفات الجاهزة في `deploy/`، والخطوات الكاملة في **[`docs/DEPLOY-EC2.md`](docs/DEPLOY-EC2.md)**.

---

## 0.1 قبل ما تبدأ — 3 حاجات

```powershell
# 1) الـ SSH Tunnel في ترمنال منفصل (سيبه مفتوح لكل الخطوات)
ssh -i "$env:USERPROFILE\Downloads\cloudguard-bastion-key.pem" -N -L 5432:cloudguard-db1.c7uy2kk4edth.eu-north-1.rds.amazonaws.com:5432 ec2-user@13.48.2.127

# 2) في تيرمنال تاني — جوه مجلد المشروع
npm install
Copy-Item .env.example .env        # اكتب الباسورد الحقيقي في DATABASE_URL

# 3) امشي على الجدول اللي تحت بالترتيب
```

---

## 1. المسار الكامل بالترتيب

| # | الأمر | المتوقع |
|---|---|---|
| ① | `npm run db:check` | `الاتصال ناجح` + `0/8` أو `8/8` |
| ② | `npm run db:push` | `8 tables created` |
| ③ | `npm run db:check` | **`8/8 جداول ✔`** |
| ④ | `npm run db:seed` | `✅ Seed complete` + جدول أعداد (10 أجهزة · 6 موارد · 8 أحداث · حوادث · إجراءات) |
| ⑤ | `npm run db:smoke` | **`ALL CHECKS PASSED`** |
| ⑥ | `npm run dev` | `/api/v1/health` بيرجّع `success: true` |

> **الترتيب مش اختياري.** `db:push` قبل `db:check` بيدّيك `0/8` وهو ده الطبيعي
> أول مرة. لو عملت `db:seed` قبل `db:push` هتاخد `relation does not exist`.

---

## 2. الـ Scripts

| الأمر | الوظيفة |
|---|---|
| `npm run dev` | Next.js على 3000 |
| `npm run db:check` | تشخيص: اتصال + جداول + قيود + timezone |
| `npm run db:push` | `drizzle-kit push --force` |
| `npm run db:generate` | توليد migration SQL في `drizzle/` |
| `npm run db:seed` | داتا تجريبية (10 أجهزة، 6 موارد، 8 أحداث) |
| `npm run db:smoke` | 15 اختبار على الـ CHECK/FK/CASCADE |
| `npm run db:sql -- <file>` | تشغيل ملف SQL من الترمنال (بدل pgAdmin) |
| `npm run db:export` | تصدير CSV لكل جدول للفريق |
| `npm run db:studio` | Drizzle Studio |
| `npm run db:clean` | ⚠️ دروب كامل (dev فقط) |
| `npm run typecheck` | `tsc --noEmit` |

---

## 3. الـ API — متوافق مع `Frontend/src/lib/api/services.ts`

القاعدة الأساسية: `NEXT_PUBLIC_USE_MOCK_DATA=0` لازم يشتغل من غير ما حد يلمس صفحة واحدة.

| Method | Endpoint | ملاحظات |
|---|---|---|
| GET | `/api/v1/health` | جداول + قيود + عدد الصفوف + latency |
| GET | `/api/v1/devices` | `search, status, risk, simulationState, sort, page, pageSize` |
| POST | `/api/v1/devices` | Zod validation |
| GET | `/api/v1/cloud-resources` | ARN فقط — ممنوع أي مفتاح AWS |
| POST | `/api/v1/cloud-resources` | |
| GET | `/api/v1/security-events` | `severity, sourceType, deviceId, minScore, range, sort` + التقييم مضمّن |
| POST | `/api/v1/security-events` | **حدث → تقييم → حادث تلقائي لو HIGH/CRITICAL** |
| GET | `/api/v1/risk-assessments` | شرح الدرجة + العوامل |
| POST | `/api/v1/risk-assessments` | إعادة تقييم (الدرجة من المحرّك مش من العميل) |
| GET | `/api/v1/incidents` | `+ approvalPending` |
| GET | `/api/v1/incidents/{id}` | تفاصيل + timeline + الإجراءات |
| POST/PATCH | `/api/v1/incidents` | `closed_at` تلقائي |
| GET | `/api/v1/response-actions` | |
| POST | `/api/v1/response-actions` | دايماً `PENDING` |
| POST | `/api/v1/response-actions/{id}/approve` | `{ performedBy, mode: DRY_RUN\|EXECUTED }` |
| POST | `/api/v1/response-actions/{id}/reject` | |
| GET | `/api/v1/devices/{id}` | تفاصيل جهاز + عدد أحداثه |
| GET | `/api/v1/security-events/{id}` | حدث + تقييماته + حوادثه + إجراءاته |
| GET | `/api/v1/response-actions/{id}` | إجراء + الحادث التابع له |
| PATCH | `/api/v1/incidents/{id}` | `{status}` — `closed_at` تلقائي |
| POST | `/api/v1/incidents/{id}/notes` | ملاحظة تحقيق → `audit_log` |
| POST | `/api/v1/cloud-resources/rescan` | محاكاة — بدون استدعاء AWS |
| POST | `/api/v1/auth/login` | ⚠️ مؤقت — لحد Auth.js بتاع M1 |
| POST | `/api/v1/auth/logout` | ⚠️ مؤقت |
| GET | `/api/v1/audit-logs` | قراءة فقط (append-only) |

> **الحالة الكاملة (16 من 23 endpoint + اللي ناقص وليه):** [`docs/API-CONTRACT-STATUS.md`](docs/API-CONTRACT-STATUS.md)

### شكل الرد (عقد الـ Frontend)

```json
{ "success": true, "message": "…", "data": { } }
{ "success": true, "data": { "items": [], "total": 0, "page": 1, "pageSize": 10 } }
{ "success": false, "message": "…", "error": { "code": "VALIDATION_ERROR", "details": [] } }
```

---

## 4. قلب التصميم — القيود اللي بتحمي الداتا

| القيد | القاعدة |
|---|---|
| `ck_security_event_source_link` | `IOT_DEVICE` → `device_id` فقط · `CLOUD_RESOURCE` → `resource_id` فقط · `SYSTEM` → بدون أي منهما |
| `ck_risk_assessment_level_matches_score` | `0-24 LOW` · `25-49 MEDIUM` · `50-74 HIGH` · `75-100 CRITICAL` |
| `ck_incident_closure_consistency` | حالة مغلقة ⟺ `closed_at` موجود |
| `ck_response_action_times` | `completed_at >= started_at` |
| `pk_incident_event` | ربط الحدث بالحادث مرة واحدة بس |
| `fk_security_event_device` | `ON DELETE RESTRICT` — مفيش حذف جهاز له أحداث |

---

## 5. محرّك الخطورة (`src/lib/risk-engine.ts`)

10 قواعد قابلة للتفسير — كل قاعدة بتسجل اسمها ونقاطها في `factors`:

```
BASE_EVENT_TYPE          الوزن الأساسي حسب نوع الحدث
DECLARED_SEVERITY        زيادة حسب severity
DELAYED_INGEST           > 300s بين detected_at و created_at → replay
FUTURE_TIMESTAMP         حدث بوقت مستقبلي → تلاعب ساعة
EXTERNAL_SOURCE          IP خارج RFC1918
INBOUND_TO_INTERNAL      من الإنترنت لهدف داخلي
REPLAY_SIGNAL            raw_payload.duplicate = true
INVALID_SIGNATURE        raw_payload.signatureValid = false
STALE_DEVICE             جهاز صامت > 60 دقيقة
SIMULATION_DAMPING       is_simulated = true → خفض 10%
```

**التصعيد:** `HIGH` / `CRITICAL` بس هما اللي بيفتحوا حادث + يولّدوا إجراءات من الـ playbook.

**العزل التلقائي** مسموح في حالة واحدة: جهاز `is_simulated = true` **و** `risk_score ≥ 85`. أي حاجة تانية بتستنى موافقة بشرية.

---

## 6. هيكل المشروع

```
Cloud_guard_final/
├── src/
│   ├── db/
│   │   ├── schema.ts          ← 8 جداول (مرآة Physical-Schema.docx)
│   │   ├── index.ts           ← Drizzle client (SSL شرطي + global cache)
│   │   ├── validators.ts      ← Zod + نفس قواعد الـ CHECK برسائل أوضح
│   │   └── seed.ts            ← داتا واقعية من حسابك
│   ├── lib/
│   │   ├── envelope.ts        ← عقد الرد اللي الـ Frontend مستنيه
│   │   ├── api-error.ts       ← تحويل أخطاء Postgres لأكواد العقد
│   │   ├── risk-engine.ts     ← 10 قواعد + playbook
│   │   ├── incidents.ts       ← منطق الحوادث + الموافقة + العزل التلقائي
│   │   └── audit.ts           ← append-only
│   └── app/api/v1/            ← 18 route group · 27 handler
│       └── auth/              ← ⚠️ مؤقت لـ M1
├── scripts/
│   ├── healthcheck.mjs        ← تشخيص شامل
│   ├── smoke.mjs              ← 15 اختبار حقيقي على RDS
│   ├── verify.sql             ← queries للـ screenshots
│   ├── reconcile.mjs          ← دروب كامل
│   ├── export-csv.mjs         ← snapshot للفريق
│   └── run-sql.mjs            ← تشغيل SQL من الترمنال
├── deploy/
│   ├── cloudguard-api.service      ← systemd للـ Backend
│   ├── cloudguard-frontend.service ← systemd للـ Frontend
│   ├── cloudguard.conf             ← nginx (فرونت + API على نفس الأصل)
│   ├── deploy.sh                   ← سكربت نشر بعد git push
│   └── tunnel-to-rds.md            ← ربط الـ EC2 بالـ RDS (3 حالات)
├── docs/
│   ├── DEPLOY-EC2.md          ← خطوات النشر الكاملة على 13.49.223.91
│   ├── ACCESS-EC2.md          ← SSH timed out؟ (Security Group + بدائل)
│   ├── IMPACT-ON-TEAM.md      ← هل التعديل بيأثر على شغل الفريق؟
│   ├── START-NOW.md           ← ⚡ أسرع طريق: RDS في 15 دقيقة بدون EC2
│   ├── ZERO-IMPACT-PLAN.md    ← خطة النشر بدون لمس سيرفر الزمايل
│   ├── ANALYSIS-REPO.md       ← تحليل الريبو + المطلوب من كل عضو
│   ├── API-CONTRACT-STATUS.md ← إيه اللي هيشتغل وإيه لأ
│   ├── API-CONTRACT.md        ← العقد المنفذ ← للـ Frontend
│   ├── DECISIONS-NEEDED.md    ← 6 قرارات محتاجة الفريق
│   ├── MIGRATION-GUIDE.md     ← سيناريوهات الـ migration
│   ├── SCHEMA.md              ← تصميم كل جدول + الأرقام المؤكدة
│   └── SUBMIT-TO-GITHUB.md    ← خطوات الـ PR
├── drizzle.config.ts
├── .env.example
└── package.json
```

---

## 7. حل المشاكل

| العرض | السبب | الحل |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:5432` | Tunnel مش شغال | شغّل أمر `ssh -N -L 5432:...` |
| `ETIMEDOUT` | `.env` على `10.0.1.202` | غيّرها لـ `127.0.0.1` |
| `password authentication failed` | باسورد غلط / `@` مش encoded | `@` → `%40` |
| `relation "device" does not exist` | الـ push ماحصلش | `npm run db:push` |
| `ck_security_event_source_link` | بعتّ `device_id` مع `source_type=CLOUD_RESOURCE` | راجع الـ source_type |
| `ck_risk_assessment_level_matches_score` | `risk_level` مش مطابق للـ score | استخدم `levelForScore()` |
| `remaining connection slots` | pools متراكمة | الكود بيستخدم `globalThis` cache |
| `bind: Address already in use` | tunnel شغال مرتين | استخدم بورت 5433 |

---

## 8. النشر على الـ EC2

```bash
# على السيرفر 13.49.223.91
cd ~/CloudGuard-IoT && bash Backend/deploy/deploy.sh
```

الملفات الكاملة: `deploy/cloudguard.conf` · `deploy/cloudguard-api.service` ·
`deploy/cloudguard-frontend.service` · `deploy/tunnel-to-rds.md`

| الملف | فين بيتحط |
|---|---|
| `cloudguard-api.service` | `/etc/systemd/system/` |
| `cloudguard-frontend.service` | `/etc/systemd/system/` |
| `cloudguard.conf` | `/etc/nginx/sites-available/cloudguard` |
| `.env` (بالباسورد) | `~/CloudGuard-IoT/Backend/.env` — **عمره ما يترفع** |

**التحقق بعد النشر:**
```bash
curl http://127.0.0.1:3000/api/v1/health      # من السيرفر
curl http://13.49.223.91/api/v1/health        # من بره
```

> 🔴 **متحطش `NEXT_PUBLIC_API_BASE_URL` على IP.** سيبه `/api/v1` نسبي.
> أي قيمة تانية = CORS + مشكلة نشر.
