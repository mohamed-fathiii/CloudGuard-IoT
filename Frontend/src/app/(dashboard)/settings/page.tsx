"use client";

import { useState, type FormEvent } from "react";
import { Field, KeyValue, Modal, Panel, PanelHead, StateBlock } from "@/components/ui";
import { useResource } from "@/hooks/useResource";
import { useAuth, ROLE_LABELS } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { getDetectionRules, getSettings, inviteUser, listUsers, toError, updateSettings } from "@/lib/api/services";
import { formatDate } from "@/lib/format";
import type { Role, SystemSettings, User } from "@/lib/types";

type Tab = "Administrator Profile" | "User Management" | "Notifications" | "Security Policies" | "Device Policies" | "Data Retention" | "Integrations" | "System Configuration";
const TABS: Tab[] = ["Administrator Profile", "User Management", "Notifications", "Security Policies", "Device Policies", "Data Retention", "Integrations", "System Configuration"];

export default function SettingsPage() {
  const { can, session } = useAuth();
  const { notify } = useToast();
  const [tab, setTab] = useState<Tab>("Administrator Profile");
  const [profile, setProfile] = useState({ name: session?.user.name ?? "Administrator", email: session?.user.email ?? "admin@example.com" });
  const [notifications, setNotifications] = useState({ critical: true, high: true, incidents: true, responses: false });
  const [allowlist, setAllowlist] = useState("");
  const [environment, setEnvironment] = useState("SIMULATION");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ name: "", email: "", role: "VIEWER" as Role });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const { data, loading, error, reload, setData } = useResource(async () => {
    const [settings, users, rules] = await Promise.all([getSettings(), listUsers(), getDetectionRules()]);
    return { settings, users, rules };
  }, []);

  if (!can("changeSettings")) {
    return (
      <div className="page">
        <div className="page-head"><div><div className="eyebrow">SYSTEM CONFIGURATION</div><h2>Settings</h2><p>Console and platform configuration.</p></div></div>
        <Panel><StateBlock kind="denied" description="Only the Administrator role may change settings. Switch roles from the user menu to inspect this view." /></Panel>
      </div>
    );
  }

  if (loading && !data) return <div className="page"><Panel><StateBlock kind="loading" /></Panel></div>;
  if (error || !data) return <div className="page"><Panel><StateBlock kind="error" title="Settings could not be loaded" action={<button className="btn" onClick={reload}>Try again</button>} /></Panel></div>;

  const settings = data.settings;

  function patch(next: Partial<SystemSettings>, message: string) {
    setBusy(true);
    updateSettings(next, session?.user.email ?? "demo")
      .then((updated) => { setData({ ...data!, settings: updated }); notify(message); })
      .catch((cause) => notify(toError(cause).message, "error"))
      .finally(() => setBusy(false));
  }

  async function submitInvite(event: FormEvent) {
    event.preventDefault();
    if (invite.name.trim().length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invite.email)) {
      setFormError("Enter a name of at least 3 characters and a valid email address.");
      return;
    }
    setBusy(true); setFormError("");
    try {
      const created = await inviteUser({ ...invite, name: invite.name.trim() }, session?.user.email ?? "demo");
      setData({ ...data!, users: [...data!.users, created] });
      setInviteOpen(false); setInvite({ name: "", email: "", role: "VIEWER" });
      notify(`Demo invitation recorded for ${created.email}. No email was sent.`);
    } catch (cause) { setFormError(toError(cause).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">SYSTEM CONFIGURATION</div>
          <h2>Settings</h2>
          <p>Changes in this demo are held in memory only and are labelled as such.</p>
        </div>
        <div className="page-actions"><span className="chip plain">ADMINISTRATOR ACCESS</span></div>
      </div>

      <div className="tabs" role="tablist" aria-label="Settings sections">
        {TABS.map((name) => (
          <button key={name} role="tab" aria-selected={tab === name} className={`tab ${tab === name ? "active" : ""}`} onClick={() => setTab(name)}>{name}</button>
        ))}
      </div>

      <div style={{ marginTop: 16, maxWidth: 920 }}>
        <Panel>
          <PanelHead title={tab} subtitle="CloudGuard IoT console" />
          <div className="panel-body stack" style={{ gap: 14 }}>

            {tab === "Administrator Profile" && (
              <>
                <Field label="Name"><input className="input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></Field>
                <Field label="Email"><input className="input" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} /></Field>
                <Field label="Role" hint="Role is managed by M1 authentication and server-side RBAC."><input className="input" value={ROLE_LABELS[session?.user.role ?? "ADMINISTRATOR"]} disabled /></Field>
                <div><button className="btn btn-primary" onClick={() => notify("Profile details saved in the demo session only.")}>Save profile</button></div>
              </>
            )}

            {tab === "User Management" && (
              <>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <span className="toolbar-note">{data.users.length} provisioned accounts · seed accounts from the implementation plan</span>
                  <button className="btn btn-sm btn-primary" onClick={() => setInviteOpen(true)}>Invite user</button>
                </div>
                <div className="table-scroll">
                  <table className="data">
                    <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>State</th><th>Created</th></tr></thead>
                    <tbody>
                      {data.users.map((user: User) => (
                        <tr key={user.id}>
                          <td className="strong">{user.name}</td>
                          <td className="mono">{user.email}</td>
                          <td>{ROLE_LABELS[user.role]}</td>
                          <td><span className={`chip ${user.active ? "low" : "neutral"}`}>{user.active ? "ACTIVE" : "INACTIVE"}</span></td>
                          <td className="num">{formatDate(user.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {tab === "Notifications" && (
              <>
                {([
                  ["critical", "Critical alerts", "Events scoring 80–100."],
                  ["high", "High alerts", "Events scoring 60–79."],
                  ["incidents", "Incident updates", "Status and assignment changes."],
                  ["responses", "Response results", "Execution and recovery outcomes."],
                ] as const).map(([key, label, hint]) => (
                  <label className="check-row" key={key}>
                    <input type="checkbox" checked={notifications[key]} onChange={(e) => setNotifications({ ...notifications, [key]: e.target.checked })} />
                    <span><strong style={{ fontWeight: 500 }}>{label}</strong><span className="dim" style={{ display: "block", fontSize: 11 }}>{hint}</span></span>
                  </label>
                ))}
                <div><button className="btn btn-primary" onClick={() => notify("Notification preferences saved in the demo session.")}>Save changes</button></div>
              </>
            )}

            {tab === "Security Policies" && (
              <>
                <div className="toolbar-note">Risk bands are fixed by decision D-07. They cannot be changed from this UI.</div>
                <KeyValue rows={Object.entries(settings.riskThresholds).map(([level, range]) => ({ label: level, value: <span className="mono">{range.min}–{range.max}</span> }))} />
                <Field label="Correlation window (minutes)" hint="Groups related events from the same identity into an incident. Default: 15.">
                  <input className="input" type="number" min={1} max={1440} value={settings.correlationWindowMinutes} onChange={(e) => setData({ ...data!, settings: { ...settings, correlationWindowMinutes: Number(e.target.value) } })} />
                </Field>
                <Field label="Response mode">
                  <div className="select-wrap"><select className="select" value={settings.responseMode} onChange={(e) => setData({ ...data!, settings: { ...settings, responseMode: e.target.value as SystemSettings["responseMode"] } })}>
                    <option value="APPROVAL_REQUIRED">Approval required</option>
                    <option value="GUARDED_AUTOMATIC">Guarded automatic (allowlisted, score ≥85)</option>
                  </select></div>
                </Field>
                <div className="notice info">Automatic isolation at score ≥85 is allowed only for allowlisted simulated targets. Scores 80–84 require approval. No unrestricted automatic isolation is possible.</div>
                <div><button className="btn btn-primary" disabled={busy} onClick={() => patch({ correlationWindowMinutes: settings.correlationWindowMinutes, responseMode: settings.responseMode }, "Security policy saved (demo).")}>Save policy</button></div>
              </>
            )}

            {tab === "Device Policies" && (
              <>
                <Field label="Cooldown between response actions (minutes)" hint="Default 15 minutes in the prototype.">
                  <input className="input" type="number" min={0} max={1440} value={settings.cooldownMinutes} onChange={(e) => setData({ ...data!, settings: { ...settings, cooldownMinutes: Number(e.target.value) } })} />
                </Field>
                <Field label="Response allowlist" hint="Comma-separated device IDs. Requests against other targets are rejected before any action.">
                  <textarea className="textarea" value={allowlist || settings.allowedTargets.join(", ")} onChange={(e) => setAllowlist(e.target.value)} />
                </Field>
                <div className="chip-row">{settings.allowedTargets.map((target) => <span className="chip plain" key={target}>{target}</span>)}</div>
                <div className="notice info">Dry run is available for every action and makes no device or cloud state change.</div>
                <div><button className="btn btn-primary" disabled={busy} onClick={() => patch({ cooldownMinutes: settings.cooldownMinutes, allowedTargets: (allowlist || settings.allowedTargets.join(", ")).split(",").map((s) => s.trim()).filter(Boolean) }, "Device policy saved (demo).")}>Save policy</button></div>
              </>
            )}

            {tab === "Data Retention" && (
              <>
                <Field label="Event and incident retention (days)">
                  <input className="input" type="number" min={1} max={3650} value={settings.retentionDays} onChange={(e) => setData({ ...data!, settings: { ...settings, retentionDays: Number(e.target.value) } })} />
                </Field>
                <div className="notice info">Audit records are append-only and retained independently of operational events. The backend must not allow UPDATE or DELETE on audit entries from the application role.</div>
                <div><button className="btn btn-primary" disabled={busy} onClick={() => patch({ retentionDays: settings.retentionDays }, "Retention policy saved (demo).")}>Save retention</button></div>
              </>
            )}

            {tab === "Integrations" && (
              <>
                <Field label="AWS integration state">
                  <div className="select-wrap"><select className="select" value={settings.awsIntegration} onChange={(e) => setData({ ...data!, settings: { ...settings, awsIntegration: e.target.value as SystemSettings["awsIntegration"] } })}>
                    <option value="SIMULATED">Simulated (no live calls)</option>
                    <option value="NOT_CONNECTED">Not connected</option>
                  </select></div>
                </Field>
                <Field label="Simulator API key" hint="Secrets are configured server-side and must never be stored in this frontend or in fixtures.">
                  <input className="input" value="Configured server-side" disabled />
                </Field>
                <div className="notice info">No production AWS resource is connected. Cross-domain events in this demo are generated by the simulator and labelled as such.</div>
                <div><button className="btn btn-primary" disabled={busy} onClick={() => patch({ awsIntegration: settings.awsIntegration }, "Integration state saved (demo).")}>Save integration</button></div>
              </>
            )}

            {tab === "System Configuration" && (
              <>
                <KeyValue rows={[
                  { label: "Application", value: "CloudGuard IoT Security Console" },
                  { label: "API base path", value: <span className="mono">{process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1"}</span> },
                  { label: "Data source", value: <span className="mono">{process.env.NEXT_PUBLIC_USE_MOCK_DATA === "0" ? "LIVE API (ADAPTER)" : "DEMO FIXTURES"}</span> },
                  { label: "Detection rules", value: `${data.rules.length} prototype rules` },
                ]} />
                <Field label="Environment">
                  <div className="select-wrap"><select className="select" value={environment} onChange={(e) => setEnvironment(e.target.value)}>
                    {["SIMULATION", "DEVELOPMENT", "TESTING", "STAGING", "PRODUCTION"].map((e) => <option key={e} value={e}>{e}</option>)}
                  </select></div>
                </Field>
                <div><button className="btn btn-primary" onClick={() => notify(`Environment selection (${environment}) recorded in the demo session.`)}>Save configuration</button></div>
              </>
            )}
          </div>
        </Panel>
      </div>

      {inviteOpen && (
        <Modal title="Invite user" subtitle="Records a demo invitation; no email is sent." onClose={() => setInviteOpen(false)} footer={<>
          <button className="btn" onClick={() => setInviteOpen(false)} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submitInvite} disabled={busy}>{busy ? "Saving…" : "Record invitation"}</button>
        </>}>
          {formError && <div className="notice danger" role="alert">{formError}</div>}
          <Field label="Name"><input className="input" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} /></Field>
          <Field label="Email"><input className="input" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} /></Field>
          <Field label="Role">
            <div className="select-wrap"><select className="select" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as Role })}>
              {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select></div>
          </Field>
        </Modal>
      )}
    </div>
  );
}
