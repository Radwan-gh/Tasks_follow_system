import { Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/features/auth/auth-context";
import { colors, fonts, fontSizes } from "@/theme/tokens";

/** Icon + label + breathing room, *before* the device's bottom inset. */
const TAB_BAR_CONTENT_HEIGHT = 62;

/**
 * The bottom bar from the design: اللوحات · مهامي · التقارير · حسابي.
 *
 * «التقارير» is ADMIN-only. It is hidden with `href: null` rather than omitted
 * from the tree, so a deep link to `/reports` still resolves — the server is
 * the actual gate (`AdminGuard`), this only keeps the tab out of the bar.
 */
export default function TabsLayout() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          // Android draws edge-to-edge, so the gesture pill sits *over* the
          // app and the bar has to reserve `insets.bottom` on top of its own
          // content. React Navigation reads a `height` given here as the
          // *total* height (inset included), so a bare `height: 64` squeezed
          // the icons and labels into whatever the inset left over — which is
          // what put the labels under the gesture bar.
          height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.medium,
          fontSize: fontSizes.caption,
          // Cairo clips Arabic ascenders/descenders at RN's default line
          // height — the same reason `components/text.tsx` sets one.
          lineHeight: 18,
        },
        sceneStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "اللوحات",
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="my-tasks"
        options={{
          title: "مهامي",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkmark-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "التقارير",
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "حسابي",
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
