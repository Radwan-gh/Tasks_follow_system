import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import type { BoardMember } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { avatarColorFor } from "@/lib/avatar";
import { initials } from "@/lib/initials";
import { topMatches } from "@/lib/match-users";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/**
 * Generic people type-ahead sheet — reused for card assignees, subtask
 * assignees, and restricted-access members (`v2-new-style.md` §5's
 * `AssigneePickerSheet`). Type a few letters, get the top three matching
 * members (`topMatches`); the return key adds the first one, a tap adds any
 * of them, and every pick lands as a chip under the box, which clears for the
 * next name.
 *
 * Controlled: the parent owns the selection and gets the whole new set from
 * `onChange` on every add/remove — the card screens save it straight away
 * (`useAutoSavedIds`), the new-card screen keeps it until the card exists. So
 * there is no save button, only «تم».
 *
 * It lives in a sheet rather than inline on the card screen because the
 * sheet already lifts itself above the keyboard; an inline box mid-screen
 * would put its suggestions under the IME on Android.
 *
 * A member picked before being deactivated stays as a chip, badged «معطَّل»,
 * and can still be removed — matching the server's "only new assignments are
 * blocked" rule — but is never suggested.
 */
export function AssigneePickerSheet({
  visible,
  onClose,
  title,
  subtitle,
  members,
  selectedIds,
  onChange,
  saving = false,
  failed = false,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  members: BoardMember[];
  selectedIds: string[];
  onChange: (userIds: string[]) => void;
  saving?: boolean;
  failed?: boolean;
}) {
  const [search, setSearch] = useState("");

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const matches = useMemo(() => topMatches(members, search, selected), [members, search, selected]);
  const chosen = useMemo(
    () =>
      selectedIds
        .map((id) => members.find((m) => m.userId === id))
        .filter((m): m is BoardMember => !!m),
    [members, selectedIds],
  );
  const typed = search.trim();

  useEffect(() => {
    if (visible) setSearch("");
  }, [visible]);

  function add(member: BoardMember | undefined) {
    if (!member) return;
    onChange([...selectedIds, member.userId]);
    setSearch("");
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} scrollable={false}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md, flexShrink: 1 }}>
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

        {members.length === 0 ? (
          <AppText size="small" color={colors.muted}>
            لا يوجد أعضاء في اللوحة لإسنادها إليهم.
          </AppText>
        ) : (
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled">
            <TextInput
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={() => add(matches[0])}
              // Keep the keyboard up after a pick so the next name can be typed straight away.
              blurOnSubmit={false}
              returnKeyType="done"
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="اكتب اسمًا أو اسم مستخدم"
              placeholderTextColor={colors.muted}
              accessibilityLabel={`ابحث عن عضو — ${title}`}
              style={{
                minHeight: MIN_TOUCH_TARGET,
                borderWidth: 1,
                borderColor: typed ? colors.accent : colors.line,
                borderRadius: radii.field,
                paddingHorizontal: spacing.lg,
                fontFamily: fonts.regular,
                fontSize: fontSizes.body,
                color: colors.ink,
                textAlign: "right",
                writingDirection: "rtl",
              }}
            />

            {typed ? (
              matches.length === 0 ? (
                <AppText size="small" color={colors.muted}>
                  لا يوجد عضو يطابق «{typed}».
                </AppText>
              ) : (
                <View style={{ gap: spacing.xs }}>
                  {matches.map((member, index) => (
                    <SuggestionRow
                      key={member.userId}
                      member={member}
                      term={typed}
                      // The first row is what the keyboard's return key adds.
                      primary={index === 0}
                      onPress={() => add(member)}
                    />
                  ))}
                </View>
              )
            ) : null}

            {chosen.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
                {chosen.map((member) => (
                  <SelectedChip
                    key={member.userId}
                    member={member}
                    onRemove={() => onChange(selectedIds.filter((id) => id !== member.userId))}
                  />
                ))}
              </View>
            ) : null}

            {saving ? (
              <AppText size="caption" color={colors.muted}>
                جارٍ الحفظ…
              </AppText>
            ) : failed ? (
              <AppText size="caption" color={colors.alert} accessibilityRole="alert">
                تعذّر الحفظ، فأُعيدت القائمة إلى آخر حالة محفوظة.
              </AppText>
            ) : null}
          </ScrollView>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            borderRadius: radii.field,
            backgroundColor: colors.accent,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: spacing.sm,
          }}
        >
          <AppText weight="semibold" color={colors.surface}>
            تم
          </AppText>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

function Avatar({ member, size }: { member: BoardMember; size: number }) {
  const palette = avatarColorFor(member.userId);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        backgroundColor: palette.bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AppText weight="bold" color={palette.fg} style={{ fontSize: size > 30 ? 12 : 10 }}>
        {initials(member.user.displayName)}
      </AppText>
    </View>
  );
}

/** `text` with the first case-insensitive occurrence of `term` emphasised — shows *why* a row matched. */
function MatchedText({ text, term, size, color }: { text: string; term: string; size?: "caption"; color?: string }) {
  const at = text.toLowerCase().indexOf(term.toLowerCase());
  if (at < 0) {
    return (
      <AppText size={size} color={color}>
        {text}
      </AppText>
    );
  }
  return (
    <AppText size={size} color={color}>
      {text.slice(0, at)}
      <AppText size={size} weight="bold" color={colors.accent}>
        {text.slice(at, at + term.length)}
      </AppText>
      {text.slice(at + term.length)}
    </AppText>
  );
}

function SuggestionRow({
  member,
  term,
  primary,
  onPress,
}: {
  member: BoardMember;
  term: string;
  primary: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`إضافة ${member.user.displayName}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        minHeight: MIN_TOUCH_TARGET + 8,
        borderRadius: radii.field,
        paddingHorizontal: spacing.md,
        backgroundColor: primary || pressed ? colors.accentSoft : colors.surface,
      })}
    >
      <Avatar member={member} size={38} />
      <View style={{ flex: 1 }}>
        <MatchedText text={member.user.displayName} term={term} />
        <MatchedText text={member.user.username} term={term} size="caption" color={colors.muted} />
      </View>
      <AppText size="caption" weight="semibold" color={primary ? colors.accent : colors.muted}>
        إضافة +
      </AppText>
    </Pressable>
  );
}

function SelectedChip({ member, onRemove }: { member: BoardMember; onRemove: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`إزالة ${member.user.displayName}`}
      onPress={onRemove}
      hitSlop={4}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
        borderRadius: radii.chip,
        backgroundColor: colors.canvas,
        borderWidth: 1,
        borderColor: colors.line,
        paddingVertical: 4,
        paddingStart: 4,
        paddingEnd: spacing.md,
        opacity: member.user.isActive ? 1 : 0.6,
      }}
    >
      <Avatar member={member} size={26} />
      <AppText size="small">{member.user.displayName}</AppText>
      {!member.user.isActive ? (
        <AppText size="caption" weight="semibold" color={colors.alert}>
          معطَّل
        </AppText>
      ) : null}
      <AppText size="caption" color={colors.muted}>
        ✕
      </AppText>
    </Pressable>
  );
}
