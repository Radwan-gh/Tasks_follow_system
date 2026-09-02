import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import type { RecurrenceRule } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { MIN_TOUCH_TARGET, colors, radii, spacing } from "@/theme/tokens";

const WEEKDAY_LABELS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

type Freq = "NONE" | RecurrenceRule["freq"];

/**
 * "التكرار" sheet (`design-prompt-group-3.md` §3a-3): بدون · يومي · أسبوعي
 * (أيام كرقائق) · شهري (يوم الشهر)، مع سطر ملخّص حي. Shared between the
 * add-task screen and card detail's recurrence chip.
 */
export function RecurrenceSheet({
  visible,
  onClose,
  value,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  value: RecurrenceRule | null;
  onChange: (rule: RecurrenceRule | null) => void;
}) {
  const [freq, setFreq] = useState<Freq>("NONE");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [dayOfMonth, setDayOfMonth] = useState(1);

  useEffect(() => {
    if (!visible) return;
    setFreq(value?.freq ?? "NONE");
    setWeekdays(value?.freq === "WEEKLY" ? value.weekdays : []);
    setDayOfMonth(value?.freq === "MONTHLY" ? value.dayOfMonth : 1);
  }, [visible, value]);

  function save() {
    if (freq === "NONE") {
      onChange(null);
    } else if (freq === "DAILY") {
      onChange({ freq: "DAILY" });
    } else if (freq === "WEEKLY") {
      if (weekdays.length === 0) return;
      onChange({ freq: "WEEKLY", weekdays: [...weekdays].sort() });
    } else {
      onChange({ freq: "MONTHLY", dayOfMonth });
    }
    onClose();
  }

  const canSave = freq !== "WEEKLY" || weekdays.length > 0;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.sm }}>
        <AppText weight="bold" size="title">
          التكرار
        </AppText>

        <View style={{ gap: spacing.sm }}>
          <FreqRow label="بدون" active={freq === "NONE"} onPress={() => setFreq("NONE")} />
          <FreqRow label="يومي" active={freq === "DAILY"} onPress={() => setFreq("DAILY")} />
          <FreqRow label="أسبوعي" active={freq === "WEEKLY"} onPress={() => setFreq("WEEKLY")} />
          <FreqRow label="شهري" active={freq === "MONTHLY"} onPress={() => setFreq("MONTHLY")} />
        </View>

        {freq === "WEEKLY" ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {WEEKDAY_LABELS.map((label, index) => {
              const active = weekdays.includes(index);
              return (
                <Pressable
                  key={index}
                  accessibilityRole="button"
                  onPress={() =>
                    setWeekdays((prev) => (active ? prev.filter((d) => d !== index) : [...prev, index]))
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
                    {label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {freq === "MONTHLY" ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                const active = day === dayOfMonth;
                return (
                  <Pressable
                    key={day}
                    accessibilityRole="button"
                    onPress={() => setDayOfMonth(day)}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 999,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: active ? colors.accent : colors.canvas,
                      borderWidth: 1,
                      borderColor: active ? colors.accent : colors.line,
                    }}
                  >
                    <AppText size="small" weight="semibold" color={active ? colors.surface : colors.ink}>
                      {day}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        ) : null}

        {freq !== "NONE" ? (
          <AppText size="small" color={colors.muted}>
            {summarize(freq, weekdays, dayOfMonth)}
          </AppText>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={!canSave}
          onPress={save}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            borderRadius: radii.field,
            backgroundColor: canSave ? colors.accent : colors.line,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AppText weight="semibold" color={canSave ? colors.surface : colors.muted}>
            حفظ
          </AppText>
        </Pressable>

        {value ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onChange(null);
              onClose();
            }}
            style={{ minHeight: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}
          >
            <AppText weight="semibold" color={colors.alert}>
              إيقاف التكرار
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </BottomSheet>
  );
}

function FreqRow({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={{
        minHeight: MIN_TOUCH_TARGET,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderRadius: radii.field,
        borderWidth: 1,
        borderColor: active ? colors.accent : colors.line,
        backgroundColor: active ? colors.accentSoft : colors.surface,
        paddingHorizontal: spacing.lg,
      }}
    >
      <AppText weight={active ? "semibold" : "regular"}>{label}</AppText>
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 999,
          borderWidth: 1.5,
          borderColor: active ? colors.accent : colors.line,
          backgroundColor: active ? colors.accent : "transparent",
        }}
      />
    </Pressable>
  );
}

/** "تتكرر كل أحد" style live summary line, shown while a repeat rule is selected. */
export function summarizeRecurrence(rule: RecurrenceRule | null): string | null {
  if (!rule) return null;
  if (rule.freq === "DAILY") return "تتكرر يوميًا";
  if (rule.freq === "WEEKLY") return summarize("WEEKLY", rule.weekdays, 1);
  return summarize("MONTHLY", [], rule.dayOfMonth);
}

function summarize(freq: Freq, weekdays: number[], dayOfMonth: number): string {
  if (freq === "DAILY") return "تتكرر يوميًا";
  if (freq === "WEEKLY") {
    if (weekdays.length === 0) return "اختر يومًا واحدًا على الأقل";
    return `تتكرر كل ${weekdays
      .map((d) => WEEKDAY_LABELS[d])
      .join("، ")}`;
  }
  if (freq === "MONTHLY") return `تتكرر شهريًا في اليوم ${dayOfMonth}`;
  return "";
}
