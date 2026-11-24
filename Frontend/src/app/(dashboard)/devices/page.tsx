"use client";

import { useState, type FormEvent } from "react";
import { DeviceTable } from "@/components/Tables";
import { ErrorBanner, Field, Modal, Pager, Panel, PanelHead, StateBlock } from "@/components/ui";
import { useResource } from "@/hooks/useResource";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { createDevice, listDevices, toError } from "@/lib/api/services";
import type { ApiError, DeviceType, Environment } from "@/lib/types";

const DEVICE_TYPES: DeviceType[] = ["SENSOR", "CAMERA", "GATEWAY", "ACTUATOR", "SMART_LOCK", "OTHER"];
const ENVIRONMENTS: Environment[] = ["SIMULATION", "TESTING", "DEVELOPMENT", "STAGING", "PRODUCTION"];

export default function DevicesPage() {
  const { can, session } = useAuth();
  const { notify } = useToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [simulationState, setSimulationState] = useState("ALL");
  const [risk, setRisk] = useState("ALL");
  const [sort, setSort] = useState("risk-desc");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ deviceName: "", deviceType: "SENSOR" as DeviceType, model: "", environment: "SIMULATION" as Environment, location: "", isSimulated: true });

  const { data, loading, error, reload } = useResource(
    () => listDevices({ search, status, simulationState, risk, sort, page, pageSize: 10 }),
    [search, status, simulationState, risk, sort, page],
  );

  function resetFilters() {
    setSearch(""); setStatus("ALL"); setSimulationState("ALL"); setRisk("ALL"); setSort("risk-desc"); setPage(1);
  }

  async function submitDevice(event: FormEvent) {
    event.preventDefault();
    if (form.deviceName.trim().length < 3) { setFormError("Device name must be at least 3 characters."); return; }
    if (!form.model.trim()) { setFormError("Model is required."); return; }
    if (!form.location.trim()) { setFormError("Location is required."); return; }
    setBusy(true); setFormError("");
    try {
      const created = await createDevice({ ...form, deviceName: form.deviceName.trim() }, session?.user.email ?? "demo");
      notify(`Device ${created.id} registered in the demo inventory.`);
      setOpen(false);
      setForm({ deviceName: "", deviceType: "SENSOR", model: "", environment: "SIMULATION", location: "", isSimulated: true });
      reload();
    } catch (cause) {
      setFormError(toError(cause).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">ASSET INVENTORY</div>
          <h2>Devices</h2>
          <p>Search, filter and inspect the registered IoT devices in this demo inventory.</p>
        </div>
        <div className="page-actions">
          {can("manageDevices") ? (
            <button className="btn btn-primary" onClick={() => setOpen(true)}>+ Register device</button>
          ) : (
            <span className="toolbar-note">Registering devices requires the Administrator role.</span>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="filter-row">
          <input className="input" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search name, ID, model…" aria-label="Search devices" />
          <select className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter by device status">
            <option value="ALL">Any status</option>
            {["ONLINE", "OFFLINE", "COMPROMISED", "MAINTENANCE", "DECOMMISSIONED"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="select" value={simulationState} onChange={(e) => { setSimulationState(e.target.value); setPage(1); }} aria-label="Filter by simulation state">
            <option value="ALL">Any simulation state</option>
            <option value="OPERATIONAL">Operational</option>
            <option value="QUARANTINED">Quarantined</option>
          </select>
          <select className="select" value={risk} onChange={(e) => { setRisk(e.target.value); setPage(1); }} aria-label="Filter by risk band">
            <option value="ALL">Any risk</option>
            <option value="LOW">Low · 0–29</option>
            <option value="MEDIUM">Medium · 30–59</option>
            <option value="HIGH">High · 60–79</option>
            <option value="CRITICAL">Critical · 80–100</option>
          </select>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort devices">
            <option value="risk-desc">Risk: high to low</option>
            <option value="risk-asc">Risk: low to high</option>
            <option value="name-asc">Name: A–Z</option>
            <option value="name-desc">Name: Z–A</option>
            <option value="seen-desc">Last seen: newest</option>
          </select>
          <div className="filter-spacer" />
          <button className="btn btn-sm btn-quiet" onClick={resetFilters}>Clear filters</button>
        </div>

        <ErrorBanner error={error as ApiError | null} onRetry={reload} />
        {loading && !data ? <StateBlock kind="loading" /> : data && data.items.length > 0 ? (
          <>
            <DeviceTable devices={data.items} />
            <Pager page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
          </>
        ) : <StateBlock kind="empty" title="No devices match these filters" action={<button className="btn" onClick={resetFilters}>Clear filters</button>} />}
      </div>

      {open && (
        <Modal
          title="Register device"
          subtitle="Adds a synthetic device to the demo inventory. No cloud API call is made."
          onClose={() => setOpen(false)}
          footer={<>
            <button className="btn" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" onClick={submitDevice} disabled={busy}>{busy ? "Registering…" : "Register device"}</button>
          </>}
        >
          {formError && <div className="notice danger" role="alert">{formError}</div>}
          <Field label="Device name">
            <input className="input" value={form.deviceName} onChange={(e) => setForm({ ...form, deviceName: e.target.value })} placeholder="e.g. SIM-11 · dev-110" />
          </Field>
          <div className="row" style={{ gap: 12 }}>
            <div style={{ flex: 1 }}><Field label="Device type">
              <div className="select-wrap"><select className="select" value={form.deviceType} onChange={(e) => setForm({ ...form, deviceType: e.target.value as DeviceType })}>{DEVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
            </Field></div>
            <div style={{ flex: 1 }}><Field label="Environment">
              <div className="select-wrap"><select className="select" value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value as Environment })}>{ENVIRONMENTS.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
            </Field></div>
          </div>
          <Field label="Model"><input className="input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Hardware or simulation profile" /></Field>
          <Field label="Location"><input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Lab, site or Simulator" /></Field>
          <label className="check-row"><input type="checkbox" checked={form.isSimulated} onChange={(e) => setForm({ ...form, isSimulated: e.target.checked })} /> <span>Simulated device</span></label>
        </Modal>
      )}
    </div>
  );
}
