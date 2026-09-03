import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/**
 * §3c-1 "التكلفة": amount (numeric keypad) + optional note (invoice #/vendor
 * name). Card detail's collapsed «التكلفة — إضافة ▾» row opens this.
 */
export function CostSheet({
  visible,
  onClose,
  amount,
  note,
  onSave,
  saving,
}: {
  visible: boolean;
  onClose: () => void;
  amount: string | null;
  note: string | null;
  onSave: (amount: string | null, note: string | null) => void;
  saving?: boolean;
}) {
  const [amountText, setAmountText] = useState("");
  const [noteText, setNoteText] = useState("");

  useEffect(() => {
    if (visible) {
      setAmountText(amount ?? "");
      setNoteText(note ?? "");
    }
    // Re-seed only when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const parsed = Number(amountText.replace(/[^0-9.]/g, ""));
  const isValid = amountText.trim().length === 0 || (Number.isFinite(parsed) && parsed >= 0);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.sm }}>
        <AppText weight="bold" size="title">
          التكلفة
        </AppText>

        <View style={{ gap: spacing.xs }}>
          <AppText size="caption" weight="semibold" color={colors.muted}>
            المبلغ
          </AppText>
          <TextInput
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.muted}
            style={{
              minHeight: MIN_TOUCH_TARGET,
              backgroundColor: colors.canvas,
              borderWidth: 1,
              borderColor: isValid ? colors.line : colors.alert,
              borderRadius: radii.field,
              paddingHorizontal: spacing.md,
              fontFamily: fonts.regular,
              fontSize: fontSizes.body,
              color: colors.ink,
              textAlign: "right",
            }}
          />
        </View>

        <View style={{ gap: spacing.xs }}>
          <AppText size="caption" weight="semibold" color={colors.muted}>
            ملاحظة (اختياري — رقم فاتورة أو اسم مورّد)
          </AppText>
          <TextInput
            value={noteText}
            onChangeText={setNoteText}
            placeholder="مثال: فاتورة 114"
            placeholderTextColor={colors.muted}
            style={{
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
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {amount != null ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onSave(null, null)}
              style={{
                minHeight: MIN_TOUCH_TARGET,
                paddingHorizontal: spacing.lg,
                borderRadius: radii.field,
                backgroundColor: colors.alertSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AppText weight="semibold" color={colors.alert}>
                إزالة
              </AppText>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={!isValid || saving}
            onPress={() => {
              const trimmed = amountText.trim();
              onSave(trimmed.length > 0 ? trimmed : null, noteText.trim() || null);
            }}
            style={{
              flex: 1,
              minHeight: MIN_TOUCH_TARGET,
              borderRadius: radii.field,
              backgroundColor: isValid ? colors.accent : colors.line,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AppText weight="semibold" color={colors.surface}>
              {saving ? "جارٍ الحفظ..." : "حفظ"}
            </AppText>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}

/** «‏350,000 ل.س · فاتورة 114» — details-screen-only chip text. */
export function formatCostChip(amount: string, note: string | null, currencySymbol: string): string {
  const formatted = Number(amount).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return note ? `${formatted} ${currencySymbol} · ${note}` : `${formatted} ${currencySymbol}`;
}
