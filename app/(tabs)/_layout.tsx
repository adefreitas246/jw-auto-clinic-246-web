import { CustomTabBar } from "@/components/CustomTabBar";
import { useAuth } from "@/context/AuthContext";
import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function TransparentHeader() {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        height: insets.top, // just reserve safe-area space; no visible UI
        backgroundColor: "transparent",
      }}
    >
      <StatusBar style="dark" translucent />
    </View>
  );
}

export default function TabLayout() {
  const { user } = useAuth();

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        // Show header only on mobile platforms
        headerShown: Platform.OS !== "web",
        // Make it truly transparent
        headerTransparent: true,
        headerStyle: { backgroundColor: "transparent" },
        headerShadowVisible: false,
        headerTitle: "",
        // Provide a no-op transparent header (prevents route title)
        header: () => <TransparentHeader />,
      }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="transactions" />
      <Tabs.Protected guard={user?.role === "admin"}>
        <Tabs.Screen name="employees" />
      </Tabs.Protected>
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
