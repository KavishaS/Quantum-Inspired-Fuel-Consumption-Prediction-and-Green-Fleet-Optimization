import { useState } from "react";
import {
  FileText, Plus, Trash2, Edit2, AlertTriangle, Calculator,
  Clock, DollarSign, Package, CheckCircle2, XCircle
} from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { createContract, deleteContract, listContracts, updateContract, listVessels } from "@/services/api";
import { ApiError } from "@/services/api";
import type { Contract, ContractCreateInput } from "@/types/api";
import { Button, Field, Input, Select } from "@/components/ui/Controls";
import { ChartCard } from "@/components/ui/ChartCard";
import { KpiCard } from "@/components/ui/KpiCard";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/States";
import { fmtNum, fmtUsd } from "@/utils/format";

const DEFAULT_NEW_CONTRACT: ContractCreateInput = {
  contract_code: "",
  customer: "",
  origin_port: "Rotterdam",
  destination_port: "Singapore",
  cargo_type: "Iron Ore",
  cargo_quantity_tonnes: 120000,
  required_arrival_days: 24,
  laycan_start: "2026-11-01",
  laycan_end: "2026-11-25",
  penalty_per_day: 15000,
  priority: "High",
  status: "Active",
};

export function PortContracts() {
  const { data, loading, error, reload } = useAsync(() => listContracts());
  const { data: vesselData } = useAsync(listVessels);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterPriority, setFilterPriority] = useState("ALL");
  const [search, setSearch] = useState("");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [form, setForm] = useState<ContractCreateInput>(DEFAULT_NEW_CONTRACT);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Penalty Calculator State
  const [calcContractId, setCalcContractId] = useState<number | null>(null);
  const [calcDelayDays, setCalcDelayDays] = useState<number>(3);

  const openCreateModal = () => {
    setEditingContract(null);
    setForm({
      ...DEFAULT_NEW_CONTRACT,
      contract_code: `CT-2026-${String(Math.floor(100 + Math.random() * 900))}`,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (c: Contract) => {
    setEditingContract(c);
    setForm({
      contract_code: c.contract_code,
      customer: c.customer,
      origin_port: c.origin_port,
      destination_port: c.destination_port,
      cargo_type: c.cargo_type,
      cargo_quantity_tonnes: c.cargo_quantity_tonnes,
      required_arrival_days: c.required_arrival_days,
      laycan_start: c.laycan_start || "",
      laycan_end: c.laycan_end || "",
      penalty_per_day: c.penalty_per_day,
      priority: c.priority,
      status: c.status,
      assigned_vessel_id: c.assigned_vessel_id,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);
    try {
      if (editingContract) {
        await updateContract(editingContract.id, form);
      } else {
        await createContract(form);
      }
      setIsModalOpen(false);
      reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to save contract.");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this contract?")) return;
    try {
      await deleteContract(id);
      reload();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Delete failed.");
    }
  };

  const contracts = data?.contracts ?? [];
  const filtered = contracts.filter((c) => {
    if (filterStatus !== "ALL" && c.status !== filterStatus) return false;
    if (filterPriority !== "ALL" && c.priority !== filterPriority) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const match =
        c.contract_code.toLowerCase().includes(q) ||
        c.customer.toLowerCase().includes(q) ||
        c.origin_port.toLowerCase().includes(q) ||
        c.destination_port.toLowerCase().includes(q) ||
        c.cargo_type.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const activeCount = contracts.filter((c) => c.status === "Active").length;
  const totalCargo = contracts.reduce((acc, c) => acc + (c.cargo_quantity_tonnes || 0), 0);
  const totalPenaltyRisk = contracts
    .filter((c) => c.status === "Active")
    .reduce((acc, c) => acc + (c.penalty_per_day || 0), 0);
  const urgentCount = contracts.filter((c) => c.priority === "Urgent" || c.priority === "High").length;

  const selectedCalcContract = contracts.find((c) => c.id === calcContractId) ?? contracts[0];
  const penaltyPerDay = selectedCalcContract?.penalty_per_day ?? 15000;
  const calcTotalPenalty = Math.max(0, calcDelayDays) * penaltyPerDay;
  const calcCostPerTonne = selectedCalcContract?.cargo_quantity_tonnes
    ? calcTotalPenalty / selectedCalcContract.cargo_quantity_tonnes
    : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-xl font-semibold text-slate-ink">Port Contract Management</h1>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
              SCENARIO DATA
            </span>
          </div>
          <p className="text-sm text-slate-body mt-0.5">
            Commercial charterparty contracts with laycan windows, deadlines, and delay penalties for contract-aware fleet optimization.
          </p>
        </div>
        <Button onClick={openCreateModal} variant="primary">
          <Plus className="h-4 w-4" /> Add Port Contract
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Active Contracts" value={String(activeCount)} icon={FileText} />
        <KpiCard label="Total Cargo Demand" value={`${fmtNum(totalCargo)} t`} icon={Package} />
        <KpiCard label="Daily Penalty Exposure" value={`${fmtUsd(totalPenaltyRisk)}/day`} icon={DollarSign} />
        <KpiCard label="High Priority / Urgent" value={String(urgentCount)} icon={AlertTriangle} />
      </div>

      {/* Contract Penalty Calculator & Provenance Notice */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass-panel rounded-xl p-5 border border-slate-line/50 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-signal" />
              <h2 className="text-sm font-semibold text-slate-ink">Contract Penalty &amp; Demurrage Calculator</h2>
            </div>
            <span className="text-xs text-slate-body">Real-time Financial Exposure</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Target Contract">
              <Select
                value={selectedCalcContract?.id ?? ""}
                onChange={(e) => setCalcContractId(Number(e.target.value))}
              >
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.contract_code} — {c.customer} ({fmtUsd(c.penalty_per_day)}/d)
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Delay Duration (Days)">
              <Input
                type="number"
                min="0"
                step="0.5"
                value={calcDelayDays}
                onChange={(e) => setCalcDelayDays(Number(e.target.value))}
              />
            </Field>

            <div className="flex flex-col justify-end">
              <div className="p-3 bg-navy-50/70 border border-slate-line/50 rounded-lg">
                <span className="text-xs text-slate-body block">Total Calculated Penalty</span>
                <span className="text-lg font-bold text-danger">{fmtUsd(calcTotalPenalty)}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-t border-slate-line/50 pt-3">
            <div>
              <span className="text-slate-body">Daily Rate:</span>{" "}
              <strong className="text-slate-ink">{fmtUsd(penaltyPerDay)}/day</strong>
            </div>
            <div>
              <span className="text-slate-body">Penalty per Cargo Tonne:</span>{" "}
              <strong className="text-slate-ink">${calcCostPerTonne.toFixed(2)}/t</strong>
            </div>
            <div>
              <span className="text-slate-body">Laycan Window:</span>{" "}
              <strong className="text-slate-ink">
                {selectedCalcContract?.laycan_start} → {selectedCalcContract?.laycan_end}
              </strong>
            </div>
            <div>
              <span className="text-slate-body">Risk Level:</span>{" "}
              <span className={`font-semibold ${calcDelayDays > 4 ? "text-danger" : calcDelayDays > 0 ? "text-amber-400" : "text-positive"}`}>
                {calcDelayDays > 4 ? "CRITICAL BREACH" : calcDelayDays > 0 ? "PENALTY APPLIED" : "ON TIME"}
              </span>
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-xl p-5 border border-amber-500/20 bg-amber-500/5 flex flex-col justify-between text-xs text-slate-body">
          <div>
            <div className="flex items-center gap-2 text-amber-400 font-semibold mb-2">
              <AlertTriangle className="h-4 w-4" />
              <span>Commercial Scenario Provenance</span>
            </div>
            <p className="leading-relaxed">
              All port contracts, freight charter commitments, and arrival dates in this view are labeled as <strong>SCENARIO</strong> data.
            </p>
            <p className="mt-2 leading-relaxed">
              They are utilized by the <strong>QGA / QPSO</strong> optimization engines to weigh fuel &amp; carbon reduction against contractual delay penalties (${"penalty"} &times; ${"delay_days"}$).
            </p>
          </div>
          <div className="mt-3 text-[11px] text-slate-400 border-t border-amber-500/20 pt-2">
            Status: Simulation Engine Ready
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="glass-panel rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <Field label="Search Contracts">
            <Input
              type="text"
              placeholder="Search code, customer, port, cargo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Status">
          <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="ALL">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Pending">Pending</option>
            <option value="Fulfilled">Fulfilled</option>
            <option value="Breached">Breached</option>
          </Select>
        </Field>
        <Field label="Priority">
          <Select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
            <option value="ALL">All Priorities</option>
            <option value="Urgent">Urgent</option>
            <option value="High">High</option>
            <option value="Standard">Standard</option>
            <option value="Low">Low</option>
          </Select>
        </Field>
      </div>

      {/* Main Contracts Table */}
      <ChartCard title="Port Contracts" subtitle={`${filtered.length} of ${contracts.length} contracts displayed`}>
        {loading && <LoadingState label="Loading port contracts" />}
        {error && <ErrorState body={error} />}
        {!loading && filtered.length === 0 && (
          <EmptyState
            title="No contracts found"
            body="Try clearing your filters or create a new commercial contract scenario."
            action={
              <Button onClick={openCreateModal} variant="secondary" className="mt-2">
                <Plus className="h-4 w-4" /> Add Contract
              </Button>
            }
          />
        )}
        {!loading && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[960px]">
              <thead>
                <tr className="text-left text-xs text-slate-body border-b border-slate-line">
                  <th className="py-2.5 pr-3 font-medium">Contract</th>
                  <th className="py-2.5 pr-3 font-medium">Customer</th>
                  <th className="py-2.5 pr-3 font-medium">Origin → Dest</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Cargo (t)</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Deadline</th>
                  <th className="py-2.5 pr-3 font-medium">Laycan Window</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Penalty ($/day)</th>
                  <th className="py-2.5 pr-3 font-medium">Priority</th>
                  <th className="py-2.5 pr-3 font-medium">Assigned Vessel</th>
                  <th className="py-2.5 pr-3 font-medium">Status</th>
                  <th className="py-2.5 pr-1 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b border-slate-line/50 hover:bg-white/5 transition-colors">
                    <td className="py-2.5 pr-3 font-medium text-slate-ink">
                      <div className="flex items-center gap-1.5">
                        <span>{c.contract_code}</span>
                        <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">
                          SCENARIO
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-ink font-medium">{c.customer}</td>
                    <td className="py-2.5 pr-3 text-slate-body">
                      {c.origin_port} → {c.destination_port}
                    </td>
                    <td className="py-2.5 pr-3 tabular text-right font-medium text-slate-ink">
                      {fmtNum(c.cargo_quantity_tonnes)} <span className="text-xs text-slate-400 font-normal">({c.cargo_type})</span>
                    </td>
                    <td className="py-2.5 pr-3 tabular text-right">
                      {c.required_arrival_days} days
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-slate-body">
                      {c.laycan_start ? `${c.laycan_start} ~ ${c.laycan_end}` : "Open"}
                    </td>
                    <td className="py-2.5 pr-3 tabular text-right font-semibold text-danger">
                      {fmtUsd(c.penalty_per_day)}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium ${
                          c.priority === "Urgent"
                            ? "bg-red-500/20 text-red-300 border border-red-500/30"
                            : c.priority === "High"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "bg-slate-500/20 text-slate-300 border border-slate-500/30"
                        }`}
                      >
                        {c.priority}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-body">
                      {c.assigned_vessel_name || "Unassigned"}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium flex items-center gap-1 w-fit ${
                          c.status === "Active"
                            ? "bg-signal/20 text-signal border border-signal/30"
                            : c.status === "Fulfilled"
                            ? "bg-positive/20 text-positive border border-positive/30"
                            : c.status === "Breached"
                            ? "bg-danger/20 text-danger border border-danger/30"
                            : "bg-slate-500/20 text-slate-400 border border-slate-500/30"
                        }`}
                      >
                        {c.status === "Active" && <CheckCircle2 className="h-3 w-3" />}
                        {c.status === "Breached" && <XCircle className="h-3 w-3" />}
                        {c.status}
                      </span>
                    </td>
                    <td className="py-2.5 pr-1 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEditModal(c)}
                          className="p-1 hover:bg-white/10 rounded text-slate-body hover:text-signal transition-colors"
                          title="Edit contract"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="p-1 hover:bg-white/10 rounded text-slate-body hover:text-danger transition-colors"
                          title="Delete contract"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>

      {/* Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-navy-900 border border-slate-line/70 rounded-2xl max-w-xl w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-line/50">
              <h3 className="text-base font-semibold text-slate-ink">
                {editingContract ? "Edit Port Contract" : "Create Port Contract (Scenario)"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Contract Code">
                  <Input
                    required
                    value={form.contract_code}
                    onChange={(e) => setForm({ ...form, contract_code: e.target.value })}
                  />
                </Field>
                <Field label="Customer / Charterer">
                  <Input
                    required
                    value={form.customer}
                    onChange={(e) => setForm({ ...form, customer: e.target.value })}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Origin Port">
                  <Input
                    required
                    value={form.origin_port}
                    onChange={(e) => setForm({ ...form, origin_port: e.target.value })}
                  />
                </Field>
                <Field label="Destination Port">
                  <Input
                    required
                    value={form.destination_port}
                    onChange={(e) => setForm({ ...form, destination_port: e.target.value })}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Cargo Type">
                  <Input
                    required
                    value={form.cargo_type}
                    onChange={(e) => setForm({ ...form, cargo_type: e.target.value })}
                  />
                </Field>
                <Field label="Cargo Quantity (Tonnes)">
                  <Input
                    type="number"
                    required
                    min="1"
                    value={form.cargo_quantity_tonnes}
                    onChange={(e) => setForm({ ...form, cargo_quantity_tonnes: Number(e.target.value) })}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Required Arrival Window (Days)">
                  <Input
                    type="number"
                    required
                    min="1"
                    value={form.required_arrival_days}
                    onChange={(e) => setForm({ ...form, required_arrival_days: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Delay Penalty ($/Day)">
                  <Input
                    type="number"
                    required
                    min="0"
                    value={form.penalty_per_day}
                    onChange={(e) => setForm({ ...form, penalty_per_day: Number(e.target.value) })}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Laycan Start">
                  <Input
                    type="date"
                    value={form.laycan_start || ""}
                    onChange={(e) => setForm({ ...form, laycan_start: e.target.value })}
                  />
                </Field>
                <Field label="Laycan End">
                  <Input
                    type="date"
                    value={form.laycan_end || ""}
                    onChange={(e) => setForm({ ...form, laycan_end: e.target.value })}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Priority">
                  <Select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  >
                    <option value="Urgent">Urgent</option>
                    <option value="High">High</option>
                    <option value="Standard">Standard</option>
                    <option value="Low">Low</option>
                  </Select>
                </Field>

                <Field label="Status">
                  <Select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                  >
                    <option value="Active">Active</option>
                    <option value="Pending">Pending</option>
                    <option value="Fulfilled">Fulfilled</option>
                    <option value="Breached">Breached</option>
                  </Select>
                </Field>

                <Field label="Assign Vessel (Optional)">
                  <Select
                    value={form.assigned_vessel_id || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        assigned_vessel_id: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                    <option value="">Unassigned</option>
                    {vesselData?.vessels.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.vessel_type || v.vessel_class})
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              {formError && <p className="text-sm text-danger">{formError}</p>}

              <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-slate-line/50">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsModalOpen(false)}
                  disabled={formLoading}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={formLoading}>
                  {formLoading ? "Saving…" : editingContract ? "Save Changes" : "Create Scenario Contract"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
