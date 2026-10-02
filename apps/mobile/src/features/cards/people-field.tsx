import { useMemo, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import type { BoardMember } from "@app/types";
import { AppText } from "@/components/text";
import { avatarColorFor } from "@/lib/avatar";
import { initials } from "@/lib/initials";
import { topMatches } from "@/lib/match-users";
import { useRevealInScroll } from "@/lib/scroll-reveal";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/**
 * Inline people type-ahead — card assignees, subtask assignees and
 * restricted-access members, edited right where they are shown, with no sheet
 * to open first.
 *
 * One bordered box holds the picked people as chips with the text input at
 * the end of the same wrapping row (a "token field"). Typing shows the top
 * three matching members (`topMatches`) under the box; the return key adds
 * the first, a tap adds any of them, and the box clears for the next name.
 * Tapping a chip removes that person.
 *
 * Controlled: the parent owns the selection and gets the whole new set from
 * `onChange` on every add/remove — the card screens save it straight away
 * (`useAutoSavedIds`), the new-card screen keeps it until the card exists.
 *
 * The suggestions grow downwards, so on focus the field asks the screen's
 * `ScrollView` to scroll it to the top (`lib/scroll-reveal.tsx`) — otherwise
 * Android would leave it just above the keyboard with the suggestions under it.
 *
 * A member picked before being deactivated stays as a chip, badged «معطَّل»,
 * and can still be removed — matching the server's "only new assignments are
 * blocked" rule — but is never suggested.
 */
export function PeopleField({
  label,
  members,
  lookup = members,
  selectedIds,
  onChange,
  placeholder,
  accessibilityLabel,
  emptyHint,
  noneLabel = "لا أحد",
  readOnly = false,
  autoFocus = false,
  revealMargin,
  saving = false,
  failed = false,
}: {
  /** Section label shown above the box; the save status sits at its end. */
  label?: string;
  /** Who can be suggested. */
  members: BoardMember[];
  /** Where chips resolve their person from, when wider than `members` (e.g. an assignee who is now a viewer). */
  lookup?: BoardMember[];
  selectedIds: string[];
  onChange: (userIds: string[]) => void;
  placeholder: string;
  accessibilityLabel: string;
  /** Shown instead of the box when there is nobody to pick and nobody picked. */
  emptyHint?: string;
  /** Read-only text when nobody is picked. */
  noneLabel?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
  /** Room left above the field when focus scrolls it to the top — to keep what it belongs to in view. */
  revealMargin?: number;
  saving?: boolean;
  failed?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const containerRef = useRef<View>(null);
  const scroll = useRevealInScroll();

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const matches = useMemo(() => topMatches(members, search, selected), [members, search, selected]);
  const chosen = useMemo(
    () =>
      selectedIds
        .map((id) => lookup.find((m) => m.userId === id))
        .filter((m): m is BoardMember => !!m),
    [lookup, selectedIds],
  );
  const typed = search.trim();

  function add(member: BoardMember | undefined) {
    if (!member) return;
    onChange([...selectedIds, member.userId]);
    setSearch("");
  }

  const status = saving ? (
    <AppText size="caption" color={colors.muted}>
      جارٍ الحفظ…
    </AppText>
  ) : failed ? (
    <AppText size="caption" color={colors.alert} accessibilityRole="alert">
      تعذّر الحفظ، فأُعيدت القائمة إلى آخر حالة محفوظة.
    </AppText>
  ) : null;

  let body;
  if (readOnly) {
    body =
      chosen.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          {chosen.map((member) => (
            <PersonChip key={member.userId} member={member} />
          ))}
        </View>
      ) : (
        <AppText size="small" color={colors.muted}>
          {noneLabel}
        </AppText>
      );
  } else if (members.length === 0 && chosen.length === 0) {
    body = (
      <AppText size="small" color={colors.muted}>
        {emptyHint ?? noneLabel}
      </AppText>
    );
  } else {
    body = (
      <View style={{ gap: spacing.xs }}>
        <Pressable
          // The whole box focuses the input, not just the text after the chips.
          accessible={false}
          onPress={() => inputRef.current?.focus()}
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: spacing.xs,
            minHeight: MIN_TOUCH_TARGET + 4,
            borderWidth: 1,
            borderColor: focused ? colors.accent : colors.line,
            borderRadius: radii.field,
            backgroundColor: colors.surface,
            paddingHorizontal: spacing.sm,
            paddingVertical: 5,
          }}
        >
          {chosen.map((member) => (
            <PersonChip
              key={member.userId}
              member={member}
              onRemove={() => onChange(selectedIds.filter((id) => id !== member.userId))}
            />
          ))}
          <TextInput
            ref={inputRef}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => add(matches[0])}
            // Keep the keyboard up after a pick so the next name can be typed straight away.
            submitBehavior="submit"
            returnKeyType="done"
            autoFocus={autoFocus}
            autoCapitalize="none"
            autoCorrect={false}
            onFocus={() => {
              setFocused(true);
              scroll?.reveal(containerRef.current, revealMargin);
            }}
            onBlur={() => {
              setFocused(false);
              // Clear the native text too: keystrokes landing as focus moves can
              // leave it holding text that `search` (already "") never sees.
              inputRef.current?.clear();
              setSearch("");
              scroll?.release();
            }}
            placeholder={chosen.length > 0 ? "أضف شخصًا آخر" : placeholder}
            placeholderTextColor={colors.muted}
            accessibilityLabel={accessibilityLabel}
            style={{
              flexGrow: 1,
              minWidth: 120,
              minHeight: 34,
              paddingHorizontal: spacing.xs,
              paddingVertical: 0,
              fontFamily: fonts.regular,
              fontSize: fontSizes.body,
              color: colors.ink,
              textAlign: "right",
              writingDirection: "rtl",
            }}
          />
        </Pressable>

        {focused && typed ? (
          matches.length === 0 ? (
            <AppText size="small" color={colors.muted} style={{ paddingHorizontal: spacing.sm }}>
              لا يوجد عضو يطابق «{typed}».
            </AppText>
          ) : (
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: radii.field,
                backgroundColor: colors.surface,
                padding: spacing.xs,
                gap: 2,
              }}
            >
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
      </View>
    );
  }

  return (
    <View ref={containerRef} style={{ gap: spacing.sm }}>
      {label ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
          <AppText size="caption" weight="semibold" color={colors.muted}>
            {label}
          </AppText>
          {status}
        </View>
      ) : null}
      {body}
      {!label ? status : null}
    </View>
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
        minHeight: MIN_TOUCH_TARGET + 4,
        borderRadius: radii.field - 4,
        paddingHorizontal: spacing.sm,
        backgroundColor: primary || pressed ? colors.accentSoft : colors.surface,
      })}
    >
      <Avatar member={member} size={34} />
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

/** A picked person. With `onRemove` the chip is the remove button; without it, a plain label. */
function PersonChip({ member, onRemove }: { member: BoardMember; onRemove?: () => void }) {
  const content = (
    <>
      <Avatar member={member} size={24} />
      <AppText size="small">{member.user.displayName}</AppText>
      {!member.user.isActive ? (
        <AppText size="caption" weight="semibold" color={colors.alert}>
          معطَّل
        </AppText>
      ) : null}
      {onRemove ? (
        <AppText size="caption" color={colors.muted}>
          ✕
        </AppText>
      ) : null}
    </>
  );
  const style = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.xs,
    borderRadius: radii.chip,
    backgroundColor: colors.canvas,
    paddingVertical: 3,
    paddingStart: 3,
    paddingEnd: spacing.md,
    opacity: member.user.isActive ? 1 : 0.6,
  };

  if (!onRemove) return <View style={style}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`إزالة ${member.user.displayName}`}
      onPress={onRemove}
      hitSlop={4}
      style={style}
    >
      {content}
    </Pressable>
  );
}
