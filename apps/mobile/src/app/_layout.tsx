import { useCallback, useEffect } from "react";
import { I18nManager, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  Cairo_400Regular,
  Cairo_500Medium,
  Cairo_600SemiBold,
  Cairo_700Bold,
  useFonts,
} from "@expo-google-fonts/cairo";

import { AuthProvider, useAuth } from "@/features/auth/auth-context";
import { setUnauthorizedHandler } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { useAutoUpdate } from "@/lib/updates";
import { colors } from "@/theme/tokens";

// The whole product is Arabic, so RTL is not a per-user setting — it is the
// layout. The `expo-localization` config plugin sets this natively at build
// time (see app.json); this call covers Expo Go, where config plugins do not
// apply. React Native only picks up a *change* in direction after a restart,
// so in Expo Go the very first launch may render LTR until you reload.
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { user, isLoading, clearSession } = useAuth();

  // The API client is created at module scope and cannot reach React state, so
  // it calls back here when a refresh finally fails. Dropping `user` is enough:
  // the guards below swap the navigator over to the login screen.
  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  if (isLoading) return null;

  // A user mid-forced-reset gets *only* this screen — no tabs, no back way
  // out — until `completePasswordReset` clears `mustChangePassword` server-side.
  const needsPasswordReset = !!user?.mustChangePassword;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
      <Stack.Protected guard={!!user && needsPasswordReset}>
        <Stack.Screen name="change-password-required" />
      </Stack.Protected>
      <Stack.Protected guard={!!user && !needsPasswordReset}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="board/[id]" />
        <Stack.Screen name="board/[id]/cards/new" options={{ presentation: "modal" }} />
        <Stack.Screen name="board/[id]/settings" options={{ presentation: "modal" }} />
        <Stack.Screen name="card/[id]" options={{ presentation: "modal" }} />
        <Stack.Screen name="admin/users" options={{ presentation: "modal" }} />
        <Stack.Screen name="notifications" />
      </Stack.Protected>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  useAutoUpdate();

  const [fontsLoaded, fontError] = useFonts({
    Cairo_400Regular,
    Cairo_500Medium,
    Cairo_600SemiBold,
    Cairo_700Bold,
  });

  // Hide the splash only once Cairo is in memory, otherwise the first frame
  // renders in the system font and visibly reflows. A font *error* still
  // releases the splash — a fallback face beats a stuck splash screen.
  const onReady = useCallback(async () => {
    if (fontsLoaded || fontError) await SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    void onReady();
  }, [onReady]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <View style={{ flex: 1, backgroundColor: colors.canvas }}>
              <StatusBar style="dark" />
              <RootNavigator />
            </View>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
