import CountryPickerCompat, { Country, CountryCode } from "@/components/CountryPickerCompat";
import { useAuth } from "@/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView, Modal, Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
  useWindowDimensions
} from "react-native";
import DropDownPicker from "react-native-dropdown-picker";
import "react-native-gesture-handler";
import { Swipeable, gestureHandlerRootHOC } from "react-native-gesture-handler";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

type Role = "admin" | "staff";

interface Employee {
  _id: string;
  name: string;
  email: string;
  phone: string;
  role: Role | string;
  hourlyRate?: number;
  clockedIn: boolean;
}

interface Shift {
  _id: string;
  employee: string;
  date: string;        // "YYYY-MM-DD"
  clockIn: string;     // "01:23:45 PM"
  clockOut?: string;   // undefined if active
  status: "Active" | "Completed";
  lunchStart?: string;
  lunchEnd?: string;
}

function EmployeesScreen() {
  // ----- Platform helpers + design tokens --------------------------------
  const isWeb = Platform.OS === "web";
  const isIOS = (Platform.OS as string) === "ios";
  const isAndroid = Platform.OS === "android";

  const UI = {
    maxWidth: 740,
    padX: 18,
    radius: Platform.select({ ios: 14, android: 10, default: 12 })!,
    colors: {
      // Light only
      bg: "#F2F2F7", // iOS grouped background (light)
      card: "#FFFFFF",
      border: "#E5E5EA",
      text: "#111111",
      sub: "#6E6E73",
      primary: "#6A0DAD",
      glyphBorder: "#e9ecf7",
    },
  };

  // sticky header elevation on scroll
  const [headerElevated, setHeaderElevated] = useState(false);

  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const showEvent = isIOS ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = isIOS ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);



  const { user } = useAuth();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;
  const smallestSide = Math.min(width, height);

  const isPhone = !isWeb && smallestSide < 600;
  const isTablet = !isWeb && smallestSide >= 600;

  // Only phones use the inline sticky header row hack.
  // Tablets will use a normal ListHeaderComponent.
  const useInlineStickyHeader = isPhone;

  // --- Web responsiveness ---
  const BREAKPOINT_TABLE = 900; // px
  const isWebCards = isWeb && width < BREAKPOINT_TABLE; // use card layout on narrow web
  const isWebTable = isWeb && !isWebCards;              // keep table on wide web

  // Responsive columns (native + web-cards)
  const columns = useMemo(() => {
    if (isWebTable) return 1; // not used for wide web table

    // Phones stay 1-column in both portrait and landscape.
    if (isPhone) return 1;

    // Native tablets: keep it to max 2 columns for readability.
    if (!isWeb && isTablet) {
      return width >= 700 ? 2 : 1;
    }

    // Web "card" layout can still go up to 3 columns.
    return width >= 1100 ? 3 : width >= 700 ? 2 : 1;
  }, [isWebTable, isPhone, isTablet, isWeb, width]);
  
  const isWide = columns > 1;  
  

  // ---------- Data ----------
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [tick, setTick] = useState(0);

  // ---------- Add Form ----------
  const [addVisible, setAddVisible] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [openRole, setOpenRole] = useState(false);

  // touched flags for inline validation
  const [tName, setTName] = useState(false);
  const [tEmail, setTEmail] = useState(false);
  const [tPhone, setTPhone] = useState(false);
  const [tRole, setTRole] = useState(false);
  const [tRate, setTRate] = useState(false);

  const [nameError, setNameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [roleError, setRoleError] = useState("");
  const [hourlyRateError, setHourlyRateError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Country/phone formatting
  const [countryCode, setCountryCode] = useState<CountryCode>("BB");
  const [callingCode, setCallingCode] = useState("1");
  const [country, setCountry] = useState<Country | null>(null);

  // ---------- Filters/Search ----------
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [openRoleFilter, setOpenRoleFilter] = useState(false);

  // ---------- UI States ----------
  const [clockingIds, setClockingIds] = useState<Set<string>>(new Set());
  const [lunchingIds, setLunchingIds] = useState<Set<string>>(new Set());
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [editVisible, setEditVisible] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ---------- Helpers ----------
  const api = "https://jw-auto-clinic-246.onrender.com";

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch(`${api}/api/employees`, {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      const data = await res.json();
      setEmployees(Array.isArray(data) ? data : []);
    } catch (err) {
      // console.error("Error fetching employees", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchShifts = useCallback(async () => {
    try {
      const res = await fetch(`${api}/api/shifts`, {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      const data = await res.json();
      setShifts(Array.isArray(data) ? data : []);
    } catch (err) {
      // console.error("Error fetching shifts", err);
    }
  }, [user]);

  useEffect(() => {
    fetchEmployees();
    fetchShifts();

    const interval = setInterval(() => {
      fetchEmployees();
      fetchShifts();
      setTick((t) => t + 1);
    }, 5000);

    const sec = setInterval(() => setTick((t) => t + 1), 1000);

    return () => {
      clearInterval(interval);
      clearInterval(sec);
    };
  }, [fetchEmployees, fetchShifts]);

  // ---------- Validation ----------
  const validateName = (text: string) => {
    const trimmed = text.replace(/\s+/g, " ").trim();
    setName(trimmed);
    const basic = /^[a-zA-Z\s.'-]{2,}$/.test(trimmed);
    const parts = trimmed.split(" ");
    const twoWords = parts.length >= 2 && parts.every((p) => p.length >= 2);
    setNameError(basic && twoWords ? "" : "Enter full name (e.g. Jane Smith).");
  };

  const validateEmail = (text: string) => {
    setEmail(text);
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());
    setEmailError(ok ? "" : "Enter a valid email address.");
  };

  const formatPhoneNumber = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  const validatePhone = (text: string) => {
    const digits = text.replace(/\D/g, "");
    const formatted = formatPhoneNumber(digits);
    setPhone(formatted);
    const full = `${callingCode}-${formatted}`;
    const ok = new RegExp(`^${callingCode}-\\d{3}-\\d{3}-\\d{4}$`).test(full);
    setPhoneError(ok ? "" : `Invalid format. Ex: ${callingCode}-XXX-XXX-XXXX`);
  };

  const onSelectCountry = (c: Country) => {
    setCountryCode(c.cca2);
    setCallingCode(c.callingCode?.[0] || "");
    setCountry(c);
    setPhone("");
    setPhoneError("");
  };

  const validateRole = (value: Role | null) => {
    setRole(value);
    if (tRole) setRoleError(value === "admin" || value === "staff" ? "" : "Please select a role.");
  };

  const sanitiseRate = (val: string) => {
    let v = val.replace(/[^\d.]/g, "");
    const dot = v.indexOf(".");
    if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, "");
    v = v.replace(/^(\d{0,3})(\d*)$/, (_m, a, b) => a + b);
    v = v.replace(/^(\d{1,3})(?:\.(\d{0,3}))?.*$/, (_m, a, b) => (b !== undefined ? `${a}.${b}` : a));
    setHourlyRate(v);
    if (tRate) setHourlyRateError(v.length ? "" : "Hourly rate is required for staff.");
  };

  // ---------- Derived ----------
  const shiftsByEmployee = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const s of shifts) {
      if (!map.has(s.employee)) map.set(s.employee, []);
      map.get(s.employee)!.push(s);
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => +shiftStart(b) - +shiftStart(a));
      map.set(k, arr);
    }
    return map;
  }, [shifts, tick]);

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return employees.filter((e) => {
      const matchesRole = roleFilter === "all" ? true : e.role === roleFilter;
      const matchesQuery =
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        (e.phone || "").toLowerCase().includes(q);
      return matchesRole && matchesQuery;
    });
  }, [employees, roleFilter, searchQuery]);

  // First two "rows" are not employees: a sticky title bar and the mobile header block.
  // Row 0 will be sticky like Settings' header.
  const dataCards = useMemo(() => {
    if (useInlineStickyHeader) {
      // Phones: first two “virtual rows” for sticky header + summary.
      return [
        { __type: "stickyHeader" } as any,
        { __type: "mobileHeader" } as any,
        ...filteredEmployees,
      ];
    }
  
    // Tablets / web-cards: plain data; header will be ListHeaderComponent.
    return filteredEmployees;
  }, [filteredEmployees, useInlineStickyHeader]);
  

  // ---------- Shift time helpers ----------
  function parseDateTime(dateISO: string, time12h: string) {
    const [time, ampm] = time12h.split(" ");
    const [hh, mm, ss] = time.split(":").map((n) => parseInt(n, 10));
    let H = hh % 12;
    if (ampm?.toUpperCase() === "PM") H += 12;
    const pad = (n: number) => String(n).padStart(2, "0");
    return new Date(`${dateISO}T${pad(H)}:${pad(mm)}:${pad(ss)}`);
  }
  function shiftStart(s: Shift) {
    return parseDateTime(s.date, s.clockIn);
  }
  function shiftEnd(s: Shift) {
    return s.clockOut ? parseDateTime(s.date, s.clockOut) : new Date();
  }
  function formatDuration(ms: number) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
  }

  // ---------- Actions ----------
  const refetchAll = async () => {
    await Promise.all([fetchEmployees(), fetchShifts()]);
  };

  const handleAddEmployee = async () => {
    setSubmitting(true);
    setTName(true); setTEmail(true); setTPhone(true); setTRole(true); if (role === "staff") setTRate(true);

    const trimmedName = name.replace(/\s+/g, " ").trim();
    const nameOk = /^[a-zA-Z\s.'-]{2,}$/.test(trimmedName) && trimmedName.split(" ").length >= 2 && trimmedName.split(" ").every(p => p.length >= 2);
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    const phoneOk = new RegExp(`^${callingCode}-\\d{3}-\\d{3}-\\d{4}$`).test(`${callingCode}-${phone}`);
    const roleOk = role === "admin" || role === "staff";
    const rateOk = role === "admin" || (role === "staff" && !!hourlyRate);

    setNameError(nameOk ? "" : "Enter full name (e.g. Jane Smith).");
    setEmailError(emailOk ? "" : "Enter a valid email address.");
    setPhoneError(phoneOk ? "" : `Invalid format. Ex: ${callingCode}-XXX-XXX-XXXX`);
    setRoleError(roleOk ? "" : "Please select a role.");
    if (role === "staff") setHourlyRateError(rateOk ? "" : "Hourly rate is required for staff.");

    const valid = nameOk && emailOk && phoneOk && roleOk && rateOk;
    if (!valid) { setSubmitting(false); return; }

    try {
      const res = await fetch(`${api}/api/employees`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user?.token}`,
        },
        body: JSON.stringify({
          name: trimmedName,
          email,
          phone,
          role,
          hourlyRate: role === "staff" ? parseFloat(hourlyRate || "0") : 0,
          password: "",
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error?.error || "Failed to add employee");
      }

      try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}

      await refetchAll();
      setName(""); setEmail(""); setPhone(""); setRole(null); setHourlyRate("");
      setCountryCode("BB"); setCallingCode("1"); setCountry(null);
      setTName(false); setTEmail(false); setTPhone(false); setTRole(false); setTRate(false);
      setNameError(""); setEmailError(""); setPhoneError(""); setRoleError(""); setHourlyRateError("");
      setAddVisible(false);
      Keyboard.dismiss();
    } catch (err) {
      // console.error(err);
      Alert.alert("Error", "Could not add employee.");
    } finally {
      setSubmitting(false);
    }
  };

  const clearForm = () => {
    setName(""); setEmail(""); setPhone(""); setRole(null); setHourlyRate("");
    setCountryCode("BB"); setCallingCode("1"); setCountry(null);
    setTName(false); setTEmail(false); setTPhone(false); setTRole(false); setTRate(false);
    setNameError(""); setEmailError(""); setPhoneError(""); setRoleError(""); setHourlyRateError("");
  };

  const handleClockInOut = async (emp: Employee) => {
    if (clockingIds.has(emp._id)) return;
    const setIds = new Set(clockingIds); setIds.add(emp._id); setClockingIds(setIds);

    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-US", {
      hour12: true, hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const dateStr = now.toISOString().split("T")[0];

    try {
      if (!emp.clockedIn) {
        await fetch(`${api}/api/shifts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${user?.token}` },
          body: JSON.stringify({ employee: emp.name, date: dateStr, clockIn: timeStr }),
        });
      } else {
        const res = await fetch(`${api}/api/shifts/last/${encodeURIComponent(emp.name)}`, {
          headers: { Authorization: `Bearer ${user?.token}` },
        });
        const activeShift = await res.json();
        if (activeShift?._id) {
          await fetch(`${api}/api/shifts/${activeShift._id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${user?.token}` },
            body: JSON.stringify({ clockOut: timeStr, status: "Completed" }),
          });
        }
      }

      await fetch(`${api}/api/employees/${emp._id}/clock`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${user?.token}` },
      });

      try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}

      await refetchAll();
    } catch (err) {
      // console.error("Clock error:", err);
      Alert.alert("Error", "Clock in/out failed.");
    } finally {
      const s2 = new Set(clockingIds); s2.delete(emp._id); setClockingIds(s2);
    }
  };

  const handleLunchToggle = async (emp: Employee) => {
    if (lunchingIds.has(emp._id)) return;
    const setIds = new Set(lunchingIds); setIds.add(emp._id); setLunchingIds(setIds);

    try {
      const res = await fetch(`${api}/api/shifts/last/${encodeURIComponent(emp.name)}`, {
        headers: { Authorization: `Bearer ${user?.token}` },
      });

      const json = await res.json();
      const activeShift: Shift | undefined = (json && (json.shift || json)) as any;

      if (!activeShift?._id || activeShift.clockOut) {
        Alert.alert("No active shift", "You must be clocked in to start/end lunch.");
        return;
      }

      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-US", {
        hour12: true, hour: "2-digit", minute: "2-digit", second: "2-digit",
      });

      let patch: Partial<Shift> | null = null;
      let successMsg = "";
      if (!activeShift.lunchStart) {
        patch = { lunchStart: timeStr };
        successMsg = "Lunch started.";
      } else if (activeShift.lunchStart && !activeShift.lunchEnd) {
        patch = { lunchEnd: timeStr };
        successMsg = "Lunch ended.";
      } else {
        Alert.alert("Lunch already recorded", "Lunch start and end are already set for this shift.");
      }

      if (patch) {
        const put = await fetch(`${api}/api/shifts/${activeShift._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${user?.token}` },
          body: JSON.stringify(patch),
        });
        if (!put.ok) {
          const e = await put.text();
          throw new Error(e || "Failed to update lunch");
        }

        setShifts(prev => prev.map(s => (s._id === activeShift._id ? { ...s, ...patch } : s)));
        try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
        Alert.alert("Success", successMsg);
      }

      await fetchShifts();
    } catch (err) {
      // console.error("Lunch error:", err);
      Alert.alert("Error", "Lunch update failed.");
    } finally {
      const s2 = new Set(lunchingIds); s2.delete(emp._id); setLunchingIds(s2);
    }
  };

  const confirmDelete = (emp: Employee) => {
    Alert.alert("Delete Employee", `Delete ${emp.name}? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteEmployee(emp._id) },
    ]);
  };

  const deleteEmployee = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`${api}/api/employees/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (!res.ok) throw new Error("Delete failed");
      await refetchAll();
    } catch {
      Alert.alert("Error", "Could not delete employee.");
    } finally {
      setDeletingId(null);
    }
  };

  const openEdit = (emp: Employee) => {
    setEditing({
      ...emp,
      role: (emp.role as Role) || "staff",
    });
    setEditVisible(true);
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      const res = await fetch(`${api}/api/employees/${editing._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${user?.token}` },
        body: JSON.stringify({
          name: editing.name,
          email: editing.email,
          phone: editing.phone,
          role: editing.role,
          hourlyRate: editing.role === "staff" ? editing.hourlyRate ?? 0 : 0,
        }),
      });
      if (!res.ok) throw new Error("Update failed");
      setEditVisible(false);
      setEditing(null);
      await refetchAll();
    } catch {
      Alert.alert("Error", "Could not update employee.");
    }
  };

  const copy = async (label: string, value: string) => {
    try {
      await Clipboard.setStringAsync(value);
      if (Platform.OS === "android") {
        ToastAndroid.show(`${label} copied`, ToastAndroid.SHORT);
      } else {
        Alert.alert("Copied", `${label} copied to clipboard`);
      }
    } catch {}
  };

  // ---------- Header band (FIXED, elevated on scroll) ----------
  const HeaderBand = useMemo(
    () => (
      <View
        style={[
          styles.headerBand,
          isWeb && styles.headerBandWeb,
          headerElevated && styles.headerBandElevated,
        ]}
      >
        <View style={[styles.headerRow, isWeb && styles.headerRowWeb]}>
          {/* no-wrap big title */}
          <Text style={styles.largeTitle} numberOfLines={1} ellipsizeMode="tail">
            Employees
          </Text>

          {isWeb ? (
            <TouchableOpacity
              onPress={() => setAddVisible(true)}
              style={styles.webPrimaryBtn}
              accessibilityRole="button"
              accessibilityLabel="Add employee"
            >
              <Ionicons name="person-add-outline" size={18} color="#fff" />
              <Text style={styles.webPrimaryBtnText} numberOfLines={1} ellipsizeMode="tail">
                Add Employee
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.cardHelper}>
              Manage your team, clock-ins, and lunches. Long-press email/phone to copy.
            </Text>
          )}
        </View>
      </View>
    ),
    [isWeb, headerElevated]
  );

  // ---------- List headers (web vs mobile) ----------
  const MobileListHeader = useMemo(
    () => (
      <View>
        {/* On tablets, show the big title here (phones already have StickyMobileHeader) */}
        {!useInlineStickyHeader && (
          <View style={{ marginBottom: 8, paddingHorizontal: 4 }}>
            <Text style={styles.largeTitle} numberOfLines={1} ellipsizeMode="tail">
              Employees
            </Text>
          </View>
        )}
  
        <View style={[styles.card, styles.summaryCard]}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNum}>{employees.filter(e => e.clockedIn).length}</Text>
            <Text style={styles.summaryLabel}>Active now</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNum}>
              {shifts.filter(s => s.status !== "Completed" && !!s.lunchStart && !s.lunchEnd).length}
            </Text>
            <Text style={styles.summaryLabel}>On lunch</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNum}>{employees.filter(e => String(e.role) === "staff").length}</Text>
            <Text style={styles.summaryLabel}>Staff</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNum}>{employees.filter(e => String(e.role) === "admin").length}</Text>
            <Text style={styles.summaryLabel}>Admins</Text>
          </View>
        </View>
  
        <View style={[styles.card, { marginTop: 12 }]}>
          {/* no-wrap section title */}
          <Text style={styles.sectionTitle} numberOfLines={1} ellipsizeMode="tail">
            Directory
          </Text>
          <View style={[styles.row, isWide && styles.rowWide]}>
            <View style={[styles.col, isWide && styles.twoThirds]}>
              <TextInput
                style={styles.input}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search by name, email, or phone"
                placeholderTextColor="#777"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              <Text style={styles.helper}>
                {filteredEmployees.length} result{filteredEmployees.length === 1 ? "" : "s"}
              </Text>
            </View>
            <View style={[styles.col, isWide && styles.third, styles.zFix]}>
              <DropDownPicker
                open={openRoleFilter}
                value={roleFilter}
                items={[
                  { label: "All Roles", value: "all" },
                  { label: "Admin", value: "admin" },
                  { label: "Staff", value: "staff" },
                ]}
                setOpen={setOpenRoleFilter}
                setValue={(cb) => setRoleFilter((cb as any)(roleFilter))}
                placeholder="Filter role"
                listMode="MODAL"
                style={styles.dropdown}
                dropDownContainerStyle={styles.dropdownContainer}
                modalTitle="Filter by role"
              />
            </View>
          </View>
        </View>
      </View>
    ),
    [
      employees,
      shifts,
      searchQuery,
      roleFilter,
      openRoleFilter,
      isWide,
      filteredEmployees.length,
      useInlineStickyHeader,
    ]
  );
  

  // WEB: sticky, compact toolbar + table header
  const WebToolbarHeader = useMemo(() => (
    <View style={styles.webHeaderBlock}>
      <View style={styles.webToolbarWrap}>
        <View style={styles.webToolbarRow}>
          <View style={styles.webSearchWrap}>
            <Ionicons name="search-outline" size={16} color="#6b7280" />
            <TextInput
              style={styles.webSearchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search name, email, phone…"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>

          <View style={styles.webFilterWrap}>
            <DropDownPicker
              open={openRoleFilter}
              value={roleFilter}
              items={[
                { label: "All Roles", value: "all" },
                { label: "Admin", value: "admin" },
                { label: "Staff", value: "staff" },
              ]}
              setOpen={setOpenRoleFilter}
              setValue={(cb) => setRoleFilter((cb as any)(roleFilter))}
              placeholder="Role"
              listMode="MODAL"
              style={styles.webDropdown}
              dropDownContainerStyle={styles.dropdownContainer}
              modalTitle="Filter by role"
            />
          </View>

          <View style={styles.webChipsRow}>
            <View style={[styles.webChip, styles.webChipGreen]}>
              <Text style={styles.webChipText}>Active {employees.filter(e => e.clockedIn).length}</Text>
            </View>
            <View style={[styles.webChip, styles.webChipBlue]}>
              <Text style={styles.webChipText}>
                Lunch {shifts.filter(s => s.status !== "Completed" && !!s.lunchStart && !s.lunchEnd).length}
              </Text>
            </View>
            <View style={styles.webChip}>
              <Text style={styles.webChipText}>Staff {employees.filter(e => String(e.role) === "staff").length}</Text>
            </View>
            <View style={styles.webChip}>
              <Text style={styles.webChipText}>Admins {employees.filter(e => String(e.role) === "admin").length}</Text>
            </View>
          </View>
        </View>

        <View style={styles.webTableHeader}>
          <Text style={[styles.webTh, { flex: 2 }]} numberOfLines={1}>Employee</Text>
          <Text style={[styles.webTh, { flex: 2 }]} numberOfLines={1}>Email</Text>
          <Text style={[styles.webTh, { flex: 1.5 }]} numberOfLines={1}>Phone</Text>
          <Text style={[styles.webTh, { flex: 1 }]} numberOfLines={1}>Role</Text>
          <Text style={[styles.webTh, { flex: 1 }]} numberOfLines={1}>Status</Text>
          <Text style={[styles.webTh, { flex: 1.8, textAlign: "left" }]} numberOfLines={1}>Actions</Text>
        </View>
      </View>
    </View>
  ), [employees, shifts, searchQuery, roleFilter, openRoleFilter]);

  // --- Sticky mobile header (matches Settings) ---
  const StickyMobileHeader = useMemo(
    () => (
      <View
        style={[
          styles.stickyHeader,
          headerElevated && styles.stickyHeaderElevated,
        ]}
      >
        <Text style={styles.largeTitle} numberOfLines={1} ellipsizeMode="tail">
          Employees
        </Text>
      </View>
    ),
    [headerElevated]
  );

  // ---------- Item renderer (cards for native) ----------
  const renderMobileCard = ({ item }: { item: Employee }) => {
    const emp = item;
    const empShifts = shiftsByEmployee.get(emp.name) || [];
    const last = empShifts[0];

    const lunchState: "none" | "canStart" | "canEnd" | "done" =
      !last || last.clockOut
        ? "none"
        : !last.lunchStart
          ? "canStart"
          : last.lunchStart && !last.lunchEnd
            ? "canEnd"
            : "done";

    const CardInner = (
      <View style={[styles.employeeCard, isTablet && styles.employeeCardTablet]}>        
        <View style={styles.cardHeader}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={[styles.statusDot, emp.clockedIn ? styles.statusOn : styles.statusOff]} />
            {/* no-wrap name */}
            <Text style={styles.employeeName} numberOfLines={1} ellipsizeMode="tail">
              {emp.name}
            </Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {Platform.OS === "web" && (
              <>
                <TouchableOpacity onPress={() => openEdit(emp)} accessibilityRole="button" accessibilityLabel={`Edit ${emp.name}`} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="create-outline" size={18} color="#6a0dad" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => confirmDelete(emp)} accessibilityRole="button" accessibilityLabel={`Delete ${emp.name}`} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </TouchableOpacity>
              </>
            )}

            <View style={[styles.roleBadge, emp.role === "admin" ? styles.roleAdmin : styles.roleStaff]}>
              <Text style={[styles.roleText, emp.role === "admin" ? { color: "#6a0dad" } : { color: "#065f46" }]} numberOfLines={1}>
                {String(emp.role).toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.employeeInfo} selectable onLongPress={() => copy("Email", emp.email)}>{emp.email}</Text>
        <Text style={styles.employeeInfo} selectable onLongPress={() => copy("Phone", emp.phone)}>{emp.phone}</Text>
        {typeof emp.hourlyRate === "number" && emp.role === "staff" && (
          <Text style={styles.employeeInfo}>{`$${emp.hourlyRate.toFixed(3)}/hour`}</Text>
        )}

        <View style={styles.cardFooter}>
          <TouchableOpacity
            style={[
              styles.clockButton,
              emp.clockedIn ? { backgroundColor: "#ef4444" } : { backgroundColor: "#22c55e" },
              clockingIds.has(emp._id) && { opacity: 0.7 },
            ]}
            onPress={() => handleClockInOut(emp)}
            disabled={clockingIds.has(emp._id)}
            accessibilityRole="button"
            accessibilityLabel={`${emp.clockedIn ? "Clock out" : "Clock in"} ${emp.name}`}
          >
            <Ionicons name={emp.clockedIn ? "time-outline" : "play-circle-outline"} size={18} color="#fff" />
            <Text style={styles.clockText}>{clockingIds.has(emp._id) ? "Processing…" : emp.clockedIn ? "Clock Out" : "Clock In"}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.lunchButton,
              (lunchState === "none" || lunchState === "done" || lunchingIds.has(emp._id)) && { opacity: 0.5 },
              lunchState === "canStart" && { backgroundColor: "#fbbf24" },
              lunchState === "canEnd" && { backgroundColor: "#3b82f6" },
            ]}
            onPress={() => handleLunchToggle(emp)}
            disabled={lunchState === "none" || lunchState === "done" || lunchingIds.has(emp._id)}
            accessibilityRole="button"
            accessibilityLabel={
              lunchState === "canStart" ? `Start lunch for ${emp.name}` :
              lunchState === "canEnd" ? `End lunch for ${emp.name}` :
              `Lunch not available`
            }
          >
            <Ionicons name="fast-food-outline" size={18} color="#fff" />
            <Text style={styles.lunchText}>
              {lunchingIds.has(emp._id) ? "Updating…" : lunchState === "canStart" ? "Start Lunch" : lunchState === "canEnd" ? "End Lunch" : "Lunch"}
            </Text>
          </TouchableOpacity>

          {(() => {
            const empShifts = shiftsByEmployee.get(emp.name) || [];
            const last = empShifts[0];
            const liveMs = last && !last.clockOut ? shiftEnd(last).getTime() - shiftStart(last).getTime() : 0;
            return last ? (
              <Text style={styles.shiftMeta}>
                {last.status === "Completed"
                  ? `Last: ${formatDuration(shiftEnd(last).getTime() - shiftStart(last).getTime())}`
                  : `Active: ${formatDuration(liveMs)}`}
              </Text>
            ) : <Text style={styles.shiftMeta}>No shifts yet</Text>;
          })()}

          <TouchableOpacity
            onPress={() => {
              const s = new Set(expandedCards);
              s.has(emp._id) ? s.delete(emp._id) : s.add(emp._id);
              setExpandedCards(s);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${expandedCards.has(emp._id) ? "Hide" : "View"} history for ${emp.name}`}
          >
            <Text style={styles.toggleHistory}>
              {expandedCards.has(emp._id) ? "Hide history ▲" : "View history ▼"}
            </Text>
          </TouchableOpacity>
        </View>

        {expandedCards.has(emp._id) && (
          <View style={styles.history}>
            {(shiftsByEmployee.get(emp.name) || []).slice(0, 3).map((s) => {
              const dur = formatDuration(shiftEnd(s).getTime() - shiftStart(s).getTime());
              return (
                <View key={s._id} style={styles.historyRow}>
                  <Text style={styles.historyDate}>{s.date}</Text>
                  <Text style={styles.historyDur}>{dur}</Text>
                  <Text style={[styles.historyStatus, s.status === "Completed" ? styles.statusDone : styles.statusActive]}>
                    {s.status}
                  </Text>
                </View>
              );
            })}
            {(shiftsByEmployee.get(emp.name) || []).length === 0 && <Text style={styles.historyEmpty}>No shift records.</Text>}
          </View>
        )}
      </View>
    );

    if (Platform.OS === "web") return CardInner;
    return (
      <Swipeable renderRightActions={() => renderRightActions(emp)} overshootRight={false}>
        {CardInner}
      </Swipeable>
    );
  };

  // ---------- Web table row (compact + zebra) ----------
  const renderWebRow = ({ item: emp, index }: { item: Employee; index: number }) => {
    const empShifts = shiftsByEmployee.get(emp.name) || [];
    const last = empShifts[0];
    const active = !!last && !last.clockOut;
    const lunching = !!last && !!last.lunchStart && !last.lunchEnd;

    return (
      <View style={[styles.webTr, index % 2 === 1 && styles.webTrAlt]}>
        {/* Employee */}
        <View style={[styles.webTd, { flex: 2, gap: 8, alignItems: "center", flexDirection: "row" }]}>
          <View style={[styles.webDot, active ? styles.webDotOn : styles.webDotOff]} />
          <Text style={styles.webName} numberOfLines={1} ellipsizeMode="tail">{emp.name}</Text>
        </View>

        {/* Email */}
        <TouchableOpacity
          style={[styles.webTd, { flex: 2 }]}
          onPress={() => copy("Email", emp.email)}
          accessibilityRole="button"
        >
          <Text style={styles.webCellText} numberOfLines={1} ellipsizeMode="middle">{emp.email}</Text>
        </TouchableOpacity>

        {/* Phone */}
        <TouchableOpacity
          style={[styles.webTd, { flex: 1.5 }]}
          onPress={() => copy("Phone", emp.phone)}
          accessibilityRole="button"
        >
          <Text style={styles.webCellText} numberOfLines={1} ellipsizeMode="tail">{emp.phone}</Text>
        </TouchableOpacity>

        {/* Role */}
        <View style={[styles.webTd, { flex: 1 }]}>
          <View style={[styles.webRoleBadge, emp.role === "admin" ? styles.webRoleAdmin : styles.webRoleStaff]}>
            <Text style={[styles.webRoleText, emp.role === "admin" ? { color: "#6a0dad" } : { color: "#065f46" }]} numberOfLines={1}>
              {String(emp.role).toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Status */}
        <View style={[styles.webTd, { flex: 1 }]}>
          <Text style={[styles.webStatus, active ? styles.webStatusActive : styles.webStatusDone]} numberOfLines={1}>
            {active ? (lunching ? "On Lunch" : "Active") : "Completed"}
          </Text>
        </View>

        {/* Actions */}
        <View style={[styles.webTd, { flex: 1.8, alignItems: "flex-end" }]}>
          <View style={styles.webActions}>
            <TouchableOpacity
              onPress={() => handleClockInOut(emp)}
              style={[styles.webBtn, active ? styles.webBtnDanger : styles.webBtnSuccess]}
            >
              <Ionicons name={active ? "time-outline" : "play-circle-outline"} size={16} color="#fff" />
              <Text style={styles.webBtnText} numberOfLines={1}>{active ? "Clock Out" : "Clock In"}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleLunchToggle(emp)}
              disabled={!active}
              style={[
                styles.webBtn,
                lunching ? styles.webBtnInfo : styles.webBtnWarn,
                !active && { opacity: 0.4, cursor: "not-allowed" as any },
              ]}
            >
              <Ionicons name="fast-food-outline" size={16} color="#fff" />
              <Text style={styles.webBtnText} numberOfLines={1}>{lunching ? "End Lunch" : "Start Lunch"}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => openEdit(emp)} style={[styles.webIconBtn]}>
              <Ionicons name="create-outline" size={18} color="#374151" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => confirmDelete(emp)} style={[styles.webIconBtn]}>
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const renderRightActions = (emp: Employee) => (
    <View style={styles.swipeActions}>
      <TouchableOpacity
        style={[styles.swipeBtn, { backgroundColor: "#fbbf24" }]}
        onPress={() => openEdit(emp)}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${emp.name}`}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="create-outline" size={20} color="#000" />
        <Text style={styles.swipeText}>Edit</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.swipeBtn, { backgroundColor: "#ef4444" }]}
        onPress={() => confirmDelete(emp)}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${emp.name}`}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="trash-outline" size={20} color="#fff" />
        <Text style={[styles.swipeText, { color: "#fff" }]}>
          {deletingId === emp._id ? "Deleting…" : "Delete"}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const fabBottom = useMemo(() => {
    // Base vertical offset from the safe-area bottom
    const base = 20 + insets.bottom;
  
    // Tiny extra lift for iOS landscape so we stay above the home indicator
    if (isIOS && isLandscape) {
      return base + 12;
    }
  
    return base;
  }, [insets.bottom, isIOS, isLandscape]);
  
  const fabRight = useMemo(() => 16 + insets.right, [insets.right]);
  

  // ---------- Render ----------
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isWeb ? "#fff" : "#fff", ...(isWeb ? { minHeight: 0 } : {}), }}>
      <KeyboardAvoidingView
        style={{ flex: 1, ...(isWeb ? { minHeight: 0 } : {}) }}
        behavior={isIOS ? "padding" : undefined}
        keyboardVerticalOffset={isIOS ? 0 : 0}
      >
        {/* FIXED header: web only (mobile uses sticky header inside list) */}
        {isWeb ? HeaderBand : null}

        {/* Scrolling area */}
        <View style={{ flex: 1, ...(isWeb ? { minHeight: 0 } : {}) }}>
          {isWebTable ? (
            <FlatList
              style={{ flex: 1 }}
              data={filteredEmployees}
              key={"web-table"}
              keyExtractor={(emp) => emp._id}
              renderItem={renderWebRow}
              ListHeaderComponent={WebToolbarHeader}
              stickyHeaderIndices={[0]}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingHorizontal: 24,
                paddingTop: 8,
                paddingBottom: 32,
              }}
              initialNumToRender={30}
              windowSize={9}
              onScroll={(e) => setHeaderElevated(e.nativeEvent.contentOffset.y > 2)}
              scrollEventThrottle={16}
            />          
          ) : (
            <FlatList
              style={{ flex: 1 }}
              data={dataCards}
              key={`cards-${columns}-${isWebCards ? "narrow" : "wide"}`}
              keyExtractor={(item: any) =>
                (item as any)?.__type ? `k-${(item as any).__type}` : (item as Employee)._id
              }
              numColumns={columns}
              columnWrapperStyle={columns > 1 ? { gap: 12, alignItems: "flex-start" } : undefined}
              renderItem={({ item }) => {
                if (useInlineStickyHeader && (item as any).__type === "stickyHeader") {
                  return StickyMobileHeader;
                }
                if (useInlineStickyHeader && (item as any).__type === "mobileHeader") {
                  return MobileListHeader;
                }
                return renderMobileCard({ item } as any);
              }}
              // Phones: sticky row 0; Tablets: no sticky row, header handled via ListHeaderComponent.
              stickyHeaderIndices={useInlineStickyHeader ? [0] : undefined}
              ListHeaderComponent={!useInlineStickyHeader ? MobileListHeader : undefined}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                padding: 16,
                paddingBottom: 120 + insets.bottom,
                backgroundColor: "#fff",
                width: "100%",
                maxWidth: 1200,
                alignSelf: "center",
              }}
              initialNumToRender={12}
              maxToRenderPerBatch={12}
              windowSize={7}
              removeClippedSubviews={!isWeb}
              onScroll={(e) => setHeaderElevated(e.nativeEvent.contentOffset.y > 2)}
              scrollEventThrottle={16}
              ListEmptyComponent={
                !loading ? (
                  <View style={{ padding: 24 }}>
                    <Text style={{ color: "#666" }}>No employees match your filters.</Text>
                  </View>
                ) : null
              }
            />
          )}
        </View>

        {/* FAB (native only) */}
        {!isWeb && (
          <View style={[styles.fabWrap, { bottom: fabBottom, right: fabRight }]}>
            <TouchableOpacity
              style={styles.fab}
              onPress={() => setAddVisible(true)}
              accessibilityLabel="Add employee"
            >
              <Ionicons name="add" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        )}


        {/* Add Employee Bottom Sheet */}
        <Modal
          visible={addVisible}
          transparent
          animationType="fade"
          presentationStyle={isIOS ? "overFullScreen" : undefined}
          statusBarTranslucent
          supportedOrientations={["portrait", "landscape"]}
          onRequestClose={() => setAddVisible(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setAddVisible(false)} />

          {isIOS ? (
            // iOS: keep KeyboardAvoidingView (works well with padding behavior)
            <KeyboardAvoidingView
              behavior="padding"
              style={{ flex: 1, justifyContent: "flex-end" }}
            >
              <View
                style={[
                  styles.sheet,
                  {
                    paddingBottom: Math.max(16, insets.bottom + 8),
                    maxWidth: 720,
                    alignSelf: "center",
                    width: "100%",
                    maxHeight: "88%",
                  },
                ]}
              >
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingBottom: 24 }}
                >
                  <Text style={styles.sectionTitle} numberOfLines={1} ellipsizeMode="tail">Add Employee</Text>

                  <View style={[styles.row, !isWeb && isWide && styles.rowWide]}>
                    <View style={[styles.col, !isWeb && isWide && styles.half]}>
                      <Text style={styles.label} numberOfLines={1}>Full Name</Text>
                      <TextInput
                        style={[styles.input, tName && nameError ? styles.inputError : null]}
                        value={name}
                        onChangeText={validateName}
                        onBlur={() => setTName(true)}
                        placeholder="e.g. Jane Smith"
                        placeholderTextColor="#777"
                        autoCapitalize="words"
                        returnKeyType="next"
                      />
                      {tName && nameError ? <Text style={styles.error}>{nameError}</Text> : <Text style={styles.helper}>First & last name.</Text>}
                    </View>

                    <View style={[styles.col, !isWeb && isWide && styles.half]}>
                      <Text style={styles.label} numberOfLines={1}>Email</Text>
                      <TextInput
                        style={[styles.input, tEmail && emailError ? styles.inputError : null]}
                        value={email}
                        onChangeText={validateEmail}
                        onBlur={() => setTEmail(true)}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        placeholder="name@example.com"
                        placeholderTextColor="#777"
                        returnKeyType="next"
                      />
                      {tEmail && emailError ? <Text style={styles.error}>{emailError}</Text> : <Text style={styles.helper}>Used for login & receipts.</Text>}
                    </View>
                  </View>

                  <View style={[styles.row, !isWeb && isWide && styles.rowWide]}>
                    <View style={[styles.col, !isWeb && isWide && styles.half]}>
                      <Text style={styles.label} numberOfLines={1}>Phone</Text>
                      <View style={[styles.inputWrapper, tPhone && phoneError ? styles.inputError : null]}>
                      <CountryPickerCompat
                        countryCode={countryCode}
                        onSelect={onSelectCountry}
                        callingCode={callingCode}
                      />
                        <Text style={styles.prefix}>+{callingCode}</Text>
                        <TextInput
                          value={phone}
                          onChangeText={validatePhone}
                          onBlur={() => setTPhone(true)}
                          keyboardType="number-pad"
                          inputMode="numeric"
                          placeholder={callingCode === "1" ? "XXX-XXX-XXXX" : "Phone number"}
                          placeholderTextColor="#777"
                          maxLength={12}
                          style={{ flex: 1, paddingVertical: isIOS ? 14 : 10, paddingLeft: 10 }}
                        />
                    </View>
                      {tPhone && phoneError ? <Text style={styles.error}>{phoneError}</Text> : <Text style={styles.helper}>Auto-formatted as you type.</Text>}
                    </View>

                    <View style={[styles.col, !isWeb && isWide && styles.half]}>
                      <Text style={styles.label} numberOfLines={1}>Role</Text>
                      <View>
                        <DropDownPicker
                          open={openRole}
                          value={role}
                          items={[
                            { label: "Admin", value: "admin" },
                            { label: "Staff", value: "staff" },
                          ]}
                          setOpen={setOpenRole}
                          setValue={(cb) => {
                            const next = (cb as any)(role);
                            validateRole(next);
                          }}
                          onChangeValue={(v) => validateRole(v as Role | null)}
                          placeholder="Select role"
                          listMode="MODAL"
                          style={styles.dropdown}
                          dropDownContainerStyle={styles.dropdownContainer}
                        />
                      </View>
                      {tRole && roleError ? <Text style={styles.error}>{roleError}</Text> : <Text style={styles.helper}>Choose Admin or Staff.</Text>}
                    </View>
                  </View>

                  {role === "staff" && (
                    <View style={styles.row}>
                      <View style={[styles.col, styles.half]}>
                        <Text style={styles.label} numberOfLines={1}>Hourly rate (BBD)</Text>
                        <TextInput
                          style={[styles.input, tRate && hourlyRateError ? styles.inputError : null]}
                          value={hourlyRate}
                          onChangeText={sanitiseRate}
                          onBlur={() => setTRate(true)}
                          keyboardType={isIOS ? "decimal-pad" : "numeric"}
                          inputMode="decimal"
                          placeholder="e.g. 12.50"
                          placeholderTextColor="#777"
                          maxLength={7}
                        />
                        {tRate && hourlyRateError ? <Text style={styles.error}>{hourlyRateError}</Text> : <Text style={styles.helper}>Up to 3 digits + 3 decimals.</Text>}
                      </View>
                    </View>
                  )}

                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={[styles.primaryBtn, submitting && { opacity: 0.7 }]}
                      onPress={handleAddEmployee}
                      disabled={submitting}
                      accessibilityRole="button"
                      accessibilityLabel="Add employee"
                    >
                      <Ionicons name="person-add-outline" size={18} color="#fff" />
                      <Text style={styles.primaryBtnText} numberOfLines={1}>{submitting ? "Saving…" : "Add Employee"}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.secondaryBtn} onPress={clearForm} accessibilityRole="button" accessibilityLabel="Clear form">
                      <Text style={styles.secondaryBtnText} numberOfLines={1}>Clear</Text>
                    </TouchableOpacity>

                    <View style={{ flex: 1 }} />
                    <TouchableOpacity style={[styles.secondaryBtn, { backgroundColor: "#eee" }]} onPress={() => setAddVisible(false)}>
                      <Text style={styles.secondaryBtnText} numberOfLines={1}>Close</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          ) : (
            // ANDROID: drive the sheet with keyboardHeight instead of KeyboardAvoidingView
            <View
              style={{
                flex: 1,
                justifyContent: "flex-end",
                paddingBottom: keyboardHeight,
              }}
            >
              <View
                style={[
                  styles.sheet,
                  {
                    paddingBottom: Math.max(16, insets.bottom + 8),
                    maxWidth: 720,
                    alignSelf: "center",
                    width: "100%",
                    maxHeight: "88%",
                  },
                ]}
              >
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingBottom: 24 }}
                >
                  <Text style={styles.sectionTitle} numberOfLines={1} ellipsizeMode="tail">Add Employee</Text>

                  <View style={[styles.row, !isWeb && isWide && styles.rowWide]}>
                    <View style={[styles.col, !isWeb && isWide && styles.half]}>
                      <Text style={styles.label} numberOfLines={1}>Full Name</Text>
                      <TextInput
                        style={[styles.input, tName && nameError ? styles.inputError : null]}
                        value={name}
                        onChangeText={validateName}
                        onBlur={() => setTName(true)}
                        placeholder="e.g. Jane Smith"
                        placeholderTextColor="#777"
                        autoCapitalize="words"
                        returnKeyType="next"
                      />
                      {tName && nameError ? <Text style={styles.error}>{nameError}</Text> : <Text style={styles.helper}>First & last name.</Text>}
                    </View>

                    <View style={[styles.col, !isWeb && isWide && styles.half]}>
                      <Text style={styles.label} numberOfLines={1}>Email</Text>
                      <TextInput
                        style={[styles.input, tEmail && emailError ? styles.inputError : null]}
                        value={email}
                        onChangeText={validateEmail}
                        onBlur={() => setTEmail(true)}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        placeholder="name@example.com"
                        placeholderTextColor="#777"
                        returnKeyType="next"
                      />
                      {tEmail && emailError ? <Text style={styles.error}>{emailError}</Text> : <Text style={styles.helper}>Used for login & receipts.</Text>}
                    </View>
                  </View>

                  <View style={[styles.row, !isWeb && isWide && styles.rowWide]}>
                    <View style={[styles.col, !isWeb && isWide && styles.half]}>
                      <Text style={styles.label} numberOfLines={1}>Phone</Text>
                      <View style={[styles.inputWrapper, tPhone && phoneError ? styles.inputError : null]}>
                      <CountryPickerCompat
                        countryCode={countryCode}
                        onSelect={onSelectCountry}
                        callingCode={callingCode}
                      />
                        <Text style={styles.prefix}>+{callingCode}</Text>
                        <TextInput
                          value={phone}
                          onChangeText={validatePhone}
                          onBlur={() => setTPhone(true)}
                          keyboardType="number-pad"
                          inputMode="numeric"
                          placeholder={callingCode === "1" ? "XXX-XXX-XXXX" : "Phone number"}
                          placeholderTextColor="#777"
                          maxLength={12}
                          style={{ flex: 1, paddingVertical: isIOS ? 14 : 10, paddingLeft: 10 }}
                        />
                    </View>
                      {tPhone && phoneError ? <Text style={styles.error}>{phoneError}</Text> : <Text style={styles.helper}>Auto-formatted as you type.</Text>}
                    </View>

                    <View style={[styles.col, !isWeb && isWide && styles.half]}>
                      <Text style={styles.label} numberOfLines={1}>Role</Text>
                      <View>
                        <DropDownPicker
                          open={openRole}
                          value={role}
                          items={[
                            { label: "Admin", value: "admin" },
                            { label: "Staff", value: "staff" },
                          ]}
                          setOpen={setOpenRole}
                          setValue={(cb) => {
                            const next = (cb as any)(role);
                            validateRole(next);
                          }}
                          onChangeValue={(v) => validateRole(v as Role | null)}
                          placeholder="Select role"
                          listMode="MODAL"
                          style={styles.dropdown}
                          dropDownContainerStyle={styles.dropdownContainer}
                        />
                      </View>
                      {tRole && roleError ? <Text style={styles.error}>{roleError}</Text> : <Text style={styles.helper}>Choose Admin or Staff.</Text>}
                    </View>
                  </View>

                  {role === "staff" && (
                    <View style={styles.row}>
                      <View style={[styles.col, styles.half]}>
                        <Text style={styles.label} numberOfLines={1}>Hourly rate (BBD)</Text>
                        <TextInput
                          style={[styles.input, tRate && hourlyRateError ? styles.inputError : null]}
                          value={hourlyRate}
                          onChangeText={sanitiseRate}
                          onBlur={() => setTRate(true)}
                          keyboardType={isIOS ? "decimal-pad" : "numeric"}
                          inputMode="decimal"
                          placeholder="e.g. 12.50"
                          placeholderTextColor="#777"
                          maxLength={7}
                        />
                        {tRate && hourlyRateError ? <Text style={styles.error}>{hourlyRateError}</Text> : <Text style={styles.helper}>Up to 3 digits + 3 decimals.</Text>}
                      </View>
                    </View>
                  )}

                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={[styles.primaryBtn, submitting && { opacity: 0.7 }]}
                      onPress={handleAddEmployee}
                      disabled={submitting}
                      accessibilityRole="button"
                      accessibilityLabel="Add employee"
                    >
                      <Ionicons name="person-add-outline" size={18} color="#fff" />
                      <Text style={styles.primaryBtnText} numberOfLines={1}>{submitting ? "Saving…" : "Add Employee"}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.secondaryBtn} onPress={clearForm} accessibilityRole="button" accessibilityLabel="Clear form">
                      <Text style={styles.secondaryBtnText} numberOfLines={1}>Clear</Text>
                    </TouchableOpacity>

                    <View style={{ flex: 1 }} />
                    <TouchableOpacity style={[styles.secondaryBtn, { backgroundColor: "#eee" }]} onPress={() => setAddVisible(false)}>
                      <Text style={styles.secondaryBtnText} numberOfLines={1}>Close</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </View>
          )}
        </Modal>

        {/* Edit Modal */}
        <Modal
          visible={editVisible}
          transparent
          animationType="fade"
          presentationStyle={isIOS ? "overFullScreen" : undefined}
          statusBarTranslucent
          supportedOrientations={["portrait", "landscape"]}
          onRequestClose={() => setEditVisible(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setEditVisible(false)} />

          {Platform.OS === "ios" ? (
            <KeyboardAvoidingView
              behavior="padding"
              style={{ flex: 1, justifyContent: "flex-end" }}
            >
              <View
                style={[
                  styles.sheet,
                  {
                    paddingBottom: Math.max(16, insets.bottom + 8),
                    maxWidth: 720,
                    alignSelf: "center",
                    width: "100%",
                    maxHeight: "88%",
                  },
                ]}
              >
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingBottom: 24 }}
                >
                  <Text style={styles.sectionTitle} numberOfLines={1} ellipsizeMode="tail">Edit Employee</Text>
                  {editing && (
                    <>
                      <Text style={styles.label} numberOfLines={1}>Full Name</Text>
                      <TextInput
                        style={styles.input}
                        value={editing.name}
                        onChangeText={(t) => setEditing({ ...editing, name: t })}
                        autoCapitalize="words"
                      />

                      <Text style={styles.label} numberOfLines={1}>Email</Text>
                      <TextInput
                        style={styles.input}
                        value={editing.email}
                        onChangeText={(t) => setEditing({ ...editing, email: t })}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                      />

                      <Text style={styles.label} numberOfLines={1}>Phone</Text>
                      <TextInput
                        style={styles.input}
                        value={editing.phone}
                        onChangeText={(t) => setEditing({ ...editing, phone: t })}
                        keyboardType="number-pad"
                        inputMode="numeric"
                      />

                      <Text style={styles.label} numberOfLines={1}>Role</Text>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        {(["admin", "staff"] as Role[]).map((r) => (
                          <TouchableOpacity
                            key={r}
                            style={[
                              styles.badgeChoice,
                              editing.role === r && { backgroundColor: "#E9D5FF", borderColor: "#6a0dad" },
                            ]}
                            onPress={() => setEditing({ ...editing, role: r })}
                          >
                            <Text style={{ color: "#6a0dad", fontWeight: "600" }} numberOfLines={1}>{r.toUpperCase()}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {editing.role === "staff" && (
                        <>
                          <Text style={styles.label} numberOfLines={1}>Hourly rate (BBD)</Text>
                          <TextInput
                            style={styles.input}
                            value={String(editing.hourlyRate ?? "")}
                            onChangeText={(v) => {
                              let x = v.replace(/[^\d.]/g, "");
                              const dot = x.indexOf(".");
                              if (dot !== -1) x = x.slice(0, dot + 1) + x.slice(dot + 1).replace(/\./g, "");
                              x = x.replace(/^(\d{0,3})(\d*)$/, (_m, a, b) => a + b);
                              x = x.replace(/^(\d{1,3})(?:\.(\d{0,3}))?.*$/, (_m, a, b) => (b !== undefined ? `${a}.${b}` : a));
                              setEditing({ ...editing, hourlyRate: x ? Number(x) : (undefined as any) });
                            }}
                            keyboardType={isIOS ? "decimal-pad" : "numeric"}
                            inputMode="decimal"
                            placeholder="e.g. 12.50"
                            maxLength={7}
                          />
                        </>
                      )}

                      <View style={styles.modalActions}>
                        <TouchableOpacity style={styles.secondaryBtn} onPress={() => setEditVisible(false)}>
                          <Text style={styles.secondaryBtnText} numberOfLines={1}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.primaryBtn} onPress={saveEdit}>
                          <Ionicons name="save-outline" size={18} color="#fff" />
                          <Text style={styles.primaryBtnText} numberOfLines={1}>Save</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          ) : (
            <View
              style={{
                flex: 1,
                justifyContent: "flex-end",
                paddingBottom: keyboardHeight,
              }}
            >
              <View
                style={[
                  styles.sheet,
                  {
                    paddingBottom: Math.max(16, insets.bottom + 8),
                    maxWidth: 720,
                    alignSelf: "center",
                    width: "100%",
                    maxHeight: "88%",
                  },
                ]}
              >
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingBottom: 24 }}
                >
                  <Text style={styles.sectionTitle} numberOfLines={1} ellipsizeMode="tail">Edit Employee</Text>
                  {editing && (
                    <>
                      <Text style={styles.label} numberOfLines={1}>Full Name</Text>
                      <TextInput
                        style={styles.input}
                        value={editing.name}
                        onChangeText={(t) => setEditing({ ...editing, name: t })}
                        autoCapitalize="words"
                      />

                      <Text style={styles.label} numberOfLines={1}>Email</Text>
                      <TextInput
                        style={styles.input}
                        value={editing.email}
                        onChangeText={(t) => setEditing({ ...editing, email: t })}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                      />

                      <Text style={styles.label} numberOfLines={1}>Phone</Text>
                      <TextInput
                        style={styles.input}
                        value={editing.phone}
                        onChangeText={(t) => setEditing({ ...editing, phone: t })}
                        keyboardType="number-pad"
                        inputMode="numeric"
                      />

                      <Text style={styles.label} numberOfLines={1}>Role</Text>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        {(["admin", "staff"] as Role[]).map((r) => (
                          <TouchableOpacity
                            key={r}
                            style={[
                              styles.badgeChoice,
                              editing.role === r && { backgroundColor: "#E9D5FF", borderColor: "#6a0dad" },
                            ]}
                            onPress={() => setEditing({ ...editing, role: r })}
                          >
                            <Text style={{ color: "#6a0dad", fontWeight: "600" }} numberOfLines={1}>{r.toUpperCase()}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {editing.role === "staff" && (
                        <>
                          <Text style={styles.label} numberOfLines={1}>Hourly rate (BBD)</Text>
                          <TextInput
                            style={styles.input}
                            value={String(editing.hourlyRate ?? "")}
                            onChangeText={(v) => {
                              let x = v.replace(/[^\d.]/g, "");
                              const dot = x.indexOf(".");
                              if (dot !== -1) x = x.slice(0, dot + 1) + x.slice(dot + 1).replace(/\./g, "");
                              x = x.replace(/^(\d{0,3})(\d*)$/, (_m, a, b) => a + b);
                              x = x.replace(/^(\d{1,3})(?:\.(\d{0,3}))?.*$/, (_m, a, b) => (b !== undefined ? `${a}.${b}` : a));
                              setEditing({ ...editing, hourlyRate: x ? Number(x) : (undefined as any) });
                            }}
                            keyboardType={isIOS ? "decimal-pad" : "numeric"}
                            inputMode="decimal"
                            placeholder="e.g. 12.50"
                            maxLength={7}
                          />
                        </>
                      )}

                      <View style={styles.modalActions}>
                        <TouchableOpacity style={styles.secondaryBtn} onPress={() => setEditVisible(false)}>
                          <Text style={styles.secondaryBtnText} numberOfLines={1}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.primaryBtn} onPress={saveEdit}>
                          <Ionicons name="save-outline" size={18} color="#fff" />
                          <Text style={styles.primaryBtnText} numberOfLines={1}>Save</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </ScrollView>
              </View>
            </View>
          )}
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default gestureHandlerRootHOC(EmployeesScreen);

const styles = StyleSheet.create({
  // Header band (fixed)
  headerBand: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "web" ? 0 : 0,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  headerBandWeb: {
    backgroundColor: "#ffffff",
    borderBottomColor: "#e5e7eb",
    paddingTop: 80,
    paddingVertical: 12,
    paddingHorizontal: 24, // WEB: fuller edge padding
  
    // NEW — stick the band at the top on web
    position: "sticky" as any,
    top: 0,
    zIndex: 10,
  },  
  headerRow: {
    width: "100%",
    maxWidth: 1200,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  headerRowWeb: {
    maxWidth: 99999, // WEB: remove mobile constraint
    alignSelf: "stretch",
  },

  // --- Sticky mobile header (matches Settings) ---
  stickyHeader: {
    backgroundColor: "#fff",
    paddingTop: 0,
    paddingBottom: 10,
    zIndex: 10,
    paddingHorizontal: 0,
  },
  stickyHeaderElevated: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },

  // Cards & text
  card: {
    backgroundColor: "#fff",
    padding: 14,
    marginBottom: 8,
  },
  headerBandElevated: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 3 },
      default: { boxShadow: "0 2px 8px rgba(0,0,0,0.06)" } as any,
    }),
  },  

  sectionTitle: { fontSize: 20,
    fontWeight: "800",
    color: "#6a0dad",
    marginBottom: 8,
  },

  // Large title
  largeTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: "#6a0dad",
  },
  cardHelper: {
    color: "#666",
    marginTop: 6,
    marginBottom: 8,
    flexBasis: "100%",
    flexShrink: 1,
    ...(Platform.OS === "web" ? { wordBreak: "break-word" } : {} as any),
  },

  // Summary (mobile)
  summaryCard: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#eee",
    paddingVertical: 8,
  },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryNum: { fontSize: 18, fontWeight: "800", color: "#111" },
  summaryLabel: { color: "#666", marginTop: 4 },

  // Form layout
  row: { gap: 12 },
  rowWide: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  col: { flex: 1 },
  half: { flex: 1 },
  twoThirds: { flex: 2 },
  third: { flex: 1 },

  label: { marginTop: 8, marginBottom: 6, color: "#333", fontWeight: "600" },
  helper: { fontSize: 12, color: "#777", marginTop: 4 },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderColor: "#ddd",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 1,
    backgroundColor: "#fafafa",
  },
  prefix: { marginHorizontal: 8, fontWeight: "600", fontSize: 16, color: "#333", display: "none" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#fafafa",
  },
  inputError: { borderColor: "#ef4444" },
  dropdown: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    backgroundColor: "#fafafa",
    paddingHorizontal: 10,
    paddingVertical: 9,   // smaller vertical padding
    minHeight: 36,        // or height: 36 if you want it fixed
    justifyContent: "center", // keep text vertically centered
  },
  dropdownContainer: {
    borderColor: "#ddd",
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  error: { color: "#ef4444", fontSize: 12, marginTop: 4 },

  actions: { flexDirection: "row", gap: 10, marginTop: 14, alignItems: "center" },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#6a0dad",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700" },
  secondaryBtn: {
    backgroundColor: "#eee",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  secondaryBtnText: { color: "#333", fontWeight: "700" },

  // Employee card (mobile)
  employeeCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#f9f9ff",
    padding: 14,
    marginBottom: 10,
    borderRadius: 12,
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: "#eee",
  },
  // Extra rules for tablet
  employeeCardTablet: {
    padding: 18,              // a little more breathing room
    marginHorizontal: 8,
    maxWidth: 380,            // prevents super-wide “stretched” cards
    alignSelf: "center",
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  employeeName: { fontWeight: "800", fontSize: 16, color: "#6a0dad" },
  employeeInfo: { fontSize: 14, color: "#333", marginBottom: 2 },

  statusDot: { width: 10, height: 10, borderRadius: 6, backgroundColor: "#d1d5db" },
  statusOn: { backgroundColor: "#22c55e" },
  statusOff: { backgroundColor: "#d1d5db" },

  roleBadge: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
  },
  roleAdmin: { backgroundColor: "#F5EEFF", borderColor: "#d6bcfa" },
  roleStaff: { backgroundColor: "#ECFDF5", borderColor: "#bbf7d0" },
  roleText: { fontSize: 12, fontWeight: "800" },

  cardFooter: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 10, flexWrap: "wrap" },

  clockButton: { flexDirection: "row", gap: 8, alignItems: "center", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  clockText: { color: "#fff", fontWeight: "700" },

  lunchButton: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#fbbf24",
  },
  lunchText: { color: "#fff", fontWeight: "700" },

  shiftMeta: { color: "#555", fontSize: 12 },

  toggleHistory: {
    color: "#6a0dad",
    fontWeight: "700",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : null),
  },

  history: { marginTop: 8, backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: "#eee" },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f1f1",
    gap: 8,
  },
  historyDate: { width: 96, color: "#333", fontWeight: "600" },
  historyDur: { flex: 1, textAlign: "left", color: "#333", fontWeight: "600" },
  historyStatus: { width: 88, textAlign: "center", paddingVertical: 4, borderRadius: 999, overflow: "hidden", fontWeight: "700" },
  statusDone: { backgroundColor: "#EEF2FF", color: "#3730a3" },
  statusActive: { backgroundColor: "#FEF3C7", color: "#92400e" },
  historyEmpty: { padding: 10, color: "#666" },

  // Swipe actions (mobile)
  swipeActions: { flexDirection: "row", alignItems: "center", gap: 2, padding: 2, marginBottom: 9},
  swipeBtn: { justifyContent: "center", alignItems: "center", borderRadius: 8, width: 85, height: "100%" },
  swipeText: { fontWeight: "700", color: "#000", marginTop: 4 },

  // FAB (position only — native)
  fabWrap: {
    position: "absolute",
    zIndex: 50,
    elevation: 50,
    // Let touches pass through around the button so the list still scrolls
    pointerEvents: "box-none" as any,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#6a0dad",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    ...Platform.select({
      ios: {
        marginBottom: 15,
      },
      android: {
        elevation: 6,
        marginBottom: 55,
      },
      default: {},
    }),
  },


  // Modal overlay + sheet
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 10 },
      android: { elevation: 16 },
      default: {},
    }),
  },

  // z-index fix for dropdown column
  zFix: {
    ...Platform.select({
      ios: { zIndex: 1000 },
      android: { elevation: 2 },
      default: { zIndex: 1000 },
    }),
  },

  // (legacy modal styles kept)
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: "85%" },
  modalActions: { flexDirection: "row", justifyContent: "space-between", marginTop: 16, alignItems: "center" },
  badgeChoice: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#f9f9f9",
  },

  // ---------- WEB-ONLY STYLES ----------
  webHeaderBlock: { zIndex: 5 },

  webPrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#6a0dad",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : null),
  },
  webPrimaryBtnText: { color: "#fff", fontWeight: "700" },

  // Sticky, compact toolbar
  webToolbarWrap: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    position: "sticky" as any,
    top: 0,
    zIndex: 5,
  },
  webToolbarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
    flexWrap: "wrap",
  },
  webSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    flexGrow: 1,
    minWidth: 260,
  },
  webSearchInput: {
    flex: 1,
    paddingVertical: 2,
    outlineStyle: "none" as any,
  },
  webFilterWrap: {
    minWidth: 140,
  },
  webDropdown: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 8,   // 👈 smaller vertical padding
    minHeight: 36,        // or height: 36 if you want it fixed
    justifyContent: "center", // keep text vertically centered
  },
  webChipsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginLeft: "auto",
  },
  webChip: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "#f3f4f6",
    borderRadius: 999,
  },
  webChipGreen: { backgroundColor: "#ecfdf5" },
  webChipBlue: { backgroundColor: "#eff6ff" },
  webChipText: { color: "#374151", fontWeight: "700", fontSize: 12 },

  webTableHeader: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  webTh: { fontWeight: "800", color: "#374151", fontSize: 12 },

  webTr: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderColor: "#f3f4f6",
  },
  webTrAlt: { backgroundColor: "#fcfcff" }, // zebra rows
  webTd: { justifyContent: "center" },
  webName: { fontWeight: "700", color: "#111827" },
  webCellText: { color: "#111827" },

  webDot: { width: 10, height: 10, borderRadius: 6 },
  webDotOn: { backgroundColor: "#22c55e" },
  webDotOff: { backgroundColor: "#d1d5db" },

  webRoleBadge: {
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  webRoleAdmin: { backgroundColor: "#F5EEFF", borderColor: "#d6bcfa" },
  webRoleStaff: { backgroundColor: "#ECFDF5", borderColor: "#bbf7d0" },
  webRoleText: { fontSize: 11, fontWeight: "800" },

  webStatus: { fontWeight: "700", fontSize: 12 },
  webStatusActive: { color: "#065f46" },
  webStatusDone: { color: "#6b7280" },

  // Wrap actions so they don't overflow on mid-width screens
  webActions: { flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" },
  webBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : null),
  },
  webBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  webBtnSuccess: { backgroundColor: "#22c55e" },
  webBtnDanger: { backgroundColor: "#ef4444" },
  webBtnWarn: { backgroundColor: "#f59e0b" },
  webBtnInfo: { backgroundColor: "#3b82f6" },

  webIconBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    backgroundColor: "#fff",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : null),
  },
});
