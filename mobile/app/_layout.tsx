import React, { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Slot, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { colors, type } from '../constants/theme';
import { useAuthStore } from '../stores/authStore';
import { setAuthLostHandler } from '../services/api';
import { registerForPushNotifications } from '../services/push';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function Splash() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
      }}
    >
      <Text style={{ fontSize: 56 }}>🌼</Text>
      <Text style={[type.title, { letterSpacing: -0.5 }]}>Daffodils</Text>
      <ActivityIndicator color={colors.primaryDeep} />
    </View>
  );
}

/**
 * Routing guard. Keeps the URL and the session in agreement: signed-out users
 * are pushed into onboarding, signed-in users are pulled out of it.
 */
function RootNavigation() {
  const status = useAuthStore((s) => s.status);
  const hydrate = useAuthStore((s) => s.hydrate);
  const logout = useAuthStore((s) => s.logout);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    setAuthLostHandler(() => {
      void logout();
    });
    void hydrate();
  }, [hydrate, logout]);

  useEffect(() => {
    if (status === 'loading') return;

    const group = segments[0];
    const inPublicRoute = group === 'onboarding' || group === 'auth';

    if (status === 'anonymous' && !inPublicRoute) {
      router.replace('/onboarding/welcome');
    } else if (status === 'authenticated' && inPublicRoute) {
      router.replace('/(tabs)');
    }
  }, [status, segments, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    void registerForPushNotifications();
  }, [status]);

  if (status === 'loading') return <Splash />;

  return <Slot />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <RootNavigation />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
