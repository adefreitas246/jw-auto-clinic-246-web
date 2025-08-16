// settings.tsx
import { useAuth } from "@/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import * as Updates from "expo-updates";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Animatable from "react-native-animatable";

type ChangeItem = { type: "New" | "Improved" | "Fixed" | string; text: string };
type WhatsNewItem = { version: string; date?: string; changes: ChangeItem[] };

// --- Remote endpoint + local fallback ---
const WHATS_NEW_URL =
  "https://jw-auto-clinic-246.onrender.com/api/support/whatsnew";

const WHATS_NEW_FALLBACK: WhatsNewItem[] = [
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
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSavedAnim, setShowSavedAnim] = useState(false);

  // --- Support form state ---
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportSubject, setReportSubject] = useState("");
  const [reportMessage, setReportMessage] = useState("");
  const [sendingReport, setSendingReport] = useState(false);

  // --- Updates state ---
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // --- What's New state ---
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [whatsNew, setWhatsNew] = useState<WhatsNewItem[]>([]);
  const [loadingWhatsNew, setLoadingWhatsNew] = useState(false);
  const [whatsNewError, setWhatsNewError] = useState<string | null>(null);

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
      setEditing(false);
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
      const res = await fetch(`${"https://jw-auto-clinic-246.onrender.com"}/api/support/report`, {
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
      });

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
      setShowReportForm(false);
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
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data: WhatsNewItem[] = await res.json();
      // Basic shape validation
      if (!Array.isArray(data)) throw new Error("Invalid response");
      setWhatsNew(data);
    } catch (err: any) {
      setWhatsNew(WHATS_NEW_FALLBACK);
      setWhatsNewError(
        "Showing local release notes. (Couldn’t fetch from server.)"
      );
    } finally {
      setLoadingWhatsNew(false);
    }
  };

  // auto-load when opening the panel
  useEffect(() => {
    if (showWhatsNew && whatsNew.length === 0 && !loadingWhatsNew) {
      loadWhatsNew();
    }
  }, [showWhatsNew]);

  useEffect(() => {
    if (user === null) {
    }
  }, [user]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#fff" }}
      behavior={Platform.select({ ios: "padding", android: undefined })}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Profile Row */}
        <View style={styles.profileRow}>
          <TouchableOpacity
            onPress={pickImage}
            style={styles.avatarWrapper}
            accessibilityLabel="Edit Profile Picture"
          >
            <Image
              source={
                avatar
                  ? { uri: avatar }
                  : require("@/assets/images/avatar-placeholder.png")
              }
              style={styles.avatar}
              accessibilityLabel="Profile picture"
            />
          </TouchableOpacity>
          <View style={styles.profileText}>
            <Text style={styles.profileName}>{name}</Text>
            <Text style={styles.profileEmail}>{email}</Text>
          </View>
          <TouchableOpacity
            onPress={() => setEditing(!editing)}
            style={styles.editIcon}
            accessibilityLabel={editing ? "Cancel editing" : "Edit profile"}
          >
            <Ionicons
              name={editing ? "close-outline" : "create-outline"}
              size={24}
              color="#6a0dad"
            />
          </TouchableOpacity>
        </View>

        {/* ACCOUNT SECTION */}
        <Text style={styles.sectionTitle}>ACCOUNT</Text>

        <View style={styles.itemRow}>
          <Text style={styles.itemLabel}>Name</Text>
          {editing ? (
            <TextInput
              style={styles.itemInput}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoCorrect
              placeholder="Your full name"
              placeholderTextColor="#777"
            />
          ) : (
            <Text style={styles.itemValue}>{name || "—"}</Text>
          )}
        </View>

        {editing && (
          <Text style={styles.helperText}>Used for profile display</Text>
        )}

        <View style={styles.itemRow}>
          <Text style={styles.itemLabel}>Phone</Text>
          {editing ? (
            <TextInput
              style={styles.itemInput}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="e.g. (246) 123-4567"
              placeholderTextColor="#777"
            />
          ) : (
            <Text style={styles.itemValue}>{phone?.trim() ? phone : "—"}</Text>
          )}
        </View>

        <View style={styles.itemRow}>
          <Text style={styles.itemLabel}>Email</Text>
          {editing ? (
            <TextInput
              style={styles.itemInput}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="your@example.com"
              placeholderTextColor="#777"
            />
          ) : (
            <Text style={styles.itemValue}>{email || "—"}</Text>
          )}
        </View>

        {/* Save Button */}
        {editing && (
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveText}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Saved"}
            </Text>
          </TouchableOpacity>
        )}

        {/* Save Animation */}
        {showSavedAnim && (
          <Animatable.Text
            animation="fadeInDown"
            duration={500}
            style={styles.savedMessage}
          >
            ✅ Changes Saved Successfully!
          </Animatable.Text>
        )}

        {/* Report an Issue */}
        <TouchableOpacity
          onPress={() => setShowReportForm((v) => !v)}
          style={styles.reportButton}
        >
          <Text style={styles.reportText}>
            {showReportForm ? "Close Support Form" : "Report an Issue"}
          </Text>
        </TouchableOpacity>

        {showReportForm && (
          <View style={styles.reportForm}>
            <TextInput
              style={styles.reportInput}
              placeholder="Subject"
              placeholderTextColor="#777"
              value={reportSubject}
              onChangeText={setReportSubject}
            />
            <TextInput
              style={[styles.reportInput, { height: 120, textAlignVertical: "top" }]}
              placeholder="Describe the issue (steps to reproduce, expected vs actual, screenshots if any)"
              placeholderTextColor="#777"
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
                  `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\n\n${reportMessage || ""}`
                );
                Linking.openURL(
                  `mailto:addesylvinaus@gmail.com?subject=${subject}&body=${body}`
                );
              }}
              style={[
                styles.submitReportButton,
                { marginTop: 10, backgroundColor: "#8352d1" },
              ]}
            >
              <Text style={styles.submitReportText}>Email Support</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Check for Updates */}
        <TouchableOpacity
          onPress={checkForUpdates}
          style={[styles.reportButton, { marginTop: 16 }]}
        >
          <Text style={styles.reportText}>
            {checkingUpdate ? "Checking…" : "Check for Updates"}
          </Text>
        </TouchableOpacity>

        {/* What's New */}
        <TouchableOpacity
          onPress={() => setShowWhatsNew((v) => !v)}
          style={[styles.reportButton, { marginTop: 12 }]}
        >
          <Text style={styles.reportText}>
            {showWhatsNew ? "Hide What’s New" : "What’s New"}
          </Text>
        </TouchableOpacity>

        {showWhatsNew && (
          <View style={styles.whatsNewCard}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.whatsNewTitle}>Latest Features & Fixes</Text>
              <TouchableOpacity onPress={loadWhatsNew} disabled={loadingWhatsNew}>
                <Text style={[styles.whatsNewRefresh, loadingWhatsNew && { opacity: 0.6 }]}>
                  {loadingWhatsNew ? "Refreshing…" : "Refresh"}
                </Text>
              </TouchableOpacity>
            </View>

            {whatsNewError ? (
              <Text style={styles.whatsNewError}>{whatsNewError}</Text>
            ) : null}

            {loadingWhatsNew && whatsNew.length === 0 ? (
              <Text style={styles.whatsNewLoading}>Loading release notes…</Text>
            ) : (
              whatsNew.map((rel) => (
                <View key={`${rel.version}-${rel.date || ""}`} style={styles.whatsNewItem}>
                  <View style={styles.whatsNewHeaderRow}>
                    <Text style={styles.whatsNewVersion}>v{rel.version}</Text>
                    {rel.date ? <Text style={styles.whatsNewDate}>{rel.date}</Text> : null}
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
        )}

        {/* Logout */}
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

        {/* Footer Branding */}
        <View style={{ marginTop: 24, alignItems: "center", marginBottom: 20 }}>
          <Text style={styles.poweredBy}>Powered by ASD Inova Technologia</Text>
          <Text style={styles.appVersion}>
            Version {Constants.expoConfig?.version}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function getBadgeStyle(type: string) {
  const base = { backgroundColor: "#ece7fb", borderColor: "#6a0dad" };
  if (type === "New") return { backgroundColor: "#e6f9ef", borderColor: "#16a34a" };
  if (type === "Improved") return { backgroundColor: "#e6f2ff", borderColor: "#2563eb" };
  if (type === "Fixed") return { backgroundColor: "#fff4e6", borderColor: "#d97706" };
  return base;
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: "#fff",
    flexGrow: 1,
    paddingBottom: 100,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 24,
    marginBottom: 30,
  },
  avatarWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#6a0dad",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: Platform.OS === "android" ? 0.2 : 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  avatar: {
    width: "100%",
    height: "100%",
  },
  profileText: {
    marginLeft: 16,
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
  },
  profileEmail: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  editIcon: {
    padding: 6,
  },

  sectionTitle: {
    fontSize: 13,
    fontWeight: "500",
    color: "#999",
    marginBottom: 6,
    marginTop: 18,
  },

  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderColor: "#eee",
  },
  itemLabel: {
    fontSize: 16,
    color: "#333",
    flex: 1,
  },
  itemValue: {
    fontSize: 16,
    color: "#666",
    textAlign: "right",
  },
  itemInput: {
    fontSize: 16,
    borderBottomWidth: 1,
    borderColor: "#6a0dad",
    backgroundColor: "#f7f2fc",
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    textAlign: "right",
    flex: 1,
    color: "#000",
  },
  helperText: {
    fontSize: 12,
    color: "#888",
    marginTop: -10,
    marginBottom: 8,
    textAlign: "right",
  },

  saveButton: {
    backgroundColor: "#6a0dad",
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 30,
  },
  saveText: {
    textAlign: "center",
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },

  savedMessage: {
    marginTop: 16,
    fontSize: 14,
    color: "green",
    textAlign: "center",
    fontWeight: "500",
  },

  logoutButton: {
    marginTop: 50,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#6a0dad",
  },
  logoutText: {
    color: "#6a0dad",
    fontSize: 16,
    fontWeight: "600",
  },

  reportButton: {
    marginTop: 24,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#6a0dad",
    backgroundColor: "#f9f5ff",
  },
  reportText: {
    color: "#6a0dad",
    fontSize: 15,
    fontWeight: "500",
  },
  reportForm: {
    marginTop: 20,
    backgroundColor: "#f4f0fa",
    padding: 16,
    borderRadius: 8,
  },
  reportInput: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 12,
    color: "#000",
  },
  submitReportButton: {
    backgroundColor: "#6a0dad",
    paddingVertical: 12,
    borderRadius: 6,
  },
  submitReportText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "600",
    fontSize: 15,
  },

  // --- What's New styles ---
  whatsNewCard: {
    marginTop: 16,
    backgroundColor: "#f9f5ff",
    borderWidth: 1,
    borderColor: "#e9ddff",
    borderRadius: 10,
    padding: 14,
  },
  whatsNewTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2c2c2c",
  },
  whatsNewRefresh: {
    fontSize: 13,
    color: "#6a0dad",
    fontWeight: "600",
  },
  whatsNewError: {
    marginTop: 6,
    color: "#b45309",
    fontSize: 12,
  },
  whatsNewLoading: {
    marginTop: 8,
    color: "#666",
    fontSize: 13,
  },
  whatsNewItem: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  whatsNewHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 6,
  },
  whatsNewVersion: {
    fontSize: 15,
    fontWeight: "700",
    color: "#151515",
  },
  whatsNewDate: {
    fontSize: 12,
    color: "#666",
  },
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
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#111",
  },
  whatsNewChangeText: {
    flex: 1,
    fontSize: 14,
    color: "#333",
  },

  poweredBy: {
    marginTop: 24,
    marginBottom: 20,
    textAlign: "center",
    fontSize: 13,
    color: "#aaa",
  },
  appVersion: {
    marginTop: 4,
    fontSize: 13,
    color: "#bbb",
    textAlign: "center",
  },
});
