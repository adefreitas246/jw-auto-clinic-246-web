// login.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
//import * as LocalAuthentication from 'expo-local-authentication';
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

import { useAuth } from "@/context/AuthContext";

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [hidePassword, setHidePassword] = useState(true);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);

  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  const allowedAdmins = [
    "admin@jwautoclinic246.com",
    "jwautoclinic246@gmail.com",
  ];

  const isAdminEmail = allowedAdmins.includes(email.trim().toLowerCase());

  useEffect(() => {
    const loadRemembered = async () => {
      const savedEmail = await AsyncStorage.getItem("@rememberedEmail");
      const savedPassword = await AsyncStorage.getItem("@rememberedPassword");
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true);
      }
      if (savedPassword) {
        setPassword(savedPassword);
      }
    };
    loadRemembered();
  }, []);

  // useEffect(() => {
  //   const tryBiometricAuth = async () => {
  //     const hasHardware = await LocalAuthentication.hasHardwareAsync();
  //     const supported = await LocalAuthentication.isEnrolledAsync();
  //     if (hasHardware && supported) {
  //       const result = await LocalAuthentication.authenticateAsync({
  //         promptMessage: 'Login with Face ID / Biometrics',
  //         fallbackLabel: 'Use Passcode',
  //       });

  //       if (result.success) {
  //         const savedEmail = await AsyncStorage.getItem('@rememberedEmail');
  //         const savedPassword = await AsyncStorage.getItem('@rememberedPassword');
  //         if (savedEmail && savedPassword) {
  //           setEmail(savedEmail);
  //           setPassword(savedPassword);
  //           handleLogin(savedEmail, savedPassword); // pass manually
  //         }
  //       }
  //     }
  //   };
  //   tryBiometricAuth();
  // }, []);

  const handleLogin = async (
    overrideEmail?: string,
    overridePassword?: string
  ) => {
    const loginEmail = overrideEmail ?? email;
    const loginPassword = overridePassword ?? password;

    setEmailError(!loginEmail);
    setPasswordError(!loginPassword);

    if (!loginEmail || !loginPassword) {
      Alert.alert("Missing Fields", "Please enter both email and password.");
      return;
    }

    try {
      setLoading(true);
      if (rememberMe) {
        await AsyncStorage.setItem("@rememberedEmail", loginEmail);
        await AsyncStorage.setItem("@rememberedPassword", loginPassword);
      } else {
        await AsyncStorage.removeItem("@rememberedEmail");
        await AsyncStorage.removeItem("@rememberedPassword");
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
            <Image
              source={require("@/assets/images/icon.png")}
              style={styles.logo}
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
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="next"
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
                onChangeText={setPassword}
                autoCapitalize="none"
                returnKeyType="done"
              />
              <Pressable
                onPress={() => setHidePassword((prev) => !prev)}
                accessibilityLabel="Toggle password visibility"
              >
                <Ionicons
                  name={hidePassword ? "eye-outline" : "eye"}
                  size={22}
                  color="#555"
                />
              </Pressable>
            </Animatable.View>

            {/* Remember Me */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 24,
              }}
            >
              <Pressable onPress={() => setRememberMe((prev) => !prev)}>
                <Ionicons
                  name={rememberMe ? "checkbox" : "square-outline"}
                  size={22}
                  color="#6a0dad"
                />
              </Pressable>
              <Text style={{ marginLeft: 8, color: "#333" }}>Remember Me</Text>
            </View>

            {/* Login Button */}
            <TouchableOpacity
              style={[styles.loginBtn, loading && { opacity: 0.7 }]}
              onPress={() => handleLogin()}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.loginText}>Login</Text>
              )}
            </TouchableOpacity>

            {/* Show forgot password if email is admin */}
            {isAdminEmail && (
              <TouchableOpacity
                accessibilityLabel="Forgot your password?"
                onPress={() => router.push("/auth/forgot")}
              >
                <Text style={styles.forgotText}>Forgot Password?</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    flexGrow: 1,
    justifyContent: "center", // Optional: centers form vertically
  },
  safeArea: {
    flex: 1,
    backgroundColor: "#fff",
  },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  logo: {
    width: 350,
    height: 200,
    borderRadius: 80,
    alignSelf: "center",
    marginBottom: 20,
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
  loginBtn: {
    backgroundColor: "#6a0dad",
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 16,
  },
  loginText: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    fontWeight: "600",
  },
  forgotText: {
    fontSize: 14,
    color: "#6a0dad",
    textAlign: "center",
  },
});
