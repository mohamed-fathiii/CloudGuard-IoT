# تشغيل الـ Frontend على الباك إند بتاعك (M2 → M3)

## 1) شغّل الباك إند

```powershell
cd "C:\Users\HP\OneDrive - Menoufia National University\Desktop\Pdf\DEPI_Project\cloudguard-iot"
npm run dev
# → http://localhost:3000
```

اتأكد الأول:

```powershell
curl http://localhost:3000/api/v1/health
```
لازم ترجع `"status": "OK"` و `"foundTables": 8`.

## 2) في فولدر `Frontend/` — عدّل `.env.local`

```env
NEXT_PUBLIC_USE_MOCK_DATA=0
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1
```

> الافتراضي في الـ Frontend هو `/api/v1` (مسار نسبي) — لو الـ Frontend شغال على
> 3100 ولوحده، لازم الـ URL الكامل. لو مشغّلين الاتنين على نفس السيرفر سيبه نسبي.

ثم:

```powershell
cd Frontend
npm run dev
# → http://localhost:3100
```

## 3) لو ظهر CORS

الـ Frontend على 3100 والباك إند على 3000 = أصول مختلفة. أضف في
`next.config.ts` في الباك إند:

```ts
const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres"],
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "http://localhost:3100" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PATCH,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
    ];
  },
};
```

## 4) العقد اللي الـ Frontend مستنيه — ومطابق للتنفيذ

| Endpoint | الحالة |
|---|---|
| `GET /api/v1/health` | ✅ |
| `GET /api/v1/devices` | ✅ filters + pagination |
| `GET /api/v1/cloud-resources` | ✅ |
| `GET /api/v1/security-events` | ✅ + riskScore/riskLevel/factors مضمّنة |
| `GET /api/v1/risk-assessments` | ✅ |
| `GET /api/v1/incidents` | ✅ |
| `GET /api/v1/incidents/{id}` | ✅ + timeline |
| `GET /api/v1/response-actions` | ✅ |
| `POST /api/v1/response-actions/{id}/approve` | ✅ |
| `POST /api/v1/response-actions/{id}/reject` | ✅ |
| `GET /api/v1/audit-logs` | ✅ |
| `POST /api/v1/auth/*` | ❌ M1 — مش في نطاق M2 |
| `GET /api/v1/dashboard/summary` | ❌ الـ Frontend بيحسبه محلياً |
| `GET/PATCH /api/v1/settings` | ❌ مش في الـ schema |

## 5) شكل الرد

```json
// نجاح
{ "success": true, "message": "Operation completed successfully.", "data": { } }

// صفحة
{ "success": true, "data": { "items": [], "total": 0, "page": 1, "pageSize": 10 } }

// خطأ
{ "success": false, "message": "…", "error": { "code": "VALIDATION_ERROR", "details": [] } }
```

## 6) الحقول المشتقة اللي الباك إند بيحسبها

| الحقل اللي الـ Frontend عايزه | مصدره في الباك إند |
|---|---|
| `device.riskScore` | أعلى `risk_assessment.risk_score` لأحداث الجهاز |
| `device.riskLevel` | مشتق من `riskScore` بحدود الـ schema |
| `device.incidentCount` | `count(distinct incident_id)` عبر `incident_event` |
| `device.simulationState` | `device.tags->>'simulationState'` (OPERATIONAL/QUARANTINED) |
| `event.processingState` | `PROCESSED` لو فيه تقييم، وإلا `PROCESSING` |
| `event.incidentId` | من `incident_event` |
| `incident.approvalPending` | `exists(... status='PENDING')` |
| `audit.outcome` | مستنتج من `action` (REJECT/FAIL → DENIED) |
| `responseAction.execution` | `DRY_RUN` أو `EXECUTED` من وصف الإجراء |
