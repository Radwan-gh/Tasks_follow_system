import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { formatHijri } from "@/lib/hijri";
import { MIN_TOUCH_TARGET, colors, radii, spacing } from "@/theme/tokens";

/** Saturday first — the working week here starts on Saturday. */
const WEEKDAYS = ["س", "ح", "ن", "ث", "ر", "خ", "ج"];
const WEEKDAY_NAMES = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
const monthTitle = new Intl.DateTimeFormat("ar", { month: "long", year: "numeric" });
const fullDate = new Intl.DateTimeFormat("ar", { day: "numeric", month: "long", year: "numeric" });

/**
 * The due-date picker behind every deadline in the app: task detail, add-task,
 * the new-board sheet and board settings. Quick picks for the common cases on
 * top, and a month calendar for any other day — built here rather than with a
 * native date-picker module, because a new native module cannot reach phones
 * through an OTA update (the JS would call into a module the installed APK
 * does not have). Picking a day, like a quick pick, sets it and closes.
 *
 * Dates are stored at local noon, as before: a deadline is a *day*, and noon
 * keeps that day the same in every nearby time zone.
 */
export function DueDateSheet({
  visible,
  onClose,
  onChange,
  value,
}: {
  visible: boolean;
  onClose: () => void;
  onChange: (iso: string | null) => void;
  /** The current deadline, highlighted in the calendar and opened on its month. */
  value?: string | null;
}) {
  const selected = value ? new Date(value) : null;
  const [month, setMonth] = useState(() => startOfMonth(selected ?? new Date()));

  // Every opening starts on the current deadline's month, or this month.
  useEffect(() => {
    if (visible) setMonth(startOfMonth(value ? new Date(value) : new Date()));
  }, [visible, value]);

  function pick(iso: string | null) {
    onChange(iso);
    onClose();
  }

  const quickPicks: { label: string; days: number }[] = [
    { label: "اليوم", days: 0 },
    { label: "غدًا", days: 1 },
    { label: "بعد 3 أيام", days: 3 },
    { label: "الأسبوع القادم", days: 7 },
  ];

  const today = new Date();
  const cells = monthCells(month);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.sm }}>
        <AppText weight="bold" size="title">
          موعد التسليم
        </AppText>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {quickPicks.map((option) => (
            <Pressable
              key={option.label}
              accessibilityRole="button"
              onPress={() => pick(atNoonInDays(option.days))}
              style={{
                minHeight: 36,
                justifyContent: "center",
                paddingHorizontal: spacing.md,
                borderRadius: radii.chip,
                borderWidth: 1,
                borderColor: colors.line,
              }}
            >
              <AppText size="small">{option.label}</AppText>
            </Pressable>
          ))}
        </View>

        <View style={{ gap: spacing.xs }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {/* Start side (right in RTL) goes back, end side goes forward. */}
            <MonthArrow icon="chevron-forward" label="الشهر السابق" onPress={() => setMonth(addMonths(month, -1))} />
            <AppText weight="semibold" style={{ flex: 1, textAlign: "center" }}>
              {monthTitle.format(month)}
            </AppText>
            <MonthArrow icon="chevron-back" label="الشهر التالي" onPress={() => setMonth(addMonths(month, 1))} />
          </View>

          <View style={{ flexDirection: "row" }}>
            {WEEKDAYS.map((day, index) => (
              <AppText
                key={day}
                size="caption"
                color={colors.muted}
                accessibilityLabel={WEEKDAY_NAMES[index]}
                style={{ flex: 1, textAlign: "center" }}
              >
                {day}
              </AppText>
            ))}
          </View>

          {chunk(cells, 7).map((week, row) => (
            <View key={row} style={{ flexDirection: "row" }}>
              {week.map((date, col) => {
                if (!date) return <View key={col} style={{ flex: 1 }} />;
                const isSelected = !!selected && sameDay(date, selected);
                const isToday = sameDay(date, today);
                const isPast = date < startOfDay(today);
                return (
                  <Pressable
                    key={col}
                    accessibilityRole="button"
                    accessibilityLabel={fullDate.format(date)}
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => pick(atNoon(date))}
                    style={{ flex: 1, alignItems: "center", justifyContent: "center", minHeight: MIN_TOUCH_TARGET }}
                  >
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 999,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: isSelected ? colors.accent : "transparent",
                        borderWidth: isToday && !isSelected ? 1.5 : 0,
                        borderColor: colors.accent,
                      }}
                    >
                      <AppText
                        size="small"
                        weight={isSelected || isToday ? "semibold" : "regular"}
                        color={isSelected ? colors.surface : isToday ? colors.accent : isPast ? colors.muted : colors.ink}
                      >
                        {date.getDate()}
                      </AppText>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        {selected ? (
          <AppText size="caption" color={colors.muted} style={{ textAlign: "center" }}>
            {fullDate.format(selected)} · الموافق {formatHijri(selected)}
          </AppText>
        ) : null}

        {value ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => pick(null)}
            style={{
              minHeight: MIN_TOUCH_TARGET,
              justifyContent: "center",
              alignItems: "center",
              borderRadius: radii.field,
              backgroundColor: colors.alertSoft,
            }}
          >
            <AppText color={colors.alert} weight="semibold">
              إزالة الموعد
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </BottomSheet>
  );
}

function MonthArrow({
  icon,
  label,
  onPress,
}: {
  icon: "chevron-forward" | "chevron-back";
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}
    >
      <Ionicons name={icon} size={20} color={colors.muted} />
    </Pressable>
  );
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** The month's days, padded with `null` before the 1st so it lands in its weekday column, and after the last day to fill the week. */
function monthCells(month: Date): (Date | null)[] {
  const leading = (month.getDay() + 1) % 7; // getDay(): Sunday 0 … Saturday 6 → Saturday-first column
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= days; day++) cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

function atNoon(date: Date): string {
  const noon = new Date(date);
  noon.setHours(12, 0, 0, 0);
  return noon.toISOString();
}

function atNoonInDays(n: number): string {
  const date = new Date();
  date.setDate(date.getDate() + n);
  return atNoon(date);
}
