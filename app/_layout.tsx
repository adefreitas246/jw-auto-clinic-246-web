// _layout.tsx
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { useColorScheme } from "@/hooks/useColorScheme";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Slot, usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";

const ONBOARDING_ROUTE = "/onboarding-screen";

function AuthGate() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [shouldOnboard, setShouldOnboard] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const navigatingRef = useRef(false);
  const lastCheckedPathRef = useRef<string | null>(null);

  // Initial read once on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const v = await AsyncStorage.getItem("hasOnboarded");
        if (mounted) setShouldOnboard(v !== "true");
      } finally {
        if (mounted) setCheckingOnboarding(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Re-check the flag when leaving onboarding or landing on auth,
  // but DON'T toggle a loading spinner to avoid flicker
  useEffect(() => {
    const isOnboarding = pathname === ONBOARDING_ROUTE;
    const isAuthRoute =
      pathname.startsWith("/auth/login") ||
      pathname.startsWith("/auth/forgot") ||
      pathname.startsWith("/auth/reset-password");

    if (lastCheckedPathRef.current === pathname) return;
    lastCheckedPathRef.current = pathname;

    if (!isOnboarding || isAuthRoute) {
      (async () => {
        const v = await AsyncStorage.getItem("hasOnboarded");
        setShouldOnboard(v !== "true");
      })();
    }
  }, [pathname]);

  // Decide where to go (idempotent) — RE-READ STORAGE before forcing onboarding
  useEffect(() => {
    if (loading) return;
    if (navigatingRef.current) return;

    (async () => {
      const isOnboarding = pathname.startsWith(ONBOARDING_ROUTE);
      const isPublicAuth =
        pathname.startsWith("/auth/login") ||
        pathname.startsWith("/auth/forgot") ||
        pathname.startsWith("/auth/reset-password");

      // ✔ Re-check the flag right now to avoid stale `shouldOnboard`
      let pending = shouldOnboard;
      if (!isOnboarding) {
        const v = await AsyncStorage.getItem("hasOnboarded");
        pending = v !== "true";
        if (pending !== shouldOnboard) {
          // keep state in sync for next cycles
          setShouldOnboard(pending);
        }
      }

      // STRICT: if still pending after the fresh read, force onboarding
      if (pending && !isOnboarding) {
        if (pathname !== ONBOARDING_ROUTE) {
          navigatingRef.current = true;
          router.replace(ONBOARDING_ROUTE);
          setTimeout(() => (navigatingRef.current = false), 0);
        }
        return;
      }

      // Not authenticated? only allow auth routes or onboarding
      if (!user && !isOnboarding && !isPublicAuth) {
        if (pathname !== "/auth/login") {
          navigatingRef.current = true;
          router.replace("/auth/login");
          setTimeout(() => (navigatingRef.current = false), 0);
        }
        return;
      }
    })();
  }, [user, loading, pathname, shouldOnboard, router]);

  // Remount subtree when auth/role/onboarding state changes (guards against hook-order issues on logout)
  const slotKey = useMemo(
    () =>
      `${Boolean(user)}-${user?.role ?? "guest"}-${shouldOnboard ? "onb" : "done"}`,
    [user, shouldOnboard]
  );

  if (loading || checkingOnboarding) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (shouldOnboard && !pathname.startsWith(ONBOARDING_ROUTE)) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <Slot key={slotKey} />;
}

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  const colorScheme = useColorScheme();
  if (!loaded) return null;

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === "light" ? DefaultTheme : DarkTheme}>
        <AuthGate />
        <StatusBar style="auto" />
      </ThemeProvider>
    </AuthProvider>
  );
}
