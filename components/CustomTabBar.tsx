import { useAuth } from '@/context/AuthContext'; // 👈 import auth
import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView as ExpoBlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef } from 'react';
import {
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
  
    const tabVisibility: Record<string, boolean> = {
      employees: user?.role === 'admin',
      // other tabs are visible by default
    };
  
    return (
      <View style={styles.wrapper}>
        <View style={[styles.floatingContainer, { width: width - 40 }]}>
          <ExpoBlurView tint="light" intensity={70} style={[styles.tabBar, styles.androidShadow]}>
            {renderTabs(state, descriptors, navigation, tabVisibility)}
          </ExpoBlurView>
        </View>
      </View>
    );
  };
  

  function renderTabs(
    state: BottomTabBarProps['state'],
    descriptors: BottomTabBarProps['descriptors'],
    navigation: BottomTabBarProps['navigation'],
    tabVisibility: Record<string, boolean>
  ) {
    return state.routes.map((route, index) => {
      const { options } = descriptors[route.key];
      const focused = state.index === index;
  
      const shouldHide = tabVisibility.hasOwnProperty(route.name) && !tabVisibility[route.name];
      if (shouldHide) {
        return <View key={route.key} style={{ flex: 1 }} />;
      }
  
      const onPress = () => {
        const event = navigation.emit({
          type: 'tabPress',
          target: route.key,
          canPreventDefault: true,
        });
  
        if (!event.defaultPrevented) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          navigation.navigate(route.name);
        }
      };
  
      const animRef = useRef<Animatable.View & View>(null);
      const { icon, label, animation } = TAB_ICONS[route.name] || {
        icon: 'help',
        label: route.name,
        animation: 'bounceIn',
      };
  
      useEffect(() => {
        if (focused && animRef.current) {
          animRef.current.animate(animation as Animatable.Animation, 600);
        }
      }, [focused]);
  
      return (
        <TouchableOpacity
          key={route.key}
          accessibilityRole="button"
          accessibilityState={focused ? { selected: true } : {}}
          onPress={onPress}
          activeOpacity={0.8}
          style={styles.tabButton}
        >
          <Animatable.View ref={animRef} style={styles.iconContainer} useNativeDriver>
            <Ionicons
              name={icon as any}
              size={focused ? 28 : 22}
              color={focused ? activeColor : inactiveColor}
            />
            <Text
              style={{
                color: focused ? activeColor : inactiveColor,
                fontSize: 11,
                fontWeight: '600',
                marginTop: 2,
              }}
            >
              {label}
            </Text>
          </Animatable.View>
        </TouchableOpacity>
      );
    });
  }
  

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
    backgroundColor: 'transparent',
  },
  floatingContainer: {
    borderRadius: 40,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 12,
    height: 70,
    borderRadius: 40,
    backgroundColor:
      Platform.OS === 'ios'
        ? 'rgba(255, 255, 255, 0.25)'
        : 'rgba(255, 255, 255, 0.85)',
    borderWidth: Platform.OS === 'ios' ? 1 : 0,
    borderColor: 'rgba(255,255,255,0.4)',
    backdropFilter: 'blur(15px)',
  },
  androidShadow: {
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
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
});
  