// index.tsx
import { Redirect } from "expo-router";

export default function Index() {
  const isLoggedIn = false; // Change to true after login
  return <Redirect href={isLoggedIn ? "/(tabs)/home" : "/auth/login"} />;
}
