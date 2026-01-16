import { useAuth } from "@/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as MailComposer from "expo-mail-composer";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  InteractionManager,
  KeyboardAvoidingView, Modal, Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View
} from "react-native";
// import * as Animatable from "react-native-animatable";
import { BarChart, LineChart, PieChart } from "react-native-chart-kit";
import DropDownPicker from "react-native-dropdown-picker";
import {
  GestureHandlerRootView,
  Swipeable,
} from "react-native-gesture-handler";
import {
  DatePickerModal,
  en,
  registerTranslation,
} from "react-native-paper-dates";
import Animated, { FadeInUp } from "react-native-reanimated";

const { width: screenWidth } = Dimensions.get("window");
const isTablet = screenWidth >= 600 && screenWidth < 1024;
registerTranslation("en", en);

interface Transaction {
  _id: string;
  serviceType: string;
  originalPrice: number;
  finalPrice: number;
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

interface Worker {
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
  date: string; // YYYY-MM-DD or ISO
  amount: number; // positive expense amount
  category?: string;
  note?: string;
}

interface Shift {
  _id: string;
  id?: string;
  worker: string;
  date: string;
  clockIn: string;
  clockOut?: string;
  hours?: string;
  status: string;
  lunchStart?: string;
  lunchEnd?: string;
}

// helpers
const getInitials = (fullName: string) =>
  fullName
    ?.split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

// ======= NEW: central share helper (web-safe) =======
const shareFile = async (uri: string, mime?: string) => {
  try {
    if (Platform.OS === "web") {
      const resp = await fetch(uri);                    // ← no new File(...)
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = uri.split("/").pop() || "download";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return;
    }
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, mime ? { mimeType: mime } : undefined);
    } else {
      Alert.alert("Saved", `File saved to: ${uri}`);
    }
  } catch (e: any) {
    Alert.alert("Share failed", e?.message || "Could not share file.");
  }
};


// ======= CSV utils (dedupe + quoted commas safe) =======
const splitCSVLine = (line: string) =>
  line
    .match(/("([^"]|"")*"|[^,])+/g)
    ?.map((s) => s.replace(/^"|"$/g, "").replace(/""/g, '"')) ?? [];

// date utils
const fmtYMD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const parseMaybeDate = (v?: string) => {
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t);
};

const FS_DIR = (FileSystem.documentDirectory ?? FileSystem.cacheDirectory)!;

const writeTextFileAsync = async (fileName: string, contents: string) => {
  const uri = FS_DIR + fileName;
  await FileSystem.writeAsStringAsync(uri, contents); // UTF-8 by default
  return uri;
};

const readTextFileAsync = (uri: string) =>
  FileSystem.readAsStringAsync(uri); // UTF-8 by default

const moveFileAsync = async (fromUri: string, toFileName: string) => {
  const toUri = FS_DIR + toFileName;
  await FileSystem.moveAsync({ from: fromUri, to: toUri });
  return toUri;
};

type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxHeight?: number;
};

const BottomSheet: React.FC<BottomSheetProps> = ({
  visible,
  onClose,
  title,
  children,
  maxHeight = 420,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Pressable
        style={styles.sheetBackdrop}
        onPress={onClose}
      />

      {/* Sheet */}
      <View style={[styles.sheetContainer, { maxHeight }]}>
        <View style={styles.sheetHandle} />
        {title ? <Text style={styles.sheetTitle}>{title}</Text> : null}

        <ScrollView
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          contentContainerStyle={styles.sheetContent}
        >
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
};


// Anchored, reusable top-right floating export menu
const ExportFabMenu: React.FC<{
  visible: boolean;
  onClose: () => void;
  items: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void | Promise<void>;
    disabled?: boolean;
  }[];
  title?: string;
}> = ({ visible, onClose, items, title }) => {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      maxHeight={320}
    >
      {items.map((it, idx) => (
        <TouchableOpacity
          key={idx}
          onPress={async () => {
            if (it.disabled) return;
            onClose();
            try {
              await it.onPress();
            } catch (e) {
              // console.warn("Export action failed", e);
            }
          }}
          disabled={it.disabled}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            opacity: it.disabled ? 0.5 : 1,
          }}
          activeOpacity={0.7}
        >
          <Ionicons name={it.icon} size={18} color="#444" />
          <Text style={{ fontWeight: "600" }}>{it.label}</Text>
        </TouchableOpacity>
      ))}
    </BottomSheet>
  );
};





export default function HomeScreen() {
  const [selectedTab, setSelectedTab] = useState<
    "Transactions" | "Workers" | "Shifts" | "Reports"
  >("Transactions");
  const [chartMode, setChartMode] = useState<"monthly" | "trend" | "methods"
  >("monthly");  
  const [activePoint, setActivePoint] = useState<{
    label: string;
    value: number;
    extra?: string;
  } | null>(null);
  const windowWidth = Dimensions.get("window").width;
  const isWeb = Platform.OS === "web";
  const isAndroid = Platform.OS === "android";
  const isIOS = Platform.OS === "ios";
  const isNative = isAndroid || isIOS || isWeb;

  // You probably already have chartWidth – if so, update it to this:
  const chartWidth = isNative ? windowWidth - 32 : Math.min(windowWidth * 0.8, 900);
  
  const { user } = useAuth();
  // const { width } = useWindowDimensions();
  // const chartWidth = Math.max(width - 60, 320);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const allTabs = ["Transactions", "Workers", "Shifts", "Reports"];
  const visibleTabs = allTabs.filter((tab) =>
    ["Workers", "Shifts", "Reports"].includes(tab)
      ? user?.role === "admin"
      : true
  );

  // One flag per tab to open the export FAB menu
  const [exportFabTransactionsOpen, setExportFabTransactionsOpen] = useState(false);
  const [exportFabEmployeesOpen, setExportFabEmployeesOpen] = useState(false);
  const [exportFabShiftsOpen, setExportFabShiftsOpen] = useState(false);
  const [exportFabReportsOpen, setExportFabReportsOpen] = useState(false);


  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("https://jw-auto-clinic-246.onrender.com/api/transactions", {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      const data = await res.json();
  
      // ⬇ normalize here
      const list: Transaction[] = Array.isArray(data)
        ? data
        : (Array.isArray((data as any)?.items) ? (data as any).items : []);
      setTransactions(list);
    } catch (err) {
      // console.error("Failed to fetch transactions:", err);
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
      Alert.alert(
        "Email unavailable",
        "Mail services are not available on this device."
      );
      return;
    }
    emailBusyRef.current = true;
    try {
      await MailComposer.composeAsync(opts);
    } finally {
      emailBusyRef.current = false;
    }
  };

  // Workers
  const [workers, setEmployees] = useState<Worker[]>([]);
  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch(
        "https://jw-auto-clinic-246.onrender.com/api/workers",
        {
          headers: { Authorization: `Bearer ${user?.token}` },
        }
      );
      const data = await res.json();
      setEmployees(data);
    } catch (err) {
      // console.error("Failed to fetch workers:", err);
    }
  }, [user]);

  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [clockedInFilter, setClockedInFilter] = useState<boolean | null>(null);

  const filteredEmployees = workers.filter((emp) => {
    const matchRole = roleFilter ? emp.role === roleFilter : true;
    const matchClocked =
      clockedInFilter !== null ? emp.clockedIn === clockedInFilter : true;
    return matchRole && matchClocked;
  });

  const [editModalVisible, setEditModalVisible] = useState(false);

  const employeesToCSV = (rows: Worker[]) => {
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
        JSON.stringify(e.name ?? ""),
        JSON.stringify(e.email ?? ""),
        JSON.stringify(e.phone ?? ""),
        JSON.stringify(e.role ?? ""),
        e.hourlyRate != null ? String(e.hourlyRate) : "",
        e.clockedIn ? "Yes" : "No",
      ].join(",")
    );
    return [header.join(","), ...body].join("\n");
  };

  const fmtRate = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? `$${n.toFixed(2)}` : "";
  };

  const employeesToHTML = (rows: Worker[]) => `
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
        <h1>Workers</h1>
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

  const exportEmployeesCSV = async (rows: Worker[]) => {
    try {
      const csv = employeesToCSV(rows);
      const fileName = `workers-${new Date().toISOString().slice(0, 10)}.csv`;
      const uri = await writeTextFileAsync(fileName, csv);
      await shareFile(uri, "text/csv");
    } catch (e) {
      // console.error(e);
      Alert.alert("Export failed", "Could not create CSV.");
    }
  };
  

  const exportEmployeesPDF = async (rows: Worker[]) => {
    try {
      const html = employeesToHTML(rows);
      const { uri } = await Print.printToFileAsync({ html });
      await shareFile(uri, "application/pdf");
    } catch (e) {
      // console.error(e);
      Alert.alert("Export failed", "Could not create PDF.");
    }
  };  

  const emailEmployees = async (rows: Worker[]) => {
    try {
      const html = employeesToHTML(rows);
      const { uri } = await Print.printToFileAsync({ html });
      await composeEmailSafely({
        subject: "Workers Export",
        body: "Please find the workers export attached.",
        attachments: [uri],
      });
    } catch (e) {
      // console.error(e);
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

  const handleResetPassword = async (emp: Worker) => {
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
        `https://jw-auto-clinic-246.onrender.com/api/workers/${emp._id}/reset-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user?.token}`,
          },
          body: JSON.stringify({ notify: true }),
        }
      );
      if (!res.ok) throw new Error("Failed to reset password");
      const data = await res.json(); // { temporaryPassword, emailed?: boolean }

      const temp = data.temporaryPassword as string;
      showToast?.(`Temp password: ${temp}`);
      Clipboard.setStringAsync(temp);
      Alert.alert("Temporary Password", `${temp}\n\nCopied to clipboard.`);
    } catch (err: any) {
      // console.error(err);
      Alert.alert("Error", err?.message || "Password reset failed.");
    }
  };

  const [selectedEmployee, setSelectedEmployee] = useState<Worker | null>(
    null
  );
  const handleEditEmployee = (emp: Worker) => {
    setSelectedEmployee(emp);
    setEditModalVisible(true);
  };

  const handleDeleteEmployee = async (id: string) => {
    if (Platform.OS === "windows" || Platform.OS === "web") {
      const confirm = window.confirm?.(
        "Are you sure you want to delete this worker?"
      );
      if (!confirm) return;
      try {
        const res = await fetch(
          `https://jw-auto-clinic-246.onrender.com/api/workers/${id}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${user?.token}` },
          }
        );
        if (res.ok) setEmployees((prev) => prev.filter((e) => e._id !== id));
        else console.error("Failed to delete");
      } catch (err) {
        // console.error("Delete error:", err);
      }
    } else {
      Alert.alert(
        "Confirm Delete",
        "Are you sure you want to delete this worker?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                const res = await fetch(
                  `https://jw-auto-clinic-246.onrender.com/api/workers/${id}`,
                  {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${user?.token}` },
                  }
                );
                if (res.ok)
                  setEmployees((prev) => prev.filter((e) => e._id !== id));
                else console.error("Failed to delete");
              } catch (err) {
                // console.error("Delete error:", err);
              }
            },
          },
        ],
        { cancelable: true }
      );
    }
  };

  // Shifts
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
      // console.error("Failed to fetch shifts:", err);
    }
  }, [user]);

  // ======= New: throttled unified polling (5s on Reports, 15s elsewhere) =======
  const pollInFlight = useRef(false);
  const tick = useCallback(async () => {
    if (pollInFlight.current) return;
    pollInFlight.current = true;
    try {
      await Promise.all([fetchData(), fetchEmployees(), fetchShifts()]);
      if (selectedTab === "Reports") await fetchReportData();
    } finally {
      pollInFlight.current = false;
    }
  }, [fetchData, fetchEmployees, fetchShifts, selectedTab]);

  useFocusEffect(
    useCallback(() => {
      tick();
      const period = selectedTab === "Reports" ? 5000 : 15000;
      const id = setInterval(tick, period);
      return () => clearInterval(id);
    }, [tick, selectedTab])
  );

  // date helpers for Shifts filters
  const toTime = (v?: string | null) => {
    if (!v) return null;
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m)
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  };

  // Build CSV from shifts
  const buildCsv = (rows: typeof sortedShifts) => {
    const header = ["Worker", "Date", "Clock In", "Clock Out", "Status"].join(
      ","
    );
    const body = rows
      .map((r) =>
        [
          r.worker ?? "",
          r.date ?? "",
          r.clockIn ?? "",
          r.clockOut ?? "",
          r.status ?? "",
        ]
          .map((v) => JSON.stringify(v))
          .join(",")
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
            <tr><th>Worker</th><th>Date</th><th>Clock In</th><th>Clock Out</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (r) => `
              <tr>
                <td>${(r.worker ?? "").toString()}</td>
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

  const [filtersOpen, setFiltersOpen] = useState(true);
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
      const uri = await writeTextFileAsync(filename, csv);
      await shareFile(uri, "text/csv");
    } catch (e: any) {
      // console.error(e);
      Alert.alert("Export failed", e?.message ?? "Failed to export CSV.");
    }
  };
  

  const handleExportPDF = async (rows: typeof sortedShifts) => {
    try {
      const html = buildPdfHtml(rows);
      const { uri } = await Print.printToFileAsync({ html });
      await shareFile(uri, "application/pdf");
    } catch (e: any) {
      // console.error(e);
      Alert.alert("Export failed", e?.message ?? "Failed to export PDF.");
    }
  };

  // Email helper for Shifts (CSV or PDF)
  const handleEmailDocument = async (
    rows: typeof sortedShifts,
    type: "csv" | "pdf"
  ) => {
    try {
      if (type === "csv") {
        const csv = buildCsv(rows);
        const filename = `shifts-${new Date().toISOString().slice(0, 10)}.csv`;
        const path = await writeTextFileAsync(filename, csv);
        await composeEmailSafely({
          subject: "Shifts Export",
          body: "Please find the shifts CSV attached.",
          attachments: [path],
        });
      } else {
        const html = buildPdfHtml(rows);
        const { uri } = await Print.printToFileAsync({ html });
        await composeEmailSafely({
          subject: "Shifts Export",
          body: "Please find the shifts PDF attached.",
          attachments: [uri],
        });
      }
    } catch (e: any) {
      // console.error(e);
      Alert.alert("Email failed", e?.message ?? "Could not compose email.");
    }
  };

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
        setShifts((prev) => prev.filter((s) => getShiftId(s) !== id));
      } catch (err: any) {
        // console.log("DELETE /shifts error", err);
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
            default: "100%",
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

  // Reports
  const [open, setOpen] = useState(false);
  const [chartType, setChartType] = useState<
    "Revenue" | "Services" | "Expenses"
  >("Revenue");

  const [reportPeriod, setReportPeriod] = useState<
    "Today" | "Week" | "Month" | "Custom"
  >("Today");
  const [periodItems, setPeriodItems] = useState([
    { label: "Today", value: "Today" },
    { label: "Week", value: "Week" },
    { label: "Month", value: "Month" },
    { label: "Custom Range…", value: "Custom" },
  ]);

  const [reportRange, setReportRange] = useState<{
    startDate?: Date;
    endDate?: Date;
  }>({});
  const [reportDateModalOpen, setReportDateModalOpen] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const inRange = (d: Date, start?: Date, end?: Date) => {
    if (!start && !end) return true;
    if (
      start &&
      d < new Date(start.getFullYear(), start.getMonth(), start.getDate())
    )
      return false;
    if (
      end &&
      d >
        new Date(
          end.getFullYear(),
          end.getMonth(),
          end.getDate(),
          23,
          59,
          59,
          999
        )
    )
      return false;
    return true;
  };
  const getReportWindow = (): { start?: Date; end?: Date } => {
    const now = new Date();
    const end = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    );
    if (reportPeriod === "Today")
      return {
        start: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        end,
      };
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
    return { start: reportRange.startDate, end: reportRange.endDate };
  };

  const pickExpensesCSV = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "text/csv",
          "text/comma-separated-values",
          "application/vnd.ms-excel",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if ((result as any).canceled) return;
      const asset = (result as any).assets?.[0];
      if (!asset?.uri) return;

      const content = await readTextFileAsync(asset.uri);
      const rows = parseExpensesCSV(content);
      setExpenses(rows);
      Alert.alert("Expenses imported", `${rows.length} expense rows loaded.`);
    } catch (e: any) {
      Alert.alert("Import failed", e?.message || "Could not import CSV.");
    }
  };

  // Prevent state updates after unmount during async (avoids random Android crashes)
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  // Avoid double-taps on heavy actions (e.g., importing expenses)
  const expensesBusyRef = useRef(false);

  // Defer heavy work until after animations/gestures (keeps UI smooth)
  const defer = (fn: () => void) => InteractionManager.runAfterInteractions(fn);

  // Safer CSV picker for expenses (defers + guards)
  const pickExpensesCSVSafe = useCallback(() => {
    if (expensesBusyRef.current) return;
    expensesBusyRef.current = true;
    defer(async () => {
      try {
        await pickExpensesCSV();
      } finally {
        expensesBusyRef.current = false;
      }
    });
  }, [pickExpensesCSV]);

  // Memoized totals used in Report cards (so we don't recompute during scroll)
  const reportTotals = useMemo(() => {
    const { start, end } = getReportWindow();
    const rev = transactions
      .filter((t) => {
        const d = parseMaybeDate(t.serviceDate);
        return d ? inRange(d, start, end) : false;
      })
      .reduce((s, t) => s + Number(t.finalPrice || 0), 0);

    const exp = expenses
      .filter((e) => {
        const d = parseMaybeDate(e.date);
        return d ? inRange(d, start, end) : false;
      })
      .reduce((s, e) => s + e.amount, 0);

    return { revenue: rev, expenses: exp, net: rev - exp };
  }, [transactions, expenses, reportPeriod, reportRange]);

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

    return lines
      .slice(1)
      .map((line) => {
        const cols = splitCSVLine(line);
        const date = cols[idx.date] || "";
        const amountNum = Number(
          (cols[idx.amount] || "").replace(/[^0-9.\-]/g, "")
        );
        return {
          date,
          amount: Number.isFinite(amountNum) ? amountNum : 0,
          category: idx.category >= 0 ? cols[idx.category] : undefined,
          note: idx.note >= 0 ? cols[idx.note] : undefined,
        };
      })
      .filter((e) => e.date && Number.isFinite(e.amount));
  };

  // ======= Improved generateBarData: hourly Expenses on "Today" =======
  const generateBarData = (
    period: "Today" | "Week" | "Month" | "Custom",
    type: "Revenue" | "Services" | "Expenses",
    transactions: { serviceDate: string; finalPrice: number }[],
    expensesRows: Expense[]
  ) => {
    const window = getReportWindow();
    const txInWindow = transactions.filter((tx) => {
      const d = parseMaybeDate(tx.serviceDate);
      return d ? inRange(d, window.start, window.end) : false;
    });
    const exInWindow = expensesRows.filter((ex) => {
      const d = parseMaybeDate(ex.date);
      return d ? inRange(d, window.start, window.end) : false;
    });

    const txMetric = (list: typeof txInWindow) =>
      type === "Revenue"
        ? list.reduce((s, t) => s + Number(t.finalPrice || 0), 0)
        : list.length;

    const byDay = (start: Date, end: Date) => {
      const labels: string[] = [];
      const data: number[] = [];
      const cursor = new Date(start);
      cursor.setHours(0, 0, 0, 0);
      while (cursor <= end) {
        const dayStr = cursor.toISOString().slice(0, 10);
        labels.push(
          cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        );
        if (type === "Expenses") {
          data.push(
            exInWindow
              .filter(
                (e) =>
                  parseMaybeDate(e.date)?.toISOString().slice(0, 10) === dayStr
              )
              .reduce((s, e) => s + e.amount, 0)
          );
        } else {
          const dayTx = txInWindow.filter(
            (t) =>
              parseMaybeDate(t.serviceDate)?.toISOString().slice(0, 10) ===
              dayStr
          );
          data.push(txMetric(dayTx));
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      return { labels, datasets: [{ data }] };
    };

    if (period === "Today") {
      const hours = Array.from({ length: 12 }, (_, i) => i + 7); // 7am–6pm
      const labels = hours.map((h) => `${h % 12 || 12}${h < 12 ? "a" : "p"}`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const data = hours.map((h) => {
        const start = new Date(today);
        start.setHours(h, 0, 0, 0);
        const end = new Date(today);
        end.setHours(h, 59, 59, 999);
        if (type === "Expenses") {
          return exInWindow
            .filter((e) => {
              const d = parseMaybeDate(e.date);
              return d ? d >= start && d <= end : false;
            })
            .reduce((s, e) => s + e.amount, 0);
        }
        const hourTx = txInWindow.filter((t) => {
          const d = parseMaybeDate(t.serviceDate);
          return d ? d >= start && d <= end : false;
        });
        return txMetric(hourTx);
      });

      return { labels, datasets: [{ data }] };
    }

    if (period === "Week") {
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      return byDay(start, end);
    }
    if (period === "Month") {
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const start = new Date(end);
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      return byDay(start, end);
    }
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
      // console.error("Failed to fetch reports", err);
    }
  };

  const earnings = transactions.reduce(
    (sum, tx) => sum + Number(tx.finalPrice || 0),
    0
  );

  // ======= Local-day fix for todayEarnings =======
  const todayStr = fmtYMD(new Date());
  const todayEarnings = transactions
    .filter((tx) => {
      const d = parseMaybeDate(tx.serviceDate);
      return d ? fmtYMD(d) === todayStr : false;
    })
    .reduce((sum, tx) => sum + Number(tx.finalPrice || 0), 0);

  // ======= Monthly earnings chart (leave as-is) =======
  const chartData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const total = transactions
        .filter((tx) => new Date(tx.serviceDate).getMonth() === i)
        .reduce((sum, tx) => sum + Number(tx.finalPrice || 0), 0);
      const monthLabel = new Date(0, i).toLocaleString("default", {
        month: "short",
      });
      return { month: monthLabel, earnings: total };
    });
  }, [transactions]);

  const barChartData = {
    labels: chartData.map((item) => item.month),
    datasets: [{ data: chartData.map((item) => item.earnings || 0) }],
    legend: ["Earnings"],
  };

  const [barData, setBarData] = useState<{
    labels: string[];
    datasets: { data: number[] }[];
  }>({ labels: [], datasets: [{ data: [] }] });
  useEffect(() => {
    setBarData(
      generateBarData(reportPeriod, chartType, transactions, expenses)
    );
  }, [reportPeriod, chartType, transactions, expenses, reportRange]);

  // ======= Filters & lists =======
  const [transactionSearchText, setTransactionSearchText] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<string | null>(null);
  const [serviceFilter, setServiceFilter] = useState<string | null>(null);

  // Memoized unique lists
  const paymentMethods = useMemo(
    () =>
      Array.from(
        new Set(transactions.map((tx) => tx.paymentMethod).filter(Boolean))
      ),
    [transactions]
  );
  const serviceTypes = useMemo(
    () =>
      Array.from(
        new Set(transactions.map((tx) => tx.serviceType).filter(Boolean))
      ),
    [transactions]
  );

  const [filtersModalVisible, setFiltersModalVisible] = useState(false);
  const [viewMode, setViewMode] = useState<"card" | "list">("list");

  const [range, setRange] = useState<{
    startDate: Date | undefined;
    endDate: Date | undefined;
  }>({ startDate: undefined, endDate: undefined });
  const [openDateModal, setOpenDateModal] = useState(false);

  // ======= IMPORTANT: base on ALL transactions (not the 10 "recent") =======
  const filteredTransactions = useMemo(() => {
    const search = transactionSearchText.toLowerCase();
    return transactions.filter((tx) => {
      const matchesSearch =
        (tx.employeeName?.toLowerCase().includes(search) ?? false) ||
        (tx.customerName?.toLowerCase().includes(search) ?? false) ||
        (tx.customer?.name?.toLowerCase().includes(search) ?? false);

      const matchesPayment = paymentFilter
        ? tx.paymentMethod === paymentFilter
        : true;
      const matchesService = serviceFilter
        ? tx.serviceType === serviceFilter
        : true;

      const txDate = parseMaybeDate(tx.serviceDate);
      const inDateRange =
        (!range.startDate || (txDate && txDate >= range.startDate)) &&
        (!range.endDate || (txDate && txDate <= range.endDate));

      return matchesSearch && matchesPayment && matchesService && inDateRange;
    });
  }, [
    transactions,
    transactionSearchText,
    paymentFilter,
    serviceFilter,
    range,
  ]);

  const getFileName = (prefix: string, extension: string) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `${prefix}-${timestamp}.${extension}`;
  };

  const exportAsPDF = async () => {
    const html = `
      <html><body>
      <h1>Transactions</h1>
      <table border="1" style="border-collapse:collapse;width:100%;">
        <thead>
          <tr><th>Service</th><th>Amount</th><th>Payment</th><th>Customer</th><th>Date</th></tr>
        </thead>
        <tbody>
          ${filteredTransactions
            .map(
              (tx) => `<tr>
                <td>${tx.serviceType}</td>
                <td>$${Number(tx.finalPrice || 0).toFixed(2)}</td>
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
    const newPath = await moveFileAsync(uri, fileName);
    await shareFile(newPath, "application/pdf");
  };

  // ======= Safer CSV quoting =======
  const exportAsExcel = async () => {
    const fileName = getFileName("transactions", "csv");
    const rows = [
      ["Service", "Amount", "Payment", "Customer", "Date"],
      ...filteredTransactions.map((tx) => [
        tx.serviceType,
        `$${Number(tx.finalPrice || 0).toFixed(2)}`,
        tx.paymentMethod,
        tx.customer?.name || tx.customerName || "N/A",
        tx.serviceDate ? new Date(tx.serviceDate).toLocaleDateString() : "—",
      ]),
    ];
    const csv = rows.map(r => r.map(c => JSON.stringify(c ?? "")).join(",")).join("\n");
    const uri = await writeTextFileAsync(fileName, csv);
    await shareFile(uri, "text/csv");
  };

  const emailExport = async () => {
    try {
      const rows = [
        ["Service", "Amount", "Payment", "Customer", "Date"],
        ...filteredTransactions.map((tx) => [
          tx.serviceType,
          `$${Number(tx.finalPrice || 0).toFixed(2)}`,
          tx.paymentMethod,
          tx.customer?.name || tx.customerName || "N/A",
          tx.serviceDate ? new Date(tx.serviceDate).toLocaleDateString() : "—",
        ]),
      ];
      const csv = rows.map(r => r.map(c => JSON.stringify(c ?? "")).join(",")).join("\n");
      const fileName = getFileName("transactions", "csv");
      const path = await writeTextFileAsync(fileName, csv);
      await composeEmailSafely({
        recipients: [],
        subject: "Exported Transactions",
        body: "Attached is the exported list of transactions.",
        attachments: [path],
      });
    } catch (e) {
      // console.error(e);
      Alert.alert("Email failed", "Could not compose email.");
    }
  };

  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [transactionModalVisible, setTransactionModalVisible] = useState(false);
  const [moreActionsVisible, setMoreActionsVisible] = useState(false);
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
  const handleLongPress = (emp: Worker) => {
    setSelectedEmployee(emp);
    setMoreActionsVisible(true);
  };
  const showToast = (message: string) => {
    if (Platform.OS === "android") {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } else {
      // console.log(message);
    }
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
        ? shift.worker.toLowerCase().includes(shiftSearchText.toLowerCase())
        : true
    );

  const sortedShifts = [...filteredShifts].sort((a, b) => {
    if (shiftSortBy === "name")
      return (a.worker || "").localeCompare(b.worker || "");
    if (shiftSortBy === "status")
      return (a.status || "").localeCompare(b.status || "");
    if (shiftSortBy === "date") {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateB.getTime() - dateA.getTime();
    }
    return 0;
  });

  const visibleShifts = useMemo(() => {
    const base = sortedShifts ?? [];
    const fromT = toTime(dateFrom);
    const toT = toTime(dateTo);
    const norm = (s: string) => (s ?? "").toLowerCase().trim();
    let arr = base.filter((s) => {
      const okSearch = !shiftSearchText
        ? true
        : norm(s.worker).includes(norm(shiftSearchText));
      const okStatus = statusFilter ? s.status === statusFilter : true;
      const t = toTime(s.date);
      const okDate =
        (fromT == null || (t != null && t >= fromT)) &&
        (toT == null || (t != null && t <= toT));
      return okSearch && okStatus && okDate;
    });
    if (shiftSortBy === "name")
      arr = [...arr].sort((a, b) =>
        (a.worker || "").localeCompare(b.worker || "")
      );
    else if (shiftSortBy === "status")
      arr = [...arr].sort((a, b) =>
        (a.status || "").localeCompare(b.status || "")
      );
    else if (shiftSortBy === "date")
      arr = [...arr].sort(
        (a, b) => (toTime(b.date) ?? 0) - (toTime(a.date) ?? 0)
      );
    return arr;
  }, [
    sortedShifts,
    shiftSearchText,
    statusFilter,
    shiftSortBy,
    dateFrom,
    dateTo,
  ]);

  // Reports helpers
  const buildReportRows = () => {
    const { start, end } = getReportWindow();
    const tx = transactions.filter((t) => {
      const d = parseMaybeDate(t.serviceDate);
      return d ? inRange(d, start, end) : false;
    });
    const ex = expenses.filter((e) => {
      const d = parseMaybeDate(e.date);
      return d ? inRange(d, start, end) : false;
    });
    return { tx, ex };
  };
  const reportToCSV = () => {
    const { tx, ex } = buildReportRows();
    const txHeader = "Transactions";
    const txCols = ["Service", "Amount", "Payment", "Customer", "Date"].join(
      ","
    );
    const txBody = tx
      .map((t) =>
        [
          JSON.stringify(t.serviceType ?? ""),
          Number(t.finalPrice || 0).toFixed(2),
          JSON.stringify(t.paymentMethod ?? ""),
          JSON.stringify(t.customer?.name || t.customerName || "N/A"),
          JSON.stringify(
            t.serviceDate ? new Date(t.serviceDate).toLocaleDateString() : "—"
          ),
        ].join(",")
      )
      .join("\n");
    const exHeader = "Expenses";
    const exCols = ["Date", "Amount", "Category", "Note"].join(",");
    const exBody = ex
      .map((e) =>
        [
          JSON.stringify(e.date),
          Number(e.amount || 0).toFixed(2),
          JSON.stringify(e.category ?? ""),
          JSON.stringify(e.note ?? ""),
        ].join(",")
      )
      .join("\n");
    return [txHeader, txCols, txBody, "", exHeader, exCols, exBody].join("\n");
  };
  const reportToHTML = () => {
    const { tx, ex } = buildReportRows();
    const totalRev = tx.reduce((s, t) => s + Number(t.finalPrice || 0), 0);
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
        <h1>Report (${reportPeriod}${reportPeriod === "Custom" && reportRange.startDate && reportRange.endDate ? `: ${reportRange.startDate.toLocaleDateString()} – ${reportRange.endDate.toLocaleDateString()}` : ""})</h1>
        <h2>Summary</h2>
        <p><b>Revenue:</b> $${totalRev.toFixed(2)}<br/>
           <b>Expenses:</b> $${totalExp.toFixed(2)}<br/>
           <b>Net:</b> $${net.toFixed(2)}</p>
        <h2>Transactions</h2>
        <table>
          <thead><tr><th>Service</th><th>Amount</th><th>Payment</th><th>Customer</th><th>Date</th></tr></thead>
          <tbody>
            ${tx
              .map(
                (t) => `
              <tr>
                <td>${t.serviceType ?? ""}</td>
                <td>$${Number(t.finalPrice || 0).toFixed(2)}</td>
                <td>${t.paymentMethod ?? ""}</td>
                <td>${t.customer?.name || t.customerName || "N/A"}</td>
                <td>${t.serviceDate ? new Date(t.serviceDate).toLocaleDateString() : "—"}</td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
        <h2>Expenses</h2>
        <table>
          <thead><tr><th>Date</th><th>Amount</th><th>Category</th><th>Note</th></tr></thead>
          <tbody>
            ${ex
              .map(
                (e) => `
              <tr>
                <td>${e.date}</td>
                <td>$${Number(e.amount || 0).toFixed(2)}</td>
                <td>${e.category ?? ""}</td>
                <td>${e.note ?? ""}</td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </body>
    </html>`;
  };
  const exportReportCSV = async () => {
    try {
      const csv = reportToCSV();
      const fileName = `report-${new Date().toISOString().slice(0, 10)}.csv`;
      const uri = await writeTextFileAsync(fileName, csv);
      await shareFile(uri, "text/csv");
    } catch {
      Alert.alert("Export failed", "Could not create CSV.");
    }
  };  
  const exportReportPDF = async () => {
    try {
      const html = reportToHTML();
      const { uri } = await Print.printToFileAsync({ html });
      await shareFile(uri, "application/pdf");
    } catch {
      Alert.alert("Export failed", "Could not create PDF.");
    }
  };
  const emailReport = async (type: "csv" | "pdf") => {
    try {
      let attachmentUri: string;
  
      if (type === "csv") {
        const csv = reportToCSV();
        const fileName = `report-${new Date().toISOString().slice(0, 10)}.csv`;
        attachmentUri = await writeTextFileAsync(fileName, csv);
      } else {
        const { uri } = await Print.printToFileAsync({ html: reportToHTML() });
        attachmentUri = uri;
      }
  
      await composeEmailSafely({
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
    const s = reportRange.startDate
      ? reportRange.startDate.toLocaleDateString()
      : "—";
    const e = reportRange.endDate
      ? reportRange.endDate.toLocaleDateString()
      : "—";
    return `Custom: ${s} – ${e}`;
  };

  // robust duration helpers (unchanged)
  const normalizeTime12 = (time?: string | null) =>
    time
      ? time
          .replace(/\u202F|\u00A0/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      : "";
  const parseDateTime12 = (dateISO: string, time12?: string | null) => {
    const t = normalizeTime12(time12);
    if (!dateISO || !t) return null;
    const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([APap][Mm])$/);
    if (!m) return null;
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const ss = m[3] ? parseInt(m[3], 10) : 0;
    if ([hh, mm, ss].some((n) => Number.isNaN(n))) return null;
    const ampm = m[4].toUpperCase();
    let H = hh % 12;
    if (ampm === "PM") H += 12;
    const pad = (n: number) => String(n).padStart(2, "0");
    return new Date(`${dateISO}T${pad(H)}:${pad(mm)}:${pad(ss)}`);
  };
  const diffMsSafe = (start: Date | null, end: Date | null) => {
    if (!start || !end) return 0;
    const e =
      end.getTime() < start.getTime()
        ? end.getTime() + 24 * 3600 * 1000
        : end.getTime();
    return Math.max(0, e - start.getTime());
  };
  const fmtHmss = (ms: number) => {
    if (ms <= 0) return "—";
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
  };

  // ======= CSV Importer (quoted-commas safe, dedupe; uses splitCSVLine) =======
const handleImportCSV = async () => {
  const BASE = "https://jw-auto-clinic-246.onrender.com";
  const SEEN_KEY = "imported_tx_signatures_v1";

  if (!user?.token) {
    Alert.alert("Not authorised", "Please log in.");
    return;
  }

  // Ensure we can read the picked file even if it's a content:// URI (Android)
  const ensureFileUriAsync = async (maybeUri: string) => {
    if (maybeUri.startsWith("file://")) return maybeUri;
    const dest = `${FileSystem.cacheDirectory}import-${Date.now()}.csv`;
    await FileSystem.copyAsync({ from: maybeUri, to: dest });
    return dest;
  };

  const num = (v: any) => {
    const n = Number(String(v ?? "").trim());
    return Number.isFinite(n) ? n : 0;
  };
  const normPM = (v: any) => {
    const s = String(v || "").trim().toLowerCase();
    if (s === "cash") return "Cash";
    if (["mobile payment", "mobile", "card", "m-pesa", "mpesa"].includes(s)) return "Mobile Payment";
    return "";
  };
  const parseServiceDate = (v: any) => {
    const s = String(v || "").trim();
    if (!s) return "";
    const d = new Date(s);
    return isNaN(d.getTime()) ? "" : d.toISOString();
  };

  const normalizeCsvRow = (row: Record<string, any>) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(row || {}))
      out[k.trim().toLowerCase()] = (v ?? "").toString().trim();
    out.customername = out.customername || out.customer || out["customer name"];
    out.email = out.email || out["e-mail"] || out["customer email"];
    out.vehicledetails = out.vehicledetails || out.vehicle || out["vehicle details"];
    out.servicename = out.servicename || out.service || out["service type"];
    out.specialsname = out.specialsname || out.specials || out["specials name"] || "";
    out.originalprice = out.originalprice || out.price || out.amount;
    out.discountpercent = out.discountpercent || out["discount %"] || out["discountpercent%"] || "0";
    out.discountamount = out.discountamount || out["discount amount"] || "0";
    out.paymentmethod = out.paymentmethod || out["payment method"] || out.method;
    out.servicedate = out.servicedate || out.date || out["service date"] || "";
    out.notes = out.notes || "";
    return out;
  };

  const buildSig = (p: {
    customerName: string;
    vehicleDetails: string;
    serviceName: string;
    originalPrice: number;
    finalPrice: number;
    discountPercent: number;
    discountAmount: number;
    paymentMethod: string;
    serviceDate?: string;
  }) => {
    const datePart = p.serviceDate
      ? new Date(p.serviceDate).toISOString().replace(/\.\d{3}Z$/, "Z")
      : "";
    return [
      p.customerName.trim().toLowerCase(),
      p.vehicleDetails.trim().toLowerCase(),
      p.serviceName.trim().toLowerCase(),
      Number(p.originalPrice || 0).toFixed(2),
      Number(p.finalPrice || 0).toFixed(2),
      Number(p.discountPercent || 0).toFixed(2),
      Number(p.discountAmount || 0).toFixed(2),
      p.paymentMethod.trim().toLowerCase(),
      datePart,
    ].join("|");
  };

  // 🔧 FIXED: always coerce API response to an array before iterating
  const fetchExistingSigsForCustomer = async (customerId: string, fallbackName: string, fallbackVehicle: string) => {
    const token = user!.token;
    try {
      const res = await fetch(`${BASE}/api/transactions`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return new Set<string>();

      const json = await res.json();

      // Normalize to an array no matter what the API returns
      const toArray = (j: any): any[] => {
        if (Array.isArray(j)) return j;
        if (j && Array.isArray(j.data)) return j.data;
        if (j && Array.isArray(j.items)) return j.items;
        if (j && Array.isArray(j.results)) return j.results;
        if (j && Array.isArray(j.transactions)) return j.transactions;
        if (j && Array.isArray(j.docs)) return j.docs;
        return [];
      };

      const txs = toArray(json);
      const sigs = new Set<string>();

      for (const t of txs) {
        const name = (t.customer?.name || t.customerName || "").toString();
        const vehicle = (t.customer?.vehicleDetails || t.vehicleDetails || "").toString();

        const sameCustomer =
          (t.customer?._id && t.customer._id === customerId) ||
          (name.trim().toLowerCase() === fallbackName.trim().toLowerCase() &&
            vehicle.trim().toLowerCase() === fallbackVehicle.trim().toLowerCase());

        if (!sameCustomer) continue;

        const sig = buildSig({
          customerName: name,
          vehicleDetails: vehicle,
          serviceName: t.serviceType || "",
          originalPrice: Number(t.originalPrice || 0),
          finalPrice: Number(t.finalPrice || 0),
          discountPercent: Number(t.discountPercent || 0),
          discountAmount: Number(t.discountAmount || 0),
          paymentMethod: t.paymentMethod || "",
          serviceDate: t.serviceDate ? new Date(t.serviceDate).toISOString() : "",
        });

        sigs.add(sig);
      }

      return sigs;
    } catch {
      return new Set<string>();
    }
  };

  const ensureCustomerIdForImport = async (name: string, email: string, vehicle: string): Promise<string> => {
    const token = user!.token;
    try {
      const sr = await fetch(`${BASE}/api/customers/search?name=${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (sr.ok) {
        const matches = await sr.json();
        const found = (matches || []).find(
          (c: any) => String(c.vehicleDetails || "").trim().toLowerCase() === vehicle.trim().toLowerCase()
        );
        if (found?._id) return found._id;
      }
    } catch {}
    const cr = await fetch(`${BASE}/api/customers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, vehicleDetails: vehicle, email: email || undefined }),
    });
    const data = await cr.json().catch(() => ({}));
    if (cr.ok && data?._id) return data._id;

    const msg = (data?.error || "").toString();
    if (/E11000|duplicate/i.test(msg)) {
      const allr = await fetch(`${BASE}/api/customers`, { headers: { Authorization: `Bearer ${token}` } });
      if (allr.ok) {
        const all = await allr.json();
        const found = (all || []).find(
          (c: any) =>
            String(c.name || "").trim().toLowerCase() === name.trim().toLowerCase() &&
            String(c.vehicleDetails || "").trim().toLowerCase() === vehicle.trim().toLowerCase()
        );
        if (found?._id) return found._id;
      }
    }
    throw new Error(data?.error || "Failed to create/resolve customer.");
  };

  try {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel"],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if ((res as any).canceled) return;
    const asset = (res as any).assets?.[0] ?? res;
    if (!asset?.uri) {
      Alert.alert("Import failed", "No file selected.");
      return;
    }

    const localUri = await ensureFileUriAsync(asset.uri);
    let csvText = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    // strip BOM if present
    if (csvText.charCodeAt(0) === 0xfeff) csvText = csvText.slice(1);

    const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 2) {
      Alert.alert("CSV error", "CSV must have at least a header row and one data row.");
      return;
    }

    const headers = splitCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
    const rows = lines
      .slice(1)
      .map((line) => {
        const values = splitCSVLine(line);
        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = (values[index] ?? "").trim();
        });
        return row;
      })
      .filter((r) => Object.keys(r).length);

    if (!rows.length) {
      Alert.alert("Nothing to import", "CSV has no rows.");
      return;
    }

    const seenArr = JSON.parse((await AsyncStorage.getItem(SEEN_KEY)) || "[]") as string[];
    const seen = new Set<string>(seenArr);

    const groups = new Map<string, { name: string; email: string; vehicle: string; items: any[] }>();
    const fileSigSet = new Set<string>();
    let skipped = 0;

    for (const raw of rows) {
      const r = normalizeCsvRow(raw);
      const customerName = r.customername;
      const email = r.email || "";
      const vehicleDetails = r.vehicledetails;
      const serviceName = r.servicename;
      const specialsName = r.specialsname || "";
      const paymentMethod = normPM(r.paymentmethod);
      const notes = r.notes || "";
      const originalPrice = num(r.originalprice);
      const finalPrice = num(r.finalprice);
      const discountPercent = num(r.discountpercent);
      const discountAmount = num(r.discountamount);
      const serviceDate = parseServiceDate(r.servicedate);

      if (!customerName || !vehicleDetails || !serviceName || !paymentMethod || !originalPrice) {
        skipped++;
        continue;
      }

      const sig = buildSig({
        customerName,
        vehicleDetails,
        serviceName,
        originalPrice,
        finalPrice,
        discountPercent,
        discountAmount,
        paymentMethod,
        serviceDate,
      });

      if (fileSigSet.has(sig) || seen.has(sig)) {
        skipped++;
        continue;
      }
      fileSigSet.add(sig);

      const key = `${customerName}||${vehicleDetails}||${email.toLowerCase()}`;
      if (!groups.has(key))
        groups.set(key, { name: customerName, email, vehicle: vehicleDetails, items: [] });
      groups.get(key)!.items.push({
        serviceName,
        specialsName: specialsName || undefined,
        originalPrice,
        finalPrice,
        discountPercent,
        discountAmount,
        notes,
        paymentMethod,
        serviceDate,
        __sig: sig,
      });
    }

    if (!groups.size) {
      Alert.alert("Nothing to import", "No valid rows with required fields were found.");
      return;
    }

    let totalSaved = 0;
    let totalServerSkipped = 0;

    for (const [, g] of groups) {
      let customerId: string;
      try {
        customerId = await ensureCustomerIdForImport(g.name, g.email, g.vehicle);
      } catch (e: any) {
        // console.error(`Import error for group ${g.name}`, e?.message || e);
        continue;
      }
      const serverSigs = await fetchExistingSigsForCustomer(customerId, g.name, g.vehicle);
      const newItems = g.items.filter((i) => !serverSigs.has(i.__sig));
      totalServerSkipped += g.items.length - newItems.length;
      if (newItems.length === 0) continue;

      const payload = {
        customerName: g.name,
        email: g.email,
        vehicleDetails: g.vehicle,
        customer: customerId,
        items: newItems.map((i) => {
          const { __sig, ...rest } = i;
          return { ...rest, customer: customerId };
        }),
      };

      const resp = await fetch(`${BASE}/api/transactions/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user!.token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        // console.error("Import error for group", g.name, data?.error || data);
        continue;
      }

      const savedCount = Number(data?.savedCount || 0);
      totalSaved += savedCount;
      for (const i of newItems) seen.add(i.__sig);
    }

    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen)));

    if (totalSaved > 0) {
      const msgParts = [`Imported ${totalSaved} transaction${totalSaved > 1 ? "s" : ""}.`];
      if (skipped > 0 || totalServerSkipped > 0) {
        const details: string[] = [];
        if (skipped > 0) details.push(`${skipped} duplicate(s)/invalid skipped (file or device cache)`);
        if (totalServerSkipped > 0) details.push(`${totalServerSkipped} duplicate(s) already on server`);
        msgParts.push(details.join(" • "));
      }
      Alert.alert("Import complete", msgParts.join("\n"));
    } else {
      Alert.alert("Import finished", "No transactions were saved.");
    }
  } catch (e: any) {
    // console.error(e);
    Alert.alert("Import error", e?.message || "Could not import CSV.");
  }
};


  const [headerElevated, setHeaderElevated] = useState(false);

  // Reuse your barChartData for the line chart
const lineChartData = {
  labels: barChartData.labels,
  datasets: [
    {
      data: barChartData.datasets?.[0]?.data || [],
    },
  ],
};

// Simple payment-method breakdown (from filteredTransactions)
const paymentMethodTotals: Record<string, number> = {};
filteredTransactions.forEach((tx) => {
  const key = tx.paymentMethod || "Unknown";
  const amount = Number(tx.finalPrice || 0);
  paymentMethodTotals[key] = (paymentMethodTotals[key] || 0) + amount;
});

// Colors for pie slices
const PIE_COLORS = ["#6a0dad", "#fe811f", "#2d9cdb", "#27ae60", "#e74c3c"];

const paymentMethodPieData = Object.entries(paymentMethodTotals).map(
  ([name, value], index) => ({
    name,
    value: Math.abs(value), // in case of refunds/negatives
    color: PIE_COLORS[index % PIE_COLORS.length],
    legendFontColor: "#444",
    legendFontSize: 13,
  })
);

// Shared chart config
const earningsChartConfig = {
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
};


  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#fff" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <ScrollView
        style={[styles.container]} // keep bg + flex only (no padding here)
        contentContainerStyle={styles.contentContainer} // <-- new
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
        onScroll={(e) => setHeaderElevated(e.nativeEvent.contentOffset.y > 2)}
        scrollEventThrottle={16}
      >
        {/* STICKY HEADER (full-bleed) */}
        <View
          style={[
            styles.stickyHeaderWrap,
            headerElevated && styles.stickyHeaderElevated,
            isWeb && headerElevated
              ? { shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 4 } }
              : null,
          ]}
        >
          <View style={styles.headerRow}>
            <Text style={styles.logo}>Dashboard</Text>
          </View>

          {/* Tabs live INSIDE the sticky area */}
          <View style={styles.filters}>
            {visibleTabs.map((tab) => (
              <TouchableOpacity
                key={tab}
                style={selectedTab === tab ? styles.filterActive : styles.filter}
                onPress={() => setSelectedTab(tab as any)}
              >
                <Text style={selectedTab === tab ? styles.filterTextActive : styles.filterText}>
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
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
                  <Text style={styles.cardSub}>Updated periodically</Text>
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
                <View
                  style={[
                    styles.chartHeaderRow,
                    // On phones: stack vertically so nothing overflows
                    !isTablet && {
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: 8,
                    },
                  ]}
                >
                  <Text style={styles.chartTitle}>Earnings Overview</Text>

                  <View style={styles.segmentedControl}>
                    {[
                      { key: "monthly", label: "Monthly" },
                      { key: "trend", label: "Trend" },
                      { key: "methods", label: "Methods" },
                    ].map((opt) => {
                      const active = chartMode === opt.key;
                      return (
                        <TouchableOpacity
                          key={opt.key}
                          onPress={() => {
                            if (chartMode !== opt.key) {
                              setChartMode(opt.key as "monthly" | "trend" | "methods");
                              setActivePoint(null); // 🔹 clear tooltip whenever mode changes
                            }
                          }}
                          style={[
                            styles.segmentedButton,
                            active && styles.segmentedButtonActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.segmentedLabel,
                              active && styles.segmentedLabelActive,
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* === Monthly bar chart === */}
                {chartMode === "monthly" && (
                  <>
                    <ScrollView
                      horizontal={isNative && (barChartData.labels?.length || 0) > 5}
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingRight: 24 }}
                    >
                      <BarChart
                        data={barChartData}
                        width={
                          isNative && (barChartData.labels?.length || 0) > 5
                            ? Math.max(chartWidth, (barChartData.labels?.length || 0) * 60)
                            : chartWidth
                        }
                        height={230}
                        withInnerLines
                        withHorizontalLabels
                        fromZero
                        yAxisLabel="$"
                        yAxisSuffix=""
                        yLabelsOffset={12}
                        verticalLabelRotation={
                          (barChartData.labels?.length || 0) > 4 ? 30 : 0
                        }
                        showBarTops
                        showValuesOnTopOfBars={false}
                        chartConfig={earningsChartConfig}
                        style={{
                          marginTop: 16,
                          marginLeft: Platform.select({
                            ios: -8,
                            android: -8,
                            default: -8,
                          }),
                          borderRadius: 16,
                        }}
                      />
                    </ScrollView>

                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={{ marginTop: 10 }}
                    >
                      {barChartData.labels.map((label, index) => {
                        const value = barChartData.datasets?.[0]?.data?.[index] ?? 0;
                        return (
                          <TouchableOpacity
                            key={label}
                            onPress={() =>
                              setActivePoint({
                                label,
                                value,
                                extra: "Monthly total",
                              })
                            }
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              borderRadius: 16,
                              borderWidth: 1,
                              borderColor: "#ddd",
                              marginRight: 8,
                            }}
                          >
                            <Text style={{ fontSize: 12, color: "#444" }}>
                              {label} (${value.toFixed(2)})
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </>
                )}

                {/* === Trend line chart (same monthly data but as line) === */}
                {chartMode === "trend" && (
                  <>
                    {/* Main chart */}
                    <ScrollView
                      horizontal={isNative && (lineChartData.labels?.length || 0) > 5}
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingRight: 24 }}
                    >
                      <LineChart
                        data={lineChartData}
                        width={
                          isNative && (lineChartData.labels?.length || 0) > 5
                            ? Math.max(chartWidth, (lineChartData.labels?.length || 0) * 60)
                            : chartWidth
                        }
                        height={230}
                        fromZero
                        withInnerLines
                        withVerticalLines={false}
                        yAxisLabel="$"
                        yLabelsOffset={12}
                        verticalLabelRotation={
                          (lineChartData.labels?.length || 0) > 4 ? 30 : 0
                        }
                        chartConfig={{
                          ...earningsChartConfig,
                          propsForDots: {
                            r: "5",
                            strokeWidth: "2",
                          },
                        }}
                        bezier
                        style={{
                          marginTop: 16,
                          marginLeft: Platform.select({
                            ios: -8,
                            android: -8,
                            default: -8,
                          }),
                          borderRadius: 16,
                        }}
                        // Keep native tap interaction for iOS / Web only – more reliable
                        onDataPointClick={
                          isAndroid
                            ? undefined
                            : ({ value, index }) => {
                                const label = lineChartData.labels?.[index] ?? "";
                                setActivePoint({
                                  label,
                                  value,
                                  extra: "Trend",
                                });
                              }
                        }
                      />
                    </ScrollView>

                    {/* Android-friendly interaction: tap chips to select a point */}
                    {lineChartData.labels && lineChartData.datasets?.[0]?.data && (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={{ marginTop: 10 }}
                      >
                        {lineChartData.labels.map((label, index) => {
                          const value = lineChartData.datasets[0].data[index] ?? 0;
                          const isActive =
                            activePoint &&
                            activePoint.extra === "Trend" &&
                            activePoint.label === label &&
                            activePoint.value === value;

                          return (
                            <TouchableOpacity
                              key={label}
                              onPress={() =>
                                setActivePoint({
                                  label,
                                  value,
                                  extra: "Trend",
                                })
                              }
                              style={{
                                paddingHorizontal: 10,
                                paddingVertical: 6,
                                borderRadius: 16,
                                borderWidth: 1,
                                borderColor: isActive ? "#6a0dad" : "#ddd",
                                backgroundColor: isActive ? "#f7f1ff" : "#fff",
                                marginRight: 8,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 12,
                                  color: isActive ? "#6a0dad" : "#444",
                                  fontWeight: isActive ? "700" : "500",
                                }}
                              >
                                {label} (${value.toFixed(2)})
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                  </>
                )}


                {/* === Payment-method breakdown pie chart === */}
                {chartMode === "methods" && paymentMethodPieData.length > 0 && (
                  <View style={{ marginTop: 16 }}>
                    <PieChart
                      data={paymentMethodPieData}
                      width={chartWidth}
                      height={230}
                      chartConfig={earningsChartConfig}
                      accessor="value"
                      backgroundColor="transparent"
                      paddingLeft={Platform.OS === "web" ? "40" : "70"}
                      absolute
                      hasLegend={!isNative}
                      center={[0, 0]}
                    />

                    {/* Optional: tap-to-filter legend style row */}
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={{ marginTop: 12 }}
                    >
                      {paymentMethodPieData.map((item, idx) => (
                        <TouchableOpacity
                          key={item.name}
                          onPress={() =>
                            setActivePoint({
                              label: item.name,
                              value: item.value,
                              extra: "Payment method total",
                            })
                          }
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            paddingVertical: 4,
                            paddingHorizontal: 10,
                            borderRadius: 16,
                            borderWidth: 1,
                            borderColor: "#ddd",
                            marginRight: 8,
                          }}
                        >
                          <View
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 5,
                              backgroundColor: item.color,
                              marginRight: 6,
                            }}
                          />
                          <Text style={{ fontSize: 12, color: "#444" }}>
                            {item.name} (${item.value.toFixed(2)})
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {chartMode === "methods" && paymentMethodPieData.length === 0 && (
                  <Text style={{ marginTop: 16, color: "#777" }}>
                    Not enough data to show payment method breakdown yet.
                  </Text>
                )}

                
                {activePoint && (
                  <View
                    style={{
                      marginTop: 12,
                      padding: 10,
                      borderRadius: 12,
                      backgroundColor: "#f7f1ff",
                      borderWidth: 1,
                      borderColor: "#e0d0ff",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "600",
                        color: "#6a0dad",
                        marginBottom: 2,
                      }}
                    >
                      {activePoint.extra}
                    </Text>
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "700",
                        color: "#333",
                      }}
                    >
                      {activePoint.label}
                    </Text>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: "#333",
                        marginTop: 2,
                      }}
                    >
                      ${activePoint.value.toFixed(2)}
                    </Text>
                  </View>
                )}

              </View>
            )}

            <View style={styles.recentCard}>
              <View style={styles.recentHeaderRow}>
                <Text style={styles.recentTitle}>Transactions</Text>
                {user?.role === "admin" && (
                  <TouchableOpacity
                    onPress={handleImportCSV}
                    accessibilityLabel="Import transactions from CSV"
                    style={styles.headingButton}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="cloud-upload-outline"
                      size={16}
                      color="#6a0dad"
                    />
                    <Text style={styles.headingButtonText}>Import CSV</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TextInput
                placeholder="Search by worker or customer"
                placeholderTextColor="#777"
                value={transactionSearchText}
                onChangeText={setTransactionSearchText}
                style={styles.searchBox}
              />

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
                      onPress={() => setExportFabTransactionsOpen(true)}
                      style={styles.exportButton}
                    >
                      <Ionicons name="download" size={16} color="#6a0dad" />
                      <Text style={styles.exportText}>Export</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <ExportFabMenu
                  visible={exportFabTransactionsOpen}
                  onClose={() => setExportFabTransactionsOpen(false)}
                  title="Transactions"
                  items={[
                    { icon: "document-outline", label: "Export as PDF", onPress: exportAsPDF },
                    { icon: "grid-outline",      label: "Export as CSV", onPress: exportAsExcel },
                    { icon: "mail-outline",      label: "Send via Email", onPress: emailExport },
                  ]}
                />

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
                          web: { marginBottom: 0 },
                        }),
                      }}
                    >
                      {txs.map((tx, index) => (
                        <Animated.View
                          key={tx._id}
                          entering={index < 20 ? FadeInUp.delay(index * 40) : undefined}
                          style={{ width: isTablet ? "48%" : "100%" }}
                        >
                          <TouchableOpacity
                            onPress={() => openModal(tx)}
                            activeOpacity={0.8}
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "flex-start", // allow multi-line
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
                            {/* LEFT: icon + text */}
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                flex: 1,              // take remaining space
                                paddingRight: 8,      // small gap from badge
                              }}
                            >
                              <Ionicons
                                name="document-text-outline"
                                size={24}
                                color="#aaa"
                                style={{ marginRight: 12 }}
                              />
                              <View style={{ flexShrink: 1 }}>
                                <Text
                                  style={{
                                    fontSize: Platform.OS === "ios" ? 15 : 14,
                                    fontWeight: "600",
                                    color: "#333",
                                  }}
                                  numberOfLines={2}         // wrap, but keep it tidy
                                >
                                  {tx.serviceType}
                                </Text>
                                <Text
                                  style={{ fontSize: 13, color: "#888" }}
                                  numberOfLines={1}
                                >
                                  {new Date(tx.serviceDate).toLocaleDateString("en-US", {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  })}
                                </Text>
                              </View>
                            </View>

                            {/* RIGHT: amount pill */}
                            <Text
                              style={{
                                fontWeight: "700",
                                fontSize: 14,
                                color: tx.finalPrice >= 0 ? "#5E2BFF" : "#D93025",
                                backgroundColor: tx.finalPrice >= 0 ? "#f0e8ff" : "#fee8e8",
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                                borderRadius: 10,
                                maxWidth: isTablet ? 140 : 110, // constrain width
                                flexShrink: 1,                  // allow it to shrink
                                textAlign: "right",
                              }}
                              numberOfLines={2}                 // wrap instead of overflow
                            >
                              {tx.finalPrice >= 0
                                ? `+$${Number(tx.finalPrice).toFixed(2)}`
                                : `-$${Math.abs(Number(tx.finalPrice)).toFixed(2)}`}
                            </Text>
                          </TouchableOpacity>
                        </Animated.View>
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
                      web: { marginBottom: 0 },
                    }),
                  }}
                >
                  {filteredTransactions.map((tx, index) => (
                    <Animated.View
                      key={tx._id}
                      entering={index < 20 ? FadeInUp.delay(index * 40) : undefined}
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
                            ${Number(tx.finalPrice || 0).toFixed(2)}
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
                    </Animated.View>
                  ))}
                </View>
              )}
            </View>

            {/* Filters bottom sheet */}
            <BottomSheet
              visible={filtersModalVisible}
              onClose={() => setFiltersModalVisible(false)}
              title="Filter Transactions"
              maxHeight={520}
            >
              <Text style={{ marginTop: 8, fontWeight: "600", color: "#333" }}>
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
                  <Text style={{ color: "#444", fontWeight: "600" }}>Clear</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, { flex: 1, marginLeft: 6 }]}
                  onPress={() => {
                    fetchData();
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
            </BottomSheet>

          </>
        )}

        {selectedTab === "Workers" && (
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
                <Text style={styles.recentTitle}>Worker List</Text>
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
                  onPress={() => setExportFabEmployeesOpen(true)}
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
            <ExportFabMenu
              visible={exportFabEmployeesOpen}
              onClose={() => setExportFabEmployeesOpen(false)}
              title="Workers"
              items={[
                { icon: "document-text", label: "Export CSV", onPress: () => exportEmployeesCSV(sortedEmployees), disabled: !sortedEmployees.length },
                { icon: "document",      label: "Export PDF", onPress: () => exportEmployeesPDF(sortedEmployees), disabled: !sortedEmployees.length },
                { icon: "mail",          label: "Email List", onPress: () => emailEmployees(sortedEmployees),     disabled: !sortedEmployees.length },
              ]}
            />

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
                      entering={index < 20 ? FadeInUp.delay(index * 40) : undefined}
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
                          <Animated.View entering={index < 20 ? FadeInUp.delay(index * 40) : undefined}>
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
                                showToast("Worker deleted");
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
                    entering={index < 20 ? FadeInUp.delay(index * 40) : undefined}
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
                            showToast("Worker deleted");
                          }}
                        >
                          <Ionicons name="trash-outline" size={20} color="red" />
                        </TouchableOpacity>
                      </View>
                    </Pressable>
                  </Animated.View>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        <BottomSheet
          visible={editModalVisible}
          onClose={() => setEditModalVisible(false)}
          title={
            selectedEmployee ? `Edit ${selectedEmployee.name}` : "Edit Worker"
          }
          maxHeight={500}
        >
          <Text style={styles.modalLabel}>Name</Text>
          <TextInput
            placeholder="Name"
            placeholderTextColor="#777"
            value={selectedEmployee?.name || ""}
            onChangeText={(text) =>
              setSelectedEmployee((prev) => (prev ? { ...prev, name: text } : prev))
            }
            style={styles.modalInput}
          />

          <Text style={styles.modalLabel}>Email</Text>
          <TextInput
            placeholder="Email"
            placeholderTextColor="#777"
            value={selectedEmployee?.email || ""}
            onChangeText={(text) =>
              setSelectedEmployee((prev) => (prev ? { ...prev, email: text } : prev))
            }
            style={styles.modalInput}
          />

          <Text style={styles.modalLabel}>Phone Number</Text>
          <TextInput
            placeholder="Phone"
            placeholderTextColor="#777"
            value={selectedEmployee?.phone || ""}
            onChangeText={(text) =>
              setSelectedEmployee((prev) => (prev ? { ...prev, phone: text } : prev))
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
              setSelectedEmployee((prev) =>
                prev
                  ? {
                      ...prev,
                      hourlyRate: parseFloat(text) || 0,
                    }
                  : prev
              )
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
                    `https://jw-auto-clinic-246.onrender.com/api/workers/${selectedEmployee._id}`,
                    {
                      method: "PUT",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${user?.token}`,
                      },
                      body: JSON.stringify(selectedEmployee),
                    }
                  );

                  if (!res.ok) throw new Error("Failed to update worker");

                  setEditModalVisible(false);
                  await fetchEmployees();
                  showToast("Worker updated");
                } catch (err) {
                  Alert.alert("Update failed", "Unable to update worker.");
                  // console.error(err);
                }
              }}
            >
              <Text style={[styles.modalItem, { color: "#6a0dad" }]}>
                Save Changes
              </Text>
            </TouchableOpacity>
          </View>
        </BottomSheet>


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
                      placeholder="Search by worker name"
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
                          <View
                            style={{ flexDirection: "row", alignItems: "center" }}
                          >
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
                          <View
                            style={{ flexDirection: "row", alignItems: "center" }}
                          >
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
                  onPress={() => setExportFabShiftsOpen(true)}
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
              <ExportFabMenu
                visible={exportFabShiftsOpen}
                onClose={() => setExportFabShiftsOpen(false)}
                title="Shifts"
                items={[
                  { icon: "document-text", label: "Export CSV", onPress: () => handleExportCSV(visibleShifts), disabled: !visibleShifts.length },
                  { icon: "document",      label: "Export PDF", onPress: () => handleExportPDF(visibleShifts), disabled: !visibleShifts.length },
                  { icon: "mail",          label: "Email CSV",  onPress: () => handleEmailDocument(visibleShifts, "csv"), disabled: !visibleShifts.length },
                  { icon: "mail",          label: "Email PDF",  onPress: () => handleEmailDocument(visibleShifts, "pdf"), disabled: !visibleShifts.length },
                ]}
              />

              {/* SORT modal (very small) */}
              <BottomSheet
                visible={sortMenuVisible}
                onClose={() => setSortMenuVisible(false)}
                title="Sort Shifts"
                maxHeight={260}
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
              </BottomSheet>


              {isTablet ? (
                // Tablet/Desktop table with delete column
                <ScrollView horizontal showsHorizontalScrollIndicator>
                  <View style={{ minWidth: 1200 }}>
                    <View style={[styles.tableRow, styles.tableHeader]}>
                      <Text style={[styles.columnHeader, { width: 140 }]}>
                        Worker
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

                      {/* NEW */}
                      <Text style={[styles.columnHeader, { width: 110 }]}>
                        Lunch Start
                      </Text>
                      <Text style={[styles.columnHeader, { width: 110 }]}>
                        Lunch End
                      </Text>
                      <Text style={[styles.columnHeader, { width: 110 }]}>
                        Shift Time
                      </Text>
                      <Text style={[styles.columnHeader, { width: 110 }]}>
                        Lunch Time
                      </Text>
                      {/* /NEW */}

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

                      // Completed shift duration (only when both present)
                      const sStart = parseDateTime12(shift.date, shift.clockIn);
                      const sEnd = parseDateTime12(shift.date, shift.clockOut);
                      const shiftMs = shift.clockOut
                        ? diffMsSafe(sStart, sEnd)
                        : 0;

                      // Lunch duration (only when both present)
                      const lStart = parseDateTime12(
                        shift.date,
                        shift.lunchStart
                      );
                      const lEnd = parseDateTime12(shift.date, shift.lunchEnd);
                      const lunchMs =
                        shift.lunchStart && shift.lunchEnd
                          ? diffMsSafe(lStart, lEnd)
                          : 0;

                      return (
                        <TouchableOpacity
                          key={keyId}
                          onPress={() => {
                            setSelectedShift(shift);
                            setShiftModalVisible(true);
                          }}
                        >
                          <Animated.View
                            entering={index < 20 ? FadeInUp.delay(index * 40) : undefined}
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
                              {shift.worker}
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

                            {/* NEW: lunch times + durations */}
                            <Text style={[styles.cell, { width: 110 }]}>
                              {shift.lunchStart || "—"}
                            </Text>
                            <Text style={[styles.cell, { width: 110 }]}>
                              {shift.lunchEnd || "—"}
                            </Text>
                            <Text style={[styles.cell, { width: 110 }]}>
                              {fmtHmss(shiftMs)}
                            </Text>
                            <Text style={[styles.cell, { width: 110 }]}>
                              {fmtHmss(lunchMs)}
                            </Text>
                            {/* /NEW */}

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
                    // NEW (put just before returning the card for each shift)
                    const sStart = parseDateTime12(shift.date, shift.clockIn);
                    const sEnd = parseDateTime12(shift.date, shift.clockOut);
                    const shiftMs = shift.clockOut ? diffMsSafe(sStart, sEnd) : 0;

                    const lStart = parseDateTime12(shift.date, shift.lunchStart);
                    const lEnd = parseDateTime12(shift.date, shift.lunchEnd);
                    const lunchMs =
                      shift.lunchStart && shift.lunchEnd
                        ? diffMsSafe(lStart, lEnd)
                        : 0;

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
                            entering={index < 20 ? FadeInUp.delay(index * 40) : undefined}
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
                              {shift.worker}
                            </Text>
                            <Text style={{ color: "#666", marginBottom: 4 }}>
                              {shift.date}
                            </Text>
                            <Text style={{ fontSize: 14 }}>
                              ⏱ {shift.clockIn} → {shift.clockOut || "—"}
                            </Text>

                            {/* NEW: lunch times */}
                            <Text style={{ fontSize: 14 }}>
                              🍔 {shift.lunchStart || "—"} →{" "}
                              {shift.lunchEnd || "—"}
                            </Text>

                            {/* NEW: durations */}
                            <Text style={{ fontSize: 14 }}>
                              🕒 Shift: {fmtHmss(shiftMs)} • 🍽 Lunch:{" "}
                              {fmtHmss(lunchMs)}
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

        {selectedTab === "Reports" && (
          <View style={styles.reportsContainer}>
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
                      onChangeValue={(v) => {
                        if (v === "Custom") setReportDateModalOpen(true);
                      }}
                      containerStyle={styles.periodPickerContainer}
                      style={styles.periodPicker}
                      dropDownContainerStyle={styles.periodPickerDropdown}
                      textStyle={styles.periodPickerText}
                      placeholder="Select Period"
                      listMode={
                        Platform.OS === "android" ? "MODAL" : "SCROLLVIEW"
                      }
                      modalProps={{
                        animationType: "fade",
                        presentationStyle: "overFullScreen",
                      }}
                    />
                  </View>

                  <View style={[styles.toolbarCol, { flexGrow: 0 }]}>
                    <Text style={styles.toolbarLabel}>Metric</Text>
                    <View style={styles.segment}>
                      {(["Revenue", "Services", "Expenses"] as const).map(
                        (type) => {
                          const active = chartType === type;
                          return (
                            <TouchableOpacity
                              key={type}
                              onPress={() => setChartType(type)}
                              accessibilityRole="button"
                              accessibilityLabel={`Show ${type}`}
                              style={[
                                styles.segmentBtn,
                                active && styles.segmentBtnActive,
                              ]}
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
                              <Text
                                style={[
                                  styles.segmentBtnText,
                                  active && styles.segmentBtnTextActive,
                                ]}
                              >
                                {type}
                              </Text>
                            </TouchableOpacity>
                          );
                        }
                      )}
                    </View>
                  </View>
                </View>

                {/* Row 2: Selected range pill + Actions */}
                <View style={styles.reportToolbarRow}>
                  <View style={[styles.toolbarCol, { flexGrow: 1 }]}>
                    <View style={styles.rangePill}>
                      <Ionicons
                        name="calendar-outline"
                        size={16}
                        color="#6a0dad"
                      />
                      <Text style={styles.rangePillText}>{periodLabel()}</Text>
                      {reportPeriod === "Custom" && (
                        <TouchableOpacity
                          onPress={() => setReportDateModalOpen(true)}
                          style={{ marginLeft: 6 }}
                        >
                          <Ionicons
                            name="create-outline"
                            size={16}
                            color="#6a0dad"
                          />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  <View style={[styles.toolbarCol, styles.toolbarActions]}>
                    <TouchableOpacity
                      onPress={pickExpensesCSVSafe}
                      style={styles.actionBtnSecondary}
                      accessibilityRole="button"
                      accessibilityLabel="Upload expenses CSV"
                    >
                      <Ionicons
                        name="cloud-upload-outline"
                        size={18}
                        color="#444"
                      />
                      <Text style={styles.actionBtnSecondaryText}>
                        Upload Expenses CSV
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setExportFabReportsOpen(true)}
                      style={styles.actionBtnPrimary}
                      accessibilityRole="button"
                      accessibilityLabel="Export report"
                    >
                      <Ionicons name="download" size={18} color="#fff" />
                      <Text style={styles.actionBtnPrimaryText}>Export</Text>
                    </TouchableOpacity>
                  </View>
                  <ExportFabMenu
                    visible={exportFabReportsOpen}
                    onClose={() => setExportFabReportsOpen(false)}
                    title="Reports"
                    items={[
                      { icon: "document-text", label: "Export CSV", onPress: exportReportCSV },
                      { icon: "document",      label: "Export PDF", onPress: exportReportPDF },
                      { icon: "mail",          label: "Email CSV",  onPress: () => emailReport("csv") },
                      { icon: "mail",          label: "Email PDF",  onPress: () => emailReport("pdf") },
                    ]}
                  />
                </View>
              </View>

              {/* Bar Chart */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                removeClippedSubviews
              >
                <View renderToHardwareTextureAndroid style={{}}>
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
                </View>
              </ScrollView>
            </View>

            <View style={styles.reportCards}>
              <View style={styles.reportCard}>
                <Text style={styles.cardLabel}>💰</Text>
                <Text style={styles.cardValue}>
                  ${reportTotals.revenue.toFixed(2)}
                </Text>
                <Text style={styles.cardTitle}>Total Revenue</Text>
              </View>

              <View style={styles.reportCard}>
                <Text style={styles.cardLabel}>💸</Text>
                <Text style={styles.cardValue}>
                  ${reportTotals.expenses.toFixed(2)}
                </Text>
                <Text style={styles.cardTitle}>Total Expenses</Text>
              </View>

              <View style={styles.reportCard}>
                <Text style={styles.cardLabel}>🧮</Text>
                <Text style={styles.cardValue}>
                  ${reportTotals.net.toFixed(2)}
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
                <Text style={styles.cardTitle}>Total Workers</Text>
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
          </View>
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

        {/* Transaction details bottom sheet */}
        <BottomSheet
          visible={transactionModalVisible && !!selectedTx}
          onClose={closeModal}
          title="Transaction Details"
          maxHeight={420}
        >
          {selectedTx && (
            <>
              <Text style={styles.modalLine}>
                Service:{" "}
                <Text style={{ fontWeight: "600" }}>{selectedTx.serviceType}</Text>
              </Text>
              <Text style={styles.modalLine}>
                Amount: $
                {Number(selectedTx.finalPrice || 0).toFixed(2)}
              </Text>
              <Text style={styles.modalLine}>
                Payment: {selectedTx.paymentMethod || "—"}
              </Text>
              <Text style={styles.modalLine}>
                Customer:{" "}
                {selectedTx.customer?.name || selectedTx.customerName || "N/A"}
              </Text>
              <Text style={styles.modalLine}>
                Date:{" "}
                {selectedTx.serviceDate
                  ? new Date(selectedTx.serviceDate).toLocaleString()
                  : "—"}
              </Text>
              {selectedTx.notes ? (
                <Text style={styles.modalLine}>Notes: {selectedTx.notes}</Text>
              ) : null}
            </>
          )}
        </BottomSheet>

        {/* Shift details bottom sheet */}
        <BottomSheet
          visible={shiftModalVisible && !!selectedShift}
          onClose={() => {
            setShiftModalVisible(false);
            setSelectedShift(null);
          }}
          title="Shift Details"
          maxHeight={360}
        >
          {selectedShift && (() => {
            const sStart = parseDateTime12(
              selectedShift.date,
              selectedShift.clockIn
            );
            const sEnd = parseDateTime12(
              selectedShift.date,
              selectedShift.clockOut
            );
            const lStart = parseDateTime12(
              selectedShift.date,
              selectedShift.lunchStart
            );
            const lEnd = parseDateTime12(
              selectedShift.date,
              selectedShift.lunchEnd
            );
            const shiftMs = selectedShift.clockOut
              ? diffMsSafe(sStart, sEnd)
              : 0;
            const lunchMs =
              selectedShift.lunchStart && selectedShift.lunchEnd
                ? diffMsSafe(lStart, lEnd)
                : 0;

            return (
              <>
                <Text style={styles.modalLine}>
                  Worker: {selectedShift.worker}
                </Text>
                <Text style={styles.modalLine}>
                  Date: {selectedShift.date}
                </Text>
                <Text style={styles.modalLine}>
                  Shift: {selectedShift.clockIn} →{" "}
                  {selectedShift.clockOut || "—"} ({fmtHmss(shiftMs)})
                </Text>
                <Text style={styles.modalLine}>
                  Lunch: {selectedShift.lunchStart || "—"} →{" "}
                  {selectedShift.lunchEnd || "—"} ({fmtHmss(lunchMs)})
                </Text>
                <Text style={styles.modalLine}>
                  Status: {selectedShift.status}
                </Text>
              </>
            );
          })()}
        </BottomSheet>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },  
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  // --- Sticky header that spans the full width
  stickyHeaderWrap: {
    backgroundColor: "#fff",
    // Full-bleed: cancel the ScrollView content padding (which is 20)
    marginHorizontal: -20,
    paddingHorizontal: 20,   // keep inner content aligned with page
    paddingTop: Platform.select({ ios: 40, android: 20, default: 80 }),
    paddingBottom: 10,
    zIndex: 10,
  },

  stickyHeaderElevated: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 2 },
      default: {},
    }),
  },

  // Optional: keep header row semantics (you can also reuse existing .header)
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  logo: {
    fontSize: 30,
    fontWeight: "800",
    color: "#6a0dad",
    marginTop: Platform.OS === "web" ? 10 : 10,
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

  chartHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },  
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



  segmentedControl: {
    flexDirection: "row",
    backgroundColor: "#f2e9fb",
    borderRadius: 20,
    padding: 2,
    flexShrink: 1,
    alignSelf: "flex-start", // so on phones it doesn't try to fill full width
  },  
  segmentedButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 16,
  },
  segmentedButtonActive: {
    backgroundColor: "#6a0dad",
  },
  segmentedLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6a0dad",
  },
  segmentedLabelActive: {
    color: "#fff",
  },
  

  chartTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 16,
    color: "#6a0dad",
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
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 14,
    color: "#6a0dad",
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
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12,
    color: "#6a0dad",
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
    zIndex: 3000, // makes the dropdown appear over neighbors (iOS)
    elevation: 4, // Android
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

  recentHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 8,
  },

  headingButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 6, android: 6, default: 8 }),
    backgroundColor: "#f3e9ff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e6d7fb",
  },

  headingButtonText: {
    color: "#6a0dad",
    fontWeight: "600",
    marginLeft: 6,
    fontSize: 13,
  },

  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheetContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: Platform.select({ ios: 24, android: 16, default: 16 }),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 8,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#ddd",
    marginBottom: 8,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    marginBottom: 8,
  },
  sheetContent: {
    paddingBottom: 16,
    rowGap: 4,
  },
});
