import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clayEdge, colors, radius, shadows } from '../../constants/theme';

const TABS = [
  { name: 'index', label: 'Feed', icon: '🏠' },
  { name: 'nearby', label: 'Around me', icon: '🗺' },
  { name: 'create', label: 'Create', icon: '➕' },
  { name: 'chat', label: 'Chat', icon: '💬' },
  { name: 'profile', label: 'Profile', icon: '👤' },
] as const;

/**
 * Claymorphic tab bar: a floating raised slab rather than a bordered strip.
 * The centre Create tab is lifted into a primary-coloured puck to match the
 * "➕ Create" emphasis in the navigation spec.
 */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => (
        <View
          style={{
            paddingHorizontal: 14,
            paddingBottom: Math.max(insets.bottom, 10),
            paddingTop: 6,
            backgroundColor: colors.bg,
          }}
        >
          <View
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-around',
                backgroundColor: colors.surface,
                borderRadius: radius.xl,
                paddingVertical: 8,
                paddingHorizontal: 6,
              },
              shadows.clay,
              clayEdge,
            ]}
          >
            {state.routes.map((route, index) => {
              const meta = TABS.find((t) => t.name === route.name);
              if (!meta) return null;

              const focused = state.index === index;
              const isCreate = route.name === 'create';

              return (
                <Pressable
                  key={route.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: focused }}
                  accessibilityLabel={meta.label}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => undefined);
                    const event = navigation.emit({
                      type: 'tabPress',
                      target: route.key,
                      canPreventDefault: true,
                    });
                    if (!focused && !event.defaultPrevented) {
                      navigation.navigate(route.name);
                    }
                  }}
                  style={{ flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4 }}
                >
                  <View
                    style={[
                      {
                        width: isCreate ? 46 : 38,
                        height: isCreate ? 46 : 38,
                        borderRadius: isCreate ? radius.md : radius.sm,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isCreate
                          ? colors.primary
                          : focused
                            ? colors.primarySoft
                            : 'transparent',
                        marginTop: isCreate ? -14 : 0,
                      },
                      isCreate && shadows.primary,
                      isCreate && clayEdge,
                    ]}
                  >
                    <Text style={{ fontSize: isCreate ? 20 : 17 }}>{meta.icon}</Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: focused ? '800' : '600',
                      color: focused ? colors.primaryDeep : colors.textFaint,
                      marginTop: isCreate ? -8 : 0,
                    }}
                    numberOfLines={1}
                  >
                    {meta.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
      // Keep the declared order identical to TABS.
      backBehavior="history"
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="nearby" />
      <Tabs.Screen name="create" />
      <Tabs.Screen name="chat" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
