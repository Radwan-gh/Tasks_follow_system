import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import type { BoardMember } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { AppText } from "@/components/text";
import { useKeyboardHeight } from "@/lib/keyboard";
import { topMatches } from "@/lib/match-users";
import {
  activeMention,
  linkAt,
  linkMarkup,
  removeLink,
  replaceRange,
  toggleBold,
  toggleLineStyle,
  type Edit,
  type LineStyle,
  type Selection,
} from "@/lib/rich-text";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, fs, radii, spacing } from "@/theme/tokens";
import { MemberAvatar } from "./task-fields";

const EDITOR_FONT = fs(17);

/**
 * 6c «تحرير الوصف بكامل الشاشة»: the whole screen to write in, the task's
 * title above for context, and a formatting bar riding on the keyboard —
 * B · • · 1. · ☐ · @ · «+ رابط». Touching a link while editing raises
 * فتح · تعديل · نسخ · إزالة. «تم» hands the text back; «إلغاء» asks first
 * when something changed.
 *
 * A full-window `Modal` rather than a route, so the add-task screen — whose
 * card does not exist yet — can use it the same way the edit screen does.
 */
export function DescriptionEditor({
  visible,
  taskTitle,
  initialText,
  members,
  onDone,
  onCancel,
}: {
  visible: boolean;
  taskTitle: string;
  initialText: string;
  /** Who «@» suggests. */
  members: BoardMember[];
  onDone: (text: string) => void;
  onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const inputRef = useRef<TextInput>(null);

  const [text, setText] = useState(initialText);
  const [selection, setSelection] = useState<Selection>({ start: initialText.length, end: initialText.length });
  // Only set when the editor moves the cursor itself; a controlled `selection` otherwise fights typing.
  const [forcedSelection, setForcedSelection] = useState<Selection | undefined>(undefined);
  const [linkSheet, setLinkSheet] = useState<{ label: string; url: string; range: Selection } | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  // Each opening starts from the text as it was then; later changes to `initialText` never reset typing.
  useEffect(() => {
    if (!visible) return;
    setText(initialText);
    setSelection({ start: initialText.length, end: initialText.length });
    setForcedSelection(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- per opening, not per prop change
  }, [visible]);

  function apply(edit: Edit) {
    setText(edit.text);
    setSelection(edit.selection);
    setForcedSelection(edit.selection);
    inputRef.current?.focus();
  }

  const collapsed = selection.start === selection.end;
  const link = collapsed ? linkAt(text, selection.start) : null;
  const mention = collapsed ? activeMention(text, selection.start) : null;
  const suggestions = useMemo(
    () => (mention ? topMatches(members, mention.query, new Set()) : []),
    [members, mention],
  );
  const changed = text !== initialText;

  function lineStyle(style: LineStyle) {
    apply(toggleLineStyle(text, selection, style));
  }

  function openLinkSheet() {
    if (link) {
      setLinkSheet({ label: text.slice(link.start, link.end).startsWith("[") ? link.label : "", url: link.url, range: link });
    } else {
      setLinkSheet({ label: text.slice(selection.start, selection.end), url: "", range: selection });
    }
  }

  function cancel() {
    if (changed) setConfirmingDiscard(true);
    else onCancel();
  }

  return (
    <Modal visible={visible} onRequestClose={cancel} animationType="slide" statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: 4, paddingBottom: spacing.sm }}>
          <Pressable accessibilityRole="button" onPress={cancel} style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}>
            <AppText size="body" color={colors.subtle} style={{ fontSize: 14 }}>
              إلغاء
            </AppText>
          </Pressable>
          <View style={{ flex: 1, alignItems: "center" }}>
            <AppText weight="bold" style={{ fontSize: 15, lineHeight: 22 }}>
              الوصف
            </AppText>
            <AppText color={colors.muted} numberOfLines={1} style={{ fontSize: 11, lineHeight: 16 }}>
              {taskTitle}
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => onDone(text)}
            style={{ minHeight: 40, paddingHorizontal: spacing.lg, borderRadius: radii.iconButton, backgroundColor: colors.accent, justifyContent: "center" }}
          >
            <AppText weight="bold" color={colors.surface} style={{ fontSize: 14 }}>
              تم
            </AppText>
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1, borderTopWidth: 1, borderTopColor: colors.hairline }}
          contentContainerStyle={{ paddingVertical: 18, paddingHorizontal: 22, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            selection={forcedSelection}
            onSelectionChange={(event) => {
              setSelection(event.nativeEvent.selection);
              setForcedSelection(undefined);
            }}
            autoFocus
            multiline
            scrollEnabled={false}
            placeholder="أضف وصفًا أو الصق رابطًا…"
            placeholderTextColor={colors.faint}
            accessibilityLabel="الوصف"
            style={{
              flexGrow: 1,
              fontFamily: fonts.regular,
              fontSize: EDITOR_FONT,
              lineHeight: EDITOR_FONT * 2,
              color: colors.ink,
              textAlign: "right",
              textAlignVertical: "top",
              writingDirection: "rtl",
              padding: 0,
            }}
          />
        </ScrollView>

        <View style={{ paddingBottom: Math.max(insets.bottom, keyboardHeight) }}>
          {link ? (
            // 6c's dark bar for the link under the cursor.
            <View style={{ flexDirection: "row", alignSelf: "flex-start", marginStart: 28, marginBottom: spacing.sm, backgroundColor: colors.ink, borderRadius: radii.iconButton, padding: 4 }}>
              <LinkAction label="↗ فتح" onPress={() => void Linking.openURL(link.url)} />
              <LinkAction label="✎ تعديل" onPress={openLinkSheet} />
              <LinkAction label="⧉ نسخ" onPress={() => void Clipboard.setStringAsync(link.url)} />
              <LinkAction label="✕ إزالة" onPress={() => apply(removeLink(text, link))} />
            </View>
          ) : null}

          {suggestions.length > 0 && mention ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm }}>
              {suggestions.map((member) => (
                <Pressable
                  key={member.userId}
                  accessibilityRole="button"
                  accessibilityLabel={`الإشارة إلى ${member.user.displayName}`}
                  onPress={() =>
                    apply(replaceRange(text, { start: mention.start, end: selection.start }, `@${member.user.displayName} `))
                  }
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingStart: 4, paddingEnd: spacing.md, borderRadius: radii.chip, backgroundColor: colors.accentSoft }}
                >
                  <MemberAvatar member={member} size={26} />
                  <AppText size="small" weight="semibold" color={colors.link}>
                    {member.user.displayName}
                  </AppText>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={{ flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 4, paddingHorizontal: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.toolbar }}>
            <ToolButton label="B" accessibilityLabel="عريض" onPress={() => apply(toggleBold(text, selection))} />
            <ToolButton label="•" accessibilityLabel="قائمة نقطية" onPress={() => lineStyle("bullet")} />
            <ToolButton label="1." accessibilityLabel="قائمة مرقّمة" onPress={() => lineStyle("number")} />
            <ToolButton label="☐" accessibilityLabel="مربع اختيار" onPress={() => lineStyle("check")} />
            <ToolButton label="@" accessibilityLabel="الإشارة إلى عضو" onPress={() => apply(replaceRange(text, selection, "@"))} />
            <Pressable
              accessibilityRole="button"
              onPress={openLinkSheet}
              style={{ marginStart: "auto", height: 36, paddingHorizontal: spacing.md, borderRadius: 10, backgroundColor: colors.accentSoft, justifyContent: "center" }}
            >
              <AppText size="small" weight="bold" color={colors.link}>
                + رابط
              </AppText>
            </Pressable>
          </View>
        </View>
      </View>

      <LinkSheet
        value={linkSheet}
        onClose={() => setLinkSheet(null)}
        onSave={(label, url) => {
          if (!linkSheet) return;
          apply(replaceRange(text, linkSheet.range, linkMarkup(label, url)));
          setLinkSheet(null);
        }}
      />

      <ConfirmSheet
        visible={confirmingDiscard}
        onClose={() => setConfirmingDiscard(false)}
        title="تجاهل تعديلات الوصف؟"
        consequence="لم يُحفظ ما كتبته في الوصف. إن خرجت الآن فسيضيع."
        confirmLabel="تجاهل والخروج"
        cancelLabel="متابعة التعديل"
        onConfirm={() => {
          setConfirmingDiscard(false);
          onCancel();
        }}
      />
    </Modal>
  );
}

function ToolButton({ label, accessibilityLabel, onPress }: { label: string; accessibilityLabel: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: MIN_TOUCH_TARGET,
        height: 40,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 10,
        backgroundColor: pressed ? colors.line : "transparent",
      })}
    >
      <AppText weight="bold" color={colors.inkSoft} style={{ fontSize: 15, lineHeight: 22 }}>
        {label}
      </AppText>
    </Pressable>
  );
}

function LinkAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ paddingVertical: spacing.sm, paddingHorizontal: 11 }}>
      <AppText size="small" weight="semibold" color={colors.surface} style={{ lineHeight: 18 }}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** «+ رابط» and «تعديل»: a label (optional) and the address it points to. */
function LinkSheet({
  value,
  onClose,
  onSave,
}: {
  value: { label: string; url: string } | null;
  onClose: () => void;
  onSave: (label: string, url: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const urlRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!value) return;
    setLabel(value.label);
    setUrl(value.url);
  }, [value]);

  const canSave = url.trim().length > 3;
  const field = {
    minHeight: MIN_TOUCH_TARGET + 4,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.field,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.regular,
    fontSize: fontSizes.body,
    color: colors.ink,
    textAlign: "right" as const,
    writingDirection: "rtl" as const,
  };

  return (
    <BottomSheet visible={!!value} onClose={onClose} onShow={() => urlRef.current?.focus()}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
        <AppText weight="bold" size="title">
          رابط
        </AppText>
        <TextInput
          ref={urlRef}
          value={url}
          onChangeText={setUrl}
          placeholder="الرابط — docs.google.com/…"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={{ ...field, textAlign: "left", writingDirection: "ltr" }}
        />
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder="النص الظاهر (اختياري)"
          placeholderTextColor={colors.muted}
          style={field}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!canSave}
          onPress={() => onSave(label, url)}
          style={{
            minHeight: 52,
            borderRadius: radii.field,
            backgroundColor: canSave ? colors.accent : colors.line,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AppText weight="bold" color={canSave ? colors.surface : colors.muted}>
            إضافة الرابط
          </AppText>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
