import { levelClass } from "@/lib/format";

export interface TrendPoint { label: string; events: number; critical: number }

/** Dependency-free SVG time-series chart. Values are counts from the data layer. */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  const width = 760;
  const height = 196;
  const pad = { left: 34, right: 14, top: 12, bottom: 28 };
  const max = Math.max(4, ...data.map((d) => d.events));
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const x = (index: number) => pad.left + (data.length <= 1 ? 0 : (index / (data.length - 1)) * plotWidth);
  const y = (value: number) => pad.top + (1 - value / max) * plotHeight;
  const points = data.map((d, i) => `${x(i).toFixed(1)},${y(d.events).toFixed(1)}`).join(" ");
  const area = `${pad.left},${pad.top + plotHeight} ${points} ${x(data.length - 1).toFixed(1)},${pad.top + plotHeight}`;
  const ticks = [0, Math.round(max / 2), max];

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="Security events per hour over the last 24 sampled hours">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="var(--line-soft)" strokeWidth="1" />
            <text x={pad.left - 8} y={y(tick) + 3} textAnchor="end" className="chart-axis">{tick}</text>
          </g>
        ))}
        <polygon points={area} fill="var(--accent-soft)" />
        <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinejoin="round" />
        {data.map((d, i) => d.critical > 0 ? (
          <circle key={i} cx={x(i)} cy={y(d.events)} r="2.6" fill="var(--danger)" />
        ) : null)}
        {data.map((d, i) => i % 4 === 0 ? (
          <text key={`l${i}`} x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : "middle"} className="chart-axis">{d.label}</text>
        ) : null)}
      </svg>
      <div className="chart-legend">
        <span><i style={{ background: "var(--accent)" }} />Events per hour</span>
        <span><i style={{ background: "var(--danger)" }} />Hour contains critical event</span>
      </div>
    </div>
  );
}

export function DistributionBars({ data, total, title }: { data: Record<string, number>; total?: number; title?: string }) {
  const entries = Object.entries(data).filter(([, value]) => value > 0);
  const max = Math.max(1, ...entries.map(([, value]) => value));
  const denominator = total ?? entries.reduce((sum, [, value]) => sum + value, 0);
  if (entries.length === 0) return <div className="panel-body dim" style={{ fontSize: 12 }}>No records in this view.</div>;
  return (
    <div className="panel-body">
      {title && <div className="dim" style={{ fontSize: 11, marginBottom: 8 }}>{title}</div>}
      {entries.map(([label, value]) => (
        <div className="dist-row" key={label} style={{ color: `var(--${levelClass(label) === "critical" ? "danger" : levelClass(label) === "high" ? "warning" : levelClass(label) === "medium" ? "info" : "accent"})` }}>
          <span className="muted">{label.replaceAll("_", " ")}</span>
          <span className="dist-track"><span style={{ width: `${(value / max) * 100}%` }} /></span>
          <span className="dist-value">{value}</span>
        </div>
      ))}
      {denominator > 0 && <div className="dim" style={{ fontSize: 10, marginTop: 8 }}>Total records: {denominator}</div>}
    </div>
  );
}

export function StackedSeverityBar({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).filter(([, value]) => value > 0);
  const total = entries.reduce((sum, [, value]) => sum + value, 0) || 1;
  const colors: Record<string, string> = { LOW: "var(--accent)", MEDIUM: "var(--info)", HIGH: "var(--warning)", CRITICAL: "var(--danger)" };
  return (
    <div style={{ padding: "4px 17px 18px" }}>
      <div className="stacked-bar" role="img" aria-label="Severity distribution of security events">
        {entries.map(([label, value]) => (
          <span key={label} style={{ width: `${(value / total) * 100}%`, background: colors[label] ?? "var(--dim)" }} title={`${label}: ${value}`} />
        ))}
      </div>
      <div className="chart-legend">
        {entries.map(([label, value]) => <span key={label}><i style={{ background: colors[label] }} />{label} {value}</span>)}
      </div>
    </div>
  );
}
