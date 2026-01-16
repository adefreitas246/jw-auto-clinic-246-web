// app/onboarding.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  Extrapolate,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

const { width, height } = Dimensions.get("window");

type Slide = {
  key: string;
  title: string;
  subtitle: string;
  image: any;
  gradient: [string, string];
};

const SLIDES: Slide[] = [
  {
    key: "home-transactions",
    title: "Live Dashboard",
    subtitle: "At-a-glance totals and charts for your day.",
    image: require("@/assets/images/onboarding/HomeDashboardTransactions.jpeg"),
    gradient: ["#6a0dad", "#b07cf2"],
  },
  {
    key: "home-workers",
    title: "Manage Staff",
    subtitle: "Filter by role, edit details, export lists.",
    image: require("@/assets/images/onboarding/HomeDashboardEmployees.jpeg"),
    gradient: ["#6a0dad", "#22d3ee"],
  },
  {
    key: "home-shifts",
    title: "Shifts & Status",
    subtitle: "Track active/completed shifts and export.",
    image: require("@/assets/images/onboarding/HomeDashboardShifts.jpeg"),
    gradient: ["#6a0dad", "#84cc16"],
  },
  {
    key: "home-reports",
    title: "Reports",
    subtitle: "Revenue, services, and expenses by period.",
    image: require("@/assets/images/onboarding/HomeDashboardReports.jpeg"),
    gradient: ["#6a0dad", "#b07cf2"],
  },
  {
    key: "add-transactions",
    title: "Add Transaction",
    subtitle: "Pick services/specials and calculate instantly.",
    image: require("@/assets/images/onboarding/AddTransactions.jpeg"),
    gradient: ["#6a0dad", "#22d3ee"],
  },
  {
    key: "cart-1",
    title: "Cart & Discounts",
    subtitle: "Edit items, apply discounts, and charge.",
    image: require("@/assets/images/onboarding/AddTransactionsCart2.jpeg"),
    gradient: ["#6a0dad", "#84cc16"],
  },
  {
    key: "cart-2",
    title: "Share or Clear",
    subtitle: "Quick actions before checkout.",
    image: require("@/assets/images/onboarding/AddTransactionsCart3.jpeg"),
    gradient: ["#6a0dad", "#b07cf2"],
  },
  {
    key: "workers-mgmt-1",
    title: "Quick Actions",
    subtitle: "Clock-in, lunch, and history from each card.",
    image: require("@/assets/images/onboarding/EmployeesManagement.jpeg"),
    gradient: ["#6a0dad", "#22d3ee"],
  },
  {
    key: "workers-mgmt-2",
    title: "Add Workers",
    subtitle: "Role-based setup with auto-formatted phone.",
    image: require("@/assets/images/onboarding/EmployeesManagement2.jpeg"),
    gradient: ["#6a0dad", "#84cc16"],
  },
  {
    key: "settings",
    title: "Settings",
    subtitle: "Profile, update checks, what’s new, and logout.",
    image: require("@/assets/images/onboarding/Settings.jpeg"),
    gradient: ["#6a0dad", "#b07cf2"],
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const flatRef = useRef<Animated.FlatList<Slide>>(null);

  const [index, setIndex] = useState(0);
  const x = useSharedValue(0);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems?.length > 0) setIndex(viewableItems[0].index ?? 0);
  }).current;

  const viewabilityConfig = useMemo(
    () => ({ viewAreaCoveragePercentThreshold: 50 }),
    []
  );

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      x.value = e.contentOffset.x;
    },
  });

  const goNext = useCallback(() => {
    if (index < SLIDES.length - 1) {
      flatRef.current?.scrollToIndex({ index: index + 1, animated: true });
    } else {
      handleDone();
    }
  }, [index]);

  const goBack = useCallback(() => {
    if (index > 0) {
      flatRef.current?.scrollToIndex({ index: index - 1, animated: true });
    }
  }, [index]);

  const handleDone = useCallback(async () => {
    await AsyncStorage.setItem("hasOnboarded", "true");
    router.replace("/auth/login");
  }, [router]);

  const HeaderButtons = () => (
    <View
      style={{
        position: "absolute",
        top: Platform.OS === "ios" ? 60 : 30,
        right: 20,
        left: 20,
        flexDirection: "row",
        justifyContent: "space-between",
        zIndex: 10,
      }}
    >
      <TouchableOpacity disabled={index === 0} onPress={goBack} style={{ opacity: index === 0 ? 0 : 1 }}>
        <Text style={{ color: "white", fontWeight: "600" }}>Back</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleDone}>
        <Text style={{ color: "white", fontWeight: "700" }}>Skip</Text>
      </TouchableOpacity>
    </View>
  );

  const Footer = () => (
    <View style={{ position: "absolute", bottom: 40, left: 20, right: 20, zIndex: 10 }}>
      <Dots x={x} slides={SLIDES} />
      <TouchableOpacity
        onPress={goNext}
        style={{
          marginTop: 18,
          backgroundColor: "white",
          paddingVertical: 14,
          borderRadius: 14,
          alignItems: "center",
          shadowColor: "#000",
          shadowOpacity: 0.2,
          shadowRadius: 10,
          elevation: 4,
        }}
      >
        <Text style={{ color: "#111827", fontWeight: "800", fontSize: 16 }}>
          {index === SLIDES.length - 1 ? "Get Started" : "Next"}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />
      <HeaderButtons />
      <Animated.FlatList
        ref={flatRef}
        data={SLIDES}
        keyExtractor={(item) => item.key}
        renderItem={({ item, index: i }) => <SlideItem item={item} index={i} x={x} />}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        bounces={false}
        initialNumToRender={1}
        windowSize={3}
        removeClippedSubviews
      />
      <Footer />
    </View>
  );
}

function SlideItem({
    item,
    index,
    x,
  }: {
    item: Slide;
    index: number;
    x: SharedValue<number>;
  }) {
    const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
  
    const titleStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: interpolate(x.value, inputRange, [width * 0.3, 0, -width * 0.3], Extrapolate.CLAMP) }],
      opacity: interpolate(x.value, inputRange, [0, 1, 0], Extrapolate.CLAMP),
    }));
  
    const subStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: interpolate(x.value, inputRange, [width * 0.5, 0, -width * 0.5], Extrapolate.CLAMP) }],
      opacity: interpolate(x.value, inputRange, [0, 1, 0], Extrapolate.CLAMP),
    }));
  
    const imageStyle = useAnimatedStyle(() => ({
      transform: [
        { translateY: interpolate(x.value, inputRange, [40, 0, -40], Extrapolate.CLAMP) },
        { scale: interpolate(x.value, inputRange, [0.95, 1, 0.95], Extrapolate.CLAMP) },
      ],
      opacity: interpolate(x.value, inputRange, [0.6, 1, 0.6], Extrapolate.CLAMP),
    }));
  
    // --- NEW: calculate an image size that always leaves room for text + button
    const PHONE_AR = 19.5 / 9; // (height / width) of a tall phone screenshot
    const isSmallScreen = height < 750;
    const maxImageHeight = height * (isSmallScreen ? 0.40 : 0.65); // cap relative to screen height
  
    // Start from a wide image, then clamp height if needed (preserving aspect ratio)
    const baseWidth = width * 0.82;
    let imgWidth = baseWidth;
    let imgHeight = baseWidth * PHONE_AR;
  
    if (imgHeight > maxImageHeight) {
      imgHeight = maxImageHeight;
      imgWidth = imgHeight / PHONE_AR;
    }
    // --- END NEW
  
    return (
      <View style={{ width, height }}>
        <LinearGradient
          colors={item.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ ...StyleSheet.absoluteFillObject } as any}
        />
        <View
          style={{
            flex: 1,
            paddingTop: 64, // slightly tighter to gain space
            alignItems: "center",
            paddingHorizontal: 24,
          }}
        >
          <Animated.View
            style={[
              {
                width: imgWidth,
                height: imgHeight,
                borderRadius: 16,
                overflow: "hidden",
                backgroundColor: "rgba(255,255,255,0.1)",
              },
              imageStyle,
            ]}
          >
            <Image
              source={item.image}
              style={{ width: "100%", height: "100%", resizeMode: "contain" }}
            />
          </Animated.View>
  
          <Animated.Text
            style={[
              {
                marginTop: 14,
                color: "white",
                fontSize: 28,
                fontWeight: "800",
                textAlign: "center",
              },
              titleStyle,
            ]}
          >
            {item.title}
          </Animated.Text>
  
          <Animated.Text
            style={[
              {
                marginTop: 10,
                color: "rgba(255,255,255,0.92)",
                fontSize: 16,
                lineHeight: 22,
                textAlign: "center",
                paddingHorizontal: 6,
              },
              subStyle,
            ]}
          >
            {item.subtitle}
          </Animated.Text>
        </View>
      </View>
    );
  }
  

function Dot({ x, index }: { x: SharedValue<number>; index: number }) {
  const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
  const rStyle = useAnimatedStyle(() => {
    const w = interpolate(x.value, inputRange, [8, 24, 8], Extrapolate.CLAMP);
    const o = interpolate(x.value, inputRange, [0.5, 1, 0.5], Extrapolate.CLAMP);
    return { width: w, opacity: o };
  });
  return <Animated.View style={[{ height: 8, borderRadius: 999, backgroundColor: "white" }, rStyle]} />;
}

function Dots({ x, slides }: { x: SharedValue<number>; slides: Slide[] }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "center", gap: 8 }}>
      {slides.map((_, i) => (
        <Dot key={i} x={x} index={i} />
      ))}
    </View>
  );
}
