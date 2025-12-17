// components/CountryPickerCompat.web.tsx
import React, { useMemo } from "react";
import { getCountries, getCountryCallingCode } from "react-phone-number-input";
import en from "react-phone-number-input/locale/en.json";

export type CountryCode = string;
export type Country = { cca2: string; callingCode: string[]; name?: string };

type Props = {
  onSelect?: (c: Country) => void;
  callingCode?: string; // optional: preselect by dial code
};

const ALL = getCountries().map((iso2) => {
  const cca2 = iso2.toUpperCase();
  const name = (en as Record<string, string>)[iso2] || cca2;
  const callingCode = getCountryCallingCode(iso2);
  return { cca2, name, callingCode };
});

export default function CountryPickerCompatWeb({ onSelect, callingCode }: Props) {
  const defaultCCA2 = useMemo(() => {
    if (callingCode) {
      const clean = callingCode.replace(/[^\d]/g, "");
      const hit = ALL.find((c) => c.callingCode === clean);
      if (hit) return hit.cca2;
    }
    return "BB";
  }, [callingCode]);

  return (
    <select
      defaultValue={defaultCCA2}
      onChange={(e) => {
        const cca2 = e.target.value;
        const c = ALL.find((x) => x.cca2 === cca2) || { cca2, name: cca2, callingCode: "1" };
        onSelect?.({ cca2, name: c.name, callingCode: [c.callingCode] });
      }}
      style={{
        width: "100%",
        height: 44,
        borderRadius: 10,
        border: "1px solid #ddd",
        padding: "0 12px",
        fontSize: 14,
        WebkitAppearance: "none",
        appearance: "none",
        background: "transparent",
      }}
      aria-label="Select country"
    >
      {ALL.map((c) => (
        <option key={c.cca2} value={c.cca2}>
          {c.name} (+{c.callingCode})
        </option>
      ))}
    </select>
  );
}
