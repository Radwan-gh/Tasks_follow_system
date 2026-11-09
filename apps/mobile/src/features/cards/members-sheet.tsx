import { useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import type { BoardMember } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { matchesUser } from "@/lib/match-users";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";
import { MemberAvatar } from "./task-fields";

/** Above this many people the sheet grows a filter field. */
const SEARCH_FROM = 7;

/**
 * The sheet behind a people row's «+» (6a/6b: "لمس أي صف يفتح ورقة صغيرة
 * لذلك الحقل وحده") — every member as a row with a tick box, «أنت» first.
 * Each tap is the whole act: on the edit screen it saves at once
 * (`useAutoSavedIds` in the caller), on the add screen it stays local.
 */
export function MembersSheet({
  visible,
  onClose,
  title,
  members,
  lookup = members,
  selectedIds,
  onChange,
  meId,
  lockedIds,
  note,
  saving,
  failed,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Who may be picked. */
  members: BoardMember[];
  /** Where already-picked people resolve from, when wider than `members`. */
  lookup?: BoardMember[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  meId: string | undefined;
  /** Always included and not removable — the board owner on an access list. */
  lockedIds?: ReadonlySet<string>;
  note?: string;
  saving?: boolean;
  failed?: boolean;
}) {
  const [term, setTerm] = useState("");
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const rows = useMemo(() => {
    // Someone picked but no longer pickable (deactivated, now a viewer) stays listed so they can be removed.
    const extra = lookup.filter((m) => selected.has(m.userId) && !members.some((x) => x.userId === m.userId));
    const all = [...members, ...extra].filter((m) => !lockedIds?.has(m.userId));
    const filtered = term.trim() ? all.filter((m) => matchesUser(m.user, term)) : all;
    return filtered.sort((a, b) => {
      if (a.userId === meId) return -1;
      if (b.userId === meId) return 1;
      return a.user.displayName.localeCompare(b.user.displayName, "ar");
    });
  }, [members, lookup, selected, lockedIds, term, meId]);

  function toggle(userId: string) {
    onChange(selected.has(userId) ? selectedIds.filter((id) => id !== userId) : [...selectedIds, userId]);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <AppText weight="bold" size="title">
            {title}
          </AppText>
          {saving ? (
            <AppText size="caption" color={colors.muted}>
              جارٍ الحفظ…
            </AppText>
          ) : failed ? (
            <AppText size="caption" color={colors.alert} accessibilityRole="alert">
              تعذّر الحفظ
            </AppText>
          ) : null}
        </View>

        {members.length >= SEARCH_FROM ? (
          <TextInput
            value={term}
            onChangeText={setTerm}
            placeholder="ابحث بالاسم"
            placeholderTextColor={colors.muted}
            autoCorrect={false}
            style={{
              minHeight: MIN_TOUCH_TARGET,
              backgroundColor: colors.chip,
              borderRadius: radii.chip,
              paddingHorizontal: spacing.lg,
              fontFamily: fonts.regular,
              fontSize: fontSizes.body,
              color: colors.ink,
              textAlign: "right",
              writingDirection: "rtl",
            }}
          />
        ) : null}

        {rows.length === 0 ? (
          <AppText size="small" color={colors.muted}>
            {term.trim() ? `لا يوجد عضو يطابق «${term.trim()}».` : "لا يوجد أعضاء في اللوحة."}
          </AppText>
        ) : (
          <View style={{ gap: 2 }}>
            {rows.map((member) => {
              const checked = selected.has(member.userId);
              const pickable = member.user.isActive || checked;
              return (
                <Pressable
                  key={member.userId}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked, disabled: !pickable }}
                  disabled={!pickable}
                  onPress={() => toggle(member.userId)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.md,
                    minHeight: MIN_TOUCH_TARGET + 6,
                    paddingHorizontal: spacing.sm,
                    borderRadius: radii.field,
                    backgroundColor: pressed ? colors.canvas : "transparent",
                  })}
                >
                  <MemberAvatar member={member} size={32} />
                  <View style={{ flex: 1 }}>
                    <AppText weight="semibold" style={{ lineHeight: 22 }}>
                      {member.userId === meId ? `${member.user.displayName} (أنت)` : member.user.displayName}
                    </AppText>
                    <AppText size="caption" color={member.user.isActive ? colors.muted : colors.alert} style={{ lineHeight: 18 }}>
                      {member.user.isActive ? member.user.username : "معطَّل"}
                    </AppText>
                  </View>
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 7,
                      backgroundColor: checked ? colors.accent : "transparent",
                      borderWidth: checked ? 0 : 1.5,
                      borderColor: colors.lineStrong,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {checked ? (
                      <AppText size="caption" color={colors.surface} style={{ lineHeight: 16 }}>
                        ✓
                      </AppText>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {note ? (
          <AppText size="caption" color={colors.muted}>
            {note}
          </AppText>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={{ minHeight: 52, borderRadius: radii.field, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}
        >
          <AppText weight="bold" color={colors.surface}>
            تم
          </AppText>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
