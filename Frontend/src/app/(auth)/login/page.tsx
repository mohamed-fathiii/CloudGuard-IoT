"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Field } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { DEMO_ACCOUNTS, login, toError } from "@/lib/api/services";
import type { Role } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const { session, ready, signIn } = useAuth();
  const { notify } = useToast();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("demo1234");
  const [role, setRole] = useState<Role>("ADMINISTRATOR");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  useEffect(() => {
    if (ready && session) router.replace("/dashboard");
  }, [ready, session, router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const errors: typeof fieldErrors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid work email address.";
    if (password.length < 8) errors.password = "Password must be at least 8 characters.";
    setFieldErrors(errors);
    setError("");
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    try {
      await login(email, password, role);
      signIn(email, role);
      notify("Demo session started.");
      router.push("/dashboard");
    } catch (cause) {
      setError(toError(cause).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <div className="brand-name">CLOUDGUARD</div>
            <div className="brand-sub">IoT Security Console</div>
          </div>
        </div>

        <form className="auth-form" onSubmit={submit} noValidate>
          <h1>Sign in</h1>
          <p className="lead">Access the CloudGuard IoT console using a seeded demo account.</p>

          {error && <div className="notice danger" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

          <Field label="Work email" error={fieldErrors.email}>
            <input className="input" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({ ...p, email: undefined })); }} placeholder="name@company.com" autoComplete="username" aria-invalid={!!fieldErrors.email} />
          </Field>

          <Field label="Password" error={fieldErrors.password}>
            <div className="password-wrap">
              <input className="input" type={show ? "text" : "password"} value={password} onChange={(e) => { setPassword(e.target.value); setFieldErrors((p) => ({ ...p, password: undefined })); }} placeholder="At least 8 characters" autoComplete="current-password" aria-invalid={!!fieldErrors.password} />
              <button type="button" className="password-toggle" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}>{show ? "Hide" : "Show"}</button>
            </div>
          </Field>

          <div style={{ marginTop: 16 }}>
            <Field label="Demo role" hint="Server-side RBAC will replace this selection when M1 auth is integrated.">
              <div className="select-wrap">
                <select className="select" value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Demo role">
                  {DEMO_ACCOUNTS.map((account) => <option key={account.role} value={account.role}>{account.label}</option>)}
                </select>
              </div>
            </Field>
          </div>

          <div className="auth-links">
            <Link href="/forgot-password">Forgot password?</Link>
            <span className="dim">Accounts are provisioned by an administrator.</span>
          </div>

          <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>
            {busy ? "Signing in…" : <>Sign in <Icon name="arrowRight" /></>}
          </button>

          <div className="demo-accounts">
            <div className="demo-accounts-title">SEEDED DEMO ACCOUNTS</div>
            {DEMO_ACCOUNTS.map((account) => (
              <button key={account.email} type="button" className="demo-account" onClick={() => { setEmail(account.email); setPassword(account.password); setRole(account.role); setError(""); setFieldErrors({}); }}>
                <span className="mono">{account.email}</span>
                <span className="dim">{account.label}</span>
                <Icon name="arrowRight" />
              </button>
            ))}
          </div>

          <div className="auth-note">
            Demo environment. All console records are synthetic fixtures; risk scores are prototype rule-engine outputs and are not validated probabilities of compromise. No live cloud account is connected.
          </div>
        </form>
      </div>

      <aside className="auth-aside">
        <div>
          <div className="eyebrow">SECURITY OPERATIONS CONSOLE</div>
          <h2>One console for device, event and response evidence.</h2>
          <p>Correlate simulated IoT and cloud activity, inspect explainable risk scores, and carry out controlled response actions with an audit trail.</p>
          <div className="aside-list">
            <div className="aside-row">
              <span className="idx">01</span>
              <div><h3>Explainable scoring</h3><p>Every event shows the rules and baseline deviations that produced its score.</p></div>
            </div>
            <div className="aside-row">
              <span className="idx">02</span>
              <div><h3>Correlated incidents</h3><p>Related events are grouped within a 15-minute correlation window and recorded in a timeline.</p></div>
            </div>
            <div className="aside-row">
              <span className="idx">03</span>
              <div><h3>Guarded response</h3><p>Allowlist checks, typed confirmation and an append-only audit log constrain every action.</p></div>
            </div>
          </div>
        </div>
        <div className="auth-footer">CLOUDGUARD IOT · FRONTEND HANDOVER BUILD · NO LIVE CLOUD CONNECTION</div>
      </aside>
    </div>
  );
}
