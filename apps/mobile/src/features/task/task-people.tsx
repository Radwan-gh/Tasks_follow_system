import { useMemo, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { BoardMember } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { matchesUser } from "@/lib/match-users";
import { t, taskFonts } from "@/theme/task-tokens";
import { fs } from "@/theme/tokens";
import { CloseButton, IconBox, SheetTitle, TAvatar, TCard, TText } from "./task-ui";

const ROLE_LABELS: Record<BoardMember["role"], string> = {
  OWNER: "مالك اللوحة",
  MEMBER: "عضو",
  VIEWER: "مشاهد",
};

function shortName(member: BoardMember, meId: string | undefined): string {
  return member.userId === meId ? "أنت" : member.user.firstName || member.user.displayName;
}

/** Members matching `term`, «أنت» first, deactivated people only while still picked. */
function filterPeople(members: BoardMember[], term: string, selected: ReadonlySet<string>, meId: string | undefined) {
  const q = term.trim();
  return members
    .filter((m) => (m.user.isActive || selected.has(m.userId)) && (!q || matchesUser(m.user, q)))
    .sort((a, b) => (a.userId === meId ? -1 : b.userId === meId ? 1 : a.user.displayName.localeCompare(b.user.displayName, "ar")));
}

/** One person to tick: avatar, name, role, and a round tick. */
function PersonOption({ member, meId, checked, onPress }: { member: BoardMember; meId: string | undefined; checked: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={member.user.displayName}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 52,
        paddingHorizontal: 10,
        borderRadius: 10,
        backgroundColor: pressed ? t.canvas : "transparent",
      })}
    >
      <TAvatar person={member} size={32} />
      <View style={{ flex: 1 }}>
        <TText size={14} weight="semibold">
          {member.userId === meId ? `${member.user.displayName} (أنت)` : member.user.displayName}
        </TText>
        <TText size={12} color={member.user.isActive ? t.muted : t.danger}>
          {member.user.isActive ? ROLE_LABELS[member.role] : "معطَّل"}
        </TText>
      </View>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          borderWidth: 1.5,
          borderColor: checked ? t.accent : t.idle,
          backgroundColor: checked ? t.accent : t.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? <Ionicons name="checkmark" size={13} color={t.surface} /> : null}
      </View>
    </Pressable>
  );
}

/**
 * The assignees card (`Edit Task Prototype.dc.html`): the person icon, a chip
 * per assignee with ✕, and «+». «+» turns the row into a search field and
 * drops a list of the board's people under the card; ⏎ adds the first match,
 * ⌫ on an empty field takes the last one off, «تم» closes. Every change
 * saves at once (the caller's `useAutoSavedIds`). The prototype's «دعوة عبر
 * الرابط» is left out: accounts are created by an admin only.
 */
export function AssigneesCard({
  members,
  lookup = members,
  selectedIds,
  onChange,
  meId,
  canEdit,
  failed,
}: {
  members: BoardMember[];
  lookup?: BoardMember[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  meId: string | undefined;
  canEdit: boolean;
  failed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const inputRef = useRef<TextInput>(null);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const people = useMemo(() => filterPeople(members, term, selected, meId), [members, term, selected, meId]);
  const chosen = selectedIds.map((id) => lookup.find((m) => m.userId === id)).filter((m): m is BoardMember => !!m);

  function toggle(userId: string) {
    onChange(selected.has(userId) ? selectedIds.filter((id) => id !== userId) : [...selectedIds, userId]);
  }

  function close() {
    setOpen(false);
    setTerm("");
  }

  return (
    <View>
      <TCard>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 8, paddingHorizontal: 14 }}>
          <IconBox icon="person-outline" />
          <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
            {chosen.length === 0 && !canEdit ? (
              <TText size={13} color={t.muted}>
                لا يوجد مسؤولون
              </TText>
            ) : null}
            {chosen.map((member) => (
              <View
                key={member.userId}
                style={{ flexDirection: "row", alignItems: "center", gap: 7, height: 32, paddingStart: 4, paddingEnd: canEdit ? 4 : 10, borderRadius: 999, backgroundColor: t.canvas }}
              >
                <TAvatar person={member} size={24} />
                <TText size={13} weight="semibold">
                  {shortName(member, meId)}
                </TText>
                {canEdit ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`إزالة ${member.user.displayName}`}
                    hitSlop={6}
                    onPress={() => toggle(member.userId)}
                    style={{ width: 22, height: 22, alignItems: "center", justifyContent: "center" }}
                  >
                    <Ionicons name="close" size={13} color={t.muted} />
                  </Pressable>
                ) : null}
              </View>
            ))}
            {canEdit && !open ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="إضافة مسؤول"
                onPress={() => setOpen(true)}
                style={{ width: 32, height: 32, borderRadius: 999, borderWidth: 1, borderColor: t.lineStrong, alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="add" size={17} color={t.ink} />
              </Pressable>
            ) : null}
            {open ? (
              <>
                <TextInput
                  ref={inputRef}
                  autoFocus
                  value={term}
                  onChangeText={setTerm}
                  placeholder="اكتب اسمًا…"
                  placeholderTextColor={t.faint}
                  autoCorrect={false}
                  returnKeyType="done"
                  submitBehavior="submit"
                  onSubmitEditing={() => {
                    const first = people[0];
                    if (first && !selected.has(first.userId)) onChange([...selectedIds, first.userId]);
                    setTerm("");
                  }}
                  onKeyPress={(e) => {
                    if (e.nativeEvent.key === "Backspace" && !term && selectedIds.length > 0) onChange(selectedIds.slice(0, -1));
                  }}
                  style={{ flex: 1, minWidth: 90, height: 32, padding: 0, paddingHorizontal: 4, fontFamily: taskFonts.regular, fontSize: fs(14), color: t.ink, textAlign: "right", writingDirection: "rtl" }}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="إغلاق البحث"
                  onPress={close}
                  style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: t.chipStrong, alignItems: "center", justifyContent: "center" }}
                >
                  <Ionicons name="close" size={14} color={t.ink} />
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
        {failed ? (
          <TText size={12} color={t.danger} style={{ paddingHorizontal: 14, paddingBottom: 8 }}>
            تعذّر حفظ المسؤولين — أُعيدت القائمة كما كانت.
          </TText>
        ) : null}
      </TCard>

      {open ? (
        <View
          style={{
            marginTop: 6,
            backgroundColor: t.surface,
            borderWidth: 1,
            borderColor: t.lineStrong,
            borderRadius: 14,
            padding: 6,
            shadowColor: t.ink,
            shadowOpacity: 0.18,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 12 },
            elevation: 6,
          }}
        >
          {people.map((member) => (
            <PersonOption key={member.userId} member={member} meId={meId} checked={selected.has(member.userId)} onPress={() => toggle(member.userId)} />
          ))}
          {people.length === 0 ? (
            <TText size={13} color={t.muted} style={{ padding: 12 }}>
              لا يوجد عضو بهذا الاسم في اللوحة.
            </TText>
          ) : null}
          <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingTop: 6, paddingHorizontal: 4, paddingBottom: 2, marginTop: 4, borderTopWidth: 1, borderTopColor: t.hairline }}>
            <Pressable accessibilityRole="button" onPress={close} style={{ backgroundColor: t.ink, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16 }}>
              <TText size={13} weight="semibold" color={t.surface}>
                تم
              </TText>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** The same people list in a sheet — whom a subtask is assigned to. */
export function PeopleSheet({
  visible,
  onClose,
  title,
  members,
  selectedIds,
  onChange,
  meId,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  members: BoardMember[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  meId: string | undefined;
}) {
  const selected = new Set(selectedIds);
  const people = filterPeople(members, "", selected, meId);
  return (
    <BottomSheet visible={visible} onClose={onClose} look="task">
      <View style={{ paddingHorizontal: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <SheetTitle>{title}</SheetTitle>
          </View>
          <CloseButton onPress={onClose} accessibilityLabel="إغلاق" />
        </View>
        {people.map((member) => (
          <PersonOption
            key={member.userId}
            member={member}
            meId={meId}
            checked={selected.has(member.userId)}
            onPress={() => onChange(selected.has(member.userId) ? selectedIds.filter((id) => id !== member.userId) : [...selectedIds, member.userId])}
          />
        ))}
      </View>
    </BottomSheet>
  );
}
