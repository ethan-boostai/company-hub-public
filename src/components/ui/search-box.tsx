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
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={label}
      spellCheck
      className="w-full rounded-lg border border-line bg-white px-3 py-2 focus:outline-none focus:border-brand"
    />
  );
}
