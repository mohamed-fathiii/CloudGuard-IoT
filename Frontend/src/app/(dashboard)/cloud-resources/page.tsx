"use client";

import { useState } from "react";
import { StatusChip } from "@/components/ui";
import { ErrorBanner, Modal, Panel, PanelHead, StateBlock, KeyValue } from "@/components/ui";
import { useResource } from "@/hooks/useResource";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { listCloudResources, rescanCloudResources, toError } from "@/lib/api/services";
import { formatDate, humanize } from "@/lib/format";
import type { CloudResource } from "@/lib/types";

export default function CloudResourcesPage() {
  const { session, can } = useAuth();
  const { notify } = useToast();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("ALL");
  const [selected, setSelected] = useState<CloudResource | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const { data, loading, error, reload } = useResource(listCloudResources, []);

  const rows = (data ?? []).filter((r) =>
    (!search || `${r.resourceName} ${r.id} ${r.providerResourceId}`.toLowerCase().includes(search.toLowerCase())) &&
    (type === "ALL" || r.resourceType === type));

  async function rescan() {
    setBusy(true); setErrorMessage("");
    try {
      await rescanCloudResources(session?.user.email ?? "demo");
      notify("Simulated rescan complete. No AWS API call was made.");
      reload();
    } catch (cause) {
      setErrorMessage(toError(cause).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">CLOUD ATTACHMENT</div>
          <h2>Cloud Resources</h2>
          <p>Simulated inventory used for cross-domain correlation in the prototype.</p>
        </div>
        <div className="page-actions">
          {can("manageDevices") ? (
            <button className="btn btn-primary" onClick={rescan} disabled={busy}>{busy ? "Scanning…" : "Run simulated scan"}</button>
          ) : <span className="toolbar-note">Read-only for this role.</span>}
        </div>
      </div>

      <div className="notice info" style={{ marginBottom: 16 }}>
        AWS integration is <strong>SIMULATED</strong>. These records are fixtures, not live cloud resources, and no production resource was touched.
      </div>

      <Panel>
        <div className="filter-row">
          <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search resource name or ID…" aria-label="Search cloud resources" />
          <select className="select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by resource type">
            <option value="ALL">Any resource type</option>
            {["EC2", "S3", "IAM", "LAMBDA", "RDS", "VPC", "CLOUDFRONT", "OTHER"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="filter-spacer" />
          <span className="toolbar-note">{rows.length} of {data?.length ?? 0} simulated resources</span>
        </div>

        <ErrorBanner error={error} onRetry={reload} />
        {errorMessage && <div className="notice danger" style={{ margin: 14 }} role="alert">{errorMessage}</div>}
        {loading && !data ? <StateBlock kind="loading" /> : rows.length === 0 ? <StateBlock kind="empty" title="No resources match these filters" /> : (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Resource</th><th>Type</th><th>Provider</th><th>Region</th><th>Status</th><th>Last scan</th><th><span className="sr-only">Details</span></th></tr></thead>
              <tbody>
                {rows.map((resource) => (
                  <tr key={resource.id}>
                    <td><div className="strong">{resource.resourceName}</div><div className="dim mono" style={{ fontSize: 10 }}>{resource.id}</div></td>
                    <td>{humanize(resource.resourceType)}</td>
                    <td>{resource.provider}</td>
                    <td className="mono">{resource.region}</td>
                    <td><StatusChip status={resource.status} /></td>
                    <td className="num">{formatDate(resource.lastScannedAt)}</td>
                    <td><button className="btn btn-sm btn-quiet" onClick={() => setSelected(resource)}>Details</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {selected && (
        <Modal title={selected.resourceName} subtitle="Simulated cloud resource record" onClose={() => setSelected(null)} footer={<button className="btn" onClick={() => setSelected(null)}>Close</button>}>
          <KeyValue rows={[
            { label: "Resource ID", value: <span className="mono">{selected.id}</span> },
            { label: "Provider", value: selected.provider },
            { label: "Resource type", value: humanize(selected.resourceType) },
            { label: "Provider ID", value: <span className="mono">{selected.providerResourceId}</span> },
            { label: "Region", value: <span className="mono">{selected.region}</span> },
            { label: "Environment", value: humanize(selected.environment) },
            { label: "Status", value: <StatusChip status={selected.status} /> },
            { label: "Last scanned", value: <span className="num">{formatDate(selected.lastScannedAt)}</span> },
          ]} />
          <div className="notice info">No credential or secret is stored in this record. Provider identifiers are synthetic.</div>
        </Modal>
      )}
    </div>
  );
}
