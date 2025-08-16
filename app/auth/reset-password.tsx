// reset-password.tsx
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import * as Animatable from "react-native-animatable";

const API =
  process.env.EXPO_PUBLIC_API_URL || "https://jw-auto-clinic-246.onrender.com";

export default function ResetPasswordScreen() {
  const rawParams = useLocalSearchParams();
  const token = Array.isArray(rawParams.token)
    ? rawParams.token[0]
    : typeof rawParams.token === "string"
      ? rawParams.token
      : "";

  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const passwordRef = useRef<Animatable.View>(null);
  const confirmRef = useRef<Animatable.View>(null);

  const [passwordStrength, setPasswordStrength] = useState<
    "Weak" | "Medium" | "Strong" | null
  >(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmMatch, setConfirmMatch] = useState<boolean | null>(null);

  useEffect(() => {
    if (!token) {
      alert("Invalid Link, Reset token is missing.");
      router.replace("/auth/forgot");
    }
  }, [token]);

  useEffect(() => {
    if (confirm.length > 0) {
      setConfirmMatch(confirm === password);
    } else {
      setConfirmMatch(null);
    }
  }, [password, confirm]);

  const triggerHaptic = () => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const getPasswordStrength = (
    pwd: string
  ): "Weak" | "Medium" | "Strong" | null => {
    if (!pwd) return null;
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNumber = /\d/.test(pwd);
    const hasSpecial = /[@$!%*?&()[\]{}^#_+=-]/.test(pwd);
    const isLong = pwd.length >= 8;

    const score = [hasUpper, hasLower, hasNumber, hasSpecial, isLong].filter(
      Boolean
    ).length;

    if (score <= 2) return "Weak";
    if (score === 3 || score === 4) return "Medium";
    return "Strong";
  };

  useEffect(() => {
    setPasswordStrength(getPasswordStrength(password));
  }, [password]);

  const strengthColor = useMemo(() => {
    switch (passwordStrength) {
      case "Weak":
        return "red";
      case "Medium":
        return "#f0ad4e";
      case "Strong":
        return "green";
      default:
        return "#ccc";
    }
  }, [passwordStrength]);

  const handleReset = async () => {
    let hasError = false;
    setPasswordError(false);
    setConfirmError(false);

    if (!password) {
      passwordRef.current?.shake?.(600);
      setPasswordError(true);
      hasError = true;
    }

    if (!confirm) {
      confirmRef.current?.shake?.(600);
      setConfirmError(true);
      hasError = true;
    }

    if (hasError) {
      triggerHaptic();
      alert("Missing Fields, Both password fields are required.");
      return;
    }

    const strongRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&()[\]{}^#_+=-])[A-Za-z\d@$!%*?&()[\]{}^#_+=-]{8,}$/;
    if (!strongRegex.test(password)) {
      passwordRef.current?.shake?.(600);
      setPasswordError(true);
      triggerHaptic();
      alert(
        "Weak Password, Password must be at least 8 characters and include uppercase, lowercase, number, and special character."
      );
      return;
    }

    if (password !== confirm) {
      confirmRef.current?.shake?.(600);
      setConfirmError(true);
      triggerHaptic();
      return;
    }

    setConfirmMatch(true);

    try {
      setLoading(true);
      const res = await fetch(`${API}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();
      if (res.ok) {
        setShowSuccess(true);
        setTimeout(() => {
          router.replace("/auth/login");
        }, 2000);
      } else {
        alert(data?.error || "Reset failed.");
      }
    } catch (err) {
      alert("Error, Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <TouchableWithoutFeedback
          onPress={Platform.OS !== "web" ? Keyboard.dismiss : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {showSuccess ? (
              <Animatable.View
                animation="zoomIn"
                duration={700}
                style={styles.successBox}
              >
                <Image
                  source={require("@/assets/images/success.png")}
                  style={styles.illustration}
                />
                <Text style={styles.successText}>
                  Password Reset Successfully
                </Text>
              </Animatable.View>
            ) : (
              <>
                <Image
                  source={require("@/assets/images/reset-password-illustration.png")}
                  style={styles.illustration}
                />

                <Animatable.View ref={passwordRef}>
                  <View style={styles.passwordRow}>
                    <TextInput
                      placeholder="New Password"
                      placeholderTextColor="#777"
                      secureTextEntry={!showPassword}
                      style={[styles.input, passwordError && styles.errorInput]}
                      value={password}
                      onChangeText={setPassword}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword((p) => !p)}
                      style={styles.eyeIcon}
                      accessibilityLabel="Toggle password visibility"
                    >
                      <Ionicons
                        name={showPassword ? "eye-outline" : "eye"}
                        size={22}
                        color="#555"
                      />
                    </TouchableOpacity>
                  </View>
                </Animatable.View>

                <View style={styles.tooltip}>
                  <Text style={styles.tooltipText}>
                    Include at least 8 characters, 1 uppercase, 1 lowercase, 1
                    number, and 1 special character
                  </Text>
                </View>

                {passwordStrength && (
                  <View style={styles.meterContainer}>
                    <View
                      style={[
                        styles.meterBar,
                        { backgroundColor: strengthColor },
                      ]}
                    />
                    <Text style={[styles.meterLabel, { color: strengthColor }]}>
                      {passwordStrength} Password
                    </Text>
                  </View>
                )}

                <Animatable.View ref={confirmRef}>
                  <View style={styles.passwordRow}>
                    <TextInput
                      placeholder="Confirm New Password"
                      placeholderTextColor="#777"
                      secureTextEntry={!showConfirm}
                      style={[
                        styles.input,
                        confirmError && styles.errorInput,
                        confirmMatch === false && { borderColor: "red" },
                        confirmMatch === true && { borderColor: "green" },
                      ]}
                      value={confirm}
                      onChangeText={(text) => {
                        setConfirm(text);
                        if (text.length > 0) {
                          setConfirmMatch(text === password);
                        } else {
                          setConfirmMatch(null);
                        }
                      }}
                    />
                    <TouchableOpacity
                      onPress={() => setShowConfirm((p) => !p)}
                      style={styles.eyeIcon}
                      accessibilityLabel="Toggle confirm password visibility"
                    >
                      <Ionicons
                        name={showConfirm ? "eye-outline" : "eye"}
                        size={22}
                        color="#555"
                      />
                    </TouchableOpacity>
                  </View>
                </Animatable.View>

                {confirmMatch === false && (
                  <Text style={styles.mismatchText}>
                    Passwords do not match
                  </Text>
                )}

                <TouchableOpacity
                  style={[styles.button, loading && { opacity: 0.7 }]}
                  onPress={handleReset}
                  disabled={loading}
                >
                  <Text style={styles.buttonText}>
                    {loading ? "Resetting..." : "Reset Password"}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollContent: {
    paddingBottom: 40,
    flexGrow: 1,
    justifyContent: "center", // Optional: centers the form vertically
  },
  container: {
    padding: 24,
    flexGrow: 1,
    backgroundColor: "#fff",
    justifyContent: "center",
  },
  illustration: {
    width: 520,
    height: 520,
    resizeMode: "contain",
    alignSelf: "center",
    marginBottom: -50,
  },
  input: {
    backgroundColor: "#f3f3f3",
    padding: 14,
    borderRadius: 10,
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#f3f3f3",
  },
  errorInput: {
    borderColor: "red",
  },
  button: {
    backgroundColor: "#6a0dad",
    paddingVertical: 14,
    borderRadius: 10,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    fontWeight: "600",
  },
  successBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 40,
  },
  successText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f1f1f",
    textAlign: "center",
    marginTop: 20,
  },
  meterContainer: {
    marginTop: 0,
    marginBottom: 16,
    alignItems: "flex-start",
  },
  meterBar: {
    height: 6,
    width: "100%",
    borderRadius: 4,
    marginBottom: 6,
  },
  meterLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  tooltip: {
    marginBottom: 8,
    marginTop: -8,
  },
  tooltipText: {
    fontSize: 12,
    color: "#555",
  },
  passwordRow: {
    position: "relative",
    justifyContent: "center",
  },
  eyeIcon: {
    position: "absolute",
    right: 12,
    top: 14,
  },
  mismatchText: {
    fontSize: 12,
    color: "red",
    marginTop: -12,
    marginBottom: 12,
    paddingLeft: 4,
  },
});
