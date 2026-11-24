"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Field } from "@/components/ui";

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const rules = [
    { label: "At least 8 characters", ok: password.length >= 8 },
    { label: "One uppercase letter", ok: /[A-Z]/.test(password) },
    { label: "One number", ok: /\d/.test(password) },
  ];
  const valid = rules.every((r) => r.ok) && password === confirm;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) {
      setError(password !== confirm ? "Passwords do not match." : "Password does not meet all requirements.");
      return;
    }
    setError("");
    setDone(true);
  }

  return (
    <div className="auth-form">
      <h1>Choose a new password</h1>
      <p className="lead">Set a password for the demo account. Nothing is stored by this frontend.</p>
      {token && <div className="notice info" style={{ marginBottom: 16 }}>Reset token received: <span className="mono">{token}</span></div>}
      {done ? (
        <>
          <div className="notice info" role="status"><strong>Password updated in demo mode.</strong> Sign in with your seeded account to continue.</div>
          <Link href="/login" className="btn btn-primary" style={{ marginTop: 20 }}>Back to sign in <Icon name="arrowRight" /></Link>
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          {error && <div className="notice danger" role="alert" style={{ marginBottom: 16 }}>{error}</div>}
          <Field label="New password">
            <input className="input" type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} autoComplete="new-password" />
          </Field>
          <div className="password-rules">
            {rules.map((rule) => (
              <div key={rule.label} className={rule.ok ? "ok" : ""}><span>{rule.ok ? "✓" : "○"}</span>{rule.label}</div>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <Field label="Confirm new password" error={confirm && confirm !== password ? "Passwords do not match." : undefined}>
              <input className="input" type="password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(""); }} autoComplete="new-password" />
            </Field>
          </div>
          <button className="btn btn-primary auth-submit" type="submit" disabled={!valid}>Update password <Icon name="arrowRight" /></button>
          <div className="auth-links"><Link href="/login">← Back to sign in</Link></div>
        </form>
      )}
      <div className="auth-note">Demo environment. Real password changes are handled by M1 Auth.js and must be audited server-side.</div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="auth-page">
      <div className="auth-panel">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true" />
          <div><div className="brand-name">CLOUDGUARD</div><div className="brand-sub">IoT Security Console</div></div>
        </div>
        <Suspense fallback={<div className="state"><h3>Loading reset form…</h3></div>}>
          <ResetForm />
        </Suspense>
      </div>
      <aside className="auth-aside">
        <div>
          <div className="eyebrow">ACCOUNT ACCESS</div>
          <h2>Validation before submission.</h2>
          <p>The form checks password requirements locally and shows the result state. The backend owning the account will perform the authoritative validation.</p>
        </div>
        <div className="auth-footer">CLOUDGUARD IOT · FRONTEND HANDOVER BUILD</div>
      </aside>
    </div>
  );
}
