import { STATUS_COLORS, STATUS_LABELS } from '../api.js';

export function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        STATUS_COLORS[status] || 'bg-slate-200 text-slate-700'
      }`}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export function Button({ variant = 'primary', className = '', ...props }) {
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300',
    secondary: 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-300',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300',
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({ className = '', children }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Input(props) {
  return (
    <input
      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
      {...props}
    />
  );
}

export function Spinner({ className = '' }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600 ${className}`}
    />
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {children && <p className="mt-1 text-sm text-slate-500">{children}</p>}
    </div>
  );
}
