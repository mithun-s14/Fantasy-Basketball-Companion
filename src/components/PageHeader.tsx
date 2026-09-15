interface Props {
  title: string;
  description: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, actions }: Props) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl font-bold uppercase leading-none tracking-wide">{title}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
      </div>
      {actions}
    </div>
  );
}

// Small KPI tile used across dashboard pages.
export function StatTile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl font-bold leading-none tabular-nums">{value}</p>
      {hint && <p className="mt-1.5 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// Bordered panel with a header row.
export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col overflow-hidden rounded-lg border border-border bg-card ${className}`}>
      <div className="flex h-11 items-center justify-between gap-3 border-b border-border px-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
