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
    key: "welcome",
    title: "Welcome to JW Auto Clinic",
    subtitle:
      "Book services, track spend, and manage staff — all in one place.",
    image: require("@/assets/images/forgot-illustration.png"),
    gradient: ["#6a0dad", "#b07cf2"],
  },
  {
    key: "track",
    title: "Track & Report",
    subtitle:
      "Real‑time revenue, shifts, and transactions synced to the cloud.",
    image: require("@/assets/images/reset-password-illustration.png"),
    gradient: ["#6a0dad", "#22d3ee"],
  },
  {
    key: "notify",
    title: "Stay in the Loop",
    subtitle: "Get updates, reminders, and promos — right when you need them.",
    image: require("@/assets/images/success.png"),
    gradient: ["#6a0dad", "#84cc16"],
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
    router.replace("/auth/login"); // keep it simple
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
      <TouchableOpacity
        disabled={index === 0}
        onPress={goBack}
        style={{ opacity: index === 0 ? 0 : 1 }}
      >
        <Text style={{ color: "white", fontWeight: "600" }}>Back</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleDone}>
        <Text style={{ color: "white", fontWeight: "700" }}>Skip</Text>
      </TouchableOpacity>
    </View>
  );

  const Footer = () => (
    <View
      style={{
        position: "absolute",
        bottom: 40,
        left: 20,
        right: 20,
        zIndex: 10,
      }}
    >
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
        renderItem={({ item, index: i }) => (
          <SlideItem item={item} index={i} x={x} />
        )}
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
  // Parallax for title/subtitle/Image
  const inputRange = [(index - 1) * width, index * width, (index + 1) * width];

  const titleStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          x.value,
          inputRange,
          [width * 0.3, 0, -width * 0.3],
          Extrapolate.CLAMP
        ),
      },
    ],
    opacity: interpolate(x.value, inputRange, [0, 1, 0], Extrapolate.CLAMP),
  }));

  const subStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          x.value,
          inputRange,
          [width * 0.5, 0, -width * 0.5],
          Extrapolate.CLAMP
        ),
      },
    ],
    opacity: interpolate(x.value, inputRange, [0, 1, 0], Extrapolate.CLAMP),
  }));

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          x.value,
          inputRange,
          [40, 0, -40],
          Extrapolate.CLAMP
        ),
      },
      {
        scale: interpolate(
          x.value,
          inputRange,
          [0.8, 1, 0.8],
          Extrapolate.CLAMP
        ),
      },
    ],
    opacity: interpolate(x.value, inputRange, [0.6, 1, 0.6], Extrapolate.CLAMP),
  }));

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
          paddingTop: 120,
          alignItems: "center",
          paddingHorizontal: 24,
        }}
      >
        <Animated.View
          style={[
            {
              width: width * 0.75,
              height: width * 0.75,
              borderRadius: 12,
              overflow: "hidden",
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
              marginTop: 16,
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
              color: "rgba(255,255,255,0.9)",
              fontSize: 16,
              lineHeight: 22,
              textAlign: "center",
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
    const o = interpolate(
      x.value,
      inputRange,
      [0.5, 1, 0.5],
      Extrapolate.CLAMP
    );
    return { width: w, opacity: o };
  });

  return (
    <Animated.View
      style={[
        { height: 8, borderRadius: 999, backgroundColor: "white" },
        rStyle,
      ]}
    />
  );
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
