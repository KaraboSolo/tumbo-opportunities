import { useState, type KeyboardEvent } from "react";

interface Props {
  id: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  hint?: string;
}

/** A list of short text values: type and press Enter (or comma) to add, tap × to remove. */
export function TagInput({ id, label, values, onChange, placeholder, hint }: Props) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim().replace(/,$/, "").trim();
    if (value && !values.some((v) => v.toLowerCase() === value.toLowerCase())) onChange([...values, value]);
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !draft && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {hint && <p className="-mt-0.5 mb-1.5 text-xs text-ink-faint">{hint}</p>}
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-hairline bg-white p-2 transition focus-within:border-brand/40 focus-within:ring-4 focus-within:ring-brand/10">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-brand-light px-2.5 py-1 text-sm text-brand-dark">
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              className="text-brand-dark/60 hover:text-brand-dark"
              onClick={() => onChange(values.filter((x) => x !== v))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={add}
          placeholder={values.length === 0 ? placeholder : "Add more"}
          className="min-w-[8rem] flex-1 border-0 p-1 text-base focus:outline-none"
        />
      </div>
    </div>
  );
}
