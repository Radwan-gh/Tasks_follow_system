import { useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { BoardMember } from "@app/types";
import { AppText } from "@/components/text";
import { api } from "@/lib/api";
import { topMatches } from "@/lib/match-users";
import { activeMention, replaceRange, type Selection } from "@/lib/rich-text";
import { MIN_TOUCH_TARGET, colors, fonts, radii, spacing } from "@/theme/tokens";
import { commentsKey } from "./activity-timeline";
import { MemberAvatar } from "./task-fields";

/**
 * 6b/6d's comment field, fixed to the bottom of the task screen: a pill
 * input and a round ↑. Typing «@» and a few letters suggests the task's
 * people above the field; picking one writes «@الاسم» into the comment, which
 * the timeline then highlights. A comment that fails to send stays in the
 * field with «لم يُرسل — إعادة المحاولة».
 */
export function CommentComposer({ cardId, members }: { cardId: string; members: BoardMember[] }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const [forcedSelection, setForcedSelection] = useState<Selection | undefined>(undefined);

  const post = useMutation({
    mutationFn: (body: string) => api.comments.create(cardId, { body }),
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: commentsKey(cardId) });
    },
  });

  const mention = selection.start === selection.end ? activeMention(draft, selection.start) : null;
  const suggestions = useMemo(() => (mention ? topMatches(members, mention.query, new Set()) : []), [members, mention]);
  const canSend = draft.trim().length > 0 && !post.isPending;

  return (
    <View style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line }}>
      {post.isError ? (
        <Pressable accessibilityRole="button" onPress={() => post.mutate(draft.trim())} style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
          <AppText size="caption" weight="semibold" color={colors.alert}>
            لم يُرسل — إعادة المحاولة
          </AppText>
        </Pressable>
      ) : null}

      {suggestions.length > 0 && mention ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
          {suggestions.map((member) => (
            <Pressable
              key={member.userId}
              accessibilityRole="button"
              accessibilityLabel={`الإشارة إلى ${member.user.displayName}`}
              onPress={() => {
                const edit = replaceRange(draft, { start: mention.start, end: selection.start }, `@${member.user.displayName} `);
                setDraft(edit.text);
                setSelection(edit.selection);
                setForcedSelection(edit.selection);
              }}
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

      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, paddingTop: 10, paddingBottom: 10, paddingHorizontal: spacing.lg }}>
        <TextInput
          value={draft}
          onChangeText={(text) => {
            setDraft(text);
            if (post.isError) post.reset();
          }}
          selection={forcedSelection}
          onSelectionChange={(event) => {
            setSelection(event.nativeEvent.selection);
            setForcedSelection(undefined);
          }}
          multiline
          placeholder="اكتب تعليقًا، و@ للإشارة إلى عضو"
          placeholderTextColor={colors.faint}
          accessibilityLabel="اكتب تعليقًا"
          style={{
            flex: 1,
            minHeight: MIN_TOUCH_TARGET,
            maxHeight: 120,
            borderRadius: 22,
            backgroundColor: colors.chip,
            paddingHorizontal: spacing.lg,
            paddingVertical: 10,
            fontFamily: fonts.regular,
            fontSize: 13,
            lineHeight: 22,
            color: colors.ink,
            textAlign: "right",
            writingDirection: "rtl",
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="إرسال التعليق"
          disabled={!canSend}
          onPress={() => post.mutate(draft.trim())}
          style={{
            width: MIN_TOUCH_TARGET,
            height: MIN_TOUCH_TARGET,
            borderRadius: 999,
            backgroundColor: canSend ? colors.accent : colors.accentSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="arrow-up" size={20} color={canSend ? colors.surface : colors.accent} />
        </Pressable>
      </View>
    </View>
  );
}
