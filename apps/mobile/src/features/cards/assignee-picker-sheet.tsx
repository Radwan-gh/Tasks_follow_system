import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import type { BoardMember } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { avatarColorFor } from "@/lib/avatar";
import { initials } from "@/lib/initials";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/**
 * Generic member-picker sheet — reused for card assignees, subtask
 * assignees, and restricted-access members (`v2-new-style.md` §5's
 * `AssigneePickerSheet`). Manages its own selection state, seeded fresh from
 * `selectedIds` each time it opens, and only commits on "حفظ".
 *
 * Big boards get a search box, and whoever is picked stays visible as a chip
 * above the list, so a search term can never hide the current selection.
 */

/** Above this many members, scanning the list is slower than filtering it. */
const SEARCH_THRESHOLD = 6;

export function AssigneePickerSheet({
  visible,
  onClose,
  title,
  subtitle,
  members,
  selectedIds,
  onSave,
  saveLabel = "حفظ",
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  members: BoardMember[];
  selectedIds: string[];
  onSave: (userIds: string[]) => void;
  saveLabel?: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
  const [search, setSearch] = useState("");

  const term = search.trim().toLowerCase();
  const visibleMembers = useMemo(
    () =>
      term
        ? members.filter(
            (m) =>
              m.user.displayName.toLowerCase().includes(term) || m.user.email.toLowerCase().includes(term),
          )
        : members,
    [members, term],
  );
  const chosen = useMemo(() => members.filter((m) => selected.has(m.userId)), [members, selected]);

  useEffect(() => {
    if (visible) {
      setSelected(new Set(selectedIds));
      setSearch("");
    }
    // Re-seed only when the sheet opens, not on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md, maxHeight: "80%" }}>
        <View style={{ gap: spacing.xs }}>
          <AppText weight="bold" size="title">
            {title}
          </AppText>
          {subtitle ? (
            <AppText size="small" color={colors.muted}>
              {subtitle}
            </AppText>
          ) : null}
        </View>

        {chosen.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
            {chosen.map((member) => (
              <Pressable
                key={member.userId}
                accessibilityRole="button"
                accessibilityLabel={`إزالة ${member.user.displayName}`}
                onPress={() => toggle(member.userId)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.xs,
                  borderRadius: radii.chip,
                  backgroundColor: colors.accentSoft,
                  paddingHorizontal: spacing.md,
                  paddingVertical: 6,
                }}
              >
                <AppText size="caption" weight="semibold" color={colors.accent}>
                  {member.user.displayName}
                </AppText>
                <AppText size="caption" color={colors.accent}>
                  ✕
                </AppText>
              </Pressable>
            ))}
          </View>
        ) : null}

        {members.length >= SEARCH_THRESHOLD ? (
          <TextInput
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="ابحث بالاسم أو البريد الإلكتروني"
            placeholderTextColor={colors.muted}
            accessibilityLabel="ابحث عن عضو"
            style={{
              minHeight: MIN_TOUCH_TARGET,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radii.field,
              paddingHorizontal: spacing.lg,
              fontFamily: fonts.regular,
              fontSize: fontSizes.body,
              color: colors.ink,
              textAlign: "right",
              writingDirection: "rtl",
            }}
          />
        ) : null}

        {members.length === 0 ? (
          <AppText size="small" color={colors.muted}>
            لا يوجد أعضاء في اللوحة لإسنادها إليهم.
          </AppText>
        ) : visibleMembers.length === 0 ? (
          <AppText size="small" color={colors.muted} style={{ paddingVertical: spacing.md }}>
            لا يوجد عضو يطابق «{search.trim()}».
          </AppText>
        ) : (
          <ScrollView
            style={{ maxHeight: 420 }}
            contentContainerStyle={{ gap: spacing.sm }}
            keyboardShouldPersistTaps="handled"
          >
            {visibleMembers.map((member) => {
              const isSelected = selected.has(member.userId);
              const palette = avatarColorFor(member.userId);
              return (
                <Pressable
                  key={member.userId}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  onPress={() => toggle(member.userId)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.md,
                    minHeight: MIN_TOUCH_TARGET,
                    borderRadius: radii.card,
                    borderWidth: 1,
                    borderColor: isSelected ? "#D6E1F8" : colors.line,
                    backgroundColor: isSelected ? colors.accentSoft : colors.surface,
                    paddingHorizontal: spacing.md,
                  }}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 999,
                      backgroundColor: colors.surface,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <AppText weight="bold" color={palette.fg} style={{ fontSize: 12 }}>
                      {initials(member.user.displayName)}
                    </AppText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText weight="semibold">{member.user.displayName}</AppText>
                    <AppText size="caption" color={colors.muted}>
                      {member.user.email}
                    </AppText>
                  </View>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isSelected ? colors.accent : "transparent",
                      borderWidth: isSelected ? 0 : 1.5,
                      borderColor: colors.line,
                    }}
                  >
                    {isSelected ? (
                      <AppText size="caption" color={colors.surface}>
                        ✓
                      </AppText>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <View style={{ flexDirection: "row", gap: spacing.sm, paddingBottom: spacing.sm }}>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={{
              flex: 0,
              minHeight: MIN_TOUCH_TARGET,
              paddingHorizontal: spacing.xl,
              borderRadius: radii.field,
              borderWidth: 1,
              borderColor: colors.line,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AppText color={colors.muted}>إلغاء</AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => onSave([...selected])}
            style={{
              flex: 1,
              minHeight: MIN_TOUCH_TARGET,
              borderRadius: radii.field,
              backgroundColor: colors.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AppText weight="semibold" color={colors.surface}>
              {saveLabel}
            </AppText>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}
