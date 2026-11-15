const STYLES: Record<string, string> = {
  draft: 'bg-slate-200 text-slate-800',
  open: 'bg-green-100 text-green-900',
  closed: 'bg-amber-100 text-amber-900',
  published: 'bg-indigo-100 text-indigo-900',
  pending: 'bg-slate-200 text-slate-800',
  approved: 'bg-green-100 text-green-900',
  rejected: 'bg-red-100 text-red-900',
  sent: 'bg-green-100 text-green-900',
  failed: 'bg-red-100 text-red-900',
  exported: 'bg-blue-100 text-blue-900',
  candidate: 'bg-purple-100 text-purple-900',
  poll: 'bg-sky-100 text-sky-900',
};

export function StatusBadge({ value }: { value: string }) {
  return <span className={`badge ${STYLES[value] ?? STYLES.draft}`}>{value}</span>;
}
