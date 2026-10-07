import { useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { canApproveSharedBoards, type BoardKind } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { DueDateSheet } from "@/components/due-date-sheet";
import { AppText } from "@/components/text";
import { formatDueDate } from "@/lib/date";
import { useAuth } from "@/features/auth/auth-context";
import { CategoryField } from "./board-categories";
import { KindChoice, ScopeField, SimilarBoards } from "./board-sharing";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/**
 * New-board bottom sheet: name, personal or shared, optional category and optional due date. The
 * server seeds every new board with the five status lists, so there is no starter choice here.
 * A shared board needs its scope, and shows boards with similar names before it is asked for
 * (`docs/18-board-sharing.md`).
 */
export function NewBoardSheet({
  visible,
  onClose,
  onCreate,
  creating,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (input: NewBoardInput) => void;
  creating: boolean;
}) {
  const { user } = useAuth();
  const approver = !!user && canApproveSharedBoards(user);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<BoardKind>("PERSONAL");
  const [scope, setScope] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [pickingDueDate, setPickingDueDate] = useState(false);
  const nameRef = useRef<TextInput>(null);

  function close() {
    setName("");
    setKind("PERSONAL");
    setScope("");
    setDueDate(null);
    setCategoryId(null);
    onClose();
  }

  const shared = kind === "SHARED";
  const canCreate = name.trim().length > 0 && (!shared || scope.trim().length > 0) && !creating;

  function create() {
    if (!canCreate) return;
    onCreate({ name: name.trim(), kind, description: shared ? scope.trim() : null, dueDate, categoryId });
  }

  return (
    // Naming is the only required step, so the keyboard comes up with the sheet.
    // Deferred past `onShow`: Android focuses the field then, but drops the
    // keyboard request until the sheet's own window has taken focus.
    <BottomSheet visible={visible} onClose={close} onShow={() => setTimeout(() => nameRef.current?.focus(), 250)}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.lg, paddingBottom: spacing.sm }}>
        <AppText weight="bold" size="title">
          لوحة جديدة
        </AppText>

        <TextInput
          ref={nameRef}
          value={name}
          onChangeText={setName}
          // The return key creates a personal board, as the board's quick-add does;
          // a shared one still needs its scope.
          onSubmitEditing={create}
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          placeholder="اسم اللوحة"
          placeholderTextColor={colors.muted}
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

        <KindChoice value={kind} onChange={setKind} approver={approver} />

        {shared ? (
          <>
            <ScopeField value={scope} onChange={setScope} />
            <SimilarBoards name={name} />
          </>
        ) : null}

        <CategoryField value={categoryId} onChange={setCategoryId} />

        <Pressable
          accessibilityRole="button"
          onPress={() => setPickingDueDate(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            minHeight: MIN_TOUCH_TARGET,
            borderBottomWidth: 1,
            borderBottomColor: colors.line,
          }}
        >
          <AppText size="small" color={colors.muted}>
            موعد التسليم
          </AppText>
          <AppText size="small" weight="semibold">
            {dueDate ? formatDueDate(dueDate) : "بلا موعد"}
          </AppText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={!canCreate}
          onPress={create}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            borderRadius: radii.field,
            backgroundColor: canCreate ? colors.accent : colors.line,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AppText weight="semibold" color={canCreate ? colors.surface : colors.muted}>
            {creating ? "جارٍ الإنشاء..." : shared && !approver ? "إنشاء اللوحة وإرسال الطلب" : "إنشاء اللوحة"}
          </AppText>
        </Pressable>
      </View>

      <DueDateSheet visible={pickingDueDate} onClose={() => setPickingDueDate(false)} onChange={setDueDate} value={dueDate} />
    </BottomSheet>
  );
}

export interface NewBoardInput {
  name: string;
  kind: BoardKind;
  /** The scope; only a shared board asks for one. */
  description: string | null;
  dueDate: string | null;
  categoryId: string | null;
}
