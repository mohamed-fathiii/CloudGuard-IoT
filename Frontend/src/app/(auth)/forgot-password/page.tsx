"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Field } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid work email address.");
      return;
    }
    setError("");
    setSent(true);
  }

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true" />
          <div><div className="brand-name">CLOUDGUARD</div><div className="brand-sub">IoT Security Console</div></div>
        </div>
        <div className="auth-form">
          <h1>Reset password</h1>
          <p className="lead">Enter the email address associated with your account.</p>
          {sent ? (
            <>
              <div className="notice info" role="status">
                <strong>Request recorded in demo mode.</strong> No email is sent from this frontend. In production, M1 auth issues the reset token server-side.
              </div>
              <div style={{ marginTop: 20, display: "flex", gap: 8 }}>
                <Link href="/reset-password?token=demo-reset-token" className="btn btn-primary">Continue to reset <Icon name="arrowRight" /></Link>
                <Link href="/login" className="btn">Back to sign in</Link>
              </div>
            </>
          ) : (
            <form onSubmit={submit} noValidate>
              {error && <div className="notice danger" role="alert" style={{ marginBottom: 16 }}>{error}</div>}
              <Field label="Work email" error={error}>
                <input className="input" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} placeholder="name@company.com" autoComplete="username" />
              </Field>
              <button className="btn btn-primary auth-submit" type="submit">Request reset <Icon name="arrowRight" /></button>
              <div className="auth-links"><Link href="/login">← Back to sign in</Link></div>
            </form>
          )}
          <div className="auth-note">Demo environment. Password recovery is a frontend flow only until M1 auth is integrated.</div>
        </div>
      </div>
      <aside className="auth-aside">
        <div>
          <div className="eyebrow">ACCOUNT ACCESS</div>
          <h2>Recovery follows the same permission model.</h2>
          <p>Password reset and session handling are owned by the authentication module. This screen validates input and renders the states that module will return.</p>
        </div>
        <div className="auth-footer">CLOUDGUARD IOT · FRONTEND HANDOVER BUILD</div>
      </aside>
    </div>
  );
}
