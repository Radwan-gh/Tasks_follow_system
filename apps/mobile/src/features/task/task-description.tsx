import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { RichTextView } from "@/components/rich-text-view";
import { useKeyboardHeight } from "@/lib/keyboard";
import { wordCount } from "@/lib/task-format";
import { t, taskFonts } from "@/theme/task-tokens";
import { fs } from "@/theme/tokens";
import { TCard, TText } from "./task-ui";

/** How long typing must pause before the full-screen editor saves («يُحفظ تلقائيًا»). */
const AUTOSAVE_MS = 900;

/**
 * The description card (`Edit Task Prototype.dc.html`): the text, and the
 * corner button that opens it full screen. While not being edited, links in it
 * open with a tap (the prototype draws a bare field; the app keeps links
 * live). Tapping the text edits it in place; leaving the field saves.
 */
export function DescriptionCard({
  value,
  editable,
  mentionNames,
  onSave,
  onExpand,
}: {
  value: string;
  editable: boolean;
  mentionNames: readonly string[];
  onSave: (text: string) => void;
  onExpand: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  // A refresh brings in other people's edits — but never over what is being typed.
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const setEditingBoth = setEditing;

  return (
    <TCard style={{ minHeight: 116, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "flex-start", gap: 10, borderColor: editing ? t.accent : t.line }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <TextInput
            autoFocus
            value={draft}
            onChangeText={setDraft}
            onBlur={() => {
              setEditingBoth(false);
              if (draft !== value) onSave(draft);
            }}
            multiline
            scrollEnabled={false}
            placeholder="أضف وصفًا أو الصق رابطًا…"
            placeholderTextColor={t.faint}
            accessibilityLabel="الوصف"
            style={{ minHeight: 90, padding: 0, fontFamily: taskFonts.regular, fontSize: fs(15), lineHeight: fs(28), color: t.ink, textAlign: "right", textAlignVertical: "top", writingDirection: "rtl" }}
          />
        ) : value ? (
          <Pressable disabled={!editable} accessibilityRole={editable ? "button" : undefined} accessibilityLabel={editable ? "تعديل الوصف" : undefined} onPress={() => setEditingBoth(true)}>
            <RichTextView look="task" text={value} mentionNames={mentionNames} fontSize={15} lineHeight={28} color={t.ink} onEditLink={editable ? onExpand : undefined} />
          </Pressable>
        ) : (
          <Pressable disabled={!editable} accessibilityRole="button" onPress={() => setEditingBoth(true)} style={{ minHeight: 90 }}>
            <TText size={15} color={t.faint} lineHeight={28}>
              أضف وصفًا أو الصق رابطًا…
            </TText>
          </Pressable>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="فتح الوصف بكامل الشاشة"
        onPress={onExpand}
        hitSlop={5}
        style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 10, backgroundColor: pressed ? t.chipStrong : t.canvas, alignItems: "center", justifyContent: "center" })}
      >
        <Ionicons name="expand-outline" size={16} color={t.ink3} />
      </Pressable>
    </TCard>
  );
}

/**
 * The full-screen description: the task's title under «الوصف», the whole
 * screen to write in, a word count and «يُحفظ تلقائيًا» at the bottom — it
 * saves a moment after typing stops, and again on the way out. Read-only users
 * get the same view with «إغلاق» and no keyboard.
 */
export function DescriptionFullScreen({
  visible,
  taskTitle,
  value,
  editable,
  onSave,
  onClose,
}: {
  visible: boolean;
  taskTitle: string;
  value: string;
  editable: boolean;
  onSave: (text: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const [text, setText] = useState(value);
  const saved = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Each opening starts from the saved text; edits made here never get reset by a refresh.
  useEffect(() => {
    if (!visible) return;
    setText(value);
    saved.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- per opening
  }, [visible]);

  function flush(next: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (next !== saved.current) {
      saved.current = next;
      onSave(next);
    }
  }

  function change(next: string) {
    setText(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(next), AUTOSAVE_MS);
  }

  function close() {
    if (editable) flush(text);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: t.surface, paddingTop: insets.top }}>
        <View style={{ height: 52, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: t.line }}>
          <Pressable accessibilityRole="button" accessibilityLabel="تصغير" onPress={close} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="contract-outline" size={18} color={t.ink} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0, alignItems: "center" }}>
            <TText size={16} weight="bold">
              الوصف
            </TText>
            <TText size={12} color={t.muted} numberOfLines={1}>
              {taskTitle}
            </TText>
          </View>
          <Pressable accessibilityRole="button" onPress={close} style={{ minWidth: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <TText size={15} weight="semibold" color={t.accent}>
              {editable ? "تم" : "إغلاق"}
            </TText>
          </Pressable>
        </View>
        <TextInput
          autoFocus={editable}
          editable={editable}
          value={text}
          onChangeText={change}
          multiline
          placeholder="اكتب وصف المهمة هنا…"
          placeholderTextColor={t.faint}
          accessibilityLabel="الوصف"
          style={{ flex: 1, paddingVertical: 18, paddingHorizontal: 22, fontFamily: taskFonts.regular, fontSize: fs(17), lineHeight: fs(33), color: t.ink, textAlign: "right", textAlignVertical: "top", writingDirection: "rtl" }}
        />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 10,
            paddingHorizontal: 22,
            paddingBottom: 10 + Math.max(insets.bottom, keyboard),
            borderTopWidth: 1,
            borderTopColor: t.line,
          }}
        >
          <TText size={12} color={t.muted}>
            {wordCount(text)}
          </TText>
          {editable ? (
            <TText size={12} color={t.muted}>
              يُحفظ تلقائيًا
            </TText>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
