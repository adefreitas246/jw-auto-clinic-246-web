import { useAuth } from "@/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import CountryPicker, { Country, CountryCode } from "react-native-country-picker-modal";
import DropDownPicker from "react-native-dropdown-picker";
import "react-native-gesture-handler";
import { Swipeable, gestureHandlerRootHOC } from "react-native-gesture-handler";

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
  employee: string;     // employee.name
  date: string;         // "YYYY-MM-DD"
  clockIn: string;      // "01:23:45 PM"
  clockOut?: string;    // undefined if active
  status: "Active" | "Completed";
}

function EmployeesScreen() {
  const { user } = useAuth();
  const { width, height } = useWindowDimensions();
  const isWide = width > height;

  // ---------- Data ----------
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [tick, setTick] = useState(0); // live duration ticker

  // ---------- Add Form ----------
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
  const [countryCode, setCountryCode] = useState<CountryCode>("BB"); // Barbados
  const [callingCode, setCallingCode] = useState("1");
  const [country, setCountry] = useState<Country | null>(null);

  // ---------- Filters/Search ----------
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [openRoleFilter, setOpenRoleFilter] = useState(false);

  // ---------- UI States ----------
  const [clockingIds, setClockingIds] = useState<Set<string>>(new Set());
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set()); // show shift history
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
      console.error("Error fetching employees", err);
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
      console.error("Error fetching shifts", err);
    }
  }, [user]);

  useEffect(() => {
    // initial load
    fetchEmployees();
    fetchShifts();

    // background auto-refresh (no pull-to-refresh & no button)
    const interval = setInterval(() => {
      fetchEmployees();
      fetchShifts();
      setTick((t) => t + 1);
    }, 5000);

    // per-second ticker for live active shift duration
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
    setCallingCode(c.callingCode[0] || "");
    setCountry(c);
    setPhone("");
    setPhoneError("");
  };

  const validateRole = (value: Role | null) => {
    setRole(value);
    if (tRole) {
      setRoleError(value === "admin" || value === "staff" ? "" : "Please select a role.");
    }
  };

  // Allow up to 3 digits + optional . and 2 decimals (e.g. "120", "10.50")
  const sanitiseRate = (val: string) => {
    let v = val.replace(/[^\d.]/g, "");
    const dot = v.indexOf(".");
    if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, "");
    v = v.replace(/^(\d{0,3})(\d*)$/, (_m, a, b) => a + b);
    v = v.replace(/^(\d{1,3})(?:\.(\d{0,2}))?.*$/, (_m, a, b) => (b !== undefined ? `${a}.${b}` : a));
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
    // newest first per employee
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

    const valid =
      !nameError &&
      !emailError &&
      !phoneError &&
      !!role &&
      (role === "admin" || (role === "staff" && !!hourlyRate));

    if (!valid) {
      if (!name) setNameError("Enter full name (e.g. Jane Smith).");
      if (!email) setEmailError("Enter a valid email address.");
      if (!phone) setPhoneError(`Invalid format. Ex: ${callingCode}-XXX-XXX-XXXX`);
      if (!role) setRoleError("Please select a role.");
      if (role === "staff" && !hourlyRate) setHourlyRateError("Hourly rate is required for staff.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch(`${api}/api/employees`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user?.token}`,
        },
        body: JSON.stringify({
          name,
          email,
          phone,
          role,
          hourlyRate: role === "staff" ? parseFloat(hourlyRate || "0") : 0,
          password: "", // trigger default in schema
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error?.error || "Failed to add employee");
      }

      await refetchAll();
      // reset form
      setName(""); setEmail(""); setPhone(""); setRole(null); setHourlyRate("");
      setCountryCode("BB"); setCallingCode("1"); setCountry(null);
      setTName(false); setTEmail(false); setTPhone(false); setTRole(false); setTRate(false);
      setNameError(""); setEmailError(""); setPhoneError(""); setRoleError(""); setHourlyRateError("");
      Keyboard.dismiss();
    } catch (err) {
      console.error(err);
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
        // Clock in
        await fetch(`${api}/api/shifts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${user?.token}` },
          body: JSON.stringify({ employee: emp.name, date: dateStr, clockIn: timeStr }),
        });
      } else {
        // Clock out
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

      // Toggle clockedIn on employee
      await fetch(`${api}/api/employees/${emp._id}/clock`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${user?.token}` },
      });

      await refetchAll();
    } catch (err) {
      console.error("Clock error:", err);
      Alert.alert("Error", "Clock in/out failed.");
    } finally {
      const s2 = new Set(clockingIds); s2.delete(emp._id); setClockingIds(s2);
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

  // ---------- UI ----------
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

  const Header = (
    <View>
      <Text style={styles.logo}>Add Employee</Text>
      {/* Add Form (compact card) */}
      <View style={styles.card}>
        
        <Text style={styles.cardHelper}>Add team members and set their roles. Staff require an hourly rate.</Text>

        <View style={[styles.row, isWide && styles.rowWide]}>
          <View style={[styles.col, isWide && styles.half]}>
            <Text style={styles.label}>Full name</Text>
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

          <View style={[styles.col, isWide && styles.half]}>
            <Text style={styles.label}>Email</Text>
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

        <View style={[styles.row, isWide && styles.rowWide]}>
          <View style={[styles.col, isWide && styles.half]}>
            <Text style={styles.label}>Phone</Text>
            <View style={[styles.inputWrapper, tPhone && phoneError ? styles.inputError : null]}>
              <CountryPicker
                countryCode={countryCode}
                withFilter
                withFlag
                withCallingCode
                onSelect={onSelectCountry}
              />
              <Text style={styles.prefix}>+{callingCode}</Text>
              <TextInput
                value={phone}
                onChangeText={validatePhone}
                onBlur={() => setTPhone(true)}
                keyboardType="number-pad"
                inputMode="numeric"
                placeholder="XXX-XXX-XXXX"
                placeholderTextColor="#777"
                maxLength={12}
                style={{ flex: 1, paddingVertical: Platform.OS === "ios" ? 14 : 10 }}
              />
            </View>
            {tPhone && phoneError ? <Text style={styles.error}>{phoneError}</Text> : <Text style={styles.helper}>Auto-formatted as you type.</Text>}
          </View>

          <View style={[styles.col, isWide && styles.half]}>
            <Text style={styles.label}>Role</Text>
            <View style={[Platform.OS === "ios" ? { zIndex: openRole ? 4000 : 1 } : null]}>
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
                style={styles.dropdown}
                dropDownContainerStyle={[styles.dropdownContainer, Platform.OS === "ios" ? { zIndex: 5000 } : null]}
                listMode={Platform.OS === "web" ? "MODAL" : "SCROLLVIEW"}
                modalTitle="Select role"
              />
            </View>
            {tRole && roleError ? <Text style={styles.error}>{roleError}</Text> : <Text style={styles.helper}>Choose Admin or Staff.</Text>}
          </View>
        </View>

        {role === "staff" && (
          <View style={styles.row}>
            <View style={[styles.col, styles.half]}>
              <Text style={styles.label}>Hourly rate (BBD)</Text>
              <TextInput
                style={[styles.input, tRate && hourlyRateError ? styles.inputError : null]}
                value={hourlyRate}
                onChangeText={sanitiseRate}
                onBlur={() => setTRate(true)}
                keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
                inputMode="decimal"
                placeholder="e.g. 12.50"
                placeholderTextColor="#777"
                maxLength={7} // "999.99"
              />
              {tRate && hourlyRateError ? <Text style={styles.error}>{hourlyRateError}</Text> : <Text style={styles.helper}>Up to 3 digits + 2 decimals.</Text>}
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
            <Text style={styles.primaryBtnText}>{submitting ? "Saving…" : "Add Employee"}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={clearForm} accessibilityRole="button" accessibilityLabel="Clear form">
            <Text style={styles.secondaryBtnText}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* List Controls */}
      <View style={[styles.card, { marginTop: 12 }]}>
        <Text style={styles.sectionTitle}>Employees</Text>
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
            <Text style={styles.helper}>{filteredEmployees.length} result{filteredEmployees.length === 1 ? "" : "s"}</Text>
          </View>
          <View style={[styles.col, isWide && styles.third, Platform.OS === "ios" ? { zIndex: openRoleFilter ? 3500 : 1 } : null]}>
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
              dropDownDirection="TOP"
              style={styles.dropdown}
              dropDownContainerStyle={[styles.dropdownContainer, Platform.OS === "ios" ? { zIndex: 3600 } : null]}
              listMode={Platform.OS === "web" ? "MODAL" : "SCROLLVIEW"}
              modalTitle="Filter by role"
            />
          </View>
        </View>
      </View>
    </View>
  );

  const renderItem = ({ item }: { item: Employee }) => {
    const empShifts = shiftsByEmployee.get(item.name) || [];
    const last = empShifts[0];
    const liveMs = last && !last.clockOut ? shiftEnd(last).getTime() - shiftStart(last).getTime() : 0;

    const CardInner = (
      <View style={styles.employeeCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.employeeName}>{item.name}</Text>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {/* Web inline actions (swipe is awkward on web) */}
            {Platform.OS === "web" && (
              <>
                <TouchableOpacity
                  onPress={() => openEdit(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${item.name}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="create-outline" size={18} color="#6a0dad" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => confirmDelete(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${item.name}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </TouchableOpacity>
              </>
            )}

            <View style={[styles.roleBadge, item.role === "admin" ? styles.roleAdmin : styles.roleStaff]}>
              <Text style={[styles.roleText, item.role === "admin" ? { color: "#6a0dad" } : { color: "#065f46" }]}>
                {String(item.role).toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.employeeInfo}>{item.email}</Text>
        <Text style={styles.employeeInfo}>{item.phone}</Text>
        {typeof item.hourlyRate === "number" && item.role === "staff" && (
          <Text style={styles.employeeInfo}>{`$${item.hourlyRate.toFixed(2)}/hour`}</Text>
        )}

        <View style={styles.cardFooter}>
          <TouchableOpacity
            style={[
              styles.clockButton,
              item.clockedIn ? { backgroundColor: "#ef4444" } : { backgroundColor: "#22c55e" },
              clockingIds.has(item._id) && { opacity: 0.7 },
            ]}
            onPress={() => handleClockInOut(item)}
            disabled={clockingIds.has(item._id)}
            accessibilityRole="button"
            accessibilityLabel={`${item.clockedIn ? "Clock out" : "Clock in"} ${item.name}`}
          >
            <Ionicons name={item.clockedIn ? "time-outline" : "play-circle-outline"} size={18} color="#fff" />
            <Text style={styles.clockText}>
              {clockingIds.has(item._id) ? "Processing…" : item.clockedIn ? "Clock Out" : "Clock In"}
            </Text>
          </TouchableOpacity>

          {last ? (
            <Text style={styles.shiftMeta}>
              {last.status === "Completed"
                ? `Last: ${formatDuration(shiftEnd(last).getTime() - shiftStart(last).getTime())}`
                : `Active: ${formatDuration(liveMs)}`}
            </Text>
          ) : (
            <Text style={styles.shiftMeta}>No shifts yet</Text>
          )}

          <TouchableOpacity
            onPress={() => {
              const s = new Set(expandedCards);
              s.has(item._id) ? s.delete(item._id) : s.add(item._id);
              setExpandedCards(s);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${expandedCards.has(item._id) ? "Hide" : "View"} history for ${item.name}`}
          >
            <Text style={styles.toggleHistory}>
              {expandedCards.has(item._id) ? "Hide history ▲" : "View history ▼"}
            </Text>
          </TouchableOpacity>
        </View>

        {expandedCards.has(item._id) && (
          <View style={styles.history}>
            {empShifts.slice(0, 3).map((s) => {
              const dur = formatDuration(shiftEnd(s).getTime() - shiftStart(s).getTime());
              return (
                <View key={s._id} style={styles.historyRow}>
                  <Text style={styles.historyDate}>{s.date}</Text>
                  <Text style={styles.historyTime}>
                    {s.clockIn} – {s.clockOut ?? "…"}
                  </Text>
                  <Text style={styles.historyDur}>{dur}</Text>
                  <Text style={[styles.historyStatus, s.status === "Completed" ? styles.statusDone : styles.statusActive]}>
                    {s.status}
                  </Text>
                </View>
              );
            })}
            {empShifts.length === 0 && <Text style={styles.historyEmpty}>No shift records.</Text>}
          </View>
        )}
      </View>
    );

    if (Platform.OS === "web") return CardInner; // inline actions on web

    return (
      <Swipeable renderRightActions={() => renderRightActions(item)} overshootRight={false}>
        {CardInner}
      </Swipeable>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#fff" }}
      behavior={Platform.select({ ios: "padding", android: undefined })}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      <FlatList
        data={filteredEmployees}
        key={isWide ? "wide" : "narrow"} // force re-layout on rotation
        keyExtractor={(item) => item._id}
        numColumns={isWide ? 3 : 1}
        columnWrapperStyle={isWide ? { gap: 10, justifyContent: "flex-start" } : undefined}
        ListHeaderComponent={Header}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 120, backgroundColor: "#fff" }}
        ListEmptyComponent={
          !loading ? (
            <View style={{ padding: 24 }}>
              <Text style={{ color: "#666" }}>No employees match your filters.</Text>
            </View>
          ) : null
        }
      />

      {/* Edit Modal */}
      <Modal visible={editVisible} transparent animationType="slide" onRequestClose={() => setEditVisible(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Edit Employee</Text>
            {editing && (
              <>
                <Text style={styles.label}>Full name</Text>
                <TextInput
                  style={styles.input}
                  value={editing.name}
                  onChangeText={(t) => setEditing({ ...editing, name: t })}
                  autoCapitalize="words"
                />

                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={editing.email}
                  onChangeText={(t) => setEditing({ ...editing, email: t })}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                />

                <Text style={styles.label}>Phone</Text>
                <TextInput
                  style={styles.input}
                  value={editing.phone}
                  onChangeText={(t) => setEditing({ ...editing, phone: t })}
                  keyboardType="number-pad"
                  inputMode="numeric"
                />

                <Text style={styles.label}>Role</Text>
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
                      <Text style={{ color: "#6a0dad", fontWeight: "600" }}>{r.toUpperCase()}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {editing.role === "staff" && (
                  <>
                    <Text style={styles.label}>Hourly rate (BBD)</Text>
                    <TextInput
                      style={styles.input}
                      value={String(editing.hourlyRate ?? "")}
                      onChangeText={(v) => {
                        let x = v.replace(/[^\d.]/g, "");
                        const dot = x.indexOf(".");
                        if (dot !== -1) x = x.slice(0, dot + 1) + x.slice(dot + 1).replace(/\./g, "");
                        x = x.replace(/^(\d{0,3})(\d*)$/, (_m, a, b) => a + b);
                        x = x.replace(/^(\d{1,3})(?:\.(\d{0,2}))?.*$/, (_m, a, b) => (b !== undefined ? `${a}.${b}` : a));
                        setEditing({ ...editing, hourlyRate: x ? Number(x) : (undefined as any) });
                      }}
                      keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
                      inputMode="decimal"
                      placeholder="e.g. 12.50"
                      maxLength={7}
                    />
                  </>
                )}

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={() => setEditVisible(false)}>
                    <Text style={styles.secondaryBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.primaryBtn} onPress={saveEdit}>
                    <Ionicons name="save-outline" size={18} color="#fff" />
                    <Text style={styles.primaryBtnText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

export default gestureHandlerRootHOC(EmployeesScreen);

const styles = StyleSheet.create({
  // Containers
  card: {
    backgroundColor: "#fff",
    // borderRadius: 12,
    padding: 14,
    // borderWidth: 1,
    // borderColor: "#eee",
    // shadowColor: "#000",
    // shadowOpacity: 0.04,
    // shadowRadius: 6,
    // elevation: 1,
    marginBottom: 8,
  },
  logo: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#6a0dad",
    marginTop: Platform.OS === "web" ? 20 : 40,
  },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: "#6a0dad" },
  cardHelper: { color: "#666", marginTop: 6, marginBottom: 8 },

  // Form layout
  row: { gap: 12 },
  rowWide: { flexDirection: "row" },
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
    paddingHorizontal: 12,
    backgroundColor: "#fafafa",
  },
  prefix: { marginHorizontal: 8, fontWeight: "600", fontSize: 16, color: "#333" },
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
  },
  dropdownContainer: {
    borderColor: "#ddd",
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  error: { color: "#ef4444", fontSize: 12, marginTop: 4 },

  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
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

  // Employee card
  employeeCard: {
    flex: 1,
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
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  employeeName: { fontWeight: "800", fontSize: 16, color: "#6a0dad" },
  employeeInfo: { fontSize: 14, color: "#333", marginBottom: 2 },

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
  shiftMeta: { color: "#555", fontSize: 12 },

  toggleHistory: { color: "#6a0dad", fontWeight: "700" },

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
  historyTime: { flex: 1, color: "#333" },
  historyDur: { width: 80, textAlign: "right", color: "#333", fontWeight: "600" },
  historyStatus: { width: 88, textAlign: "center", paddingVertical: 4, borderRadius: 999, overflow: "hidden", fontWeight: "700" },
  statusDone: { backgroundColor: "#EEF2FF", color: "#3730a3" },
  statusActive: { backgroundColor: "#FEF3C7", color: "#92400e" },
  historyEmpty: { padding: 10, color: "#666" },

  // Swipe actions
  swipeActions: { flexDirection: "row", alignItems: "center" },
  swipeBtn: { justifyContent: "center", alignItems: "center", width: 84, height: "100%" },
  swipeText: { fontWeight: "700", color: "#000", marginTop: 4 },

  // Modal
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: "85%" },
  modalActions: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  badgeChoice: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#f9f9f9",
  },
});
