// components/countryDialCodes.ts
import { getCountries, getCountryCallingCode } from "react-phone-number-input";
import en from "react-phone-number-input/locale/en.json";

export type Dial = { name: string; cca2: string; callingCode: string; flag: string };

const codeToEmoji = (code: string) =>
  code
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));

// Built from library data at runtime – includes ALL supported countries.
export const DIALS: Dial[] = getCountries()
  .map((iso2) => {
    const cca2 = iso2.toUpperCase();
    const name = (en as Record<string, string>)[iso2] || cca2;
    const callingCode = getCountryCallingCode(iso2);
    const flag = codeToEmoji(cca2);
    return { name, cca2, callingCode, flag };
  })
  .sort((a, b) => a.name.localeCompare(b.name));
