"use client";

// Every list that holds data gets one of these.
export function SearchBox({
  value,
  onChange,
  placeholder = "Search",
  label = "Search",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <div className="relative">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 fill-none stroke-muted" strokeWidth={2} strokeLinecap="round">
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4 4" />
      </svg>
      <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={label}
      spellCheck
      className="h-11 w-full rounded-lg border border-line bg-white pl-10 pr-3 text-[15px] focus:outline-none focus:border-brand"
      />
    </div>
  );
}
