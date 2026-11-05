import { useState } from "react";
import { Pressable, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { CardPriority, List } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { DueDateSheet } from "@/components/due-date-sheet";
import { daysFromToday, formatDayMonth, noonInDays } from "@/lib/task-format";
import { t, taskPriorityColors, taskStatusColors } from "@/theme/task-tokens";
import { SheetOption, SheetTitle, TText } from "./task-ui";

/**
 * The task screen's bottom sheets (`Edit Task Prototype.dc.html`): «الحالة»,
 * «الأولوية» and «الموعد» list their choices with a ✓ on the current one and
 * close on a pick; «إرفاق ملف» is a phone-style action sheet.
 */

/** The prototype's priority words. `NORMAL` is "no priority". */
export const TASK_PRIORITY_LABELS: Record<CardPriority, string> = {
  URGENT: "عاجلة",
  HIGH: "عالية",
  MEDIUM: "متوسطة",
  LOW: "منخفضة",
  NORMAL: "بدون أولوية",
};

const PRIORITY_ORDER: CardPriority[] = ["URGENT", "HIGH", "MEDIUM", "LOW", "NORMAL"];

export function StatusSheet({
  visible,
  onClose,
  lists,
  currentListId,
  canCloseCard,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  lists: List[];
  currentListId: string;
  /** §3b-4: only the board owner or the task's assignees may move it into «انتهى». */
  canCloseCard: boolean;
  onPick: (listId: string) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} look="task">
      <View style={{ paddingHorizontal: 8 }}>
        <SheetTitle>الحالة</SheetTitle>
        {lists.map((list) => {
          const current = list.id === currentListId;
          const blocked = list.statusCategory === "CLOSED" && !current && !canCloseCard;
          return (
            <View key={list.id}>
              <SheetOption
                selected={current}
                disabled={blocked}
                accessibilityLabel={list.name}
                onPress={() => (current ? onClose() : onPick(list.id))}
              >
                <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: taskStatusColors[list.statusCategory ?? "UNCATEGORIZED"].dot }} />
                <TText size={15} weight="medium" style={{ flex: 1 }}>
                  {list.name}
                </TText>
              </SheetOption>
              {blocked ? (
                <TText size={12} color={t.muted} style={{ paddingHorizontal: 34, marginTop: -8, paddingBottom: 6 }}>
                  ينقلها إلى «{list.name}» مالك اللوحة أو المسؤول عنها
                </TText>
              ) : null}
            </View>
          );
        })}
      </View>
    </BottomSheet>
  );
}

export function TaskPrioritySheet({
  visible,
  onClose,
  value,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  value: CardPriority;
  onPick: (priority: CardPriority) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} look="task">
      <View style={{ paddingHorizontal: 8 }}>
        <SheetTitle>الأولوية</SheetTitle>
        {PRIORITY_ORDER.map((priority) => {
          const swatch = taskPriorityColors[priority];
          return (
            <SheetOption
              key={priority}
              selected={priority === value}
              accessibilityLabel={TASK_PRIORITY_LABELS[priority]}
              onPress={() => onPick(priority)}
            >
              <Ionicons name={swatch ? "flag" : "flag-outline"} size={16} color={swatch?.dot ?? t.dim} />
              <TText size={15} weight="medium" style={{ flex: 1 }}>
                {TASK_PRIORITY_LABELS[priority]}
              </TText>
            </SheetOption>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const QUICK_DUE = [
  { label: "اليوم", days: 0 },
  { label: "غدًا", days: 1 },
  { label: "الأسبوع القادم", days: 7 },
];

/**
 * «الموعد»: today, tomorrow, next week — each with its date — then «تاريخ…»
 * for any other day and «بدون موعد». The prototype's «تاريخ…» is a browser
 * date field; the app has no native date picker (a new native module can't
 * ship over OTA), so it opens the app's own calendar sheet.
 */
export function TaskDueSheet({
  visible,
  onClose,
  value,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  value: string | null;
  onPick: (iso: string | null) => void;
}) {
  const [calendar, setCalendar] = useState(false);
  const quickDays = value ? daysFromToday(value) : null;
  const isQuick = QUICK_DUE.some((q) => q.days === quickDays);

  return (
    <>
      <BottomSheet visible={visible && !calendar} onClose={onClose} look="task">
        <View style={{ paddingHorizontal: 8 }}>
          <SheetTitle>الموعد</SheetTitle>
          {QUICK_DUE.map((q) => {
            const iso = noonInDays(q.days);
            return (
              <SheetOption key={q.label} selected={quickDays === q.days} accessibilityLabel={q.label} onPress={() => onPick(iso)}>
                <TText size={15} weight="medium" style={{ flex: 1 }}>
                  {q.label}
                </TText>
                <TText size={13} color={t.muted}>
                  {formatDayMonth(iso)}
                </TText>
              </SheetOption>
            );
          })}
          <SheetOption selected={!!value && !isQuick} accessibilityLabel="تاريخ آخر" onPress={() => setCalendar(true)}>
            <TText size={15} weight="medium" style={{ flex: 1 }}>
              تاريخ…
            </TText>
            {value && !isQuick ? (
              <TText size={13} color={t.muted}>
                {formatDayMonth(value)}
              </TText>
            ) : null}
          </SheetOption>
          <SheetOption selected={!value} accessibilityLabel="بدون موعد" onPress={() => onPick(null)}>
            <TText size={15} weight="medium" style={{ flex: 1 }}>
              بدون موعد
            </TText>
          </SheetOption>
        </View>
      </BottomSheet>
      <DueDateSheet
        visible={visible && calendar}
        onClose={() => {
          setCalendar(false);
          onClose();
        }}
        value={value}
        onChange={(iso) => {
          setCalendar(false);
          onPick(iso);
        }}
      />
    </>
  );
}

/** «إرفاق ملف»: مكتبة الصور · التقاط صورة · اختيار ملف, and «إلغاء» on its own. */
export function AttachActionSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (source: "library" | "camera" | "file") => void;
}) {
  const options: { source: "library" | "camera" | "file"; label: string }[] = [
    { source: "library", label: "مكتبة الصور" },
    { source: "camera", label: "التقاط صورة" },
    { source: "file", label: "اختيار ملف" },
  ];
  return (
    <BottomSheet visible={visible} onClose={onClose} look="action">
      <View style={{ paddingHorizontal: 10, gap: 8 }}>
        <View style={{ backgroundColor: t.surface, borderRadius: 16, overflow: "hidden" }}>
          {options.map((option, i) => (
            <Pressable
              key={option.source}
              accessibilityRole="button"
              onPress={() => onPick(option.source)}
              style={({ pressed }) => ({
                minHeight: 56,
                alignItems: "center",
                justifyContent: "center",
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: t.hairline,
                backgroundColor: pressed ? t.canvas : t.surface,
              })}
            >
              <TText size={16} color={t.accent}>
                {option.label}
              </TText>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={{ minHeight: 56, borderRadius: 16, backgroundColor: t.surface, alignItems: "center", justifyContent: "center" }}
        >
          <TText size={16} weight="semibold" color={t.accent}>
            إلغاء
          </TText>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
