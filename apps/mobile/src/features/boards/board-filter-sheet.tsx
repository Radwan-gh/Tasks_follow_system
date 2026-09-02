import { Pressable, View } from "react-native";
import type { BoardMember, CardPriority } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { priorityLabel } from "@/components/priority-control";
import { MIN_TOUCH_TARGET, colors, radii, spacing } from "@/theme/tokens";

export interface BoardFilter {
  myTasksOnly: boolean;
  memberIds: string[];
  priorities: CardPriority[];
}

export const EMPTY_BOARD_FILTER: BoardFilter = { myTasksOnly: false, memberIds: [], priorities: [] };

export function isFilterActive(filter: BoardFilter): boolean {
  return filter.myTasksOnly || filter.memberIds.length > 0 || filter.priorities.length > 0;
}

const PRIORITIES: CardPriority[] = ["LOW", "NORMAL", "URGENT"];

/**
 * "ترشيح" sheet (`design-prompt-group-3.md` §3b-2): مهامي فقط · حسب العضو
 * (اختيار متعدد) · حسب الأولوية. Applied live by the caller — this sheet only
 * edits a draft `BoardFilter` and hands it back on "تطبيق".
 */
export function BoardFilterSheet({
  visible,
  onClose,
  value,
  onChange,
  members,
}: {
  visible: boolean;
  onClose: () => void;
  value: BoardFilter;
  onChange: (next: BoardFilter) => void;
  members: BoardMember[];
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.lg, paddingBottom: spacing.md }}>
        <AppText weight="bold" size="title">
          ترشيح
        </AppText>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: value.myTasksOnly }}
          onPress={() => onChange({ ...value, myTasksOnly: !value.myTasksOnly })}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: MIN_TOUCH_TARGET }}
        >
          <AppText weight="semibold">مهامي فقط</AppText>
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              backgroundColor: value.myTasksOnly ? colors.accent : "transparent",
              borderWidth: value.myTasksOnly ? 0 : 1.5,
              borderColor: colors.line,
            }}
          />
        </Pressable>

        <View style={{ gap: spacing.sm }}>
          <AppText size="caption" weight="semibold" color={colors.muted}>
            حسب العضو
          </AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {members.map((member) => {
              const active = value.memberIds.includes(member.userId);
              return (
                <Pressable
                  key={member.userId}
                  accessibilityRole="button"
                  onPress={() =>
                    onChange({
                      ...value,
                      memberIds: active
                        ? value.memberIds.filter((id) => id !== member.userId)
                        : [...value.memberIds, member.userId],
                    })
                  }
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    borderRadius: radii.chip,
                    backgroundColor: active ? colors.accent : colors.canvas,
                    borderWidth: 1,
                    borderColor: active ? colors.accent : colors.line,
                  }}
                >
                  <AppText size="small" weight="semibold" color={active ? colors.surface : colors.ink}>
                    {member.user.displayName}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: spacing.sm }}>
          <AppText size="caption" weight="semibold" color={colors.muted}>
            حسب الأولوية
          </AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {PRIORITIES.map((priority) => {
              const active = value.priorities.includes(priority);
              return (
                <Pressable
                  key={priority}
                  accessibilityRole="button"
                  onPress={() =>
                    onChange({
                      ...value,
                      priorities: active
                        ? value.priorities.filter((p) => p !== priority)
                        : [...value.priorities, priority],
                    })
                  }
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    borderRadius: radii.chip,
                    backgroundColor: active ? colors.accent : colors.canvas,
                    borderWidth: 1,
                    borderColor: active ? colors.accent : colors.line,
                  }}
                >
                  <AppText size="small" weight="semibold" color={active ? colors.surface : colors.ink}>
                    {priorityLabel(priority)}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            borderRadius: radii.field,
            backgroundColor: colors.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AppText weight="semibold" color={colors.surface}>
            تطبيق
          </AppText>
        </Pressable>

        {isFilterActive(value) ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onChange(EMPTY_BOARD_FILTER)}
            style={{ minHeight: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}
          >
            <AppText weight="semibold" color={colors.alert}>
              مسح الترشيح
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </BottomSheet>
  );
}
