import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView as ExpoBlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Animatable from 'react-native-animatable';

Animatable.initializeRegistryWithDefinitions({
  wiggle: {
    0: { transform: [{ rotate: '0deg' }] },
    0.25: { transform: [{ rotate: '-10deg' }] },
    0.5: { transform: [{ rotate: '10deg' }] },
    0.75: { transform: [{ rotate: '-10deg' }] },
    1: { transform: [{ rotate: '0deg' }] },
  },
});

const TAB_ICONS: Record<string, { icon: string; label: string; animation: string }> = {
  home: { icon: 'home', label: 'Home', animation: 'wiggle' },
  transactions: { icon: 'add-circle', label: 'Add', animation: 'pulse' },
  employees: { icon: 'person', label: 'Employees', animation: 'rubberBand' },
  settings: { icon: 'settings', label: 'Settings', animation: 'flipInY' },
};

const activeColor = '#6a0dad';
const inactiveColor = '#444';

export const CustomTabBar = ({ state, descriptors, navigation }: BottomTabBarProps) => {
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const [webMenuOpen, setWebMenuOpen] = useState(false);

  const isWeb = Platform.OS === 'web';

  const tabVisibility: Record<string, boolean> = {
    employees: user?.role === 'admin',
    // other tabs visible by default
  };

  const visibleRoutes = state.routes.filter((route) => {
    const shouldHide =
      Object.prototype.hasOwnProperty.call(tabVisibility, route.name) &&
      !tabVisibility[route.name];
    return !shouldHide;
  });

  // WEB: top hamburger navigation
  if (isWeb) {
    return (
      <View style={styles.webWrapper}>
        <View style={styles.webTopBar}>
          {/* <Text style={styles.webBrand}>JW Auto Clinic</Text> */}
          <Image
              source={require("@/assets/images/icon.png")}
              style={styles.logo}
            />

          <TouchableOpacity
            onPress={() => setWebMenuOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel="Open navigation menu"
            style={styles.webHamburgerButton}
          >
            <Ionicons name="menu" size={26} color="#6a0dad" />
          </TouchableOpacity>
        </View>

        {webMenuOpen && (
          <View style={styles.webMenu}>
            {visibleRoutes.map((route, idx) => {
              const isFocused = state.index === state.routes.indexOf(route);
              const config = TAB_ICONS[route.name] || {
                icon: 'help',
                label: route.name,
              };

              const onPress = () => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });

                if (!event.defaultPrevented) {
                  navigation.navigate(route.name as never);
                  setWebMenuOpen(false);
                }
              };

              return (
                <TouchableOpacity
                  key={route.key}
                  style={[
                    styles.webMenuItem,
                    isFocused && styles.webMenuItemActive,
                  ]}
                  onPress={onPress}
                >
                  <Ionicons
                    name={config.icon as any}
                    size={20}
                    color={isFocused ? activeColor : '#222'}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={[
                      styles.webMenuItemLabel,
                      { color: isFocused ? activeColor : '#222' },
                    ]}
                  >
                    {config.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    );
  }

  // MOBILE: liquid-glass bottom tab bar
  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View
        style={[
          styles.floatingContainer,
          styles.androidShadow,
          { width: Math.min(width - 32, 480) },
        ]}
      >
        <ExpoBlurView tint="light" intensity={90} style={styles.blurShell}>
          <View style={styles.tabBar}>
            {state.routes.map((route, index) => {
              const shouldHide =
                Object.prototype.hasOwnProperty.call(tabVisibility, route.name) &&
                !tabVisibility[route.name];

              if (shouldHide) {
                return <View key={route.key} style={{ flex: 1 }} />;
              }

              const { options } = descriptors[route.key];
              const isFocused = state.index === index;

              return (
                <TabItem
                  key={route.key}
                  route={route}
                  options={options}
                  isFocused={isFocused}
                  navigation={navigation}
                />
              );
            })}
          </View>
        </ExpoBlurView>
      </View>
    </View>
  );
};

/* ------------------------------------------------------------------ */
/* TabItem: mobile tab button with animation                          */
/* ------------------------------------------------------------------ */

type TabItemProps = {
  route: BottomTabBarProps['state']['routes'][number];
  options: any;
  isFocused: boolean;
  navigation: BottomTabBarProps['navigation'];
};

const TabItem: React.FC<TabItemProps> = ({ route, isFocused, navigation }) => {
  const animRef = useRef<Animatable.View & View>(null);

  const { icon, label, animation } = TAB_ICONS[route.name] || {
    icon: 'help',
    label: route.name,
    animation: 'bounceIn',
  };

  useEffect(() => {
    if (isFocused && animRef.current) {
      animRef.current.animate(animation as Animatable.Animation, 600);
    }
  }, [isFocused, animation]);

  const onPress = () => {
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });

    if (!event.defaultPrevented) {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      navigation.navigate(route.name as never);
    }
  };

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      onPress={onPress}
      activeOpacity={0.85}
      style={styles.tabButton}
    >
      <Animatable.View ref={animRef} style={styles.iconContainer} useNativeDriver>
        <Ionicons
          name={icon as any}
          size={isFocused ? 28 : 22}
          color={isFocused ? activeColor : inactiveColor}
        />
        <Text
          style={[
            styles.tabLabel,
            { color: isFocused ? activeColor : inactiveColor, opacity: isFocused ? 1 : 0.8 },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Animatable.View>
    </TouchableOpacity>
  );
};

/* ------------------------------------------------------------------ */
/* Styles                                                             */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  // mobile glass bar
  wrapper: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
    backgroundColor: 'transparent',
    pointerEvents: 'box-none',
  },
  floatingContainer: {
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  blurShell: {
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.12)', // a bit more milky
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',     // stronger highlight
  },
  
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingVertical: 12,
    height: 72,
    alignItems: 'center',
    justifyContent: 'space-between',
  },  
  androidShadow: {
    elevation: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },

  // web top nav + hamburger
  logo: {
    width: 140,
    height: 60,
    borderRadius: 80,
    alignSelf: "center",
    marginBottom: 0,
  },
  webWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 60,
  },
  webTopBar: {
    height: 80,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  webBrand: {
    fontSize: 24,
    fontWeight: '700',
    color: '#6a0dad',
  },
  webHamburgerButton: {
    padding: 6,
    borderRadius: 999,
  },
  webMenu: {
    position: 'absolute',
    top: 56,
    right: 16,
    minWidth: 180,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  webMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  webMenuItemActive: {
    backgroundColor: 'rgba(106,13,173,0.08)',
  },
  webMenuItemLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
});
