import { useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  BarChart3,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  Gauge,
  Layers3,
  Loader2,
  Menu,
  PackageCheck,
  Play,
  RotateCcw,
  Settings2,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  getGetOptimizationDefaultsQueryKey,
  getHealthCheckQueryKey,
  type OptimizationResult,
  type ProcurementInputs,
  useGetOptimizationDefaults,
  useHealthCheck,
  useRunOptimization,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

type InputKey = keyof ProcurementInputs;
type FieldErrors = Partial<Record<InputKey, string>>;

const groups: Array<{
  title: string;
  description: string;
  icon: typeof PackageCheck;
  fields: Array<{ key: InputKey; label: string; unit: string; hint: string }>;
}> = [
  {
    title: 'Procurement requirements',
    description: 'Volume the network must fulfill this cycle.',
    icon: PackageCheck,
    fields: [
      { key: 'demand_x', label: 'Product X demand', unit: 'units', hint: 'Required volume' },
      { key: 'demand_y', label: 'Product Y demand', unit: 'units', hint: 'Required volume' },
    ],
  },
  {
    title: 'Business constraints',
    description: 'Capacity and delivery guardrails for the recommendation.',
    icon: Gauge,
    fields: [
      { key: 'supplier_a_capacity', label: 'Supplier A capacity', unit: 'units', hint: 'Available capacity' },
      { key: 'supplier_b_capacity', label: 'Supplier B capacity', unit: 'units', hint: 'Available capacity' },
      { key: 'max_average_delivery', label: 'Max average delivery', unit: 'days', hint: 'Service ceiling' },
    ],
  },
];

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function formatDecimal(value: number, digits = 1) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function getErrorMessage(error: unknown) {
  if (typeof error === 'object' && error && 'error' in error) {
    return String((error as { error?: string }).error ?? 'The optimization service returned an error.');
  }
  if (error instanceof Error) return error.message;
  return 'The optimization service could not complete this run.';
}

function MetricChip({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'good' | 'warn' }) {
  const toneClass = tone === 'good'
    ? 'border-[hsl(var(--accent)/.25)] bg-[hsl(var(--accent)/.08)] text-[hsl(var(--accent))]'
    : tone === 'warn'
      ? 'border-[hsl(var(--primary)/.35)] bg-[hsl(var(--primary)/.12)] text-[hsl(var(--foreground))]'
      : 'border-border bg-background/70 text-foreground';
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${toneClass}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="mono-numbers">{value}</span>
    </div>
  );
}

function SectionLabel({ icon: Icon, eyebrow, title, description }: { icon: typeof PackageCheck; eyebrow: string; title: string; description: string }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--secondary))] text-[hsl(var(--accent))]">
        <Icon size={17} strokeWidth={2.2} />
      </div>
      <div>
        <p className="font-mono text-[10px] font-medium uppercase tracking-[.18em] text-[hsl(var(--accent))]">{eyebrow}</p>
        <h2 className="mt-1 text-[15px] font-extrabold tracking-[-.02em] text-foreground">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function InputField({
  field,
  value,
  error,
  onChange,
}: {
  field: (typeof groups)[number]['fields'][number];
  value: number;
  error?: string;
  onChange: (key: InputKey, value: number) => void;
}) {
  return (
    <label className="group block" data-testid={`field-${field.key}`}>
      <span className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-foreground">{field.label}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{field.unit}</span>
      </span>
      <span className={`flex items-center rounded-md border bg-background transition-colors focus-within:border-[hsl(var(--primary))] focus-within:ring-2 focus-within:ring-[hsl(var(--primary)/.18)] ${error ? 'border-[hsl(var(--destructive))]' : 'border-input'}`}>
        <input
          data-testid={`input-${field.key}`}
          className="focus-ring min-w-0 flex-1 bg-transparent px-3 py-2.5 font-mono text-[13px] font-medium text-foreground outline-none"
          type="number"
          min="0"
          step={field.key.includes('cost') || field.key.includes('delivery') ? '0.1' : '1'}
          value={Number.isFinite(value) ? value : ''}
          onChange={(event) => onChange(field.key, Number(event.target.value))}
          aria-invalid={Boolean(error)}
          aria-label={`${field.label}, ${field.unit}`}
        />
        <span className="pr-3 text-[10px] text-muted-foreground">{field.unit}</span>
      </span>
      <span className={`mt-1 block text-[10px] ${error ? 'text-[hsl(var(--destructive))]' : 'text-muted-foreground'}`}>
        {error || field.hint}
      </span>
    </label>
  );
}

const supplierRows = [
  {
    name: 'Supplier A',
    color: 'bg-[hsl(var(--primary))]',
    fields: [
      { key: 'x_cost_a' as InputKey, label: 'X Cost', unit: '$ / unit', step: '0.1' },
      { key: 'y_cost_a' as InputKey, label: 'Y Cost', unit: '$ / unit', step: '0.1' },
      { key: 'supplier_a_capacity' as InputKey, label: 'Capacity', unit: 'units', step: '1' },
      { key: 'shipping_a' as InputKey, label: 'Shipping Cost', unit: '$ / order', step: '0.1' },
      { key: 'delivery_a' as InputKey, label: 'Delivery Days', unit: 'days', step: '0.1' },
    ],
  },
  {
    name: 'Supplier B',
    color: 'bg-[hsl(var(--accent))]',
    fields: [
      { key: 'x_cost_b' as InputKey, label: 'X Cost', unit: '$ / unit', step: '0.1' },
      { key: 'y_cost_b' as InputKey, label: 'Y Cost', unit: '$ / unit', step: '0.1' },
      { key: 'supplier_b_capacity' as InputKey, label: 'Capacity', unit: 'units', step: '1' },
      { key: 'shipping_b' as InputKey, label: 'Shipping Cost', unit: '$ / order', step: '0.1' },
      { key: 'delivery_b' as InputKey, label: 'Delivery Days', unit: 'days', step: '0.1' },
    ],
  },
] as const;

function SupplierDataTable({
  inputs,
  errors,
  onChange,
}: {
  inputs: ProcurementInputs;
  errors: FieldErrors;
  onChange: (key: InputKey, value: number) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border" data-testid="supplier-data-table">
      <table className="min-w-[520px] w-full table-fixed border-collapse">
        <thead className="bg-[hsl(var(--muted)/.55)]">
          <tr className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
            <th className="px-3 py-3 text-left font-medium">Supplier</th>
            {supplierRows[0].fields.map((field) => <th key={field.key} className="px-2 py-3 text-left font-medium">{field.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {supplierRows.map((supplier) => (
            <tr key={supplier.name} className="border-t border-border">
              <th className="whitespace-nowrap px-3 py-4 text-left text-xs font-bold">
                <span className={`mr-2 inline-block size-2 rounded-full ${supplier.color}`} />
                {supplier.name}
              </th>
              {supplier.fields.map((field) => (
                <td key={field.key} className="px-2 py-3">
                  <label className="block">
                    <span className="sr-only">{supplier.name} {field.label}</span>
                    <span className={`flex min-w-[112px] items-center rounded-md border bg-background transition-colors focus-within:border-[hsl(var(--primary))] ${errors[field.key] ? 'border-[hsl(var(--destructive))]' : 'border-input'}`}>
                      <input
                        className="min-w-0 w-full bg-transparent px-2 py-2 font-mono text-xs font-medium text-foreground outline-none"
                        type="number"
                        min="0"
                        step={field.step}
                        value={inputs[field.key]}
                        onChange={(event) => onChange(field.key, Number(event.target.value))}
                        aria-invalid={Boolean(errors[field.key])}
                        data-testid={`table-input-${field.key}`}
                      />
                    </span>
                  </label>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SkeletonPanel() {
  return (
    <div className="space-y-5" data-testid="loading-defaults">
      <div className="h-5 w-44 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-2 gap-4">
        {[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="h-[66px] animate-pulse rounded-md bg-muted" />)}
      </div>
    </div>
  );
}

function AllocationTable({ result }: { result: OptimizationResult }) {
  const totalUnits = result.allocation.supplier_a.total + result.allocation.supplier_b.total;
  const aShare = totalUnits ? (result.allocation.supplier_a.total / totalUnits) * 100 : 0;
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card" data-testid="allocation-table">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-extrabold">Recommended allocation</p>
          <p className="mt-0.5 text-xs text-muted-foreground">The model balances price against your delivery ceiling.</p>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <span className="size-2 rounded-full bg-[hsl(var(--primary))]" />
          <span className="text-[10px] font-semibold text-muted-foreground">Supplier A</span>
          <span className="ml-2 size-2 rounded-full bg-[hsl(var(--accent))]" />
          <span className="text-[10px] font-semibold text-muted-foreground">Supplier B</span>
        </div>
      </div>
      <div className="grid grid-cols-[1.1fr_1fr_1fr_1fr] border-b border-border bg-[hsl(var(--muted)/.5)] px-4 py-2 font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">
        <span>Supplier</span><span className="text-right">Product X</span><span className="text-right">Product Y</span><span className="text-right">Total</span>
      </div>
      {(['supplier_a', 'supplier_b'] as const).map((supplier) => (
        <div key={supplier} className="grid grid-cols-[1.1fr_1fr_1fr_1fr] items-center border-b border-border px-4 py-3.5 last:border-0">
          <span className="flex items-center gap-2 text-xs font-bold">
            <span className={`size-2 rounded-full ${supplier === 'supplier_a' ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--accent))]'}`} />
            {supplier === 'supplier_a' ? 'Supplier A' : 'Supplier B'}
          </span>
          <span className="mono-numbers text-right text-sm">{formatDecimal(result.allocation[supplier].x, 0)}</span>
          <span className="mono-numbers text-right text-sm">{formatDecimal(result.allocation[supplier].y, 0)}</span>
          <span className="mono-numbers text-right text-sm font-bold">{formatDecimal(result.allocation[supplier].total, 0)}</span>
        </div>
      ))}
      <div className="px-4 py-4">
        <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[.13em] text-muted-foreground">
          <span>Volume split</span><span className="mono-numbers">{formatDecimal(aShare, 0)}% / {formatDecimal(100 - aShare, 0)}%</span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-[hsl(var(--accent)/.18)]">
          <div className="bg-[hsl(var(--primary))] transition-[width] duration-500" style={{ width: `${aShare}%` }} />
        </div>
      </div>
    </div>
  );
}

function StatusRow({ label, satisfied }: { label: string; satisfied: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0">
      <span className="text-xs font-semibold">{label}</span>
      <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[.08em] ${satisfied ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--destructive))]'}`}>
        {satisfied ? <Check size={13} /> : <X size={13} />}
        {satisfied ? 'Satisfied' : 'Not satisfied'}
      </span>
    </div>
  );
}

function buildDecisionExplanation(result: OptimizationResult, inputs: ProcurementInputs) {
  const supplierA = result.allocation.supplier_a;
  const supplierB = result.allocation.supplier_b;
  const activeSuppliers = [
    supplierA.total > 0 ? `Supplier A (${formatDecimal(supplierA.total, 0)} units)` : null,
    supplierB.total > 0 ? `Supplier B (${formatDecimal(supplierB.total, 0)} units)` : null,
  ].filter(Boolean);
  const deliveryStatus = result.delivery.average_days <= result.delivery.maximum_allowed_days
    ? `The ${formatDecimal(result.delivery.average_days)}-day average is within the ${formatDecimal(result.delivery.maximum_allowed_days)}-day limit.`
    : `The ${formatDecimal(result.delivery.average_days)}-day average is above the ${formatDecimal(result.delivery.maximum_allowed_days)}-day limit.`;
  return `The model activates ${activeSuppliers.join(' and ')} to fulfill ${formatDecimal(inputs.demand_x + inputs.demand_y, 0)} total units. It selected this mix using the submitted unit costs, fixed shipping costs, supplier capacities, and delivery times. ${deliveryStatus}`;
}

function ResultWorkspace({ result, inputs }: { result: OptimizationResult; inputs: ProcurementInputs }) {
  const deliveryWithinLimit = result.delivery.average_days <= result.delivery.maximum_allowed_days;
  const activated = [result.supplier_usage.supplier_a > 0, result.supplier_usage.supplier_b > 0].filter(Boolean).length;
  const xSatisfied = Math.abs(result.allocation.supplier_a.x + result.allocation.supplier_b.x - inputs.demand_x) < 0.001;
  const ySatisfied = Math.abs(result.allocation.supplier_a.y + result.allocation.supplier_b.y - inputs.demand_y) < 0.001;
  const supplierACapacitySatisfied = result.allocation.supplier_a.total <= inputs.supplier_a_capacity + 0.001;
  const supplierBCapacitySatisfied = result.allocation.supplier_b.total <= inputs.supplier_b_capacity + 0.001;
  return (
    <div className="space-y-4" data-testid="optimization-result">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">Total landed cost</p>
          <p className="mono-numbers mt-2 text-[25px] font-bold tracking-[-.05em]">{formatMoney(result.cost.total)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Purchase {formatMoney(result.cost.purchase)} + freight {formatMoney(result.cost.shipping)}</p>
        </div>
        <div className={`rounded-lg border p-4 ${deliveryWithinLimit ? 'border-[hsl(var(--accent)/.28)] bg-[hsl(var(--accent)/.07)]' : 'border-[hsl(var(--destructive)/.28)] bg-[hsl(var(--destructive)/.06)]'}`}>
          <p className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">Average delivery</p>
          <div className="mt-2 flex items-end gap-2">
            <p className="mono-numbers text-[25px] font-bold tracking-[-.05em]">{formatDecimal(result.delivery.average_days)} <span className="text-sm font-medium tracking-normal">days</span></p>
            {deliveryWithinLimit ? <Check size={17} className="mb-1.5 text-[hsl(var(--accent))]" /> : <X size={17} className="mb-1.5 text-[hsl(var(--destructive))]" />}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Ceiling {formatDecimal(result.delivery.maximum_allowed_days)} days</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">Suppliers activated</p>
          <p className="mono-numbers mt-2 text-[25px] font-bold tracking-[-.05em]">{activated}<span className="text-sm font-medium tracking-normal text-muted-foreground"> / 2</span></p>
          <p className="mt-1 text-[11px] text-muted-foreground">Capacity used across the plan</p>
        </div>
      </div>
      <AllocationTable result={result} />
      <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2">
              <p className="text-sm font-extrabold">Constraint status</p>
              <p className="mt-1 text-xs text-muted-foreground">Checks calculated from the returned allocation.</p>
            </div>
            <div data-testid="constraint-status">
              <StatusRow label="X demand" satisfied={xSatisfied} />
              <StatusRow label="Y demand" satisfied={ySatisfied} />
              <StatusRow label="Supplier A capacity" satisfied={supplierACapacitySatisfied} />
              <StatusRow label="Supplier B capacity" satisfied={supplierBCapacitySatisfied} />
              <StatusRow label="Average delivery time" satisfied={deliveryWithinLimit} />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-extrabold">Supplier utilization</p>
              <p className="mt-1 text-xs text-muted-foreground">Allocated volume as a share of available capacity.</p>
            </div>
            <Gauge size={18} className="text-[hsl(var(--accent))]" />
          </div>
          <div className="space-y-4">
            {(['supplier_a', 'supplier_b'] as const).map((supplier) => {
              const usage = result.supplier_usage[supplier];
              const allocation = result.allocation[supplier].total;
              const percentage = usage || allocation ? Math.min(100, allocation / usage * 100) : 0;
              return (
                <div key={supplier} data-testid={`utilization-${supplier}`}>
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="font-bold">{supplier === 'supplier_a' ? 'Supplier A' : 'Supplier B'}</span>
                    <span className="mono-numbers text-muted-foreground">{formatDecimal(percentage, 0)}% <span className="text-[10px]">of capacity</span></span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div className={`h-full rounded-full transition-[width] duration-700 ${supplier === 'supplier_a' ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--accent))]'}`} style={{ width: `${percentage}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground"><span className="mono-numbers">{formatDecimal(allocation, 0)}</span> units allocated · <span className="mono-numbers">{formatDecimal(usage, 0)}</span> available</p>
                </div>
              );
            })}
          </div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-[hsl(var(--foreground))] p-4 text-[hsl(var(--background))]">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[.16em] text-[hsl(var(--primary))]">Why this decision?</p>
              <p className="mt-3 text-[15px] font-bold leading-6">{buildDecisionExplanation(result, inputs)}</p>
            </div>
            <ShieldCheck size={20} className="shrink-0 text-[hsl(var(--primary))]" />
          </div>
          <div className="mt-7 border-t border-[hsl(var(--background)/.18)] pt-3 text-[11px] leading-5 text-[hsl(var(--background)/.65)]">
            Every allocation is constrained by capacity, unit economics, fixed shipping, and the average delivery ceiling you supplied.
          </div>
        </div>
      </div>
    </div>
  );
}

function Workspace() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [inputs, setInputs] = useState<ProcurementInputs | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [hasEdited, setHasEdited] = useState(false);

  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), retry: 1, staleTime: 30_000 } });
  const defaults = useGetOptimizationDefaults({ query: { queryKey: getGetOptimizationDefaultsQueryKey(), retry: 1 } });
  const optimization = useRunOptimization();

  useEffect(() => {
    if (defaults.data && !hasEdited) setInputs(defaults.data);
  }, [defaults.data, hasEdited]);

  const isReady = health.data?.status?.toLowerCase() === 'ok' || health.data?.status?.toLowerCase() === 'healthy';
  const currentInputs = inputs ?? defaults.data;
  const totalDemand = useMemo(() => currentInputs ? currentInputs.demand_x + currentInputs.demand_y : 0, [currentInputs]);

  const updateInput = (key: InputKey, value: number) => {
    setInputs((current) => current ? ({ ...current, [key]: Number.isFinite(value) ? value : 0 }) : current);
    setHasEdited(true);
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const resetInputs = () => {
    setInputs(defaults.data ?? null);
    setErrors({});
    setResult(null);
    setHasEdited(false);
  };

  const validate = () => {
    if (!inputs) return false;
    const nextErrors: FieldErrors = {};
    (Object.keys(inputs) as InputKey[]).forEach((key) => {
      if (!Number.isFinite(inputs[key]) || inputs[key] < 0) nextErrors[key] = 'Enter zero or a positive value.';
    });
    if (inputs.demand_x + inputs.demand_y > inputs.supplier_a_capacity + inputs.supplier_b_capacity) {
      nextErrors.demand_x = 'Combined demand exceeds network capacity.';
      nextErrors.demand_y = 'Combined demand exceeds network capacity.';
    }
    if (inputs.max_average_delivery <= 0) nextErrors.max_average_delivery = 'Set a delivery ceiling above zero.';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const runModel = () => {
    if (!inputs || !validate()) return;
    setResult(null);
    optimization.mutate({ data: inputs }, {
      onSuccess: (nextResult) => setResult(nextResult),
    });
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <aside className={`fixed inset-y-0 left-0 z-30 flex w-[238px] flex-col bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] transition-transform duration-300 lg:translate-x-0 ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-[76px] items-center border-b border-[hsl(var(--sidebar-border))] px-6">
          <div className="flex items-center gap-3">
            <div className="relative flex size-9 items-center justify-center rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
              <Layers3 size={19} strokeWidth={2.5} />
              <span className="absolute -right-1 -top-1 size-2 rounded-full bg-[hsl(var(--accent))]" />
            </div>
            <div>
              <p className="text-[13px] font-extrabold tracking-[-.02em]">supplyline</p>
              <p className="font-mono text-[9px] uppercase tracking-[.17em] text-[hsl(var(--sidebar-foreground)/.52)]">decision workspace</p>
            </div>
          </div>
          <button className="ml-auto rounded p-1 text-[hsl(var(--sidebar-foreground)/.6)] lg:hidden" onClick={() => setMobileNavOpen(false)} data-testid="button-close-navigation" aria-label="Close navigation"><X size={18} /></button>
        </div>
        <div className="px-4 py-7">
          <p className="px-2 font-mono text-[9px] font-medium uppercase tracking-[.18em] text-[hsl(var(--sidebar-foreground)/.45)]">Workspace</p>
          <nav className="mt-3 space-y-1">
            <a href="#inputs" onClick={() => setMobileNavOpen(false)} className="flex items-center gap-3 rounded-md bg-[hsl(var(--sidebar-accent))] px-3 py-2.5 text-xs font-bold text-[hsl(var(--sidebar-foreground))]" data-testid="link-optimization-workspace">
              <Activity size={16} className="text-[hsl(var(--primary))]" /> Optimization
              <ChevronRight size={14} className="ml-auto text-[hsl(var(--sidebar-foreground)/.45)]" />
            </a>
            <a href="#results" onClick={() => setMobileNavOpen(false)} className="flex items-center gap-3 rounded-md px-3 py-2.5 text-xs font-semibold text-[hsl(var(--sidebar-foreground)/.6)] transition-colors hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-foreground))]" data-testid="link-results"><BarChart3 size={16} /> Results</a>
          </nav>
        </div>
        <div className="mt-auto border-t border-[hsl(var(--sidebar-border))] p-4">
          <div className="flex items-center gap-2 rounded-md bg-[hsl(var(--sidebar-accent)/.65)] p-3">
            <div className={`flex size-7 items-center justify-center rounded-full ${isReady ? 'bg-[hsl(var(--accent)/.18)] text-[hsl(var(--primary))]' : 'bg-[hsl(var(--sidebar-foreground)/.1)] text-[hsl(var(--sidebar-foreground)/.6)]'}`}>
              {health.isLoading ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold">Optimization engine</p>
              <p className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[.12em] text-[hsl(var(--sidebar-foreground)/.5)]" data-testid="status-health">{health.isLoading ? 'checking status' : isReady ? 'online · ready' : 'connection issue'}</p>
            </div>
            <span className={`status-dot ml-auto size-1.5 rounded-full ${isReady ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--destructive))]'}`} />
          </div>
        </div>
      </aside>

      {mobileNavOpen && <button className="fixed inset-0 z-20 bg-[hsl(var(--foreground)/.28)] lg:hidden" onClick={() => setMobileNavOpen(false)} data-testid="button-navigation-overlay" aria-label="Close navigation overlay" />}

      <main className="min-h-[100dvh] lg:pl-[238px]">
        <header className="sticky top-0 z-10 flex h-[76px] items-center justify-between border-b border-border bg-[hsl(var(--background)/.93)] px-5 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3">
            <button className="rounded-md border border-border bg-card p-2 lg:hidden" onClick={() => setMobileNavOpen(true)} data-testid="button-open-navigation" aria-label="Open navigation"><Menu size={18} /></button>
            <div>
              <p className="hidden font-mono text-[9px] uppercase tracking-[.18em] text-muted-foreground sm:block">Supplyline / Optimization</p>
              <h1 className="text-[15px] font-extrabold tracking-[-.02em]">Procurement Allocation Optimizer</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden items-center gap-2 text-[11px] font-semibold text-muted-foreground sm:flex">
              <span className={`size-1.5 rounded-full ${isReady ? 'bg-[hsl(var(--accent))]' : 'bg-[hsl(var(--destructive))]'}`} />
              {isReady ? 'Model online' : 'Model unavailable'}
            </div>
            <button className="focus-ring inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-bold transition-colors hover:bg-muted" onClick={resetInputs} data-testid="button-reset-inputs">
              <RotateCcw size={14} /> <span className="hidden sm:inline">Reset inputs</span>
            </button>
          </div>
        </header>

        <div className="grid-texture min-h-[calc(100dvh-76px)]">
          <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-10">
            <section className="workspace-enter mb-8 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="rounded bg-[hsl(var(--primary))] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[.14em] text-[hsl(var(--primary-foreground))]">Live model</span>
                  <span className="font-mono text-[10px] uppercase tracking-[.13em] text-muted-foreground">v1.0 / PuLP optimization</span>
                </div>
                <h2 className="max-w-[760px] text-[clamp(29px,4vw,46px)] font-extrabold leading-[1.05] tracking-[-.055em] text-foreground">Procurement Allocation<br /><span className="text-[hsl(var(--accent))]">Optimizer</span></h2>
                <p className="mt-4 max-w-[620px] text-sm leading-6 text-muted-foreground">Find the lowest-cost supplier allocation while respecting capacity and delivery requirements.</p>
              </div>
              <div className="flex flex-wrap gap-2 xl:pb-1">
                <MetricChip label="Demand" value={`${formatDecimal(totalDemand, 0)} units`} />
                <MetricChip label="Suppliers" value="2 active" tone="good" />
                  <MetricChip label="Constraint" value={currentInputs ? `${formatDecimal(currentInputs.max_average_delivery)} days` : '—'} tone="warn" />
              </div>
            </section>

            {health.isError && (
              <div className="workspace-enter mb-5 flex items-start gap-3 rounded-lg border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.07)] px-4 py-3" data-testid="error-health">
                <AlertCircle size={17} className="mt-0.5 shrink-0 text-[hsl(var(--destructive))]" />
                <div><p className="text-xs font-bold">Optimization engine is unreachable</p><p className="mt-1 text-xs text-muted-foreground">You can still review the inputs, but a run will not complete until the service is back online.</p></div>
              </div>
            )}
            {optimization.isError && (
              <div className="workspace-enter mb-5 flex items-start gap-3 rounded-lg border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.07)] px-4 py-3" data-testid="error-optimization">
                <AlertCircle size={17} className="mt-0.5 shrink-0 text-[hsl(var(--destructive))]" />
                <div className="min-w-0"><p className="text-xs font-bold">The model could not solve this scenario</p><p className="mt-1 break-words text-xs text-muted-foreground">{getErrorMessage(optimization.error)}</p></div>
              </div>
            )}
            {optimization.isSuccess && result && (
              <div className="workspace-enter mb-5 flex items-center gap-3 rounded-lg border border-[hsl(var(--accent)/.3)] bg-[hsl(var(--accent)/.08)] px-4 py-3" data-testid="success-optimization">
                <div className="flex size-6 items-center justify-center rounded-full bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]"><Check size={14} /></div>
                <p className="text-xs font-bold">Recommendation calculated <span className="font-normal text-muted-foreground">— review the plan below before you commit.</span></p>
              </div>
            )}

            <div className="grid items-start gap-5 xl:grid-cols-[minmax(560px,1fr)_minmax(520px,1fr)]">
              <section id="inputs" className="workspace-enter workspace-enter-delay-1 rounded-xl border border-border bg-card p-5 shadow-[0_8px_30px_hsl(var(--foreground)/.035)] sm:p-6" data-testid="panel-inputs">
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-[10px] font-medium uppercase tracking-[.18em] text-[hsl(var(--accent))]">Scenario inputs</p>
                    <h3 className="mt-1 text-xl font-extrabold tracking-[-.035em]">Set your constraints</h3>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">All fields are used by the optimization model. Values must be zero or greater.</p>
                  </div>
                  <Settings2 size={19} className="mt-1 text-muted-foreground" />
                </div>
                {defaults.isLoading ? <SkeletonPanel /> : defaults.isError ? (
                  <div className="rounded-lg border border-[hsl(var(--destructive)/.25)] bg-[hsl(var(--destructive)/.05)] p-4" data-testid="error-defaults">
                    <p className="text-xs font-bold">Could not load model defaults.</p>
                    <p className="mt-1 text-xs text-muted-foreground">The model inputs could not be loaded. Refresh the page when the optimization service is available.</p>
                  </div>
                ) : (
                  <div className="space-y-7">
                    {groups.map((group, groupIndex) => (
                      <div key={group.title} className="border-t border-border pt-5 first:border-0 first:pt-0">
                        <SectionLabel icon={group.icon} eyebrow={`0${groupIndex + 1} / Inputs`} title={group.title} description={group.description} />
                        <div className={`grid gap-x-4 gap-y-4 ${group.fields.length > 4 ? 'sm:grid-cols-2' : 'grid-cols-2'}`}>
                          {group.fields.map((field) => <InputField key={field.key} field={field} value={currentInputs![field.key]} error={errors[field.key]} onChange={updateInput} />)}
                        </div>
                      </div>
                    ))}
                     <div className="border-t border-border pt-5">
                       <SectionLabel icon={BarChart3} eyebrow="03 / Supplier data" title="Supplier data" description="Editable commercial and logistics inputs used by the model." />
                       <SupplierDataTable inputs={currentInputs!} errors={errors} onChange={updateInput} />
                     </div>
                  </div>
                )}
                <div className="mt-7 border-t border-border pt-5">
                  <button
                    className="focus-ring flex w-full items-center justify-center gap-2 rounded-md bg-[hsl(var(--primary))] px-4 py-3.5 text-sm font-extrabold text-[hsl(var(--primary-foreground))] shadow-[0_3px_0_hsl(41_91%_44%)] transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                    onClick={runModel}
                    disabled={optimization.isPending || defaults.isLoading || !inputs}
                    data-testid="button-run-optimization"
                  >
                    {optimization.isPending ? <><Loader2 size={17} className="animate-spin" /> Solving scenario...</> : <><Play size={16} fill="currentColor" /> Run optimization</>}
                  </button>
                  <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[10px] text-muted-foreground"><CircleHelp size={12} /> The model will validate capacity and delivery constraints automatically.</p>
                </div>
              </section>

              <section id="results" className="workspace-enter workspace-enter-delay-2 min-w-0" data-testid="panel-results">
                <div className="mb-4 flex items-end justify-between">
                  <div>
                    <p className="font-mono text-[10px] font-medium uppercase tracking-[.18em] text-[hsl(var(--accent))]">Output / recommendation</p>
                    <h3 className="mt-1 text-xl font-extrabold tracking-[-.035em]">What the model sees</h3>
                  </div>
                  {result && <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[.13em] text-[hsl(var(--accent))]" data-testid="status-result"><Check size={13} /> Solved</div>}
                </div>
                {optimization.isPending ? (
                  <div className="space-y-4" data-testid="loading-optimization">
                    <div className="grid gap-3 sm:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-[112px] animate-pulse rounded-lg bg-muted" />)}</div>
                    <div className="h-[260px] animate-pulse rounded-lg bg-muted" />
                  </div>
                ) : result && inputs ? <ResultWorkspace result={result} inputs={inputs} /> : (
                  <div className="relative overflow-hidden rounded-xl border border-dashed border-[hsl(var(--accent)/.35)] bg-[hsl(var(--card)/.72)] px-6 py-16 text-center sm:px-16" data-testid="empty-results">
                    <div className="absolute -right-10 -top-10 size-36 rounded-full border-[18px] border-[hsl(var(--primary)/.13)]" />
                    <div className="absolute -bottom-16 -left-8 size-40 rounded-full border-[22px] border-[hsl(var(--accent)/.08)]" />
                    <div className="relative mx-auto flex size-14 items-center justify-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--accent))]"><ArrowDownRight size={25} /></div>
                    <h4 className="relative mt-5 text-lg font-extrabold tracking-[-.025em]">Your recommendation will land here</h4>
                    <p className="relative mx-auto mt-2 max-w-[360px] text-xs leading-5 text-muted-foreground">Run the model to compare the economics, delivery exposure, and capacity footprint of this scenario.</p>
                    <div className="relative mt-6 flex flex-wrap justify-center gap-2">
                      <MetricChip label="Cost" value="pending" />
                      <MetricChip label="Delivery" value="pending" />
                      <MetricChip label="Allocation" value="pending" />
                    </div>
                  </div>
                )}
                {!optimization.isPending && !result && Object.keys(errors).length > 0 && (
                  <div className="mt-4 flex items-start gap-2 rounded-md bg-[hsl(var(--destructive)/.07)] px-3 py-2.5 text-[11px] text-[hsl(var(--destructive))]" data-testid="validation-summary">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>Review the highlighted fields before running the model.</span>
                  </div>
                )}
              </section>
            </div>
            <footer className="mt-10 flex flex-col justify-between gap-2 border-t border-border py-5 text-[10px] text-muted-foreground sm:flex-row">
              <span className="font-mono uppercase tracking-[.13em]">Supplyline decision workspace</span>
              <span className="flex items-center gap-1.5"><Clock3 size={12} /> Inputs are scenario-specific and not saved.</span>
            </footer>
          </div>
        </div>
      </main>
    </div>
  );
}

function Router() {
  return (
    <ErrorBoundary>
      <Switch>
        <Route path="/" component={Workspace} />
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;