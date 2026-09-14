import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { AppText } from "@/components/text";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/**
 * Title-only card creation, inline on the board screen — the fast path.
 * `title` is the only field the API requires, so the common case needs no
 * navigation at all; the full «إضافة مهمة» screen stays one tap away behind
 * «تفاصيل» for templates, subtasks, assignees and restricted access, carrying
 * whatever was already typed with it.
 *
 * The field stays focused after a submit so several tasks can be added in a
 * row, and clears optimistically even though the board itself is refetched —
 * waiting for the round trip is what made the old flow feel slow.
 */
export function QuickAddCard({
  placeholder,
  onAdd,
  onOpenDetails,
  variant = "column",
}: {
  placeholder: string;
  /** Rejects if the card could not be created, so the title can be put back. */
  onAdd: (title: string) => Promise<unknown>;
  onOpenDetails: (draftTitle: string) => void;
  /** `bar` is the board screen's bottom bar: filled instead of dashed. */
  variant?: "column" | "bar";
}) {
  const [title, setTitle] = useState("");
  const [failed, setFailed] = useState(false);

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    setTitle("");
    setFailed(false);
    onAdd(trimmed).catch(() => {
      setFailed(true);
      // Only if nothing new has been typed meanwhile — never clobber the user.
      setTitle((current) => current || trimmed);
    });
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          borderRadius: variant === "bar" ? radii.field : radii.card,
          borderWidth: 1,
          borderStyle: variant === "bar" ? "solid" : "dashed",
          borderColor: failed ? colors.alert : colors.line,
          backgroundColor: variant === "bar" ? colors.surface : "transparent",
        }}
      >
        <TextInput
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={submit}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          returnKeyType="done"
          blurOnSubmit={false}
          style={{
            flex: 1,
            minHeight: MIN_TOUCH_TARGET,
            fontFamily: fonts.regular,
            fontSize: variant === "bar" ? fontSizes.body : fontSizes.small,
            color: colors.ink,
            textAlign: "right",
            writingDirection: "rtl",
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="إضافة مع التفاصيل"
          onPress={() => onOpenDetails(title.trim())}
          hitSlop={8}
          style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", paddingStart: spacing.xs }}
        >
          <AppText size="caption" weight="semibold" color={colors.accent}>
            تفاصيل
          </AppText>
        </Pressable>
      </View>

      {failed ? (
        <AppText size="caption" color={colors.alert} style={{ paddingHorizontal: spacing.md }}>
          تعذّرت إضافة المهمة. تحقّق من الاتصال وأعد المحاولة.
        </AppText>
      ) : null}
    </View>
  );
}
