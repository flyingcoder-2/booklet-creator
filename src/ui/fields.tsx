/** Shared form-control styling, used by the right panel and print preview toolbar. */

export const FIELD_CLASS =
  'w-full rounded-lg border border-neutral-200 bg-neutral-0 px-2 py-1.5 text-sm text-neutral-900 shadow-sm outline-none transition-colors hover:border-neutral-300 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30'

export function Select({
  className = '',
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={`${FIELD_CLASS} appearance-none pr-7 ${className}`}
        {...props}
      />
      <svg
        className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-neutral-400"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        aria-hidden="true"
      >
        <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

export function Checkbox(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className="h-4 w-4 rounded border-neutral-300 accent-accent-600"
      {...props}
    />
  )
}
