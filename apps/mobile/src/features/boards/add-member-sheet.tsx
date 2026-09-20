import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { BoardMemberCandidate, BoardRole } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { useAuth } from "@/features/auth/auth-context";
import { api } from "@/lib/api";
import { avatarColorFor } from "@/lib/avatar";
import { initials } from "@/lib/initials";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/** Long enough that the owner is still typing a name, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 250;

type AddableRole = Exclude<BoardRole, "OWNER">;

/**
 * «إضافة عضو» — search the user directory instead of typing an exact username.
 * Backed by `GET /boards/:id/member-candidates` (owner-only, already-members
 * filtered out server-side), so every row shown is one tap from being added.
 * Opens with the first candidates already listed: an empty search is a valid
 * query, so the owner never faces a blank box with nothing to pick.
 */
export function AddMemberSheet({
  visible,
  onClose,
  boardId,
  adding,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  boardId: string;
  adding: boolean;
  onPick: (user: BoardMemberCandidate, role: AddableRole) => void;
}) {
  // Named to avoid shadowing the `user` each result row is mapped over.
  const { user: currentUser } = useAuth();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [role, setRole] = useState<AddableRole>("MEMBER");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // Start each visit from a clean search, not the previous one's leftovers.
  useEffect(() => {
    if (!visible) {
      setSearch("");
      setDebounced("");
    }
  }, [visible]);

  const candidates = useQuery({
    queryKey: ["member-candidates", boardId, debounced],
    queryFn: () => api.boards.memberCandidates(boardId, { search: debounced || undefined }),
    enabled: visible,
    placeholderData: (previous) => previous,
  });

  const users = candidates.data?.users ?? [];

  return (
    // `scrollable={false}`: the results list below is the scroller.
    <BottomSheet visible={visible} onClose={onClose} scrollable={false}>
      {/* Shrinks to the sheet's max height so the list below can claim the rest. */}
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md, flexShrink: 1 }}>
        <View style={{ gap: spacing.xs }}>
          <AppText weight="bold" size="title">
            إضافة عضو
          </AppText>
          <AppText size="small" color={colors.muted}>
            ابحث بالاسم أو اسم المستخدم، ثم اختر الشخص لإضافته.
          </AppText>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="ابحث بالاسم أو اسم المستخدم"
          placeholderTextColor={colors.muted}
          accessibilityLabel="ابحث عن مستخدم لإضافته"
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

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {(["MEMBER", "VIEWER"] as const).map((option) => {
            const isSelected = role === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                onPress={() => setRole(option)}
                style={{
                  flex: 1,
                  minHeight: MIN_TOUCH_TARGET,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: radii.field,
                  borderWidth: 1,
                  borderColor: isSelected ? colors.accent : colors.line,
                  backgroundColor: isSelected ? colors.accentSoft : colors.surface,
                }}
              >
                <AppText size="small" weight={isSelected ? "semibold" : "regular"}>
                  {option === "MEMBER" ? "عضو (يعدّل)" : "مشاهد (قراءة فقط)"}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {candidates.isPending ? (
          <View style={{ paddingVertical: spacing.xl, alignItems: "center" }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : users.length === 0 ? (
          <View style={{ paddingVertical: spacing.md, gap: spacing.xs }}>
            <AppText size="small" color={colors.muted}>
              {debounced
                ? `لا يوجد مستخدم يطابق «${debounced}» ويمكن إضافته.`
                : "كل المستخدمين أعضاء في هذه اللوحة بالفعل."}
            </AppText>
            {/* Only an admin can act on this, so only an admin is told about it. */}
            {debounced && currentUser?.role === "ADMIN" ? (
              <AppText size="caption" color={colors.muted}>
                إن لم يكن له حساب بعد، أنشئه من «حسابي ← المستخدمون والصلاحيات».
              </AppText>
            ) : null}
          </View>
        ) : (
          <ScrollView
            // No fixed cap: the only shrinkable child of the sheet, so the list
            // takes every pixel the header, search, roles and close button leave
            // — and gives it back when the keyboard pushes them up.
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ gap: spacing.sm }}
            keyboardShouldPersistTaps="handled"
          >
            {users.map((user) => {
              const palette = avatarColorFor(user.id);
              return (
                <Pressable
                  key={user.id}
                  accessibilityRole="button"
                  accessibilityLabel={`إضافة ${user.displayName}`}
                  disabled={adding}
                  onPress={() => onPick(user, role)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.md,
                    minHeight: MIN_TOUCH_TARGET,
                    paddingHorizontal: spacing.md,
                    borderRadius: radii.card,
                    borderWidth: 1,
                    borderColor: colors.line,
                    backgroundColor: colors.surface,
                    opacity: adding ? 0.6 : 1,
                  }}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 999,
                      backgroundColor: palette.bg,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <AppText weight="bold" color={palette.fg} style={{ fontSize: 12 }}>
                      {initials(user.displayName)}
                    </AppText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText weight="semibold">{user.displayName}</AppText>
                    <AppText size="caption" color={colors.muted}>
                      {user.username}
                    </AppText>
                  </View>
                  {!user.isActive ? (
                    <View
                      style={{
                        borderRadius: radii.chip,
                        backgroundColor: colors.alertSoft,
                        paddingHorizontal: spacing.sm,
                        paddingVertical: 3,
                      }}
                    >
                      <AppText size="caption" weight="semibold" color={colors.alert}>
                        معطَّل
                      </AppText>
                    </View>
                  ) : (
                    <AppText size="small" weight="semibold" color={colors.accent}>
                      إضافة +
                    </AppText>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {candidates.data?.hasMore ? (
          <AppText size="caption" color={colors.muted}>
            تُعرض أوائل النتائج فقط — تابع الكتابة لتضييق البحث.
          </AppText>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            marginBottom: spacing.sm,
            borderRadius: radii.field,
            borderWidth: 1,
            borderColor: colors.line,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AppText color={colors.muted}>إغلاق</AppText>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
