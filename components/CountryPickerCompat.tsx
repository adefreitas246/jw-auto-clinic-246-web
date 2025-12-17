// components/CountryPickerCompat.tsx
import React from "react";
import { Platform } from "react-native";

// light types so we don't pull native types on web
export type CountryCode = string;
export type Country = { cca2: string; callingCode: string[]; name?: string };

interface Props {
  countryCode?: CountryCode;
  onSelect?: (c: Country) => void;
  callingCode?: string;
}

type ImplProps = Props;

const Impl: React.ComponentType<ImplProps> =
  Platform.OS === "web"
    ? // only load the web impl on web
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require("./CountryPickerCompat.web").default
    : // only load the native impl on iOS/Android
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require("./CountryPickerCompat.native").default;

export default function CountryPickerCompat(props: Props) {
  return <Impl {...props} />;
}
