import { useAuth } from "@/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as MailComposer from "expo-mail-composer";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { shareAsync } from "expo-sharing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import * as Animatable from "react-native-animatable";
import { BarChart } from "react-native-chart-kit";
import DropDownPicker from "react-native-dropdown-picker";
import {
  GestureHandlerRootView,
  Swipeable,
} from "react-native-gesture-handler";
import Modal from "react-native-modal";
import {
  DatePickerModal,
  en,
  registerTranslation,
} from "react-native-paper-dates";
import Animated, { FadeInLeft, FadeInUp } from "react-native-reanimated";

const { width: screenWidth } = Dimensions.get("window");

const isTablet = screenWidth >= 600 && screenWidth < 1024;


registerTranslation("en", en);

interface Transaction {
  _id: string;
  serviceType: string;
  originalPrice: number;
  serviceDate: string;
  paymentMethod: string;
  employeeName?: string;
  vehicleDetails?: string;
  customerName?: string;
  notes?: string;
  customer?: {
    _id: string;
    name: string;
  };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface Employee {
  _id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  hourlyRate?: number;
  clockedIn: boolean;
  avatarUrl?: string | null;
}

interface Expense {
  date: string;         // YYYY-MM-DD or ISO
  amount: number;       // positive expense amount
  category?: string;
  note?: string;
}


// helpers
const getInitials = (fullName: string) =>
  fullName
    ?.split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

interface Shift {
  _id: string;
  id?: string;
  employee: string;
  date: string;
  clockIn: string;
  clockOut?: string;
  hours?: string;
  status: string;
}

export default function HomeScreen() {
  const [selectedTab, setSelectedTab] = useState<
    "Transactions" | "Employees" | "Shifts" | "Reports"
  >("Transactions");
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(width - 60, 320);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const allTabs = ["Transactions", "Employees", "Shifts", "Reports"];

  const [queuedEmployeesAction, setQueuedEmployeesAction] = useState<
    null | (() => void)
  >(null);
  const [queuedShiftsAction, setQueuedShiftsAction] = useState<
    null | (() => void)
  >(null);

  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const visibleTabs = allTabs.filter((tab) => {
    if (["Employees", "Shifts", "Reports"].includes(tab)) {
      return user?.role === "admin";
    }
    return true;
  });

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(
        "https://jw-auto-clinic-246.onrender.com/api/transactions",
        {
          headers: {
            Authorization: `Bearer ${user?.token}`,
          },
        }
      );
      const data = await res.json();
      setTransactions(data);
    } catch (err) {
      console.error("Failed to fetch transactions:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const emailBusyRef = useRef(false);

  const composeEmailSafely = async (opts: MailComposer.MailComposerOptions) => {
    if (emailBusyRef.current) {
      Alert.alert("Email already open", "Close the current composer first.");
      return;
    }
    const available = await MailComposer.isAvailableAsync();
    if (!available) {
      Alert.alert("Email unavailable", "Mail services are not available on this device.");
      return;
    }
    emailBusyRef.current = true;
    try {
      await MailComposer.composeAsync(opts);
    } finally {
      emailBusyRef.current = false;
    }
  };
  
  // b) queue the chosen action to run after the sheet is fully hidden (no overlaps)
  const pendingReportActionRef = useRef<null | (() => Promise<void>)>(null);
  

  const [employees, setEmployees] = useState<Employee[]>([]);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch(
        "https://jw-auto-clinic-246.onrender.com/api/employees",
        {
          headers: {
            Authorization: `Bearer ${user?.token}`,
          },
        }
      );
      const data = await res.json();
      setEmployees(data);
    } catch (err) {
      console.error("Failed to fetch employees:", err);
    }
  }, [user]);

  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [clockedInFilter, setClockedInFilter] = useState<boolean | null>(null);

  const filteredEmployees = employees.filter((emp) => {
    const matchRole = roleFilter ? emp.role === roleFilter : true;
    const matchClocked =
      clockedInFilter !== null ? emp.clockedIn === clockedInFilter : true;
    return matchRole && matchClocked;
  });

  const [editModalVisible, setEditModalVisible] = useState(false);

  const employeesToCSV = (rows: Employee[]) => {
    const header = [
      "Name",
      "Email",
      "Phone",
      "Role",
      "HourlyRate",
      "ClockedIn",
    ];
    const body = rows.map((e) =>
      [
        JSON.stringify(e.name ?? ""), // quote-safe
        JSON.stringify(e.email ?? ""),
        JSON.stringify(e.phone ?? ""),
        JSON.stringify(e.role ?? ""),
        e.hourlyRate != null ? String(e.hourlyRate) : "",
        e.clockedIn ? "Yes" : "No",
      ].join(",")
    );
    return [header.join(","), ...body].join("\n");
  };

  const exportEmployeesCSV = async (rows: Employee[]) => {
    try {
      const csv = employeesToCSV(rows);
      const fileName = `employees-${new Date().toISOString().slice(0, 10)}.csv`;
      const uri = FileSystem.documentDirectory + fileName;
      await FileSystem.writeAsStringAsync(uri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "text/csv",
          dialogTitle: "Share CSV",
        });
      } else {
        Alert.alert("Saved", `CSV saved to: ${uri}`);
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Export failed", "Could not create CSV.");
    }
  };

  const fmtRate = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? `$${n.toFixed(2)}` : "";
  };

  const employeesToHTML = (rows: Employee[]) => `
    <html>
      <head>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <style>
          body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 16px; }
          h1 { color: #6a0dad; font-size: 20px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
          th { background: #f3f3f3; text-align: left; }
        </style>
      </head>
      <body>
        <h1>Employees</h1>
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Rate</th><th>Clocked In</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (e) => `
              <tr>
                <td>${e.name ?? ""}</td>
                <td>${e.email ?? ""}</td>
                <td>${e.phone ?? ""}</td>
                <td>${e.role ?? ""}</td>
                <td>${fmtRate(e.hourlyRate)}</td>
                <td>${e.clockedIn ? "Yes" : "No"}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </body>
    </html>
  `;

  const exportEmployeesPDF = async (rows: Employee[]) => {
    try {
      const html = employeesToHTML(rows);
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Share PDF",
        });
      } else {
        Alert.alert("Saved", `PDF saved to: ${uri}`);
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Export failed", "Could not create PDF.");
    }
  };

  const emailEmployees = async (rows: Employee[]) => {
    try {
      const html = employeesToHTML(rows);
      const { uri } = await Print.printToFileAsync({ html });

      await composeEmailSafely({
        subject: "Employees Export",
        body: "Please find the employees export attached.",
        attachments: [uri],
      });
    } catch (e) {
      console.error(e);
      Alert.alert("Email failed", "Could not compose email.");
    }
  };

  const AvatarBubble: React.FC<{
    uri?: string | null;
    name: string;
    size?: number;
  }> = ({ uri, name, size = 40 }) => {
    if (uri) {
      return (
        <Image
          source={{ uri }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            marginRight: 12,
          }}
        />
      );
    }
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          marginRight: 12,
          backgroundColor: "#eee",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontWeight: "700", color: "#6a0dad" }}>
          {getInitials(name)}
        </Text>
      </View>
    );
  };

  const handleResetPassword = async (emp: Employee) => {
    try {
      const confirm = await new Promise<boolean>((resolve) => {
        Alert.alert(
          "Reset Password",
          `Generate a temporary password for ${emp.name}?`,
          [
            { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
            {
              text: "Reset",
              style: "destructive",
              onPress: () => resolve(true),
            },
          ]
        );
      });
      if (!confirm) return;

      const res = await fetch(
        `https://jw-auto-clinic-246.onrender.com/api/employees/${emp._id}/reset-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user?.token}`,
          },
          body: JSON.stringify({ notify: true }), // backend can email the user if true
        }
      );
      if (!res.ok) throw new Error("Failed to reset password");
      const data = await res.json(); // { temporaryPassword, emailed?: boolean }

      const temp = data.temporaryPassword as string;
      showToast?.(`Temp password: ${temp}`);
      Clipboard.setStringAsync(temp);
      Alert.alert("Temporary Password", `${temp}\n\nCopied to clipboard.`);
    } catch (err: any) {
      console.error(err);
      Alert.alert("Error", err?.message || "Password reset failed.");
    }
  };

  const handleEditEmployee = (emp: Employee) => {
    setSelectedEmployee(emp);
    setEditModalVisible(true);
  };

  const handleDeleteEmployee = async (id: string) => {
    if (Platform.OS === "windows" || Platform.OS === "web") {
      const confirm = window.confirm?.(
        "Are you sure you want to delete this employee?"
      );
      if (!confirm) return;

      try {
        const res = await fetch(
          `https://jw-auto-clinic-246.onrender.com/api/employees/${id}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${user?.token}` },
          }
        );

        if (res.ok) {
          setEmployees((prev) => prev.filter((e) => e._id !== id));
        } else {
          console.error("Failed to delete");
        }
      } catch (err) {
        console.error("Delete error:", err);
      }
    } else {
      Alert.alert(
        "Confirm Delete",
        "Are you sure you want to delete this employee?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                const res = await fetch(
                  `https://jw-auto-clinic-246.onrender.com/api/employees/${id}`,
                  {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${user?.token}` },
                  }
                );

                if (res.ok) {
                  setEmployees((prev) => prev.filter((e) => e._id !== id));
                } else {
                  console.error("Failed to delete");
                }
              } catch (err) {
                console.error("Delete error:", err);
              }
            },
          },
        ],
        { cancelable: true }
      );
    }
  };

  

  const [shifts, setShifts] = useState<any[]>([]);

  const fetchShifts = useCallback(async () => {
    try {
      const res = await fetch(
        "https://jw-auto-clinic-246.onrender.com/api/shifts",
        {
          headers: { Authorization: `Bearer ${user?.token}` },
        }
      );
      const data = await res.json();
      setShifts(data);
    } catch (err) {
      console.error("Failed to fetch shifts:", err);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
      fetchEmployees();
      fetchShifts();

      // Refresh every second
      const interval = setInterval(() => {
        fetchData();
        fetchEmployees();
        fetchShifts();
      }, 1000);

      // Cleanup when component unmounts
      return () => clearInterval(interval);
    }, [fetchData, fetchEmployees, fetchShifts])
  );

  // Safe date parse for 'YYYY-MM-DD' or ISO; returns number (ms) or null
  const toTime = (v?: string | null) => {
    if (!v) return null;
    // Normalise e.g. '2025-08-01' to midnight local
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m)
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  };

  // Build CSV from shifts
  const buildCsv = (rows: typeof sortedShifts) => {
    const header = ["Employee", "Date", "Clock In", "Clock Out", "Status"].join(
      ","
    );
    const body = rows
      .map((r) =>
        [
          JSON.stringify(r.employee ?? ""), // JSON.stringify handles commas/quotes
          JSON.stringify(r.date ?? ""),
          JSON.stringify(r.clockIn ?? ""),
          JSON.stringify(r.clockOut ?? ""),
          JSON.stringify(r.status ?? ""),
        ].join(",")
      )
      .join("\n");
    return `${header}\n${body}`;
  };

  // Simple HTML table for PDF
  const buildPdfHtml = (rows: typeof sortedShifts) => `
    <html>
      <head>
        <meta charset="utf-8"/>
        <style>
          body { font-family: -apple-system, Segoe UI, Roboto, Arial; padding: 16px; }
          h1 { font-size: 20px; margin-bottom: 12px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
          th { background:#f3e8ff; text-align:left; }
          tr:nth-child(even){ background:#fafafa; }
        </style>
      </head>
      <body>
        <h1>Shifts Report</h1>
        <table>
          <thead>
            <tr><th>Employee</th><th>Date</th><th>Clock In</th><th>Clock Out</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (r) => `
              <tr>
                <td>${(r.employee ?? "").toString()}</td>
                <td>${(r.date ?? "").toString()}</td>
                <td>${(r.clockIn ?? "").toString()}</td>
                <td>${(r.clockOut ?? "").toString()}</td>
                <td>${(r.status ?? "").toString()}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </body>
    </html>
  `;

  // File helpers
  const saveAndShare = async (uri: string) => {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri);
    }
  };

  const fmtYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const [filtersOpen, setFiltersOpen] = useState(true);
  const [exportSheetVisibleShifts, setExportSheetVisibleShifts] =
    useState(false);
  const [exportSheetVisibleEmployees, setExportSheetVisibleEmployees] =
    useState(false);

  const [sortMenuVisible, setSortMenuVisible] = useState(false);

  const quickRange = (key: "today" | "7d" | "30d" | "ytd" | "clear") => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const today = `${y}-${m}-${d}`;

    const addDays = (base: Date, days: number) => {
      const t = new Date(base);
      t.setDate(t.getDate() + days);
      return t;
    };
    const fmt = (dt: Date) => {
      const yy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const dd = String(dt.getDate()).padStart(2, "0");
      return `${yy}-${mm}-${dd}`;
    };

    if (key === "clear") {
      setDateFrom("");
      setDateTo("");
      return;
    }
    if (key === "today") {
      setDateFrom(today);
      setDateTo(today);
      return;
    }
    if (key === "7d") {
      setDateFrom(fmt(addDays(now, -6)));
      setDateTo(today);
      return;
    }
    if (key === "30d") {
      setDateFrom(fmt(addDays(now, -29)));
      setDateTo(today);
      return;
    }
    if (key === "ytd") {
      setDateFrom(`${y}-01-01`);
      setDateTo(today);
      return;
    }
  };

  const chip = (active: boolean) => ({
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: active ? "#6a0dad" : "#eee",
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  });
  const chipText = (active: boolean) => ({
    color: active ? "#fff" : "#444",
    fontWeight: "600" as const,
  });

  const [isFromPickerVisible, setFromPickerVisible] = useState(false);
  const [isToPickerVisible, setToPickerVisible] = useState(false);

  const openFromPicker = () => setFromPickerVisible(true);
  const openToPicker = () => setToPickerVisible(true);
  const closeFromPicker = () => setFromPickerVisible(false);
  const closeToPicker = () => setToPickerVisible(false);

  const onConfirmFrom = (date: Date) => {
    setDateFrom(fmtYMD(date));
    closeFromPicker();
  };
  const onConfirmTo = (date: Date) => {
    setDateTo(fmtYMD(date));
    closeToPicker();
  };

  const handleExportCSV = async (rows: typeof sortedShifts) => {
    try {
      const csv = buildCsv(rows);
      const filename = `shifts-${new Date().toISOString().slice(0, 10)}.csv`;
      const path = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(path, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await saveAndShare(path);
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Saved", `File saved to: ${path}`);
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert("Export failed", e?.message ?? "Failed to export CSV.");
    }
  };

  const handleExportPDF = async (rows: typeof sortedShifts) => {
    try {
      const html = buildPdfHtml(rows);
      const { uri } = await Print.printToFileAsync({ html });
      await saveAndShare(uri);
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Saved", `PDF saved to: ${uri}`);
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert("Export failed", e?.message ?? "Failed to export PDF.");
    }
  };

  const handleEmailDocument = async (
    rows: typeof sortedShifts,
    type: "csv" | "pdf"
  ) => {
    try {
      let attachmentUri = "";
      const filename = `shifts-${new Date().toISOString().slice(0, 10)}.${type}`;

      if (type === "csv") {
        const csv = buildCsv(rows);
        attachmentUri = `${FileSystem.documentDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(attachmentUri, csv, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      } else {
        const { uri } = await Print.printToFileAsync({
          html: buildPdfHtml(rows),
        });
        attachmentUri = uri;
      }

      await composeEmailSafely({
        subject: "Shifts Report",
        body: "Please find the attached shifts report.",
        attachments: [attachmentUri],
      });
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        "Email failed",
        e?.message ?? "Could not start email composer."
      );
    }
  };

  // helper (put near your other utils)
  const getShiftId = (s: Shift): string | null => s?._id ?? s?.id ?? null;

  const handleDeleteShift = (rawId?: string | null) => {
    const id = rawId?.trim() || null;

    if (!id) {
      Alert.alert("Delete error", "No shift ID found.");
      return;
    }
    if (!user?.token) {
      Alert.alert("Not authorised", "Please log in.");
      return;
    }

    const looksLikeObjectId = /^[a-f\d]{24}$/i.test(id);
    if (!looksLikeObjectId) console.log("handleDeleteShift: suspicious id", id);

    const doDelete = async () => {
      try {
        const url = `https://jw-auto-clinic-246.onrender.com/api/shifts/${id}`;
        const res = await fetch(url, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${user.token}` },
        });
        const text = await res.text().catch(() => "");

        if (!res.ok) {
          console.log("DELETE /shifts failed", {
            status: res.status,
            body: text,
            id,
            url,
          });
          if (res.status === 401)
            Alert.alert("Session expired", "Please log in again.");
          else if (res.status === 404)
            Alert.alert("Not found", "Shift was not found on the server.");
          else
            Alert.alert("Failed to delete shift", text || `HTTP ${res.status}`);
          return;
        }

        setShifts((prev) => prev.filter((s) => getShiftId(s) !== id)); // optimistic UI
      } catch (err: any) {
        console.log("DELETE /shifts error", err);
        Alert.alert("Network error", err?.message || "Unable to reach server.");
      }
    };

    Alert.alert("Delete shift?", "This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: doDelete },
    ]);
  };

  const renderRightActions = (id: string | null) => (
    <View style={{ flexDirection: "row", height: "100%" }}>
      <Pressable
        onPress={() => handleDeleteShift(id)}
        style={{
          width: 88,
          height: Platform.select({
            ios: "88%",
            android: "90%",
            default: "100%", // fallback for web/other
          }),
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#e53935",
          borderTopRightRadius: 12,
          borderBottomRightRadius: 12,
        }}
        android_ripple={{ color: "#ffffff33" }}
      >
        <Text style={{ color: "#fff", fontWeight: "700" }}>Delete</Text>
      </Pressable>
    </View>
  );

  const [open, setOpen] = useState(false);
  const [chartType, setChartType] = useState<"Revenue" | "Services" | "Expenses">("Revenue");

  const [reportPeriod, setReportPeriod] = useState<"Today" | "Week" | "Month" | "Custom">("Today");
  const [periodItems, setPeriodItems] = useState([
    { label: "Today", value: "Today" },
    { label: "Week", value: "Week" },
    { label: "Month", value: "Month" },
    { label: "Custom Range…", value: "Custom" },
  ]);

  // For the Reports tab custom date range
  const [reportRange, setReportRange] = useState<{ startDate?: Date; endDate?: Date }>({});
  const [reportDateModalOpen, setReportDateModalOpen] = useState(false);

  // Expenses loaded from CSV
  const [expenses, setExpenses] = useState<Expense[]>([]);

  // Export sheet + email guard for Reports
  const [exportSheetVisibleReports, setExportSheetVisibleReports] = useState(false);
  const [isComposingEmail, setIsComposingEmail] = useState(false);


  // Inclusive range check
  const inRange = (d: Date, start?: Date, end?: Date) => {
    if (!start && !end) return true;
    if (start && d < new Date(start.getFullYear(), start.getMonth(), start.getDate())) return false;
    if (end && d > new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999)) return false;
    return true;
  };

  // Current report window (start, end) based on reportPeriod / custom
  const getReportWindow = (): { start?: Date; end?: Date } => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (reportPeriod === "Today") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { start, end };
    }
    if (reportPeriod === "Week") {
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }
    if (reportPeriod === "Month") {
      const start = new Date(end);
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }
    // Custom
    return { start: reportRange.startDate, end: reportRange.endDate };
  };

  // Safe parse YYYY-MM-DD or ISO -> Date | null
  const parseMaybeDate = (v?: string) => {
    if (!v) return null;
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : new Date(t);
  };


  // simple CSV splitter that respects quoted commas
  const splitCSVLine = (line: string) =>
    line.match(/("([^"]|"")*"|[^,])+/g)?.map((s) => s.replace(/^"|"$/g, "").replace(/""/g, '"')) ?? [];

  // Expect header like: date,amount,category,note  (extra columns are ignored)
  const parseExpensesCSV = (csv: string): Expense[] => {
    const lines = csv.split(/\r?\n/).filter((l) => l.trim().length);
    if (!lines.length) return [];
    const header = splitCSVLine(lines[0]).map((h) => h.trim().toLowerCase());

    const idx = {
      date: header.indexOf("date"),
      amount: header.indexOf("amount"),
      category: header.indexOf("category"),
      note: header.indexOf("note"),
    };

    return lines.slice(1).map((line) => {
      const cols = splitCSVLine(line);
      const date = cols[idx.date] || "";
      const amountNum = Number((cols[idx.amount] || "").replace(/[^0-9.\-]/g, ""));
      return {
        date,
        amount: Number.isFinite(amountNum) ? amountNum : 0,
        category: idx.category >= 0 ? cols[idx.category] : undefined,
        note: idx.note >= 0 ? cols[idx.note] : undefined,
      };
    }).filter((e) => e.date && Number.isFinite(e.amount));
  };

  const pickExpensesCSV = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      const content = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const rows = parseExpensesCSV(content);
      setExpenses(rows);
      Alert.alert("Expenses imported", `${rows.length} expense rows loaded.`);
    } catch (e: any) {
      Alert.alert("Import failed", e?.message || "Could not import CSV.");
    }
  };


  const generateBarData = (
    period: "Today" | "Week" | "Month" | "Custom",
    type: "Revenue" | "Services" | "Expenses",
    transactions: { serviceDate: string; originalPrice: number }[],
    expensesRows: Expense[]
  ) => {
    const window = getReportWindow();
  
    // Filter helpers by window
    const txInWindow = transactions.filter((tx) => {
      const d = parseMaybeDate(tx.serviceDate);
      return d ? inRange(d, window.start, window.end) : false;
    });
    const exInWindow = expensesRows.filter((ex) => {
      const d = parseMaybeDate(ex.date);
      return d ? inRange(d, window.start, window.end) : false;
    });
  
    // What to aggregate
    const txMetric = (list: typeof txInWindow) =>
      type === "Revenue" ? list.reduce((s, t) => s + Number(t.originalPrice || 0), 0) : list.length;
  
    const exMetric = (list: typeof exInWindow) => list.reduce((s, e) => s + Number(e.amount || 0), 0);
  
    const byDay = (start: Date, end: Date) => {
      const labels: string[] = [];
      const data: number[] = [];
      const cursor = new Date(start);
      cursor.setHours(0, 0, 0, 0);
  
      while (cursor <= end) {
        const dayStr = cursor.toISOString().slice(0, 10);
        labels.push(cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  
        if (type === "Expenses") {
          data.push(exInWindow.filter((e) => (parseMaybeDate(e.date)?.toISOString().slice(0, 10) === dayStr)).reduce((s, e) => s + e.amount, 0));
        } else {
          const dayTx = txInWindow.filter((t) => (parseMaybeDate(t.serviceDate)?.toISOString().slice(0, 10) === dayStr));
          data.push(txMetric(dayTx));
        }
  
        cursor.setDate(cursor.getDate() + 1);
      }
      return { labels, datasets: [{ data }] };
    };
  
    if (period === "Today") {
      // Hourly 7am–6pm
      const hours = Array.from({ length: 12 }, (_, i) => i + 7);
      const labels = hours.map((h) => `${h % 12 || 12}${h < 12 ? "a" : "p"}`);
      const data = hours.map((h) => {
        if (type === "Expenses") {
          // group expenses by hour not typical; show daily sum at each hour to avoid zeroes
          const day = new Date(); day.setHours(0,0,0,0);
          const sum = exInWindow.reduce((s, e) => s + e.amount, 0);
          return sum; // flat value across the day
        }
        const now = new Date();
        return txMetric(
          txInWindow.filter((tx) => {
            const d = new Date(tx.serviceDate);
            return d.getHours() === h && d.toDateString() === now.toDateString();
          })
        );
      });
      return { labels, datasets: [{ data }] };
    }
  
    if (period === "Week") {
      const end = new Date(); end.setHours(23, 59, 59, 999);
      const start = new Date(end); start.setDate(start.getDate() - 6); start.setHours(0,0,0,0);
      return byDay(start, end);
    }
  
    if (period === "Month") {
      const end = new Date(); end.setHours(23, 59, 59, 999);
      const start = new Date(end); start.setDate(start.getDate() - 29); start.setHours(0,0,0,0);
      return byDay(start, end);
    }
  
    // Custom
    const start = window.start ?? new Date();
    const end = window.end ?? new Date();
    return byDay(start, end);
  };

  





  const [reportData, setReportData] = useState({
    totalRevenue: 0,
    totalServices: 0,
    totalEmployees: 0,
    activeNow: 0,
    todayRevenue: 0,
    todayServices: 0,
    todayClockedIn: 0,
    todayTransactions: 0,
  });

  useEffect(() => {
    let interval: number;

    if (selectedTab === "Reports") {
      fetchReportData(); // Initial fetch
      interval = setInterval(() => {
        fetchReportData();
      }, 1000); // Refresh every 1 second
    }

    return () => clearInterval(interval);
  }, [selectedTab]);

  const fetchReportData = async () => {
    try {
      const res = await fetch(
        "https://jw-auto-clinic-246.onrender.com/api/reports/dashboard",
        {
          headers: { Authorization: `Bearer ${user?.token}` },
        }
      );
      const data = await res.json();
      setReportData(data);
    } catch (err) {
      console.error("Failed to fetch reports", err);
    }
  };

  const earnings = transactions.reduce(
    (sum, tx) => sum + Number(tx.originalPrice || 0),
    0
  );
  const today = new Date().toISOString().split("T")[0];
  const todayEarnings = transactions
    .filter((tx) => tx.serviceDate?.startsWith(today))
    .reduce((sum, tx) => sum + Number(tx.originalPrice || 0), 0);

  const recent = [...transactions]
    .sort(
      (a, b) =>
        new Date(b.serviceDate).getTime() - new Date(a.serviceDate).getTime()
    )
    .slice(0, 10);

  const chartData = Array.from({ length: 12 }, (_, i) => {
    const monthIndex = i; // 0-based
    const total = transactions
      .filter((tx) => {
        const date = new Date(tx.serviceDate);
        return date.getMonth() === monthIndex;
      })
      .reduce((sum, tx) => sum + Number(tx.originalPrice || 0), 0);

    const monthLabel = new Date(0, monthIndex).toLocaleString("default", {
      month: "short",
    });

    return {
      month: monthLabel, // 'Jan', 'Feb', ...
      earnings: total,
    };
  });

  const barChartData = {
    labels: chartData.map((item) => item.month),
    datasets: [
      {
        data: chartData.map((item) => item.earnings || 0),
      },
    ],
    legend: ["Earnings"],
  };

  // Create an array of the last 7 days (newest last)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i)); // 6 = oldest first
    return d;
  });

  // Aggregate earnings per day
  const dailyRevenue = last7Days.map((date) => {
    const dayStr = date.toISOString().split("T")[0]; // "YYYY-MM-DD"
    const total = transactions
      .filter((tx) => tx.serviceDate?.startsWith(dayStr))
      .reduce((sum, tx) => sum + Number(tx.originalPrice || 0), 0);

    return {
      label: date.toLocaleDateString("en-US", { weekday: "short" }), // e.g. "Tue"
      value: total,
    };
  });

  // Build barData for chart
  const [barData, setBarData] = useState<{
    labels: string[];
    datasets: { data: number[]; color?: () => string }[];
  }>({
    labels: [],
    datasets: [{ data: [] }],
  });

 

  useEffect(() => {
    const newBarData = generateBarData(reportPeriod, chartType, transactions, expenses);
    setBarData(newBarData);
  }, [reportPeriod, chartType, transactions, expenses, reportRange]);
  

  const [transactionSearchText, setTransactionSearchText] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<string | null>(null);
  const [serviceFilter, setServiceFilter] = useState<string | null>(null);

  const paymentMethods = Array.from(
    new Set(transactions.map((tx) => tx.paymentMethod).filter(Boolean))
  );
  const serviceTypes = Array.from(
    new Set(transactions.map((tx) => tx.serviceType).filter(Boolean))
  );

  const [filtersModalVisible, setFiltersModalVisible] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [viewMode, setViewMode] = useState<"card" | "list">("list");

  const [range, setRange] = useState<{
    startDate: Date | undefined;
    endDate: Date | undefined;
  }>({
    startDate: undefined,
    endDate: undefined,
  });

  const [openDateModal, setOpenDateModal] = useState(false);

  const filteredTransactions = recent.filter((tx) => {
    const search = transactionSearchText.toLowerCase();

    const matchesSearch =
      tx.employeeName?.toLowerCase().includes(search) ||
      tx.customerName?.toLowerCase().includes(search) ||
      tx.customer?.name?.toLowerCase().includes(search);

    const matchesPayment = paymentFilter
      ? tx.paymentMethod === paymentFilter
      : true;
    const matchesService = serviceFilter
      ? tx.serviceType === serviceFilter
      : true;

    const txDate = new Date(tx.serviceDate);

    const inDateRange =
      (!range.startDate || txDate >= range.startDate) &&
      (!range.endDate || txDate <= range.endDate);

    return matchesSearch && matchesPayment && matchesService && inDateRange;
  });

  const getFileName = (prefix: string, extension: string) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `${prefix}-${timestamp}.${extension}`;
  };

  const exportAsPDF = async () => {
    const html = `
      <html><body>
      <h1>Recent Transactions</h1>
      <table border="1" style="border-collapse:collapse;width:100%;">
        <thead>
          <tr><th>Service</th><th>Amount</th><th>Payment</th><th>Customer</th><th>Date</th></tr>
        </thead>
        <tbody>
          ${filteredTransactions
            .map(
              (tx) => `<tr>
                <td>${tx.serviceType}</td>
                <td>$${tx.originalPrice.toFixed(2)}</td>
                <td>${tx.paymentMethod}</td>
                <td>${tx.customer?.name || tx.customerName || "N/A"}</td>
                <td>${tx.serviceDate ? new Date(tx.serviceDate).toLocaleDateString() : "—"}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
      </body></html>
    `;
    const fileName = getFileName("transactions", "pdf");
    const { uri } = await Print.printToFileAsync({ html });
    const newPath = FileSystem.documentDirectory + fileName;
    await FileSystem.moveAsync({ from: uri, to: newPath });
    await shareAsync(newPath);
  };

  const exportAsExcel = async () => {
    const fileName = getFileName("transactions", "csv");
    const csv = [
      ["Service", "Amount", "Payment", "Customer", "Date"],
      ...filteredTransactions.map((tx) => [
        tx.serviceType,
        `$${tx.originalPrice.toFixed(2)}`,
        tx.paymentMethod,
        tx.customer?.name || tx.customerName || "N/A",
        tx.serviceDate ? new Date(tx.serviceDate).toLocaleDateString() : "—",
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const uri = FileSystem.documentDirectory + fileName;
    await FileSystem.writeAsStringAsync(uri, csv, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    await shareAsync(uri);
  };

  const emailExport = async () => {
    try {
      const csv = [
        ["Service", "Amount", "Payment", "Customer", "Date"],
        ...filteredTransactions.map((tx) => [
          tx.serviceType,
          `$${tx.originalPrice.toFixed(2)}`,
          tx.paymentMethod,
          tx.customer?.name || tx.customerName || "N/A",
          tx.serviceDate ? new Date(tx.serviceDate).toLocaleDateString() : "—",
        ]),
      ]
        .map((row) => row.join(","))
        .join("\n");

      const fileName = getFileName("transactions", "csv");
      const path = FileSystem.documentDirectory + fileName;
      await FileSystem.writeAsStringAsync(path, csv);

      await composeEmailSafely({
        recipients: [],
        subject: "Exported Transactions",
        body: "Attached is the exported list of transactions.",
        attachments: [path],
      });
    } catch (e) {
      console.error(e);
      Alert.alert("Email failed", "Could not compose email.");
    }
  };

  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [transactionModalVisible, setTransactionModalVisible] = useState(false);
  const [moreActionsVisible, setMoreActionsVisible] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
    null
  );
  const [searchText, setSearchText] = useState("");
  const [sortOpen, setSortOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "role" | "rate">("name");

  const openModal = (tx: Transaction) => {
    setSelectedTx(tx);
    setTransactionModalVisible(true);
  };

  const closeModal = () => {
    setTransactionModalVisible(false);
    setSelectedTx(null);
  };

  const handleLongPress = (emp: Employee) => {
    setSelectedEmployee(emp);
    setMoreActionsVisible(true); // triggers Modal
  };

  const showToast = (message: string) => {
    ToastAndroid.show(message, ToastAndroid.SHORT);
    // or custom component using Animated
  };

  const searchedEmployees = filteredEmployees.filter(
    (emp) =>
      emp.name.toLowerCase().includes(searchText.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchText.toLowerCase())
  );

  const sortedEmployees = [...searchedEmployees].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "role") return a.role.localeCompare(b.role);
    if (sortBy === "rate") return (a.hourlyRate || 0) - (b.hourlyRate || 0);
    return 0;
  });

  const [statusFilter, setStatusFilter] = useState<
    "Active" | "Completed" | null
  >(null);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [shiftModalVisible, setShiftModalVisible] = useState(false);
  const [shiftSortBy, setShiftSortBy] = useState<
    "name" | "status" | "date" | null
  >(null);
  const [shiftSearchText, setShiftSearchText] = useState("");

  const filteredShifts = shifts
    .filter((shift) => (statusFilter ? shift.status === statusFilter : true))
    .filter((shift) =>
      shiftSearchText
        ? shift.employee.toLowerCase().includes(shiftSearchText.toLowerCase())
        : true
    );

  const sortedShifts = [...filteredShifts].sort((a, b) => {
    if (shiftSortBy === "name") return a.employee.localeCompare(b.employee);
    if (shiftSortBy === "status") return a.status.localeCompare(b.status);
    if (shiftSortBy === "date") {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateB.getTime() - dateA.getTime(); // Newest first
    }
    return 0;
  });

  const visibleShifts = useMemo(() => {
    // Start from your base array of shifts; if yours is already filtered, swap it in here.
    const base = sortedShifts ?? [];

    const fromT = toTime(dateFrom);
    const toT = toTime(dateTo);
    const norm = (s: string) => (s ?? "").toLowerCase().trim();

    let arr = base.filter((s) => {
      // Search by employee
      const okSearch = !shiftSearchText
        ? true
        : norm(s.employee).includes(norm(shiftSearchText));

      // Status filter
      const okStatus = statusFilter ? s.status === statusFilter : true;

      // Date filter (inclusive)
      const t = toTime(s.date);
      const okDate =
        (fromT == null || (t != null && t >= fromT)) &&
        (toT == null || (t != null && t <= toT));

      return okSearch && okStatus && okDate;
    });

    // Your existing sort toggle
    if (shiftSortBy === "name") {
      arr = [...arr].sort((a, b) =>
        (a.employee || "").localeCompare(b.employee || "")
      );
    } else if (shiftSortBy === "status") {
      arr = [...arr].sort((a, b) =>
        (a.status || "").localeCompare(b.status || "")
      );
    } else if (shiftSortBy === "date") {
      arr = [...arr].sort(
        (a, b) => (toTime(b.date) ?? 0) - (toTime(a.date) ?? 0)
      );
    }

    return arr;
  }, [
    sortedShifts,
    shiftSearchText,
    statusFilter,
    shiftSortBy,
    dateFrom,
    dateTo,
  ]);




  const buildReportRows = () => {
    const { start, end } = getReportWindow();
    const tx = transactions.filter((t) => {
      const d = parseMaybeDate(t.serviceDate); return d ? inRange(d, start, end) : false;
    });
    const ex = expenses.filter((e) => {
      const d = parseMaybeDate(e.date); return d ? inRange(d, start, end) : false;
    });
    return { tx, ex };
  };
  
  const reportToCSV = () => {
    const { tx, ex } = buildReportRows();
  
    // Two sections in one CSV
    const txHeader = "Transactions";
    const txCols = ["Service", "Amount", "Payment", "Customer", "Date"].join(",");
    const txBody = tx.map(t => [
      JSON.stringify(t.serviceType ?? ""),
      (Number(t.originalPrice || 0)).toFixed(2),
      JSON.stringify(t.paymentMethod ?? ""),
      JSON.stringify(t.customer?.name || t.customerName || "N/A"),
      JSON.stringify(t.serviceDate ? new Date(t.serviceDate).toLocaleDateString() : "—"),
    ].join(",")).join("\n");
  
    const exHeader = "Expenses";
    const exCols = ["Date","Amount","Category","Note"].join(",");
    const exBody = ex.map(e => [
      JSON.stringify(e.date),
      (Number(e.amount || 0)).toFixed(2),
      JSON.stringify(e.category ?? ""),
      JSON.stringify(e.note ?? ""),
    ].join(",")).join("\n");
  
    return [
      txHeader, txCols, txBody, "",
      exHeader, exCols, exBody
    ].join("\n");
  };
  
  const reportToHTML = () => {
    const { tx, ex } = buildReportRows();
    const totalRev = tx.reduce((s, t) => s + Number(t.originalPrice || 0), 0);
    const totalExp = ex.reduce((s, e) => s + Number(e.amount || 0), 0);
    const net = totalRev - totalExp;
  
    return `
    <html>
      <head>
        <meta charset="utf-8"/>
        <style>
          body { font-family: -apple-system, Segoe UI, Roboto, Arial; padding: 16px; }
          h1,h2 { color:#6a0dad; }
          table { border-collapse: collapse; width: 100%; margin-bottom:16px; }
          th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
          th { background:#f3e8ff; text-align:left; }
        </style>
      </head>
      <body>
        <h1>Report (${reportPeriod}${reportPeriod==="Custom" && reportRange.startDate && reportRange.endDate ? `: ${reportRange.startDate.toLocaleDateString()} – ${reportRange.endDate.toLocaleDateString()}` : ""})</h1>
        <h2>Summary</h2>
        <p><b>Revenue:</b> $${totalRev.toFixed(2)}<br/>
           <b>Expenses:</b> $${totalExp.toFixed(2)}<br/>
           <b>Net:</b> $${net.toFixed(2)}</p>
  
        <h2>Transactions</h2>
        <table>
          <thead><tr><th>Service</th><th>Amount</th><th>Payment</th><th>Customer</th><th>Date</th></tr></thead>
          <tbody>
            ${tx.map(t => `
              <tr>
                <td>${t.serviceType ?? ""}</td>
                <td>$${Number(t.originalPrice || 0).toFixed(2)}</td>
                <td>${t.paymentMethod ?? ""}</td>
                <td>${t.customer?.name || t.customerName || "N/A"}</td>
                <td>${t.serviceDate ? new Date(t.serviceDate).toLocaleDateString() : "—"}</td>
              </tr>`).join("")}
          </tbody>
        </table>
  
        <h2>Expenses</h2>
        <table>
          <thead><tr><th>Date</th><th>Amount</th><th>Category</th><th>Note</th></tr></thead>
          <tbody>
            ${ex.map(e => `
              <tr>
                <td>${e.date}</td>
                <td>$${Number(e.amount || 0).toFixed(2)}</td>
                <td>${e.category ?? ""}</td>
                <td>${e.note ?? ""}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </body>
    </html>`;
  };
  
  const exportReportCSV = async () => {
    try {
      const csv = reportToCSV();
      const fileName = `report-${new Date().toISOString().slice(0,10)}.csv`;
      const uri = FileSystem.documentDirectory + fileName;
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      await shareAsync(uri);
    } catch (e) {
      Alert.alert("Export failed", "Could not create CSV.");
    }
  };
  
  const exportReportPDF = async () => {
    try {
      const html = reportToHTML();
      const { uri } = await Print.printToFileAsync({ html });
      await shareAsync(uri);
    } catch (e) {
      Alert.alert("Export failed", "Could not create PDF.");
    }
  };
  
  const emailReport = async (type: "csv" | "pdf") => {
    try {
      const available = await MailComposer.isAvailableAsync();
      if (!available) {
        Alert.alert("Email unavailable", "Mail services are not available on this device.");
        return;
      }
      let attachmentUri = "";
      if (type === "csv") {
        const csv = reportToCSV();
        const fileName = `report-${new Date().toISOString().slice(0,10)}.csv`;
        attachmentUri = FileSystem.documentDirectory + fileName;
        await FileSystem.writeAsStringAsync(attachmentUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      } else {
        const { uri } = await Print.printToFileAsync({ html: reportToHTML() });
        attachmentUri = uri;
      }
      await MailComposer.composeAsync({
        subject: "Filtered Report",
        body: "Please find the filtered report attached.",
        attachments: [attachmentUri],
      });
    } catch (e: any) {
      Alert.alert("Email failed", e?.message || "Could not compose email.");
    }
  };
  

  const periodLabel = () => {
    if (reportPeriod !== "Custom") return reportPeriod;
    const s = reportRange.startDate ? reportRange.startDate.toLocaleDateString() : "—";
    const e = reportRange.endDate ? reportRange.endDate.toLocaleDateString() : "—";
    return `Custom: ${s} – ${e}`;
  };
  


  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        {/* <Ionicons name="menu" size={24} color="#6a0dad" /> */}
        <Text style={styles.logo}>Dashboard</Text>
        {/* <Ionicons name="person-circle-outline" size={35} color="#6a0dad" /> */}
      </View>

      <View style={styles.filters}>
        {visibleTabs.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={selectedTab === tab ? styles.filterActive : styles.filter}
            onPress={() => setSelectedTab(tab as any)}
          >
            <Text
              style={
                selectedTab === tab
                  ? styles.filterTextActive
                  : styles.filterText
              }
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {selectedTab === "Transactions" && (
        <>
          {user?.role === "admin" && (
            <View style={styles.summaryRow}>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Total Earned Today</Text>
                <Text style={styles.cardAmount}>
                  ${(todayEarnings || 0).toFixed(2)}
                </Text>
                <Text style={styles.cardSub}>Updated live</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Total Earnings</Text>
                <Text style={styles.cardAmount}>
                  ${(earnings || 0).toFixed(2)}
                </Text>
                <Text style={styles.cardSub}>
                  {transactions?.length || 0} transactions
                </Text>
              </View>
            </View>
          )}

          {user?.role === "admin" && (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Monthly Earnings</Text>
              <BarChart
                data={barChartData}
                width={chartWidth}
                height={260}
                withInnerLines={true}
                withHorizontalLabels={true}
                fromZero
                yAxisLabel="$"
                yAxisSuffix=""
                yLabelsOffset={20}
                showBarTops={true}
                showValuesOnTopOfBars={true}
                chartConfig={{
                  backgroundColor: "#fff",
                  backgroundGradientFrom: "#fff",
                  backgroundGradientTo: "#fff",
                  decimalPlaces: 0,
                  barPercentage: 0.4,
                  fillShadowGradient: "#6a0dad",
                  fillShadowGradientOpacity: 1,
                  color: (opacity = 1) => `rgba(106, 13, 173, ${opacity})`,
                  labelColor: () => "#888",
                  propsForBackgroundLines: {
                    stroke: "#e3e3e3",
                    strokeDasharray: "6",
                  },
                }}
                style={{
                  marginTop: Platform.select({
                    ios: 16,
                    android: 16,
                    default: 16,
                  }),
                  marginLeft: Platform.select({
                    ios: -14,
                    android: -14,
                    default: -14,
                  }),
                  borderRadius: 16,
                }}
              />
            </View>
          )}

          <View style={styles.recentCard}>
            <Text style={styles.recentTitle}>Recent Transactions</Text>

            <KeyboardAvoidingView
              style={{ flex: 1, backgroundColor: "#fff" }}
              behavior={Platform.select({ ios: "padding", android: undefined })}
              keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
            >
              <TextInput
                placeholder="Search by employee or customer"
                placeholderTextColor="#777"
                value={transactionSearchText}
                onChangeText={setTransactionSearchText}
                style={styles.searchBox}
              />
            </KeyboardAvoidingView>

            {/* Top control buttons */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  onPress={() => setFiltersModalVisible(true)}
                  style={styles.exportButton}
                >
                  <Ionicons name="filter" size={16} color="#6a0dad" />
                  <Text style={styles.exportText}>Filters</Text>
                </TouchableOpacity>
                {user?.role === "admin" && (
                  <TouchableOpacity
                    onPress={() => setExportModalVisible(true)}
                    style={styles.exportButton}
                  >
                    <Ionicons name="download" size={16} color="#6a0dad" />
                    <Text style={styles.exportText}>Export</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                onPress={() =>
                  setViewMode(viewMode === "card" ? "list" : "card")
                }
                style={[styles.exportButton, { paddingVertical: 6 }]}
              >
                <Ionicons name="swap-horizontal" size={16} color="#6a0dad" />
                <Text style={styles.exportText}>
                  {viewMode === "card" ? "List View" : "Card View"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Render by viewMode */}
            {filteredTransactions.length === 0 ? (
              <View style={styles.placeholderCard}>
                <Text style={styles.placeholderText}>
                  No transactions found for your search/filter.
                </Text>
              </View>
            ) : viewMode === "list" ? (
              Object.entries(
                filteredTransactions.reduce(
                  (acc, tx) => {
                    const date = new Date(tx.serviceDate);
                    const monthYear = date.toLocaleString("default", {
                      month: "long",
                      year: "numeric",
                    });
                    if (!acc[monthYear]) acc[monthYear] = [];
                    acc[monthYear].push(tx);
                    return acc;
                  },
                  {} as Record<string, Transaction[]>
                )
              ).map(([month, txs]) => (
                <View key={month} style={{ marginBottom: 20 }}>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "bold",
                      color: "#444",
                      marginBottom: 10,
                    }}
                  >
                    {month}
                  </Text>

                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      justifyContent: isTablet ? "space-between" : "flex-start",
                      gap: 12,
                      display: Platform.OS === "web" ? "flex" : undefined,
                      ...Platform.select({
                        ios: { marginBottom: 0 },
                        android: { marginBottom: 10 },
                        web: { marginBottom: 0 }, // Only web has spacing
                      }),
                    }}
                  >
                    {txs.map((tx, index) => (
                      <Animatable.View
                        key={tx._id}
                        animation="fadeInUp"
                        delay={index * 50}
                        duration={400}
                        style={{
                          width: isTablet ? "48%" : "100%",
                        }}
                      >
                        <TouchableOpacity
                          onPress={() => openModal(tx)}
                          activeOpacity={0.8}
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                            backgroundColor: "#fff",
                            padding: 14,
                            borderRadius: 12,
                            marginBottom: isTablet ? 0 : 8,
                            shadowColor: "#000",
                            shadowOpacity: 0.05,
                            shadowOffset: { width: 0, height: 1 },
                            shadowRadius: 4,
                            elevation: 1,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                            }}
                          >
                            <Ionicons
                              name="document-text-outline"
                              size={24}
                              color="#aaa"
                              style={{ marginRight: 12 }}
                            />
                            <View>
                              <Text
                                style={{
                                  fontSize: Platform.OS === "ios" ? 15 : 14,
                                  fontWeight: "600",
                                  color: "#333",
                                }}
                              >
                                {tx.serviceType}
                              </Text>
                              <Text style={{ fontSize: 13, color: "#888" }}>
                                {new Date(tx.serviceDate).toLocaleDateString(
                                  "en-US",
                                  {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  }
                                )}
                              </Text>
                            </View>
                          </View>
                          <Text
                            style={{
                              fontWeight: "700",
                              fontSize: 14,
                              color:
                                tx.originalPrice >= 0 ? "#5E2BFF" : "#D93025",
                              backgroundColor:
                                tx.originalPrice >= 0 ? "#f0e8ff" : "#fee8e8",
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                              borderRadius: 10,
                            }}
                          >
                            {tx.originalPrice >= 0
                              ? `+$${tx.originalPrice.toFixed(2)}`
                              : `-$${Math.abs(tx.originalPrice).toFixed(2)}`}
                          </Text>
                        </TouchableOpacity>
                      </Animatable.View>
                    ))}
                  </View>
                </View>
              ))
            ) : (
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: isTablet ? "space-between" : "flex-start",
                  gap: 12,
                  display: Platform.OS === "web" ? "flex" : undefined,
                  ...Platform.select({
                    ios: { marginBottom: 10 },
                    android: { marginBottom: 30 },
                    web: { marginBottom: 0 }, // Only web has spacing
                  }),
                }}
              >
                {filteredTransactions.map((tx, index) => (
                  <Animatable.View
                    key={tx._id}
                    animation="fadeInUp"
                    delay={index * 50}
                    duration={400}
                    style={styles.transactionCard}
                  >
                    <TouchableOpacity
                      onPress={() => openModal(tx)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.txService}>{tx.serviceType}</Text>
                      <View style={styles.txRow}>
                        <Text style={styles.txLabel}>Amount:</Text>
                        <Text style={styles.txValue}>
                          ${tx.originalPrice.toFixed(2)}
                        </Text>
                      </View>
                      <View style={styles.txRow}>
                        <Text style={styles.txLabel}>Payment:</Text>
                        <Text style={styles.txValue}>{tx.paymentMethod}</Text>
                      </View>
                      <View style={styles.txRow}>
                        <Text style={styles.txLabel}>Customer:</Text>
                        <Text style={styles.txValue}>
                          {tx.customer?.name || tx.customerName || "N/A"}
                        </Text>
                      </View>
                      <View style={styles.txRow}>
                        <Text style={styles.txLabel}>Date:</Text>
                        <Text style={styles.txValue}>
                          {tx.serviceDate
                            ? new Date(tx.serviceDate).toLocaleDateString()
                            : "—"}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </Animatable.View>
                ))}
              </View>
            )}
          </View>

          <Modal
            isVisible={filtersModalVisible}
            onBackdropPress={() => setFiltersModalVisible(false)}
            backdropOpacity={0.4}
            style={{
              justifyContent: "center",
              alignItems: "center",
              margin: 0,
            }}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Filter Transactions</Text>

              <Text style={{ marginTop: 20, fontWeight: "600", color: "#333" }}>
                Date Range
              </Text>

              <TouchableOpacity
                onPress={() => setOpenDateModal(true)}
                style={{
                  marginTop: 8,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: "#f4f4f4",
                  borderWidth: 1,
                  borderColor: "#ddd",
                }}
              >
                <Text>
                  {range.startDate && range.endDate
                    ? `${range.startDate.toLocaleDateString()} - ${range.endDate.toLocaleDateString()}`
                    : "Select date range"}
                </Text>
              </TouchableOpacity>

              <Text style={{ marginTop: 10, fontWeight: "600", color: "#333" }}>
                Payment Method
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 8,
                  marginTop: 8,
                }}
              >
                {[null, ...paymentMethods].map((method) => {
                  const isActive = paymentFilter === method;
                  return (
                    <TouchableOpacity
                      key={method || "all"}
                      onPress={() => setPaymentFilter(method)}
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 14,
                        borderRadius: 20,
                        backgroundColor: isActive ? "#6a0dad" : "#eee",
                      }}
                    >
                      <Text
                        style={{
                          color: isActive ? "#fff" : "#444",
                          fontWeight: "600",
                        }}
                      >
                        {method || "All Methods"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={{ marginTop: 20, fontWeight: "600", color: "#333" }}>
                Service Type
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 8,
                  marginTop: 8,
                }}
              >
                {[null, ...serviceTypes].map((service) => {
                  const isActive = serviceFilter === service;
                  return (
                    <TouchableOpacity
                      key={service || "all"}
                      onPress={() => setServiceFilter(service)}
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 14,
                        borderRadius: 20,
                        backgroundColor: isActive ? "#6a0dad" : "#eee",
                      }}
                    >
                      <Text
                        style={{
                          color: isActive ? "#fff" : "#444",
                          fontWeight: "600",
                        }}
                      >
                        {service || "All Services"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Buttons */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginTop: 30,
                }}
              >
                <TouchableOpacity
                  style={[
                    styles.modalButton,
                    { backgroundColor: "#eee", flex: 1, marginRight: 6 },
                  ]}
                  onPress={() => {
                    setPaymentFilter(null);
                    setServiceFilter(null);
                    setRange({ startDate: undefined, endDate: undefined });
                  }}
                >
                  <Text style={{ color: "#444", fontWeight: "600" }}>
                    Clear
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, { flex: 1, marginLeft: 6 }]}
                  onPress={() => {
                    fetchData(); // optionally refetch data
                    setFiltersModalVisible(false);
                  }}
                >
                  <Text style={styles.modalButtonText}>Apply</Text>
                </TouchableOpacity>
              </View>

              <DatePickerModal
                locale="en"
                mode="range"
                visible={openDateModal}
                onDismiss={() => setOpenDateModal(false)}
                startDate={range.startDate}
                endDate={range.endDate}
                onConfirm={({ startDate, endDate }) => {
                  setRange({ startDate, endDate });
                  setOpenDateModal(false);
                }}
              />
            </View>
          </Modal>

          <Modal
            isVisible={exportModalVisible}
            onBackdropPress={() => setExportModalVisible(false)}
            backdropOpacity={0.4}
            style={{
              justifyContent: "center",
              alignItems: "center",
              margin: 0,
            }}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Export Transactions</Text>

              <TouchableOpacity
                style={styles.exportOption}
                onPress={() => {
                  exportAsPDF();
                  setExportModalVisible(false);
                }}
              >
                <Ionicons
                  name="document-outline"
                  size={20}
                  color="#6a0dad"
                  style={styles.exportIcon}
                />
                <Text style={styles.exportOptionText}>Export as PDF</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.exportOption}
                onPress={() => {
                  exportAsExcel();
                  setExportModalVisible(true);
                }}
              >
                <Ionicons
                  name="grid-outline"
                  size={20}
                  color="#6a0dad"
                  style={styles.exportIcon}
                />
                <Text style={styles.exportOptionText}>Export as Excel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.exportOption}
                onPress={() => {
                  emailExport();
                  setExportModalVisible(true);
                }}
              >
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color="#6a0dad"
                  style={styles.exportIcon}
                />
                <Text style={styles.exportOptionText}>Send via Email</Text>
              </TouchableOpacity>

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginTop: 30,
                }}
              >
                <TouchableOpacity
                  style={[
                    styles.modalButton,
                    { backgroundColor: "#eee", flex: 1, marginRight: 6 },
                  ]}
                  onPress={() => setExportModalVisible(false)}
                >
                  <Text style={styles.modalClose}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </>
      )}

      {selectedTab === "Employees" && (
        <View style={styles.recentCard}>
          {/* HEADER: Title, result count, clear filters */}
          <View style={{ marginBottom: 12 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text style={styles.recentTitle}>Employee List</Text>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <Text style={{ color: "#666" }}>
                  {sortedEmployees.length} result
                  {sortedEmployees.length === 1 ? "" : "s"}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setRoleFilter(null);
                    setClockedInFilter(null);
                    setSearchText("");
                  }}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 8,
                    backgroundColor: "#f4e8ff",
                  }}
                >
                  <Text style={{ color: "#6a0dad", fontWeight: "700" }}>
                    Clear Filters
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Filters (chip style) */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingVertical: 8,
                paddingHorizontal: 4,
              }}
            >
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {/* Role chips */}
                {[
                  {
                    label: "All Roles",
                    value: null,
                    filter: roleFilter,
                    setter: setRoleFilter,
                    icon: "people",
                  },
                  {
                    label: "Admin",
                    value: "admin",
                    filter: roleFilter,
                    setter: setRoleFilter,
                    icon: "shield-checkmark",
                  },
                  {
                    label: "Staff",
                    value: "staff",
                    filter: roleFilter,
                    setter: setRoleFilter,
                    icon: "person",
                  },
                ].map(({ label, value, filter, setter, icon }, idx) => {
                  const active = filter === value;
                  return (
                    <TouchableOpacity
                      key={`role-${idx}`}
                      onPress={() => setter(value as any)}
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 14,
                        borderRadius: 20,
                        backgroundColor: active ? "#6a0dad" : "#eee",
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Ionicons
                        name={icon as any}
                        size={16}
                        color={active ? "#fff" : "#444"}
                      />
                      <Text
                        style={{
                          color: active ? "#fff" : "#444",
                          fontWeight: "600",
                        }}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                {/* Clocked status chips */}
                {[
                  {
                    label: "All Status",
                    value: null,
                    filter: clockedInFilter,
                    setter: setClockedInFilter,
                    icon: "timer-outline",
                  },
                  {
                    label: "Clocked In",
                    value: true,
                    filter: clockedInFilter,
                    setter: setClockedInFilter,
                    icon: "time",
                  },
                  {
                    label: "Clocked Out",
                    value: false,
                    filter: clockedInFilter,
                    setter: setClockedInFilter,
                    icon: "pause",
                  },
                ].map(({ label, value, filter, setter, icon }, idx) => {
                  const active = filter === value;
                  return (
                    <TouchableOpacity
                      key={`clock-${idx}`}
                      onPress={() => setter(value as any)}
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 14,
                        borderRadius: 20,
                        backgroundColor: active ? "#6a0dad" : "#eee",
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Ionicons
                        name={icon as any}
                        size={16}
                        color={active ? "#fff" : "#444"}
                      />
                      <Text
                        style={{
                          color: active ? "#fff" : "#444",
                          fontWeight: "600",
                        }}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Search box */}
            <TextInput
              placeholder="Search by name or email"
              placeholderTextColor="#777"
              value={searchText}
              onChangeText={setSearchText}
              style={styles.searchBox}
            />

            {/* Export (single button → action sheet) */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                marginBottom: 8,
              }}
            >
              <TouchableOpacity
                onPress={() => setExportSheetVisibleEmployees(true)}
                disabled={!sortedEmployees.length}
                style={{
                  opacity: sortedEmployees.length ? 1 : 0.5,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  backgroundColor: "#6a0dad",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Ionicons name="download" size={18} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "700" }}>Export</Text>
              </TouchableOpacity>
            </View>
          </View>

          

          {/* Responsive Layout */}
          {isTablet ? (
            // 🖥 Tablet/Desktop - Table Layout
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View style={{ minWidth: 800 }}>
                <View
                  style={[
                    styles.tableRow,
                    styles.tableHeader,
                    { backgroundColor: "#f3f3f3" },
                  ]}
                >
                  <Text style={[styles.columnHeader, { width: 60 }]}></Text>
                  <Text style={[styles.columnHeader, { width: 140 }]}>
                    Name
                  </Text>
                  <Text style={[styles.columnHeader, { width: 200 }]}>
                    Email
                  </Text>
                  <Text style={[styles.columnHeader, { width: 140 }]}>
                    Phone
                  </Text>
                  <Text style={[styles.columnHeader, { width: 100 }]}>
                    Role
                  </Text>
                  <Text style={[styles.columnHeader, { width: 100 }]}>
                    Rate
                  </Text>
                  <Text style={[styles.columnHeader, { width: 100 }]}>
                    Clocked In
                  </Text>
                  <Text style={[styles.columnHeader, { width: 80 }]}></Text>
                </View>

                {sortedEmployees.map((emp, index) => (
                  <Animated.View
                    key={emp._id}
                    entering={FadeInUp.delay(index * 40)}
                  >
                    <Pressable onLongPress={() => handleLongPress(emp)}>
                      <View
                        style={[
                          styles.tableRow,
                          {
                            alignItems: "center",
                            paddingVertical: 12,
                            borderBottomColor: "#eee",
                            borderBottomWidth: 1,
                          },
                        ]}
                      >
                        <Animated.View entering={FadeInLeft.delay(index * 40)}>
                          <AvatarBubble
                            uri={emp.avatarUrl}
                            name={emp.name}
                            size={32}
                          />
                        </Animated.View>

                        <Text
                          style={[
                            styles.cell,
                            { width: 140, fontWeight: "600" },
                          ]}
                        >
                          {emp.name}
                        </Text>
                        <Text style={[styles.cell, { width: 200 }]}>
                          {emp.email}
                        </Text>
                        <Text style={[styles.cell, { width: 140 }]}>
                          {emp.phone}
                        </Text>
                        <Text
                          style={[
                            styles.cell,
                            {
                              width: 100,
                              color: emp.role === "admin" ? "#6a0dad" : "#555",
                              fontWeight: "600",
                            },
                          ]}
                        >
                          {emp.role}
                        </Text>
                        <Text style={[styles.cell, { width: 100 }]}>
                          {emp.hourlyRate
                            ? `$${emp.hourlyRate.toFixed(2)}`
                            : "—"}
                        </Text>
                        <Text
                          style={[styles.cell, { width: 100, fontSize: 16 }]}
                        >
                          {emp.clockedIn ? "✅" : "❌"}
                        </Text>

                        <View
                          style={{
                            flexDirection: "row",
                            width: 80,
                            justifyContent: "center",
                          }}
                        >
                          <TouchableOpacity
                            onPress={() => handleEditEmployee(emp)}
                            style={{ marginHorizontal: 6 }}
                          >
                            <Ionicons
                              name="create-outline"
                              size={20}
                              color="#6a0dad"
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => {
                              handleDeleteEmployee(emp._id);
                              showToast("Employee deleted");
                            }}
                          >
                            <Ionicons
                              name="trash-outline"
                              size={20}
                              color="red"
                            />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </Pressable>
                  </Animated.View>
                ))}
              </View>
            </ScrollView>
          ) : (
            // 📱 Mobile - Card Layout
            <ScrollView showsVerticalScrollIndicator={false}>
              {sortedEmployees.map((emp, index) => (
                <Animated.View
                  key={emp._id}
                  entering={FadeInUp.delay(index * 40)}
                  style={{
                    backgroundColor: "#fff",
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 12,
                    elevation: 1,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.1,
                    shadowRadius: 2,
                  }}
                >
                  <Pressable onLongPress={() => handleLongPress(emp)}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginBottom: 8,
                      }}
                    >
                      <AvatarBubble
                        uri={emp.avatarUrl}
                        name={emp.name}
                        size={40}
                      />
                      <View>
                        <Text style={{ fontWeight: "600", fontSize: 16 }}>
                          {emp.name}
                        </Text>
                        <Text style={{ color: "#666", fontSize: 14 }}>
                          {emp.email}
                        </Text>
                      </View>
                    </View>

                    <Text style={{ fontSize: 14, color: "#444" }}>
                      📞 {emp.phone || "N/A"}
                    </Text>
                    <Text
                      style={{
                        fontSize: 14,
                        color: emp.role === "admin" ? "#6a0dad" : "#555",
                      }}
                    >
                      👤 Role: {emp.role}
                    </Text>
                    <Text style={{ fontSize: 14, color: "#444" }}>
                      💵 Rate:{" "}
                      {emp.hourlyRate ? `$${emp.hourlyRate.toFixed(2)}` : "—"}
                    </Text>
                    <Text
                      style={{
                        fontSize: 14,
                        color: emp.clockedIn ? "#28a745" : "#dc3545",
                      }}
                    >
                      ⏱ Status:{" "}
                      {emp.clockedIn ? "Clocked In ✅" : "Clocked Out ❌"}
                    </Text>

                    <View
                      style={{
                        flexDirection: "row",
                        marginTop: 10,
                        justifyContent: "flex-end",
                      }}
                    >
                      <TouchableOpacity
                        onPress={() => handleResetPassword(emp)}
                        style={{ marginHorizontal: 6 }}
                      >
                        <Ionicons
                          name="key-outline"
                          size={20}
                          color="#6a0dad"
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleEditEmployee(emp)}
                        style={{ marginHorizontal: 6 }}
                      >
                        <Ionicons
                          name="create-outline"
                          size={20}
                          color="#6a0dad"
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          handleDeleteEmployee(emp._id);
                          showToast("Employee deleted");
                        }}
                      >
                        <Ionicons name="trash-outline" size={20} color="red" />
                      </TouchableOpacity>
                    </View>
                  </Pressable>
                </Animated.View>
              ))}

              {/* Export action sheet (Employees) */}
          <Modal
            isVisible={exportSheetVisibleEmployees}
            onBackdropPress={() => setExportSheetVisibleEmployees(false)}
            onBackButtonPress={() => setExportSheetVisibleEmployees(false)}
            backdropOpacity={0.2}
            useNativeDriver
            useNativeDriverForBackdrop
            hideModalContentWhileAnimating
            onModalHide={() => {
              if (queuedEmployeesAction) {
                const run = queuedEmployeesAction;
                setQueuedEmployeesAction(null);
                // run on next tick so the sheet is fully gone
                setTimeout(run, 0);
              }
            }}
            style={{
              margin: 0,
              justifyContent: "flex-start",
              alignItems: "flex-end",
            }}
          >
            <View
              style={{
                marginTop: 120,
                marginRight: 16,
                backgroundColor: "#fff",
                borderRadius: 12,
                padding: 8,
                width: 220,
                elevation: 3,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.15,
                shadowRadius: 4,
              }}
              // critical: keep touches inside the sheet
              onStartShouldSetResponder={() => true}
            >
              <TouchableOpacity
                onPress={() => {
                  setQueuedEmployeesAction(
                    () => () => exportEmployeesCSV(sortedEmployees)
                  );
                  setExportSheetVisibleEmployees(false);
                }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="document-text" size={16} color="#444" />
                <Text style={{ fontWeight: "600" }}>Export CSV</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setQueuedEmployeesAction(
                    () => () => exportEmployeesPDF(sortedEmployees)
                  );
                  setExportSheetVisibleEmployees(false);
                }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="document" size={16} color="#444" />
                <Text style={{ fontWeight: "600" }}>Export PDF</Text>
              </TouchableOpacity>

              <View
                style={{
                  height: 1,
                  backgroundColor: "#eee",
                  marginVertical: 4,
                }}
              />

              <TouchableOpacity
                onPress={() => {
                  setQueuedEmployeesAction(
                    () => () => emailEmployees(sortedEmployees)
                  );
                  setExportSheetVisibleEmployees(false);
                }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="mail" size={16} color="#444" />
                <Text style={{ fontWeight: "600" }}>Email List</Text>
              </TouchableOpacity>
            </View>
          </Modal>
            </ScrollView>
          )}
        </View>
      )}

      <Modal isVisible={editModalVisible}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit {selectedEmployee?.name}</Text>

            <Text style={styles.modalLabel}>Name</Text>
            <TextInput
              placeholder="Name"
              placeholderTextColor="#777"
              value={selectedEmployee?.name || ""}
              onChangeText={(text) =>
                setSelectedEmployee((prev) => ({ ...prev!, name: text }))
              }
              style={styles.modalInput}
            />

            <Text style={styles.modalLabel}>Email</Text>
            <TextInput
              placeholder="Email"
              placeholderTextColor="#777"
              value={selectedEmployee?.email || ""}
              onChangeText={(text) =>
                setSelectedEmployee((prev) => ({ ...prev!, email: text }))
              }
              style={styles.modalInput}
            />

            <Text style={styles.modalLabel}>Phone Number</Text>
            <TextInput
              placeholder="Phone"
              placeholderTextColor="#777"
              value={selectedEmployee?.phone || ""}
              onChangeText={(text) =>
                setSelectedEmployee((prev) => ({ ...prev!, phone: text }))
              }
              style={styles.modalInput}
              keyboardType="phone-pad"
            />

            <Text style={styles.modalLabel}>Hourly Rate</Text>
            <TextInput
              placeholder="Rate"
              placeholderTextColor="#777"
              value={
                selectedEmployee?.hourlyRate !== undefined
                  ? String(selectedEmployee.hourlyRate)
                  : ""
              }
              onChangeText={(text) =>
                setSelectedEmployee((prev) => ({
                  ...prev!,
                  hourlyRate: parseFloat(text) || 0,
                }))
              }
              style={styles.modalInput}
              keyboardType="decimal-pad"
            />

            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 20,
              }}
            >
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={async () => {
                  if (!selectedEmployee) return;

                  try {
                    const res = await fetch(
                      `https://jw-auto-clinic-246.onrender.com/api/employees/${selectedEmployee._id}`,
                      {
                        method: "PUT",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${user?.token}`,
                        },
                        body: JSON.stringify(selectedEmployee),
                      }
                    );

                    if (!res.ok) throw new Error("Failed to update employee");

                    setEditModalVisible(false);
                    await fetchEmployees(); // Real-time refresh
                    showToast("Employee updated");
                  } catch (err) {
                    alert("Update failed");
                    console.error(err);
                  }
                }}
              >
                <Text style={[styles.modalItem, { color: "#6a0dad" }]}>
                  Save Changes
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <GestureHandlerRootView style={{ flex: 1 }}>
        {selectedTab === "Shifts" && (
          <View style={styles.recentCard}>
            {/* HEADER: Filters + Result count */}
            <View style={{ marginBottom: 12 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={styles.recentTitle}>Recent Shifts</Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    marginTop: -8,
                  }}
                >
                  <Text style={{ color: "#666" }}>
                    {visibleShifts.length} result
                    {visibleShifts.length === 1 ? "" : "s"}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setFiltersOpen((v) => !v)}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 8,
                      backgroundColor: "#f4e8ff",
                    }}
                  >
                    <Text style={{ color: "#6a0dad", fontWeight: "700" }}>
                      {filtersOpen ? "Hide Filters" : "Show Filters"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {filtersOpen && (
                <>
                  {/* STATUS + SORT as scrollable chips */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{
                      paddingVertical: 8,
                      paddingHorizontal: 4,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      {/* Status */}
                      {["All", "Active", "Completed"].map((status) => {
                        const isActive =
                          status === "All"
                            ? statusFilter === null
                            : statusFilter === status;
                        return (
                          <TouchableOpacity
                            key={status}
                            onPress={() =>
                              setStatusFilter(
                                status === "All"
                                  ? null
                                  : (status as "Active" | "Completed")
                              )
                            }
                            style={chip(isActive)}
                          >
                            <Ionicons
                              name={
                                status === "Active"
                                  ? "play-circle"
                                  : status === "Completed"
                                    ? "checkmark-circle"
                                    : "layers"
                              }
                              size={16}
                              color={isActive ? "#fff" : "#444"}
                            />
                            <Text style={chipText(isActive)}>{status}</Text>
                          </TouchableOpacity>
                        );
                      })}

                      {/* Sort dropdown trigger */}
                      <TouchableOpacity
                        onPress={() => setSortMenuVisible(true)}
                        style={chip(Boolean(shiftSortBy))}
                      >
                        <Ionicons
                          name="swap-vertical"
                          size={16}
                          color={shiftSortBy ? "#fff" : "#444"}
                        />
                        <Text style={chipText(Boolean(shiftSortBy))}>
                          {shiftSortBy ? `Sort: ${shiftSortBy}` : "Sort"}
                        </Text>
                      </TouchableOpacity>

                      {/* Quick date ranges */}
                      {[
                        { key: "today", label: "Today", icon: "calendar" },
                        { key: "7d", label: "Last 7 days", icon: "calendar" },
                        { key: "30d", label: "Last 30 days", icon: "calendar" },
                        { key: "ytd", label: "YTD", icon: "calendar" },
                      ].map(({ key, label, icon }) => {
                        const active = !!dateFrom || !!dateTo; // any date filter active, we colour chips uniformly
                        return (
                          <TouchableOpacity
                            key={key}
                            onPress={() => quickRange(key as any)}
                            style={chip(active)}
                          >
                            <Ionicons
                              name={icon as any}
                              size={16}
                              color={active ? "#fff" : "#444"}
                            />
                            <Text style={chipText(active)}>{label}</Text>
                          </TouchableOpacity>
                        );
                      })}

                      {/* Clear all */}
                      <TouchableOpacity
                        onPress={() => {
                          setShiftSearchText("");
                          setStatusFilter(null);
                          setDateFrom("");
                          setDateTo("");
                          setShiftSortBy(null);
                        }}
                        style={chip(false)}
                      >
                        <Ionicons name="close-circle" size={16} color="#444" />
                        <Text style={chipText(false)}>Clear All</Text>
                      </TouchableOpacity>
                    </View>
                  </ScrollView>

                  {/* Search Box */}
                  <TextInput
                    placeholder="Search by employee name"
                    placeholderTextColor="#777"
                    value={shiftSearchText}
                    onChangeText={setShiftSearchText}
                    style={{
                      backgroundColor: "#f4f4f4",
                      padding: 10,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: "#ddd",
                      marginBottom: 12,
                    }}
                  />

                  {/* Date Range Inputs (native pickers on iOS/Android, input[type=date] on Web) */}
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    {/* FROM */}
                    {Platform.OS === "web" ? (
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.currentTarget.value)}
                        placeholder="From"
                        style={
                          {
                            flex: 1,
                            background: "#f4f4f4",
                            padding: 10,
                            borderRadius: 8,
                            border: "1px solid #ddd",
                            height: 40,
                          } as React.CSSProperties
                        }
                      />
                    ) : (
                      <TouchableOpacity
                        onPress={openFromPicker}
                        style={{
                          flex: 1,
                          backgroundColor: "#f4f4f4",
                          padding: 10,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: "#ddd",
                          height: 40,
                          justifyContent: "center",
                        }}
                        activeOpacity={0.8}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Ionicons
                            name="calendar"
                            size={16}
                            color={dateFrom ? "#111" : "#777"}
                            style={{ marginRight: 8 }}
                          />
                          <Text style={{ color: dateFrom ? "#111" : "#777" }}>
                            {dateFrom || "From Date"}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    )}

                    {/* TO */}
                    {Platform.OS === "web" ? (
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.currentTarget.value)}
                        placeholder="To"
                        style={
                          {
                            flex: 1,
                            background: "#f4f4f4",
                            padding: 10,
                            borderRadius: 8,
                            border: "1px solid #ddd",
                            height: 40,
                          } as React.CSSProperties
                        }
                      />
                    ) : (
                      <TouchableOpacity
                        onPress={openToPicker}
                        style={{
                          flex: 1,
                          backgroundColor: "#f4f4f4",
                          padding: 10,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: "#ddd",
                          height: 40,
                          justifyContent: "center",
                        }}
                        activeOpacity={0.8}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Ionicons
                            name="calendar"
                            size={16}
                            color={dateTo ? "#111" : "#777"}
                            style={{ marginRight: 8 }}
                          />
                          <Text style={{ color: dateTo ? "#111" : "#777" }}>
                            {dateTo || "To Date"}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    )}

                    {/* Clear range */}
                    <TouchableOpacity
                      onPress={() => quickRange("clear")}
                      style={{
                        paddingHorizontal: 12,
                        height: 40,
                        borderRadius: 8,
                        backgroundColor: "#eee",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ color: "#444", fontWeight: "600" }}>
                        Clear
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* iOS/Android Modals (keep your DatePickerModal version) */}
                  {Platform.OS !== "web" && (
                    <>
                      <DatePickerModal
                        locale="en"
                        visible={isFromPickerVisible}
                        mode="single"
                        date={dateFrom ? new Date(dateFrom) : new Date()}
                        onConfirm={({ date }) => date && onConfirmFrom(date)}
                        onDismiss={closeFromPicker}
                      />
                      <DatePickerModal
                        locale="en"
                        visible={isToPickerVisible}
                        mode="single"
                        date={dateTo ? new Date(dateTo) : new Date()}
                        onConfirm={({ date }) => date && onConfirmTo(date)}
                        onDismiss={closeToPicker}
                      />
                    </>
                  )}
                </>
              )}
            </View>

            {/* EXPORT toolbar (single button → action sheet) */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                marginBottom: 12,
              }}
            >
              <TouchableOpacity
                onPress={() => setExportSheetVisibleShifts(true)}
                disabled={!visibleShifts.length}
                style={{
                  opacity: visibleShifts.length ? 1 : 0.5,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  backgroundColor: "#6a0dad",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Ionicons name="download" size={18} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "700" }}>Export</Text>
              </TouchableOpacity>
            </View>

            {/* SORT modal (very small) */}
            <Modal
              isVisible={sortMenuVisible}
              onBackdropPress={() => setSortMenuVisible(false)}
              backdropOpacity={0.2}
              animationIn="fadeIn"
              animationOut="fadeOut"
            >
              <Pressable
                style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.2)" }}
                onPress={() => setSortMenuVisible(false)}
              >
                <View
                  style={{
                    position: "absolute",
                    right: 16,
                    top: 120,
                    backgroundColor: "#fff",
                    borderRadius: 12,
                    padding: 8,
                    width: 180,
                    elevation: 3,
                  }}
                >
                  {(["name", "status", "date"] as const).map((k) => {
                    const active = shiftSortBy === k;
                    return (
                      <TouchableOpacity
                        key={k}
                        onPress={() => {
                          setShiftSortBy(active ? null : k);
                          setSortMenuVisible(false);
                        }}
                        style={{
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          borderRadius: 8,
                          backgroundColor: active ? "#f4e8ff" : "#fff",
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Ionicons
                          name={
                            k === "date"
                              ? "calendar"
                              : k === "name"
                                ? "person"
                                : "funnel"
                          }
                          size={16}
                          color={active ? "#6a0dad" : "#444"}
                        />
                        <Text
                          style={{
                            color: active ? "#6a0dad" : "#222",
                            fontWeight: active ? "700" : "500",
                          }}
                        >
                          Sort by {k}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </Pressable>
            </Modal>

            {/* Export action sheet (Shifts) */}
            <Modal
              isVisible={exportSheetVisibleShifts}
              onBackdropPress={() => setExportSheetVisibleShifts(false)}
              onBackButtonPress={() => setExportSheetVisibleShifts(false)}
              backdropOpacity={0.2}
              useNativeDriver
              useNativeDriverForBackdrop
              hideModalContentWhileAnimating
              onModalHide={() => {
                if (queuedShiftsAction) {
                  const run = queuedShiftsAction;
                  setQueuedShiftsAction(null);
                  setTimeout(run, 0);
                }
              }}
              style={{
                margin: 0,
                justifyContent: "flex-start",
                alignItems: "flex-end",
              }}
            >
              <View
                style={{
                  marginTop: 120,
                  marginRight: 16,
                  backgroundColor: "#fff",
                  borderRadius: 12,
                  padding: 8,
                  width: 210,
                  elevation: 3,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.15,
                  shadowRadius: 4,
                }}
                onStartShouldSetResponder={() => true}
              >
                <TouchableOpacity
                  onPress={() => {
                    setQueuedShiftsAction(
                      () => () => handleExportCSV(visibleShifts)
                    );
                    setExportSheetVisibleShifts(false);
                  }}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="document-text" size={16} color="#444" />
                  <Text style={{ fontWeight: "600" }}>Export CSV</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setQueuedShiftsAction(
                      () => () => handleExportPDF(visibleShifts)
                    );
                    setExportSheetVisibleShifts(false);
                  }}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="document" size={16} color="#444" />
                  <Text style={{ fontWeight: "600" }}>Export PDF</Text>
                </TouchableOpacity>

                <View
                  style={{
                    height: 1,
                    backgroundColor: "#eee",
                    marginVertical: 4,
                  }}
                />

                <TouchableOpacity
                  onPress={() => {
                    setQueuedShiftsAction(
                      () => () => handleEmailDocument(visibleShifts, "csv")
                    );
                    setExportSheetVisibleShifts(false);
                  }}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="mail" size={16} color="#444" />
                  <Text style={{ fontWeight: "600" }}>Email CSV</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setQueuedShiftsAction(
                      () => () => handleEmailDocument(visibleShifts, "pdf")
                    );
                    setExportSheetVisibleShifts(false);
                  }}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="mail" size={16} color="#444" />
                  <Text style={{ fontWeight: "600" }}>Email PDF</Text>
                </TouchableOpacity>
              </View>
            </Modal>

            {isTablet ? (
              // Tablet/Desktop table with delete column
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View style={{ minWidth: 880 }}>
                  <View style={[styles.tableRow, styles.tableHeader]}>
                    <Text style={[styles.columnHeader, { width: 140 }]}>
                      Employee
                    </Text>
                    <Text style={[styles.columnHeader, { width: 100 }]}>
                      Date
                    </Text>
                    <Text style={[styles.columnHeader, { width: 100 }]}>
                      Clock In
                    </Text>
                    <Text style={[styles.columnHeader, { width: 100 }]}>
                      Clock Out
                    </Text>
                    <Text style={[styles.columnHeader, { width: 100 }]}>
                      Status
                    </Text>
                    <Text
                      style={[
                        styles.columnHeader,
                        { width: 80, textAlign: "center" },
                      ]}
                    >
                      Delete
                    </Text>
                  </View>

                  {sortedShifts.map((shift, index) => {
                    const keyId = shift._id || shift.id || String(index);
                    return (
                      <TouchableOpacity
                        key={keyId}
                        onPress={() => {
                          setSelectedShift(shift);
                          setShiftModalVisible(true);
                        }}
                      >
                        <Animated.View
                          entering={FadeInUp.delay(index * 50)}
                          style={[
                            styles.tableRow,
                            {
                              backgroundColor:
                                index % 2 === 0 ? "#f9f9f9" : "#fff",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.cell,
                              { width: 140, fontWeight: "600" },
                            ]}
                          >
                            {shift.employee}
                          </Text>
                          <Text style={[styles.cell, { width: 100 }]}>
                            {shift.date}
                          </Text>
                          <Text style={[styles.cell, { width: 100 }]}>
                            {shift.clockIn}
                          </Text>
                          <Text style={[styles.cell, { width: 100 }]}>
                            {shift.clockOut || "—"}
                          </Text>
                          <View
                            style={{
                              width: 100,
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <Text style={{ fontSize: 18 }}>
                              {shift.status === "Active" ? "🟢" : "🔴"}
                            </Text>
                            <Text style={styles.statusText}>
                              {shift.status}
                            </Text>
                          </View>
                          <View
                            style={{
                              width: 80,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <TouchableOpacity
                              onPress={() => handleDeleteShift(keyId)}
                              style={{
                                backgroundColor: "#e53935",
                                paddingVertical: 6,
                                paddingHorizontal: 10,
                                borderRadius: 8,
                              }}
                            >
                              <Text
                                style={{ color: "#fff", fontWeight: "700" }}
                              >
                                Delete
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </Animated.View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            ) : (
              // Mobile Swipe-to-delete layout
              <ScrollView showsVerticalScrollIndicator={false}>
                {sortedShifts.map((shift, index) => {
                  const keyId = shift._id || shift.id || String(index);
                  return (
                    <Swipeable
                      key={getShiftId(shift) || String(index)}
                      renderRightActions={() =>
                        renderRightActions(getShiftId(shift))
                      }
                      overshootRight={false}
                      friction={2}
                    >
                      <TouchableOpacity
                        onPress={() => {
                          setSelectedShift(shift);
                          setShiftModalVisible(true);
                        }}
                        activeOpacity={0.9}
                      >
                        <Animated.View
                          entering={FadeInUp.delay(index * 50)}
                          style={{
                            backgroundColor: "#fff",
                            borderRadius: 12,
                            padding: 12,
                            marginBottom: 12,
                            elevation: 1,
                            shadowColor: "#000",
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.1,
                            shadowRadius: 2,
                          }}
                        >
                          <Text style={{ fontWeight: "600", fontSize: 16 }}>
                            {shift.employee}
                          </Text>
                          <Text style={{ color: "#666", marginBottom: 4 }}>
                            {shift.date}
                          </Text>
                          <Text style={{ fontSize: 14 }}>
                            ⏱ {shift.clockIn} → {shift.clockOut || "—"}
                          </Text>
                          <Text style={{ fontSize: 14 }}>
                            {shift.status === "Active"
                              ? "🟢 Active"
                              : "🔴 Completed"}
                          </Text>
                        </Animated.View>
                      </TouchableOpacity>
                    </Swipeable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}
      </GestureHandlerRootView>

      {/* <Modal isVisible={shiftModalVisible} onBackdropPress={() => setShiftModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Shift Details</Text>
            <Text>Employee: {selectedShift?.employee}</Text>
            <Text>Date: {selectedShift?.date}</Text>
            <Text>Clock In: {selectedShift?.clockIn}</Text>
            <Text>Clock Out: {selectedShift?.clockOut || '—'}</Text>
            <Text>Hours: {selectedShift?.hours || '—'}</Text>
            <Text>Status: {selectedShift?.status}</Text>
            <TouchableOpacity onPress={() => setShiftModalVisible(false)} style={{ marginTop: 16 }}>
              <Text style={styles.modalClose}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal> */}

      {selectedTab === "Reports" && (
        <ScrollView contentContainerStyle={styles.reportsContainer}>
          <View style={{ marginBottom: 16 }}>
            {/* REPORTS TOOLBAR */}
            <View style={styles.reportToolbar}>
              {/* Row 1: Period + Segmented toggle */}
              <View style={styles.reportToolbarRow}>
                <View style={styles.toolbarCol}>
                  <Text style={styles.toolbarLabel}>Period</Text>
                  <DropDownPicker
                    open={open}
                    value={reportPeriod}
                    items={periodItems}
                    setOpen={setOpen}
                    setValue={setReportPeriod}
                    setItems={setPeriodItems}
                    onChangeValue={(v) => { if (v === "Custom") setReportDateModalOpen(true); }}
                    containerStyle={styles.periodPickerContainer}
                    style={styles.periodPicker}
                    dropDownContainerStyle={styles.periodPickerDropdown}
                    textStyle={styles.periodPickerText}
                    placeholder="Select Period"
                    listMode="SCROLLVIEW"
                  />
                </View>

                <View style={[styles.toolbarCol, { flexGrow: 0 }]}>
                  <Text style={styles.toolbarLabel}>Metric</Text>
                  <View style={styles.segment}>
                    {(["Revenue", "Services", "Expenses"] as const).map((type) => {
                      const active = chartType === type;
                      return (
                        <TouchableOpacity
                          key={type}
                          onPress={() => setChartType(type)}
                          accessibilityRole="button"
                          accessibilityLabel={`Show ${type}`}
                          style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                        >
                          <Ionicons
                            name={
                              type === "Revenue"
                                ? "cash-outline"
                                : type === "Services"
                                ? "construct-outline"
                                : "wallet-outline"
                            }
                            size={16}
                            color={active ? "#fff" : "#444"}
                          />
                          <Text style={[styles.segmentBtnText, active && styles.segmentBtnTextActive]}>
                            {type}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>

              {/* Row 2: Selected range pill + Actions */}
              <View style={styles.reportToolbarRow}>
                <View style={[styles.toolbarCol, { flexGrow: 1 }]}>
                  <View style={styles.rangePill}>
                    <Ionicons name="calendar-outline" size={16} color="#6a0dad" />
                    <Text style={styles.rangePillText}>{periodLabel()}</Text>
                    {reportPeriod === "Custom" && (
                      <TouchableOpacity onPress={() => setReportDateModalOpen(true)} style={{ marginLeft: 6 }}>
                        <Ionicons name="create-outline" size={16} color="#6a0dad" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                <View style={[styles.toolbarCol, styles.toolbarActions]}>
                  <TouchableOpacity
                    onPress={pickExpensesCSV}
                    style={styles.actionBtnSecondary}
                    accessibilityRole="button"
                    accessibilityLabel="Upload expenses CSV"
                  >
                    <Ionicons name="cloud-upload-outline" size={18} color="#444" />
                    <Text style={styles.actionBtnSecondaryText}>Upload Expenses CSV</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setExportSheetVisibleReports(true)}
                    style={styles.actionBtnPrimary}
                    accessibilityRole="button"
                    accessibilityLabel="Export report"
                  >
                    <Ionicons name="download" size={18} color="#fff" />
                    <Text style={styles.actionBtnPrimaryText}>Export</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>


            {/* Bar Chart */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <BarChart
                data={barData}
                width={Math.max(screenWidth, barData.labels.length * 60)} // Dynamic width
                height={220}
                yAxisLabel="$"
                yAxisSuffix=""
                fromZero
                withInnerLines={true}
                showBarTops={true}
                showValuesOnTopOfBars={true}
                chartConfig={{
                  backgroundColor: "#fff",
                  backgroundGradientFrom: "#fff",
                  backgroundGradientTo: "#fff",
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(106, 13, 173, ${opacity})`,
                  labelColor: () => "#666",
                  propsForBackgroundLines: {
                    strokeDasharray: "",
                  },
                }}
                style={{
                  marginVertical: 16,
                  borderRadius: 12,
                }}
              />
            </ScrollView>
          </View>

          <View style={styles.reportCards}>
            <View style={styles.reportCard}>
              <Text style={styles.cardLabel}>💰</Text>
              <Text style={styles.cardValue}>
                ${reportData.totalRevenue.toFixed(2)}
              </Text>
              <Text style={styles.cardTitle}>Total Revenue</Text>
            </View>

            <View style={styles.reportCard}>
              <Text style={styles.cardLabel}>💸</Text>
              <Text style={styles.cardValue}>
                {(() => {
                  const { start, end } = getReportWindow();
                  const total = expenses
                    .filter((e) => {
                      const d = parseMaybeDate(e.date);
                      return d ? inRange(d, start, end) : false;
                    })
                    .reduce((s, e) => s + e.amount, 0);
                  return `$${total.toFixed(2)}`;
                })()}
              </Text>
              <Text style={styles.cardTitle}>Total Expenses</Text>
            </View>

            <View style={styles.reportCard}>
              <Text style={styles.cardLabel}>🧮</Text>
              <Text style={styles.cardValue}>
                {(() => {
                  const { start, end } = getReportWindow();
                  const rev = transactions
                    .filter((t) => {
                      const d = parseMaybeDate(t.serviceDate);
                      return d ? inRange(d, start, end) : false;
                    })
                    .reduce((s, t) => s + Number(t.originalPrice || 0), 0);
                  const exp = expenses
                    .filter((e) => {
                      const d = parseMaybeDate(e.date);
                      return d ? inRange(d, start, end) : false;
                    })
                    .reduce((s, e) => s + e.amount, 0);
                  return `$${(rev - exp).toFixed(2)}`;
                })()}
              </Text>
              <Text style={styles.cardTitle}>Net (Rev - Exp)</Text>
            </View>


            <View style={styles.reportCard}>
              <Text style={styles.cardLabel}>🚗</Text>
              <Text style={styles.cardValue}>{reportData.totalServices}</Text>
              <Text style={styles.cardTitle}>Total Services</Text>
            </View>

            <View style={styles.reportCard}>
              <Text style={styles.cardLabel}>👥</Text>
              <Text style={styles.cardValue}>{reportData.totalEmployees}</Text>
              <Text style={styles.cardTitle}>Total Employees</Text>
            </View>

            <View style={styles.reportCard}>
              <Text style={styles.cardLabel}>🕒</Text>
              <Text style={styles.cardValue}>{reportData.activeNow}</Text>
              <Text style={styles.cardTitle}>Active Now</Text>
            </View>
          </View>

          <View style={styles.performanceCard}>
            <Text style={styles.performanceTitle}>Today's Performance</Text>

            <View style={styles.performanceRow}>
              <View>
                <Text style={styles.performanceSubTitle}>Revenue</Text>
                <Text style={styles.performanceValue}>
                  ${reportData.todayRevenue.toFixed(2)}
                </Text>
                <Text style={styles.performanceNote}>
                  from {reportData.todayTransactions} transactions
                </Text>
              </View>

              <View style={styles.performanceColumn}>
                <Text style={styles.performanceSubTitle}>Activity</Text>
                <Text style={styles.performanceItem}>
                  Services Completed: {reportData.todayServices}
                </Text>
                <Text style={styles.performanceItem}>
                  Staff on Duty: {reportData.todayClockedIn}
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      )}


      <DatePickerModal
        locale="en"
        mode="range"
        visible={reportDateModalOpen}
        onDismiss={() => setReportDateModalOpen(false)}
        startDate={reportRange.startDate}
        endDate={reportRange.endDate}
        onConfirm={({ startDate, endDate }) => {
          setReportRange({ startDate, endDate });
          setReportDateModalOpen(false);
        }}
      />




      <Modal
        isVisible={exportSheetVisibleReports}
        onBackdropPress={() => setExportSheetVisibleReports(false)}
        onBackButtonPress={() => setExportSheetVisibleReports(false)}
        backdropOpacity={0.2}
        useNativeDriver
        useNativeDriverForBackdrop
        hideModalContentWhileAnimating
        style={{ margin: 0, justifyContent: "flex-start", alignItems: "flex-end" }}
        // run the queued action only after the sheet fully closes
        onModalHide={async () => {
          const fn = pendingReportActionRef.current;
          pendingReportActionRef.current = null;
          if (fn) await fn();
        }}
      >
        <View
          style={{
            marginTop: 120,
            marginRight: 16,
            backgroundColor: "#fff",
            borderRadius: 12,
            padding: 8,
            width: 230,
            elevation: 3,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.15,
            shadowRadius: 4,
          }}
          onStartShouldSetResponder={() => true}
        >
          {/* CSV */}
          <TouchableOpacity
            onPress={() => {
              pendingReportActionRef.current = async () => { await exportReportCSV(); };
              setExportSheetVisibleReports(false);
            }}
            style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 8 }}
            activeOpacity={0.7}
          >
            <Ionicons name="document-text" size={16} color="#444" />
            <Text style={{ fontWeight: "600" }}>Export CSV</Text>
          </TouchableOpacity>

          {/* PDF */}
          <TouchableOpacity
            onPress={() => {
              pendingReportActionRef.current = async () => { await exportReportPDF(); };
              setExportSheetVisibleReports(false);
            }}
            style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 8 }}
            activeOpacity={0.7}
          >
            <Ionicons name="document" size={16} color="#444" />
            <Text style={{ fontWeight: "600" }}>Export PDF</Text>
          </TouchableOpacity>

          <View style={{ height: 1, backgroundColor: "#eee", marginVertical: 4 }} />

          {/* Email CSV */}
          <TouchableOpacity
            disabled={isComposingEmail}
            onPress={() => {
              pendingReportActionRef.current = async () => {
                if (isComposingEmail) return;
                setIsComposingEmail(true);
                try { await emailReport("csv"); }
                finally { setIsComposingEmail(false); }
              };
              setExportSheetVisibleReports(false);
            }}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              opacity: isComposingEmail ? 0.6 : 1,
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="mail" size={16} color="#444" />
            <Text style={{ fontWeight: "600" }}>Email CSV</Text>
          </TouchableOpacity>

          {/* Email PDF */}
          <TouchableOpacity
            disabled={isComposingEmail}
            onPress={() => {
              pendingReportActionRef.current = async () => {
                if (isComposingEmail) return;
                setIsComposingEmail(true);
                try { await emailReport("pdf"); }
                finally { setIsComposingEmail(false); }
              };
              setExportSheetVisibleReports(false);
            }}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              opacity: isComposingEmail ? 0.6 : 1,
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="mail" size={16} color="#444" />
            <Text style={{ fontWeight: "600" }}>Email PDF</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      
    </ScrollView>
  );
}


const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: "#fff",
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  logo: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#6a0dad",
    marginTop: Platform.OS === "web" ? 20 : 40,
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  filter: {
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  filterActive: {
    backgroundColor: "#efdbff",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  filterText: {
    color: "#555",
    fontSize: 13,
  },
  filterTextActive: {
    color: "#6a0dad",
    fontWeight: "600",
    fontSize: 13,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  card: {
    flexGrow: 1,
    flexBasis: "48%",
    backgroundColor: "#fafafa",
    borderRadius: 12,
    padding: 12,
    elevation: 1,
    maxWidth: "48%",
  },
  cardTitle: { color: "#666", fontSize: 13 },
  cardAmount: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#6a0dad",
    marginTop: 4,
  },
  cardSub: { fontSize: 12, color: "#999" },
  chartCard: {
    backgroundColor: "#fafafa",
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    marginBottom: 24,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 1, // Android shadow
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
    color: "#2c2c2c",
  },
  columnHeader: { fontWeight: "700", color: "#555", fontSize: 12 },
  cell: { fontSize: 12, color: "#333" },
  tableRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  tableHeader: {
    borderBottomWidth: 1,
    borderColor: "#ccc",
    paddingBottom: 6,
    marginBottom: 10,
  },
  placeholderCard: {
    backgroundColor: "#fafafa",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    minHeight: 150,
  },
  placeholderText: {
    fontSize: 14,
    color: "#777",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#000",
  },
  statusActive: { backgroundColor: "#d2f7e3" },
  statusCompleted: { backgroundColor: "#eee" },
  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e6d4ff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
  },
  exportText: {
    color: "#6a0dad",
    fontWeight: "bold",
    marginLeft: 6,
  },
  exportOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#f4f1fc",
    borderRadius: 10,
    marginTop: 10,
  },
  exportIcon: { marginRight: 12 },
  exportOptionText: {
    fontSize: 15,
    color: "#333",
    fontWeight: "600",
  },
  reportsContainer: {
    padding: 20,
    backgroundColor: "#fff",
    paddingBottom: 100,
  },
  reportCards: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
    marginBottom: 16,
  },
  reportCard: {
    flexGrow: 1,
    flexBasis: "48%",
    backgroundColor: "#f9f9f9",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    minWidth: "47%",
    maxWidth: "100%",
  },
  performanceCard: {
    backgroundColor: "#f8f9fa",
    padding: 20,
    borderRadius: 12,
    marginTop: 20,
  },
  performanceTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 14,
    color: "#333",
  },
  performanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  performanceColumn: {
    alignItems: "flex-end",
  },
  performanceSubTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  performanceValue: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#6a0dad",
  },
  performanceNote: {
    fontSize: 12,
    color: "#888",
  },
  performanceItem: {
    fontSize: 14,
    marginBottom: 2,
    color: "#333",
  },
  cardLabel: { fontSize: 24 },
  cardValue: {
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 6,
    color: "#333",
  },
  refreshButton: {
    alignSelf: "flex-start",
    marginTop: -10,
    marginBottom: 10,
    backgroundColor: "#e1e1ff",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  refreshText: {
    color: "#4b3ca6",
    fontWeight: "600",
  },
  recentCard: {
    marginTop: 20,
    paddingBottom: 100,
  },
  recentTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
    color: "#333",
  },
  transactionCard: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
    width: isTablet ? "48%" : "100%",
  },

  txService: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
    color: "#6a0dad",
  },
  txRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  txLabel: {
    fontSize: 14,
    color: "#888",
  },
  txValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#222",
  },
  modalCard: {
    backgroundColor: "#fff",
    padding: 24,
    borderRadius: 20,
    width: "85%",
    maxWidth: 500,
    alignItems: "flex-start",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#6a0dad",
    marginBottom: 12,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
    marginTop: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  modalLine: {
    fontSize: 15,
    marginVertical: 2,
    color: "#333",
  },
  modalButton: {
    marginTop: 16,
    alignSelf: "center",
    backgroundColor: "#6a0dad",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
  },
  modalButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
    backgroundColor: "#eee",
  },
  searchBox: {
    backgroundColor: "#f3f3f3",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    color: "#333",
    width: "100%",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 16,
    width: "80%",
    maxWidth: 500,
  },
  modalItem: {
    fontSize: 16,
    fontWeight: "600",
  },
  modalClose: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6a0dad",
    textAlign: "center",
  },
  dropdown: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    backgroundColor: "#fafafa",
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  dropdownContainer: {
    borderColor: "#ddd",
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: "#fafafa",
  },
  chipStyle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#6a0dad",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  chipText: {
    color: "#fff",
    fontWeight: "600",
  },
  reportToolbar: {
    marginVertical: 12,
    gap: 10,
  },
  reportToolbarRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "flex-end",
  },
  toolbarCol: {
    minWidth: 160,
    flexShrink: 1,
  },
  toolbarLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#666",
    marginBottom: 6,
  },
  
  // DropDownPicker fixes
  periodPickerContainer: {
    height: 40,
    zIndex: 3000,          // makes the dropdown appear over neighbors (iOS)
    elevation: 4,          // Android
  },
  periodPicker: {
    borderColor: "#f3e8ff",
    borderRadius: 10,
    minHeight: 40,
    backgroundColor: "#f3e8ff",
  },
  periodPickerDropdown: {
    borderColor: "#f3e8ff",
    borderRadius: 10,
    backgroundColor: "#f3e8ff",
  },
  periodPickerText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6a0dad",
  },
  
  // Segmented control
  segment: {
    flexDirection: "row",
    backgroundColor: "#eee",
    borderRadius: 999,
    padding: 4,
    gap: 6,
  },
  segmentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "transparent",
  },
  segmentBtnActive: {
    backgroundColor: "#6a0dad",
  },
  segmentBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#444",
  },
  segmentBtnTextActive: {
    color: "#fff",
  },
  
  // Range pill + actions
  rangePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f4e8ff",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  rangePillText: {
    color: "#6a0dad",
    fontWeight: "700",
    fontSize: 13,
  },
  
  toolbarActions: {
    flexDirection: "row",
    gap: 8,
    flexGrow: 0,
    flexShrink: 0,
  },
  
  actionBtnSecondary: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#eee",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionBtnSecondaryText: {
    color: "#444",
    fontWeight: "700",
  },
  
  actionBtnPrimary: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#6a0dad",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionBtnPrimaryText: {
    color: "#fff",
    fontWeight: "700",
  },
  
});
