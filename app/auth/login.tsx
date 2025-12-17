// login.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from "react-native";
import * as Animatable from "react-native-animatable";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [hidePassword, setHidePassword] = useState(true);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);

  // Biometrics state
  const [biometricEnabled, setBiometricEnabled] = useState(false); // from Settings
  const [biometricAvailable, setBiometricAvailable] = useState(false); // device supports + enrolled
  const [hasStoredCredentials, setHasStoredCredentials] = useState(false); // has remembered email & password

  const emailRef = useRef<any>(null);
  const passwordRef = useRef<any>(null);

  const allowedAdmins = [
    "admin@jwautoclinic246.com",
    "jwautoclinic246@gmail.com",
  ];

  const isAdminEmail = allowedAdmins.includes(email.trim().toLowerCase());
  const isNative = Platform.OS === "ios" || Platform.OS === "android";
  const isSmallScreen = height < 700;

  useEffect(() => {
    const loadRemembered = async () => {
      try {
        const savedEmail = await AsyncStorage.getItem("@rememberedEmail");
        const savedPassword = await AsyncStorage.getItem("@rememberedPassword");
        const savedUseBiometrics = await AsyncStorage.getItem("@useBiometrics");

        if (savedEmail) {
          setEmail(savedEmail);
          setRememberMe(true);
        }
        if (savedPassword) {
          setPassword(savedPassword);
        }
        if (savedEmail && savedPassword) {
          setHasStoredCredentials(true);
        } else {
          setHasStoredCredentials(false);
        }

        if (savedUseBiometrics === "true") {
          setBiometricEnabled(true);
        }
      } catch (e) {
        // swallow – not critical
      }
    };
    loadRemembered();
  }, []);

  // Check if device supports biometrics (hardware + enrolled)
  useEffect(() => {
    if (!isNative) return;

    const checkBiometrics = async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setBiometricAvailable(hasHardware && enrolled);
      } catch {
        setBiometricAvailable(false);
      }
    };

    checkBiometrics();
  }, [isNative]);

  const handleLogin = async (
    overrideEmail?: string,
    overridePassword?: string
  ) => {
    const loginEmail = overrideEmail ?? email;
    const loginPassword = overridePassword ?? password;

    const emailMissing = !loginEmail;
    const passwordMissing = !loginPassword;

    setEmailError(emailMissing);
    setPasswordError(passwordMissing);

    if (emailMissing || passwordMissing) {
      Alert.alert("Missing Fields", "Please enter both email and password.");
      return;
    }

    try {
      setLoading(true);
      if (rememberMe) {
        await AsyncStorage.setItem("@rememberedEmail", loginEmail);
        await AsyncStorage.setItem("@rememberedPassword", loginPassword);
        setHasStoredCredentials(true);
      } else {
        await AsyncStorage.removeItem("@rememberedEmail");
        await AsyncStorage.removeItem("@rememberedPassword");
        setHasStoredCredentials(false);
      }

      await login(loginEmail, loginPassword);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      router.replace("/(tabs)/home");
    } catch (error: any) {
      const message =
        error?.response?.data?.error || "Invalid credentials or server error.";
      Alert.alert("Login Failed", message);
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    if (!isNative) return;

    if (!biometricEnabled) {
      Alert.alert(
        "Biometric login not enabled",
        "Turn on biometric login in Settings first."
      );
      return;
    }

    if (!biometricAvailable) {
      Alert.alert(
        "Biometrics not available",
        "This device does not support biometric authentication or it is not set up."
      );
      return;
    }

    try {
      const savedEmail = await AsyncStorage.getItem("@rememberedEmail");
      const savedPassword = await AsyncStorage.getItem("@rememberedPassword");

      if (!savedEmail || !savedPassword) {
        setHasStoredCredentials(false);
        Alert.alert(
          "Biometric login not ready",
          "Please log in once with your email and password so we can securely save your credentials."
        );
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Login with biometrics",
        fallbackLabel: Platform.OS === "ios" ? "Use passcode" : "Use device PIN",
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
      });

      if (result.success) {
        setEmail(savedEmail);
        setPassword(savedPassword);
        await handleLogin(savedEmail, savedPassword);
      }
    } catch (e) {
      Alert.alert(
        "Biometric error",
        "We couldn’t complete biometric authentication."
      );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      {/* Ensure status bar is visible on phones, but do nothing on web */}
      {isNative && (
        <StatusBar
          barStyle="dark-content"
          backgroundColor="#ffffff"
          translucent={false}
          hidden={false}
        />
      )}

      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: "#fff" }}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : Platform.OS === "android"
            ? "height"
            : undefined
        }
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      >
        <TouchableWithoutFeedback
          onPress={Platform.OS !== "web" ? Keyboard.dismiss : undefined}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              isNative && {
                paddingTop: isSmallScreen ? 24 : 40,
                paddingBottom:
                  (insets.bottom || 16) + (isSmallScreen ? 24 : 40),
              },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.formContainer}>
              <Image
                source={require("@/assets/images/icon.png")}
                style={[
                  styles.logo,
                  isSmallScreen && styles.logoSmall,
                  isNative && { marginBottom: isSmallScreen ? 16 : 24 },
                ]}
                resizeMode="contain"
              />

              <Text style={styles.heading}>Sign In to Your Account</Text>
              <Text style={styles.subtext}>
                Enter your email and password to access your dashboard
              </Text>

              {/* Email input */}
              <Animatable.View
                ref={emailRef}
                animation={emailError ? "shake" : undefined}
              >
                <TextInput
                  style={[styles.input, emailError && styles.errorInput]}
                  placeholder="Email Address"
                  placeholderTextColor="#999"
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (emailError && text) setEmailError(false);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  importantForAutofill="yes"
                  returnKeyType="next"
                  onSubmitEditing={() => {
                    // move focus to password on native; web behaves normally
                    (passwordRef.current as any)?.fadeIn?.(200);
                  }}
                />
              </Animatable.View>

              {/* Password input */}
              <Animatable.View
                ref={passwordRef}
                animation={passwordError ? "shake" : undefined}
                style={styles.passwordContainer}
              >
                <TextInput
                  style={[
                    styles.passwordInput,
                    passwordError && styles.errorInput,
                  ]}
                  placeholder="Password"
                  placeholderTextColor="#999"
                  secureTextEntry={hidePassword}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (passwordError && text) setPasswordError(false);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  returnKeyType="done"
                  onSubmitEditing={() => handleLogin()}
                />
                <Pressable
                  onPress={() => setHidePassword((prev) => !prev)}
                  accessibilityLabel="Toggle password visibility"
                  hitSlop={8}
                >
                  <Ionicons
                    name={hidePassword ? "eye-outline" : "eye"}
                    size={22}
                    color="#555"
                  />
                </Pressable>
              </Animatable.View>

              {/* Remember Me */}
              <View style={styles.rememberRow}>
                <Pressable
                  onPress={() => setRememberMe((prev) => !prev)}
                  hitSlop={8}
                >
                  <Ionicons
                    name={rememberMe ? "checkbox" : "square-outline"}
                    size={22}
                    color="#6a0dad"
                  />
                </Pressable>
                <Text style={styles.rememberLabel}>Remember Me</Text>
              </View>

              {/* Login Button */}
              <TouchableOpacity
                style={[styles.loginBtn, loading && { opacity: 0.7 }]}
                onPress={() => handleLogin()}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.loginText}>Login</Text>
                )}
              </TouchableOpacity>

              {/* Biometric Login Button (shows when enabled in Settings & supported on device) */}
              {isNative && biometricEnabled && biometricAvailable && (
                <TouchableOpacity
                  style={[styles.biometricBtn, loading && { opacity: 0.7 }]}
                  onPress={handleBiometricLogin}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#6a0dad" />
                  ) : (
                    <View style={styles.biometricBtnContent}>
                      <Ionicons
                        name="finger-print-outline"
                        size={20}
                        color="#6a0dad"
                      />
                      <Text style={styles.biometricBtnText}>
                        Login with Biometrics
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}

              {/* Show forgot password if email is admin */}
              {isAdminEmail && (
                <TouchableOpacity
                  accessibilityLabel="Forgot your password?"
                  onPress={() => router.push("/auth/forgot")}
                >
                  <Text style={styles.forgotText}>Forgot Password?</Text>
                </TouchableOpacity>
              )}
            </View>
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
    padding: 20,
    paddingBottom: 40,
    flexGrow: 1,
    justifyContent: "center",
  },
  formContainer: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  logo: {
    width: 350,
    height: 200,
    borderRadius: 80,
    alignSelf: "center",
    marginBottom: 20,
  },
  logoSmall: {
    width: 260,
    height: 150,
    borderRadius: 60,
  },
  heading: {
    fontSize: 22,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
    color: "#0d1321",
  },
  subtext: {
    fontSize: 14,
    color: "#555",
    textAlign: "center",
    marginBottom: 24,
  },
  input: {
    backgroundColor: "#f3f3f3",
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
    fontSize: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  errorInput: {
    borderColor: "red",
    borderWidth: 1,
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f3f3",
    borderRadius: 10,
    paddingHorizontal: 14,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
  },
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  rememberLabel: {
    marginLeft: 8,
    color: "#333",
  },
  loginBtn: {
    backgroundColor: "#6a0dad",
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 12,
  },
  loginText: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    fontWeight: "600",
  },
  biometricBtn: {
    borderWidth: 1,
    borderColor: "#6a0dad",
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  biometricBtnContent: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  biometricBtnText: {
    color: "#6a0dad",
    fontSize: 15,
    fontWeight: "600",
    marginLeft: 8,
  },
  forgotText: {
    fontSize: 14,
    color: "#6a0dad",
    textAlign: "center",
  },
});
