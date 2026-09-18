"use client";
import { useId, useState } from "react";
export type Choice = { value: string; label: string; search?: string };
export function ChoiceField({
  label,
  value,
  options,
  onChange,
  placeholder = "请选择",
}: {
  label: string;
  value: string;
  options: Choice[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const id = useId();
  const selected = options.find((o) => o.value === value);
  const filtered = options.filter((o) =>
    `${o.label} ${o.search ?? ""}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="choice-field">
      <label htmlFor={`${id}-input`}>{label}</label>
      <input
        id={`${id}-input`}
        className="choice-trigger"
        value={open ? query : (selected?.label ?? "")}
        placeholder={placeholder}
        autoComplete="off"
        aria-label={label}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
      />
      {open && (
        <div className="choice-panel">
          <div
            className="choice-options"
            role="group"
            aria-label={`${label}选项`}
          >
            {filtered.map((o) => (
              <button
                type="button"
                key={o.value}
                aria-pressed={value === o.value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(o.value);
                  setOpen(false);
                  setQuery("");
                }}
              >
                {o.label}
                {value === o.value ? " ✓" : ""}
              </button>
            ))}
            {!filtered.length && (
              <p className="muted">没有找到匹配项，请尝试其他城市或名称。</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
