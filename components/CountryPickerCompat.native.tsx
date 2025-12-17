// components/CountryPickerCompat.native.tsx
import type { CountryCode as LpnCountryCode } from "libphonenumber-js/core";
import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { CountryPicker as RNCCP } from "react-native-country-codes-picker";
import { getCountryCallingCode } from "react-phone-number-input";

export type CountryCode = string;
export type Country = { cca2: string; callingCode: string[]; name?: string };

type Props = {
  countryCode?: CountryCode;
  onSelect?: (c: Country) => void;
  callingCode?: string;

  /** NEW: search customization */
  searchPlaceholder?: string;      // placeholder shown in the picker’s search box
  initialSearch?: string;          // prefill the search box when opening
  excludedCountries?: string[];    // e.g. ["AQ","BV"]
};

const codeToEmoji = (code: string) =>
  code?.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));

type PickerItem = {
  code: string;                 // ISO2, e.g. "BB"
  dial_code?: string;           // e.g. "+1-246"
  name: string | Record<string, string>;
};

export default function CountryPickerCompatNative({
  countryCode = "BB",
  onSelect,
  searchPlaceholder = "Search by country or code",
  initialSearch,
  excludedCountries,
}: Props) {
  const [open, setOpen] = useState(false);

  const flag = useMemo(() => codeToEmoji(countryCode), [countryCode]);
  const canonicalDial = useMemo(
    () => getCountryCallingCode(countryCode.toUpperCase() as LpnCountryCode),
    [countryCode]
  );

  return (
    <View>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          paddingVertical: 10,
          paddingHorizontal: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: "#ddd",
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Text style={{ fontSize: 20 }}>{flag}</Text>
        <Text style={{ fontWeight: "600" }}>
          {countryCode} (+{canonicalDial})
        </Text>
      </Pressable>

      <RNCCP
        show={open}
        onBackdropPress={() => setOpen(false)}
        lang="en"
        /** enables the search UI + custom placeholder */
        inputPlaceholder="Search country or +code"
        /** message shown when no matches */
        searchMessage="No matching country"
        /** optional: prefill and filtering/exclusions */
        initialState={initialSearch}
        excludedCountries={excludedCountries}
        /** avoid keyboard covering input on Android */
        enableModalAvoiding
        androidWindowSoftInputMode="pan"
        // style the TextInput so you can see it
        style={{
          modal: { maxHeight: 480, paddingTop: 8, paddingBottom: 12 },
          textInput: {
            marginHorizontal: 12,
            marginTop: 10,
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: "#fff",
            color: "#111",
          },
        }}
        pickerButtonOnPress={(item: PickerItem) => {
          const name =
            typeof item.name === "string"
              ? item.name
              : item.name?.en ?? Object.values(item.name ?? {})[0];

          const calling = getCountryCallingCode(
            item.code.toUpperCase() as LpnCountryCode
          );

          onSelect?.({
            cca2: item.code.toUpperCase(),
            callingCode: calling ? [calling] : [],
            name,
          });

          setOpen(false);
        }}
      />
    </View>
  );
}
