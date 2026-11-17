const STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300/70',
  open: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200',
  closed: 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200',
  published: 'bg-indigo-50 text-indigo-800 ring-1 ring-inset ring-indigo-200',
  pending: 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200',
  rejected: 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-200',
  sent: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200',
  failed: 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-200',
  exported: 'bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200',
  collecting: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300/70',
  ready: 'bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200',
  consent_sent: 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200',
  accepted: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200',
  declined: 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-200',
  expired: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-300/70',
  candidate: 'bg-indigo-50 text-indigo-800 ring-1 ring-inset ring-indigo-200',
  poll: 'bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200',
  active: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200',
  deactivated: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-300/70',
};

export function StatusBadge({ value }: { value: string }) {
  return <span className={`badge ${STYLES[value] ?? STYLES.draft}`}>{value}</span>;
}
