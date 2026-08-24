import { Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "@/features/auth/auth-context";
import { colors, fonts, fontSizes } from "@/theme/tokens";

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

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          height: 64,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: fontSizes.caption },
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
