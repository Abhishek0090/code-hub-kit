"use client";

import { LANGUAGES } from "@/lib/languages";
import { useServerStatus } from "@/lib/useServerStatus";

export default function LanguageSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const status = useServerStatus();
  const serverNote = status && !status.piston ? " (needs Piston)" : "";
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input py-1.5" aria-label="Language">
      <optgroup label="Runs in the browser">
        {LANGUAGES.filter((l) => l.browser).map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </optgroup>
      <optgroup label={`Runs on the server${serverNote}`}>
        {LANGUAGES.filter((l) => !l.browser).map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
