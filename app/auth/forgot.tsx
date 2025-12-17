// forgot.tsx
import { useAuth } from "@/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
    Alert,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    LayoutAnimation,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
} from "react-native";
import * as Animatable from "react-native-animatable";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { forgotPassword } = useAuth(); // assume you have or will define this

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState(false);
  const [sending, setSending] = useState(false);

  const emailRef = useRef(null);

  const handleReset = async () => {
    setEmailError(!email);

    if (!email) {
      Alert.alert("Missing Email", "Please enter your email address.");
      return;
    }

    try {
      setSending(true);

      // If using context method (preferred)
      if (forgotPassword) {
        await forgotPassword(email);
      } else {
        // fallback if not yet in context
        const res = await fetch(
          "https://jw-auto-clinic-246.onrender.com/api/auth/forgot-password",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          }
        );

        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Request failed");
      }

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      Alert.alert("Success", "Password reset link sent to your email.");
      router.back();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Something went wrong.");
    } finally {
      setSending(false);
    }
  };

  const handleBackToLogin = () => {
    if (Platform.OS === "web") {
      router.replace("/auth/login"); // Directly route on web
    } else {
      router.back(); // Use history on native
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
            <Animatable.View style={styles.container}>
              {/* <View style={styles.imageWrapper}> */}
              <Image
                source={require("@/assets/images/forgot-illustration.png")}
                style={styles.illustration}
              />
              {/* </View> */}

              {/* <Text style={styles.heading}>Forgot Your Password?</Text>
              <Text style={styles.subtext}>
                Enter your email and we’ll send you a link to reset it.
              </Text> */}

              <TextInput
                placeholder="Email Address"
                placeholderTextColor="#777"
                style={[styles.input, emailError && styles.errorInput]}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setEmailError(false);
                }}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="done"
                onSubmitEditing={handleReset}
              />

              <TouchableOpacity
                style={[styles.loginBtn, sending && { opacity: 0.7 }]}
                onPress={handleReset}
                disabled={sending}
              >
                <Text style={styles.loginText}>
                  {sending ? "Sending..." : "Send Reset Link"}
                </Text>
              </TouchableOpacity>

              <Pressable
                onPress={handleBackToLogin}
                style={({ hovered }) => [
                  styles.backButton,
                  hovered &&
                    Platform.OS === "web" && { backgroundColor: "#f3eaff" },
                ]}
              >
                <Ionicons name="arrow-back" size={16} color="#6a0dad" />
                <Text style={styles.backButtonText}>Back to Login</Text>
              </Pressable>
            </Animatable.View>
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
    justifyContent: "center",
  },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    backgroundColor: "#fff",
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
  illustration: {
    width: 420,
    height: 420,
    resizeMode: "contain",
    alignSelf: "center",
    marginBottom: 12,
    marginTop: -8, // Optional to fine-tune spacing
  },
  // imageWrapper: {
  //   backgroundColor: '#f3eaff',
  //   width: 260,
  //   height: 260,
  //   borderRadius: 130,
  //   justifyContent: 'center',
  //   alignItems: 'center',
  //   alignSelf: 'center',
  //   marginBottom: 12,
  // },
  input: {
    backgroundColor: "#f3f3f3",
    padding: 14,
    borderRadius: 10,
    marginBottom: 24,
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
  backButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderColor: "#6a0dad",
    borderWidth: 1,
    borderRadius: 8,
    alignSelf: "center",
    // Optional: smooth transition
    transitionDuration: Platform.OS === "web" ? "200ms" : undefined,
  },

  backButtonText: {
    fontSize: 14,
    color: "#6a0dad",
    marginLeft: 6,
    fontWeight: "500",
  },
});
