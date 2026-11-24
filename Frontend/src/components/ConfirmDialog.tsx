"use client";

import { useState } from "react";
import { Field, Modal } from "./ui";
import type { ResponseAction, ExecutionType } from "@/lib/types";

/**
 * Sensitive-action confirmation. Password re-entry and a typed target are
 * required before the confirm button becomes available. No password is stored,
 * logged, or sent by this demo component.
 */
export function SensitiveActionDialog({
  action,
  target,
  incidentId,
  onCancel,
  onConfirm,
  busy = false,
  allowExecution = true,
}: {
  action: ResponseAction;
  target: string;
  incidentId: string;
  onCancel: () => void;
  onConfirm: (execution: ExecutionType) => void;
  busy?: boolean;
  allowExecution?: boolean;
}) {
  const isDryRun = action === "DRY_RUN";
  const [password, setPassword] = useState("");
  const [typed, setTyped] = useState("");
  // A dry run is always a no-change action; never default it to EXECUTED.
  const [execution, setExecution] = useState<ExecutionType>(isDryRun || !allowExecution ? "DRY_RUN" : "EXECUTED");
  const valid = password.length >= 8 && typed.trim() === target;

  return (
    <Modal
      title={`Confirm ${action === "DRY_RUN" ? "dry run" : action === "REINSTATE_DEVICE" ? "reinstatement" : "isolation"} of ${target}`}
      subtitle="This action is simulated, reversible where applicable, and written to the audit log."
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={`btn ${execution === "EXECUTED" ? "btn-danger" : "btn-primary"}`} onClick={() => onConfirm(execution)} disabled={!valid || busy}>
            {busy ? "Recording…" : execution === "DRY_RUN" ? "Run dry run" : "Confirm action"}
          </button>
        </>
      }
    >
      <div className="notice danger">
        {isDryRun
          ? "Dry run. No device or cloud state will change. The simulated result is recorded in the audit log."
          : action === "ISOLATE_DEVICE"
            ? "Warning. The device will stop publishing and subscribing until reinstated. Evidence is preserved first."
            : "Warning. The device policy will be restored. This action is recorded in the audit log."}
      </div>
      <div className="safeguard-row" aria-label="Action safeguards">
        <span><span className="safeguard-mark">✓</span> Allowlist check</span>
        <span><span className="safeguard-mark">✓</span> Cooldown enforced</span>
        <span><span className="safeguard-mark">✓</span> {isDryRun ? "No state change" : "Reversible"}</span>
      </div>
      <dl className="kv compact">
        <dt>Incident</dt><dd className="mono">{incidentId}</dd>
        <dt>Target</dt><dd className="mono">{target}</dd>
        <dt>Action type</dt><dd className="mono">{action}</dd>
        <dt>Execution</dt>
        <dd>
          {isDryRun ? (
            <span className="mono">DRY_RUN · no change made</span>
          ) : (
            <div className="select-wrap">
              <select className="select" value={execution} onChange={(e) => setExecution(e.target.value as ExecutionType)} aria-label="Execution mode">
                {allowExecution && <option value="EXECUTED">Executed (simulated state change)</option>}
                <option value="DRY_RUN">Dry run (no change made)</option>
              </select>
            </div>
          )}
        </dd>
      </dl>
      <Field label="Re-enter password" hint="Demo confirmation only. The value is never stored or transmitted.">
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="off" />
      </Field>
      <Field label={`Type ${target} to confirm`} error={typed && typed.trim() !== target ? "Target does not match." : undefined}>
        <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={target} autoComplete="off" />
      </Field>
    </Modal>
  );
}

export function SimpleConfirmDialog({
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm,
  busy = false,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={<>
        <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={onConfirm} disabled={busy}>{busy ? "Saving…" : confirmLabel}</button>
      </>}
    >
      <div className="notice info">{message}</div>
    </Modal>
  );
}
