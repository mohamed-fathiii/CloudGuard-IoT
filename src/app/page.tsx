/**
 * صفحة فحص سريع — مش جزء من الـ UI الرسمي (الـ Frontend في فولدر Frontend/).
 * غرضها: تثبت إن الـ API شغال على كل endpoint بضغطة.
 */

const ENDPOINTS = [
  { path: "/api/v1/health", label: "Health — حالة الداتابيز والجداول" },
  { path: "/api/v1/devices", label: "Devices — الأجهزة" },
  { path: "/api/v1/cloud-resources", label: "Cloud Resources — موارد AWS" },
  { path: "/api/v1/security-events", label: "Security Events — الأحداث" },
  { path: "/api/v1/risk-assessments", label: "Risk Assessments — التقييمات" },
  { path: "/api/v1/incidents", label: "Incidents — الحوادث" },
  { path: "/api/v1/response-actions", label: "Response Actions — الإجراءات" },
  { path: "/api/v1/audit-logs", label: "Audit Logs — السجل" },
];

export default function Home() {
  return (
    <main
      style={{
        fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        padding: 40,
        maxWidth: 860,
        margin: "0 auto",
        lineHeight: 1.8,
      }}
    >
      <h1 style={{ marginBottom: 4 }}>CloudGuard IoT — M2 API</h1>
      <p style={{ color: "#555", marginTop: 0 }}>
        8 جداول · 12 foreign key · REST تحت <code>/api/v1</code> · متوافق مع{" "}
        <code>Frontend/src/lib/api/services.ts</code>
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 24 }}>
        <thead>
          <tr style={{ background: "#f4f4f5", textAlign: "left" }}>
            <th style={{ padding: 10, border: "1px solid #ddd" }}>Endpoint</th>
            <th style={{ padding: 10, border: "1px solid #ddd" }}>الوصف</th>
          </tr>
        </thead>
        <tbody>
          {ENDPOINTS.map((e) => (
            <tr key={e.path}>
              <td style={{ padding: 10, border: "1px solid #ddd" }}>
                <a href={e.path} style={{ color: "#065f46", textDecoration: "none" }}>
                  {e.path}
                </a>
              </td>
              <td style={{ padding: 10, border: "1px solid #ddd" }}>{e.label}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ marginTop: 32, fontSize: 18 }}>تشغيل الـ Frontend على الباك إند ده</h2>
      <pre
        style={{
          background: "#0f172a",
          color: "#e2e8f0",
          padding: 16,
          borderRadius: 8,
          overflowX: "auto",
          fontSize: 13,
        }}
      >{`# في فولدر Frontend/
NEXT_PUBLIC_USE_MOCK_DATA=0
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1`}</pre>
    </main>
  );
}
