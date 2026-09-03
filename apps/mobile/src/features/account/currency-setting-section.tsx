import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AppText } from "@/components/text";
import { api } from "@/lib/api";
import { useCurrencySymbol } from "@/lib/currency";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/** §3c-1 "إعدادات عامة (شاشة «حسابي» للمشرف): حقل نصي واحد «رمز العملة»" — admin-only. */
export function CurrencySettingSection() {
  const queryClient = useQueryClient();
  const currentSymbol = useCurrencySymbol();
  const [symbol, setSymbol] = useState(currentSymbol);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (!seeded && currentSymbol) {
      setSymbol(currentSymbol);
      setSeeded(true);
    }
  }, [currentSymbol, seeded]);

  const save = useMutation({
    mutationFn: (currencySymbol: string) => api.settings.update({ currencySymbol }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });

  const dirty = symbol.trim().length > 0 && symbol.trim() !== currentSymbol;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radii.card,
        borderWidth: 1,
        borderColor: colors.line,
        padding: spacing.xl,
        gap: spacing.md,
      }}
    >
      <AppText weight="bold">رمز العملة</AppText>
      <AppText size="small" color={colors.muted}>
        يظهر بجانب كل مبالغ التكلفة في التطبيق.
      </AppText>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <TextInput
          value={symbol}
          onChangeText={setSymbol}
          maxLength={10}
          style={{
            flex: 1,
            minHeight: MIN_TOUCH_TARGET,
            backgroundColor: colors.canvas,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radii.field,
            paddingHorizontal: spacing.md,
            fontFamily: fonts.regular,
            fontSize: fontSizes.body,
            color: colors.ink,
            textAlign: "right",
            writingDirection: "rtl",
          }}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!dirty || save.isPending}
          onPress={() => save.mutate(symbol.trim())}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            paddingHorizontal: spacing.lg,
            borderRadius: radii.field,
            backgroundColor: dirty ? colors.accent : colors.line,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AppText weight="semibold" color={colors.surface}>
            {save.isPending ? "..." : "حفظ"}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
