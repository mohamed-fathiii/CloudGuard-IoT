"use client";

import { useEffect, type ReactNode } from "react";
import { Icon } from "./Icon";
import { levelClass } from "@/lib/format";
import type { ApiError, Page } from "@/lib/types";

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>;
}

export function PanelHead({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="panel-head">
      <div>
        <h3>{title}</h3>
        {subtitle && <div className="sub">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

export function SeverityChip({ level }: { level: string }) {
  return <span className={`chip ${levelClass(level)}`}>{level.toUpperCase()}</span>;
}

export function StatusChip({ status }: { status: string }) {
  const s = status.toUpperCase().replaceAll("_", " ");
  const cls = s.includes("CRITICAL") ? "critical" : s.includes("HIGH") || s.includes("AWAITING") || s.includes("PENDING") ? "high" : s.includes("RESOLVED") || s.includes("RECOVERED") || s.includes("PROCESSED") || s.includes("ONLINE") || s.includes("EXECUTED") ? "low" : "neutral";
  return <span className={`chip ${cls}`}>{s}</span>;
}

export function RiskValue({ score }: { score: number }) {
  const level = score >= 80 ? "CRITICAL" : score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW";
  return (
    <span className={`risk-value ${levelClass(level)}`}>
      {score}
      <span className="risk-bar" aria-hidden="true"><span style={{ width: `${score}%` }} /></span>
    </span>
  );
}

export function StateBlock({
  kind = "empty",
  title,
  description,
  action,
}: {
  kind?: "empty" | "error" | "loading" | "denied" | "offline";
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  if (kind === "loading") {
    return (
      <div className="state" role="status" aria-live="polite">
        <div className="state-mark">··</div>
        <h3>Loading data</h3>
        <p>Reading the request from the configured data source.</p>
        <div style={{ width: "100%", maxWidth: 480, display: "grid", gap: 8, marginTop: 8 }}>
          <div className="skeleton" style={{ height: 34 }} />
          <div className="skeleton" style={{ height: 34 }} />
          <div className="skeleton" style={{ height: 34 }} />
        </div>
      </div>
    );
  }
  const defaults = {
    empty: ["No records match this view", "Adjust the filters or clear the search to see more records."],
    error: ["Request could not be completed", "The data source did not return a usable response. Retry or contact the platform owner."],
    denied: ["Access denied", "Your current role does not include permission for this area. Switch to a role with the required access in the demo session."],
    offline: ["Data source unavailable", "The API is not reachable. The console will resume when the connection is restored."],
  } as const;
  return (
    <div className="state">
      <div className="state-mark">{kind === "empty" ? "—" : kind === "denied" ? "×" : "!"}</div>
      <h3>{title ?? defaults[kind][0]}</h3>
      <p>{description ?? defaults[kind][1]}</p>
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export function Pager({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="table-foot">
      <span>
        {total === 0 ? "No records" : `Showing ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, total)} of ${total}`}
      </span>
      <div className="pager">
        <button className="btn btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
          <Icon name="arrowLeft" /> Prev
        </button>
        <span className="mono dim" style={{ fontSize: 11 }}>{page} / {pages}</span>
        <button className="btn btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page">
          Next <Icon name="arrowRight" />
        </button>
      </div>
    </div>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error" role="alert">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

export function Select({
  value,
  onChange,
  options,
  label,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <div className={`select-wrap ${className}`}>
      <select className="select" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function Metric({ label, value, note, tone }: { label: string; value: string | number; note?: string; tone?: "critical" | "warning" | "accent" }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className={`metric-value ${tone === "critical" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "accent" ? "text-accent" : ""}`}>{value}</div>
      {note && <div className="metric-note">{note}</div>}
    </div>
  );
}

export function KeyValue({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="kv">
      {rows.map((r) => <div key={r.label} style={{ display: "contents" }}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}
    </dl>
  );
}

export function ErrorBanner({ error, onRetry }: { error: ApiError | null; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div className="notice danger" style={{ marginBottom: 16 }}>
      <strong>{error.code}</strong> — {error.message}
      {onRetry && <button className="btn btn-sm btn-quiet" onClick={onRetry} style={{ marginLeft: 10 }}>Retry</button>}
    </div>
  );
}

export function PageResult<T>({
  state,
  onRetry,
  children,
}: {
  state: { loading: boolean; error: ApiError | null; data: Page<T> | T[] | null };
  onRetry: () => void;
  children: (data: T[]) => ReactNode;
}) {
  if (state.loading && !state.data) return <Panel><StateBlock kind="loading" /></Panel>;
  if (state.error) return <Panel><StateBlock kind={state.error.status === 403 ? "denied" : state.error.status === 0 ? "offline" : "error"} action={<button className="btn" onClick={onRetry}>Try again</button>} /></Panel>;
  if (!state.data) return <Panel><StateBlock kind="empty" /></Panel>;
  const items = Array.isArray(state.data) ? state.data : state.data.items;
  if (items.length === 0) return <Panel><StateBlock kind="empty" /></Panel>;
  return <>{children(items)}</>;
}
