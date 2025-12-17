// settings.tsx
import { useAuth } from "@/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import * as LocalAuthentication from "expo-local-authentication";
import { useRouter } from "expo-router";
import * as Updates from "expo-updates";
import React, { useEffect, useState } from "react";
import type { PressableStateCallbackType } from "react-native";
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions
} from "react-native";
import * as Animatable from "react-native-animatable";

type ChangeItem = { type: "New" | "Improved" | "Fixed" | string; text: string };
type WhatsNewItem = { version: string; date?: string; changes: ChangeItem[] };

// --- Remote endpoint + local fallback ---
const WHATS_NEW_URL =
  "https://jw-auto-clinic-246.onrender.com/api/support/whatsnew";

  const WHATS_NEW_FALLBACK: WhatsNewItem[] = [
    {
      version: "1.4.0",
      date: "2025-12-14",
      changes: [
        { type: "New", text: "Biometric login option added to the login screen once enabled in Settings." },
        { type: "New", text: "New bottom sheet UI for key flows like Services & Specials and Settings, replacing full-screen modals." },
        { type: "New", text: "Enhanced earnings and payment-method charts with tap-to-filter behavior and active-point display." },
        { type: "New", text: "Chart segment control now resets the detail view until you tap a new point in the current segment." },
  
        { type: "Improved", text: "Tablet layouts refined for Employees, Transactions, Settings, and other screens in portrait and landscape." },
        { type: "Improved", text: "Sticky headers adjusted for better full-width appearance, spacing, and elevation while scrolling." },
        { type: "Improved", text: "Floating action buttons now show correctly on Android landscape and tablet orientations." },
        { type: "Improved", text: "Bottom sheets and modals behave better with the keyboard, keeping content visible while typing." },
        { type: "Improved", text: "Login screen spacing and animations polished, including conditional biometric button display." },
        { type: "Improved", text: "Android launcher icon updated to use the correct light artwork." },
  
        { type: "Improved", text: "Browser password reset validation aligned with the app’s strong password rules and messages." },
        { type: "Improved", text: "Transaction detail view now falls back to list data if the server returns a 404 for that transaction." },
        { type: "Improved", text: "Distance and matching logic (OSRM) improved for more consistent routing and fallback behavior." },
  
        { type: "Fixed", text: "Fixed bottom sheet bug where closing the keyboard left extra blank space at the bottom." },
        { type: "Fixed", text: "Fixed multiple landscape layout issues where content could be misaligned or partially hidden." },
        { type: "Fixed", text: "Fixed payment-method chart issue where the previous segment’s highlighted value could remain visible." },
        { type: "Fixed", text: "Resolved custom tab bar error ('Rendered fewer hooks than expected') that could cause crashes." },
        { type: "Fixed", text: "Long service and transaction labels now wrap correctly instead of overflowing outside their cards." },
      ],
    },
    {
      version: "1.3.0",
      date: "2025-10-01",
      changes: [
        {
          type: "Improved",
          text: "Employee hourly-rate field now supports fractional values such as 9.375 per hour for more accurate pay setups.",
        },
        {
          type: "Fixed",
          text: "Fixed an issue where the email body total could differ from the receipt calculation, ensuring both now match correctly.",
        },
        {
          type: "Improved",
          text: "UI/UX updates across the Add, Employees, and Settings tabs for a cleaner and more consistent experience.",
        },
        {
          type: "Improved",
          text: "Device orientation handling updated so screens behave correctly in both portrait and landscape modes.",
        },
        {
          type: "Improved",
          text: "Additional under-the-hood changes and updates for stability and performance.",
        },
      ],
    },
    {
      version: "1.2.0",
      date: "2025-08-12",
      changes: [
        { type: "New", text: "Support form added under Settings → Report an Issue." },
        { type: "Improved", text: "Check for Updates now shows clearer messages." },
        { type: "Fixed", text: "Minor layout polish in Settings and inputs." },
      ],
    },
    {
      version: "1.1.0",
      date: "2025-08-05",
      changes: [
        { type: "New", text: "Employee and Shifts screens now refresh more reliably." },
      ],
    },
  ];
  

// ----- Platform helpers + design tokens --------------------------------
const isWeb = Platform.OS === "web";
const isIOS = Platform.OS === "ios";
const isAndroid = Platform.OS === "android";
const isNative = isIOS || isAndroid;

const UI = {
  maxWidth: isWeb ? 1120 : 740, // wider on web
  padX: isWeb ? 24 : 18, // a bit more padding on web
  radius: Platform.select({ ios: 14, android: 10, default: 12 })!,
  colors: {
    // Light only
    bg: "#FFFFFF", // iOS grouped background (light)
    card: "#f9f9ff",
    border: "#E5E5EA",
    text: "#111111",
    sub: "#6E6E73",
    primary: "#6A0DAD",
    glyphBorder: "#e9ecf7",
  },
};

// ----- Social links (edit to your accounts) ----------------------------
const APP_NAME = String(Constants.expoConfig?.name || "Our App");
const SOCIAL = {
  website: "https://example.com",
  instagram: "https://instagram.com/",
  tiktok: "https://tiktok.com/@",
  twitter: "https://twitter.com/",
};

// ----- Small helpers ----------------------------------------------------
function openLink(url: string) {
  if (!url) return;
  Linking.openURL(url).catch(() => {
    Alert.alert("Unable to open link", "Please try again later.");
  });
}

// Human-readable label for available biometrics
function getBiometricLabel(
  types: LocalAuthentication.AuthenticationType[]
): string {
  if (!types || types.length === 0) {
    return "Biometrics available";
  }
  const names: string[] = [];

  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    names.push(isIOS ? "Touch ID / Fingerprint" : "Fingerprint");
  }
  if (
    types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
  ) {
    names.push(isIOS ? "Face ID" : "Face recognition");
  }
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    names.push("Iris");
  }

  if (names.length === 0) return "Biometrics available";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} or ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <View style={[styles.shell, { backgroundColor: UI.colors.bg }]}>
      <View
        style={[
          styles.page,
          isWeb
            ? ({
                maxWidth: "100%",
                alignSelf: "stretch",
                flex: 1,
                minHeight: 0,
              } as any)
            : null, // ← full-bleed on web
        ]}
      >
        {children}
      </View>
    </View>
  );
}

function ListIcon({
  name,
  tint = UI.colors.primary,
}: {
  name: React.ComponentProps<typeof Ionicons>["name"];
  tint?: string;
}) {
  return (
    <View style={[styles.glyphWrap, { borderColor: UI.colors.glyphBorder }]}>
      <Ionicons name={name} size={18} color={tint} />
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  // Only decorate our custom Row components so arbitrary children (like social card) don't get extra props.
  const kids = React.Children.toArray(children);
  const decorated = kids.map((child, i) => {
    if (!React.isValidElement(child)) return child;
    if ((child as any).type === Row) {
      return React.cloneElement(child as any, {
        isFirst: i === 0,
        isLast: i === kids.length - 1,
      });
    }
    return child;
  });

  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionHeader} accessibilityRole="header">
        {title}
      </Text>

      <View style={styles.sectionBody}>{decorated}</View>
    </View>
  );
}

type RowProps = {
  label: string;
  value?: string;
  subtitle?: string;
  leading?: React.ReactNode; // icon tile
  childrenRight?: React.ReactNode; // inputs/switches
  onPress?: () => void;
  navigates?: boolean; // chevron
  external?: boolean; // external indicator
  accessibilityLabel?: string;
  isFirst?: boolean;
  isLast?: boolean;
};

function Row({
  label,
  value,
  subtitle,
  leading,
  childrenRight,
  onPress,
  navigates,
  external,
  accessibilityLabel,
  isLast,
}: RowProps) {
  const Content = (
    <View style={styles.rowInner}>
      <View style={styles.rowLeft}>
        {leading ? <View style={{ marginRight: 12 }}>{leading}</View> : null}
        <View style={{ flex: 1 }}>
          {/* no-wrap title */}
          <Text style={styles.rowLabel} numberOfLines={1} ellipsizeMode="tail">
            {label}
          </Text>
          {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>

      <View style={styles.rowRight}>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        {childrenRight}
        {external ? (
          <Ionicons
            name="open-outline"
            size={18}
            color="#9aa0a6"
            style={{ marginLeft: 8 }}
          />
        ) : navigates ? (
          <Ionicons
            name={isIOS ? "chevron-forward" : "chevron-forward-outline"}
            size={18}
            color="#9aa0a6"
            style={{ marginLeft: 8 }}
          />
        ) : null}
      </View>

      {/* light divider between rows (hidden on last) */}
      {!isLast ? <View style={styles.rowDivider} /> : null}
    </View>
  );

  if (!onPress)
    return (
      <View
        style={[
          styles.row,
          isWeb ? ({ cursor: "default" } as any) : undefined,
        ]}
      >
        {Content}
      </View>
    );

  return (
    <Pressable
      onPress={onPress}
      android_ripple={
        isAndroid ? { color: "rgba(0,0,0,0.06)" } : undefined
      }
      style={(state: PressableStateCallbackType) => [
        styles.row,
        isWeb &&
          state.hovered &&
          ({ backgroundColor: "#FAFAFA", cursor: "pointer" } as any),
        isIOS && state.pressed && { opacity: 0.75 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
    >
      {Content}
    </Pressable>
  );
}

// ----- Reusable bottom sheet -------------------------------------------
type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  keyboardOffset?: number;  // 👈 new
};

function BottomSheet({
  visible,
  onClose,
  title,
  children,
  keyboardOffset = 0,      // 👈 default
}: BottomSheetProps) {
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.bsWrapper}>
        <Pressable style={styles.bsBackdrop} onPress={onClose} />

        <Animatable.View
          animation="fadeInUp"
          duration={220}
          style={[
            styles.bsSheet,
            keyboardOffset ? { marginBottom: keyboardOffset } : null, // 👈 shift above keyboard
          ]}
        >
          <View style={styles.bsHandle} />
          {title ? <Text style={styles.bsTitle}>{title}</Text> : null}
          <View style={styles.bsContent}>{children}</View>
        </Animatable.View>
      </View>
    </Modal>
  );
}

// ----- Screen ------------------------------------------------------------------
export default function SettingsScreen() {
  const { user, logout, updateProfile } = useAuth();
  const router = useRouter();

  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone?.trim() || "");
  const [avatar, setAvatar] = useState(user?.avatar || null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    user?.notificationsEnabled ?? true
  );
  const [saving, setSaving] = useState(false);
  const [showSavedAnim, setShowSavedAnim] = useState(false);

  // NEW: subtle elevation when scrolled for the sticky header
  const [headerElevated, setHeaderElevated] = useState(false);

  // --- Bottom sheets visibility ---
  const [editSheetVisible, setEditSheetVisible] = useState(false);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  const [whatsNewSheetVisible, setWhatsNewSheetVisible] = useState(false);

  // --- Support form state (inside sheet) ---
  const [reportSubject, setReportSubject] = useState("");
  const [reportMessage, setReportMessage] = useState("");
  const [sendingReport, setSendingReport] = useState(false);

  // --- Updates state ---
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // --- What's New state (sheet content) ---
  const [whatsNew, setWhatsNew] = useState<WhatsNewItem[]>([]);
  const [loadingWhatsNew, setLoadingWhatsNew] = useState(false);
  const [whatsNewError, setWhatsNewError] = useState<string | null>(null);

  const [keyboardOffset, setKeyboardOffset] = useState(0);

  // --- Biometrics / Security state ---
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricTypes, setBiometricTypes] = useState<
    LocalAuthentication.AuthenticationType[]
  >([]);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [checkingBiometric, setCheckingBiometric] = useState(true);

  // Web layout breakpoint
  const { width } = useWindowDimensions();
  const isWideWeb = isWeb && width >= 1024;

  useEffect(() => {
    if (isWeb) return;

    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const height = e?.endCoordinates?.height ?? 0;
      setKeyboardOffset(height);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardOffset(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Init biometrics from device + stored preference
  useEffect(() => {
    if (!isNative) {
      setCheckingBiometric(false);
      return;
    }

    const initBiometrics = async () => {
      try {
        const saved = await AsyncStorage.getItem("@useBiometrics");
        if (saved === "true") {
          setBiometricEnabled(true);
        }

        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();

        if (hasHardware && enrolled) {
          setBiometricAvailable(true);
          const types =
            await LocalAuthentication.supportedAuthenticationTypesAsync();
          setBiometricTypes(types);
        } else {
          setBiometricAvailable(false);
        }
      } catch (e) {
        setBiometricAvailable(false);
      } finally {
        setCheckingBiometric(false);
      }
    };

    initBiometrics();
  }, []);

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Please allow access to your photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (!result.canceled && result.assets.length > 0) {
      setAvatar(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({ name, email, phone, avatar, notificationsEnabled });
      Alert.alert("Saved", "Your profile has been updated.");
      setEditSheetVisible(false);
      setShowSavedAnim(true);
      setTimeout(() => setShowSavedAnim(false), 2000);
    } catch (err) {
      Alert.alert("Error", "Failed to save profile changes.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  const handleSubmitReport = async () => {
    if (!reportSubject.trim() || !reportMessage.trim()) {
      Alert.alert("Missing info", "Please add a subject and a message.");
      return;
    }
    setSendingReport(true);
    try {
      const res = await fetch(
        `${"https://jw-auto-clinic-246.onrender.com"}/api/support/report`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
          },
          body: JSON.stringify({
            subject: reportSubject,
            message: reportMessage,
            name,
            email,
            phone,
            to: "addesylvinaus@gmail.com",
          }),
        }
      );

      const maybeJson = await res.clone().json().catch(() => null);

      if (!res.ok) {
        const serverMsg =
          (maybeJson && (maybeJson.error || maybeJson.message)) ||
          (await res.text()).slice(0, 300) ||
          "Unknown server error";
        Alert.alert("Send failed", serverMsg);
        return;
      }

      Alert.alert("Thanks!", "Your issue was sent to support.");
      setReportSubject("");
      setReportMessage("");
      setReportSheetVisible(false);
    } catch (e: any) {
      Alert.alert(
        "Network error",
        "We’ll open your mail app so you can send the report manually."
      );
      const subject = encodeURIComponent(`[App Support] ${reportSubject}`);
      const body = encodeURIComponent(
        `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\n\n${reportMessage}`
      );
      Linking.openURL(
        `mailto:addesylvinaus@gmail.com?subject=${subject}&body=${body}`
      );
      setReportSheetVisible(false);
    } finally {
      setSendingReport(false);
    }
  };

  const checkForUpdates = async () => {
    if (__DEV__ || Platform.OS === "web") {
      Alert.alert(
        "Not available here",
        "Update checks run in a production build on iOS/Android."
      );
      return;
    }

    setCheckingUpdate(true);
    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        Alert.alert("Update available", "Download and restart now?", [
          { text: "Later", style: "cancel" },
          {
            text: "Update",
            onPress: async () => {
              try {
                await Updates.fetchUpdateAsync();
                await Updates.reloadAsync();
              } catch (e) {
                Alert.alert("Error", "Failed to apply the update.");
              }
            },
          },
        ]);
      } else {
        Alert.alert("Up to date", "You already have the latest version.");
      }
    } catch (e: any) {
      Alert.alert("Update check failed", e?.message || "Unknown error");
    } finally {
      setCheckingUpdate(false);
    }
  };

  // Toggle biometric login preference (used by login screen)
  const handleToggleBiometrics = async (next: boolean) => {
    if (!isNative) return;

    if (!biometricAvailable) {
      Alert.alert(
        "Biometrics not available",
        "This device does not support biometric authentication or it is not set up."
      );
      return;
    }

    if (next) {
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Enable biometric login",
          fallbackLabel: isIOS ? "Use passcode" : "Use device PIN",
          cancelLabel: "Cancel",
        });

        if (result.success) {
          setBiometricEnabled(true);
          await AsyncStorage.setItem("@useBiometrics", "true");
          Alert.alert(
            "Biometric login enabled",
            "You can now use Face ID, Touch ID, or your device’s biometrics when logging in (where supported)."
          );
        } else {
          setBiometricEnabled(false);
        }
      } catch (e) {
        setBiometricEnabled(false);
        Alert.alert(
          "Biometric error",
          "We couldn’t complete biometric authentication."
        );
      }
    } else {
      Alert.alert(
        "Turn off biometric login?",
        "You will need to log in using your email and password only.",
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => setBiometricEnabled(true),
          },
          {
            text: "Turn Off",
            style: "destructive",
            onPress: async () => {
              setBiometricEnabled(false);
              await AsyncStorage.setItem("@useBiometrics", "false");
            },
          },
        ]
      );
    }
  };

  // --- Load release notes (with fallback) ---
  const loadWhatsNew = async () => {
    setLoadingWhatsNew(true);
    setWhatsNewError(null);
    try {
      const res = await fetch(WHATS_NEW_URL, {
        headers: {
          "Content-Type": "application/json",
          ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: WhatsNewItem[] = await res.json();
      if (!Array.isArray(data)) throw new Error("Invalid response");
      setWhatsNew(data);
    } catch {
      setWhatsNew(WHATS_NEW_FALLBACK);
      setWhatsNewError(
        "Showing local release notes. (Couldn’t fetch from server.)"
      );
    } finally {
      setLoadingWhatsNew(false);
    }
  };

  useEffect(() => {
    if (whatsNewSheetVisible && whatsNew.length === 0 && !loadingWhatsNew) {
      loadWhatsNew();
    }
  }, [whatsNewSheetVisible]);

  useEffect(() => {
    if (user === null) {
    }
  }, [user]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: UI.colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <Shell>
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          stickyHeaderIndices={[0]}
          onScroll={(e) =>
            setHeaderElevated(e.nativeEvent.contentOffset.y > 2)
          } // NEW
          scrollEventThrottle={16} // NEW
        >
          {/* NEW: Sticky Header */}
          <View
            style={[
              styles.stickyHeader,
              headerElevated && styles.stickyHeaderElevated,
              // web-only shadow polish
              isWeb && headerElevated
                ? {
                    shadowColor: "#000",
                    shadowOpacity: 0.05,
                    shadowRadius: 6,
                    shadowOffset: { width: 0, height: 4 },
                  }
                : null,
            ]}
          >
            <Text style={styles.largeTitle}>Settings</Text>
          </View>

          {/* Profile summary card */}
          <View style={styles.profileCard}>
            <TouchableOpacity
              onPress={pickImage}
              accessibilityLabel="Edit profile picture"
            >
              <Image
                source={
                  avatar
                    ? { uri: avatar }
                    : require("@/assets/images/avatar-placeholder.png")
                }
                style={styles.profileAvatar}
              />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName}>{name || "—"}</Text>
              <Text style={styles.profileEmail}>{email || "—"}</Text>
              {editSheetVisible ? (
                <Text style={styles.profileHint}>
                  Tap Save to keep your changes
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={() => setEditSheetVisible((v) => !v)}
              style={styles.editPill}
              accessibilityLabel={
                editSheetVisible ? "Close edit profile" : "Edit profile"
              }
            >
              <Ionicons
                name={editSheetVisible ? "close-outline" : "create-outline"}
                size={18}
                color="#fff"
              />
              <Text style={styles.editPillText}>
                {editSheetVisible ? "Close" : "Edit"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ====== COLUMN LAYOUT (single column on mobile, two columns on wide web) ====== */}
          <View style={[styles.columns, isWideWeb && styles.columnsWide]}>
            {/* LEFT COLUMN */}
            <View style={[styles.col, isWideWeb && styles.colLeft]}>
              {/* GENERAL / ACCOUNT */}
              <Section title="General">
                <Row
                  label="Name"
                  value={name || "—"}
                  leading={<ListIcon name="person-outline" />}
                />
                <Row
                  label="Phone"
                  value={phone?.trim() || "—"}
                  leading={<ListIcon name="call-outline" />}
                />
                <Row
                  label="Email"
                  value={email || "—"}
                  leading={<ListIcon name="mail-outline" />}
                />
                <Row
                  label="Notifications"
                  leading={<ListIcon name="notifications-outline" />}
                  childrenRight={
                    <Switch
                      value={!!notificationsEnabled}
                      onValueChange={setNotificationsEnabled}
                    />
                  }
                />
              </Section>

              {/* SECURITY */}
              {!isWeb && (
                <Section title="Security">
                  <Row
                    label="Biometric Login"
                    subtitle={
                      checkingBiometric
                        ? "Checking device security…"
                        : biometricAvailable
                        ? getBiometricLabel(biometricTypes)
                        : "Not available on this device"
                    }
                    leading={<ListIcon name="lock-closed-outline" />}
                    childrenRight={
                      <Switch
                        value={biometricEnabled}
                        onValueChange={handleToggleBiometrics}
                        disabled={checkingBiometric || !biometricAvailable}
                      />
                    }
                  />
                </Section>
              )}

              {showSavedAnim ? (
                <Animatable.Text
                  animation="fadeInDown"
                  duration={500}
                  style={styles.savedMessage}
                >
                  ✅ Changes saved successfully!
                </Animatable.Text>
              ) : null}

              {/* SUPPORT */}
              <Section title="Support">
                <Row
                  label="Report an Issue"
                  leading={<ListIcon name="chatbox-ellipses-outline" />}
                  navigates
                  onPress={() => setReportSheetVisible(true)}
                />
              </Section>
            </View>

            {/* RIGHT COLUMN */}
            <View style={[styles.col, isWideWeb && styles.colRight]}>
              {/* UPDATES */}
              <Section title="Updates">
                <Row
                  label="Check for Updates"
                  leading={<ListIcon name="refresh-outline" />}
                  onPress={checkForUpdates}
                  navigates={!checkingUpdate}
                  value={checkingUpdate ? "Checking…" : undefined}
                />
                <Row
                  label="What’s New"
                  leading={<ListIcon name="sparkles-outline" />}
                  onPress={() => setWhatsNewSheetVisible(true)}
                  navigates
                />
              </Section>

              {/* ABOUT */}
              <Section title="About">
                <Row
                  label="Powered by"
                  value="ASD Inova Technologia"
                  leading={<ListIcon name="hardware-chip-outline" />}
                />
                <Row
                  label="Version"
                  value={String(Constants.expoConfig?.version || "")}
                  leading={<ListIcon name="information-circle-outline" />}
                />
                <Row
                  label="Log Out"
                  onPress={handleLogout}
                  navigates
                  leading={<ListIcon name="exit-outline" />}
                />
              </Section>

              {/* STAY CONNECTED / SOCIAL FOOTER (optional) */}
              {/* ... (unchanged, still commented out) ... */}
            </View>
          </View>
          {/* ====== /COLUMN LAYOUT ====== */}
        </ScrollView>

        {/* === EDIT PROFILE BOTTOM SHEET === */}
        <BottomSheet
          visible={editSheetVisible}
          onClose={() => setEditSheetVisible(false)}
          title="Edit Profile"
          keyboardOffset={keyboardOffset}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 460 }}
          >
            <View style={{ gap: 12 }}>
              <Text style={styles.sheetLabel}>Name</Text>
              <TextInput
                style={styles.itemInput}
                value={name}
                onChangeText={setName}
                placeholder="Your full name"
                placeholderTextColor="#888"
              />

              <Text style={styles.sheetLabel}>Phone</Text>
              <TextInput
                style={styles.itemInput}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="(246) 123-4567"
                placeholderTextColor="#888"
              />

              <Text style={styles.sheetLabel}>Email</Text>
              <TextInput
                style={styles.itemInput}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="your@example.com"
                placeholderTextColor="#888"
              />

              <View style={{ height: 16 }} />

              <TouchableOpacity
                style={[styles.saveButton, saving && styles.buttonDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.saveText}>
                  {saving ? "Saving…" : "Save Changes"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.saveButton,
                  { backgroundColor: "#e5e5ea", marginTop: 8 },
                ]}
                onPress={() => setEditSheetVisible(false)}
              >
                <Text style={[styles.saveText, { color: "#111" }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </BottomSheet>

        {/* === REPORT ISSUE BOTTOM SHEET === */}
        <BottomSheet
          visible={reportSheetVisible}
          onClose={() => setReportSheetVisible(false)}
          title="Report an Issue"
          keyboardOffset={keyboardOffset}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 420 }}
          >
            <TextInput
              style={styles.reportInput}
              placeholder="Subject"
              placeholderTextColor="#888"
              value={reportSubject}
              onChangeText={setReportSubject}
            />
            <TextInput
              style={[
                styles.reportInput,
                { height: 120, textAlignVertical: "top" },
              ]}
              placeholder="Describe the issue (steps to reproduce, expected vs actual, screenshots if any)"
              placeholderTextColor="#888"
              value={reportMessage}
              onChangeText={setReportMessage}
              multiline
            />
            <TouchableOpacity
              onPress={handleSubmitReport}
              style={[
                styles.submitReportButton,
                sendingReport && styles.buttonDisabled,
              ]}
              disabled={sendingReport}
            >
              <Text style={styles.submitReportText}>
                {sendingReport ? "Sending…" : "Send to Support"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                const subject = encodeURIComponent(
                  `[App Support] ${reportSubject || ""}`
                );
                const body = encodeURIComponent(
                  `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\n\n${
                    reportMessage || ""
                  }`
                );
                Linking.openURL(
                  `mailto:addesylvinaus@gmail.com?subject=${subject}&body=${body}`
                );
                setReportSheetVisible(false);
              }}
              style={[
                styles.submitReportButton,
                { marginTop: 10, backgroundColor: "#8352d1" },
              ]}
            >
              <Text style={styles.submitReportText}>Email Support</Text>
            </TouchableOpacity>
          </ScrollView>
        </BottomSheet>

        {/* === WHAT'S NEW BOTTOM SHEET === */}
        <BottomSheet
          visible={whatsNewSheetVisible}
          onClose={() => setWhatsNewSheetVisible(false)}
          title="What’s New"
          keyboardOffset={keyboardOffset}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 420 }}
          >
            <View style={styles.whatsNewCard}>
              <View style={styles.whatsNewHeaderRow}>
                <Text style={styles.whatsNewTitle}>Latest Features & Fixes</Text>
                <TouchableOpacity
                  onPress={loadWhatsNew}
                  disabled={loadingWhatsNew}
                >
                  <Text
                    style={[
                      styles.whatsNewRefresh,
                      loadingWhatsNew && { opacity: 0.6 },
                    ]}
                  >
                    {loadingWhatsNew ? "Refreshing…" : "Refresh"}
                  </Text>
                </TouchableOpacity>
              </View>

              {whatsNewError ? (
                <Text style={styles.whatsNewError}>{whatsNewError}</Text>
              ) : null}

              {loadingWhatsNew && whatsNew.length === 0 ? (
                <Text style={styles.whatsNewLoading}>
                  Loading release notes…
                </Text>
              ) : (
                whatsNew.map((rel) => (
                  <View
                    key={`${rel.version}-${rel.date || ""}`}
                    style={styles.whatsNewItem}
                  >
                    <View style={styles.whatsNewHeaderRow}>
                      <Text style={styles.whatsNewVersion}>
                        v{rel.version}
                      </Text>
                      {rel.date ? (
                        <Text style={styles.whatsNewDate}>{rel.date}</Text>
                      ) : null}
                    </View>
                    {rel.changes.map((c, idx) => (
                      <View key={idx} style={styles.whatsNewChangeRow}>
                        <View style={[styles.badge, getBadgeStyle(c.type)]}>
                          <Text style={styles.badgeText}>{c.type}</Text>
                        </View>
                        <Text style={styles.whatsNewChangeText}>{c.text}</Text>
                      </View>
                    ))}
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </BottomSheet>
      </Shell>
    </KeyboardAvoidingView>
  );
}

function getBadgeStyle(type: string) {
  const base = { backgroundColor: "#eef0ff", borderColor: UI.colors.border };
  if (type === "New")
    return { backgroundColor: "#ECFDF3", borderColor: "#BBF7D0" };
  if (type === "Improved")
    return { backgroundColor: "#EEF2FF", borderColor: "#C7D2FE" };
  if (type === "Fixed")
    return { backgroundColor: "#FFF7ED", borderColor: "#FDE68A" };
  return base;
}

const styles = StyleSheet.create({
  // Shell / Page
  shell: { flex: 1 },
  page: {
    width: "100%",
    maxWidth: UI.maxWidth,
    alignSelf: "center",
    paddingHorizontal: UI.padX,
    paddingTop: 14,
    paddingBottom: 80,
  },
  container: { flexGrow: 1, paddingTop: 25, paddingBottom: 20 },

  // NEW: Sticky header
  stickyHeader: {
    backgroundColor: UI.colors.bg,
    paddingBottom: 10,
    zIndex: 10,
    ...Platform.select({
      ios: { paddingTop: 25, },
      android: { paddingTop: 25 },
      default: { paddingTop: 60, },
    }),
  },
  stickyHeaderElevated: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: UI.colors.border,
  },

  // Large title
  largeTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: "#6a0dad",
    letterSpacing: 0.4,
  },

  // Profile summary card
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: UI.colors.card,
    borderRadius: UI.radius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: UI.colors.border,
    padding: 14,
    marginTop: 14,
    marginBottom: 14,
  },
  profileAvatar: { width: 56, height: 56, borderRadius: 12, marginRight: 12 },
  profileName: { fontSize: 17, fontWeight: "700", color: UI.colors.text },
  profileEmail: { fontSize: 13, color: UI.colors.sub, marginTop: 2 },
  profileHint: { fontSize: 12, color: "#8a8a8f", marginTop: 4 },
  editPill: {
    backgroundColor: UI.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  editPillText: { color: "#fff", fontWeight: "700", marginLeft: 6 },

  // Section container
  sectionWrap: { marginTop: 14 },
  sectionHeader: {
    fontSize: 20,
    fontWeight: "800",
    color: "#6a0dad",
    marginBottom: 8,
  },
  sectionBody: {
    backgroundColor: UI.colors.card,
    borderRadius: UI.radius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: UI.colors.border,
    overflow: "hidden",
  },

  // Row
  row: { paddingHorizontal: 14, backgroundColor: "transparent" },
  rowInner: {
    minHeight: 54,
    paddingVertical: 10,
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 8,
  },
  rowLabel: {
    fontSize: 16,
    color: UI.colors.text,
    fontWeight: "600",
    flexShrink: 1, // allow truncation
  },
  rowSubtitle: { fontSize: 12, color: UI.colors.sub, marginTop: 2 },
  rowRight: { flexDirection: "row", alignItems: "center" },
  rowValue: { fontSize: 16, color: "#5f6368" },
  rowDivider: {
    position: "absolute",
    left: 14 + 28 + 12, // left padding + glyph + gap
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: UI.colors.border,
  },

  // Icon tile
  glyphWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: "#F7F8FF",
    alignItems: "center",
    justifyContent: "center",
  },

  // Inputs (web-friendly)
  itemInput: {
    fontSize: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: UI.colors.border,
    backgroundColor: "#f9f9ff",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    textAlign: Platform.select({
      web: "left",
      default: "left",
    }) as any,
    minWidth: Platform.select({ web: 750, default: 200 }) as any,
    maxWidth: Platform.select({ web: 360, default: undefined }) as any,
    marginLeft: 8,
  },

  saveButton: {
    backgroundColor: UI.colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 10,
    alignSelf: Platform.select({
      web: "auto",
      default: "auto",
    }) as any,
    minWidth: Platform.select({ web: 220, default: undefined }) as any,
    paddingHorizontal: Platform.select({
      web: 18,
      default: undefined,
    }) as any,
  },
  saveText: {
    textAlign: "center",
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  savedMessage: {
    marginTop: 10,
    fontSize: 13,
    color: "#0a7f32",
    textAlign: "center",
    fontWeight: "700",
  },

  // Support form
  reportInput: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: UI.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 10,
    color: UI.colors.text,
  },
  submitReportButton: {
    backgroundColor: UI.colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
  },
  submitReportText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "800",
    fontSize: 15,
  },

  // What's New
  whatsNewCard: {
    marginTop: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: UI.colors.border,
    borderRadius: UI.radius,
    padding: 14,
  },
  whatsNewHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  whatsNewTitle: { fontSize: 16, fontWeight: "800", color: UI.colors.text },
  whatsNewRefresh: {
    fontSize: 13,
    color: UI.colors.primary,
    fontWeight: "800",
  },
  whatsNewError: { marginTop: 6, color: "#b45309", fontSize: 12 },
  whatsNewLoading: { marginTop: 8, color: "#666", fontSize: 13 },
  whatsNewItem: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: UI.colors.border,
  },
  whatsNewVersion: {
    fontSize: 15,
    fontWeight: "800",
    color: UI.colors.text,
  },
  whatsNewDate: { fontSize: 12, color: UI.colors.sub },
  whatsNewChangeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 6,
    gap: 8,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  badgeText: { fontSize: 11, fontWeight: "800", color: UI.colors.text },
  whatsNewChangeText: { flex: 1, fontSize: 14, color: "#333" },

  // Social footer (unused / commented in JSX for now)
  socialWrap: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: "center",
    gap: 12,
  },
  socialRow: { flexDirection: "row", gap: 12 },
  socialButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7F8FF",
    borderWidth: 1,
    borderColor: UI.colors.glyphBorder,
  },
  footerLead: { fontSize: 14, color: UI.colors.sub },
  footerMeta: { fontSize: 13, color: "#8a8a8f" },

  // Columns for web desktop
  columns: {
    // mobile default (stacked)
  },
  columnsWide: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },
  col: {
    flex: 1,
    minWidth: 0,
  },
  colLeft: {},
  colRight: {},

  // Bottom sheet styles
  bsWrapper: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  bsBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  bsSheet: {
    backgroundColor: UI.colors.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.select({ ios: 24, default: 16 }) as number,
    width: "100%",
    maxHeight: "82%",
    alignSelf: "center",
    maxWidth: isWeb ? UI.maxWidth : undefined,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  } as any,
  bsHandle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#D1D5DB",
    marginBottom: 8,
  },
  bsTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: UI.colors.text,
    marginBottom: 10,
  },
  bsContent: {
    paddingBottom: 4,
  },
  sheetLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: UI.colors.sub,
    marginBottom: 4,
    marginTop: 2,
  },
});
