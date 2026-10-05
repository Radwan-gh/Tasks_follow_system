import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ListStatusCategory } from "@app/types";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { MIN_TOUCH_TARGET, colors, radii, spacing, statusColors } from "@/theme/tokens";

/**
 * `/guide` — «دليل الاستخدام», reached from the account tab. Static end-user
 * help; every statement describes real behaviour, so it changes with the code:
 * the statuses follow `TASK_WORKFLOW_TEMPLATE`, "completed" follows
 * `COMPLETED_CATEGORIES` (DONE + CLOSED), and who may move a card into «انتهى»
 * follows `CardsService.update`. The web app has its own copy
 * (`apps/web/src/features/guide/GuidePage.tsx`) because some details differ
 * per platform — keep the two in step.
 */

interface StatusEntry {
  category: ListStatusCategory;
  name: string;
  meaning: string;
  moveWhen: string;
  /** Behaviour specific to this status, beyond what all completed statuses share. */
  notes?: string[];
}

const STATUSES: StatusEntry[] = [
  {
    category: "NEW",
    name: "جديد",
    meaning: "مهمة سُجّلت ولم تُجهَّز للعمل بعد.",
    moveWhen: "كل طلب أو فكرة جديدة تبدأ هنا، حتى لو كانت تفاصيلها ناقصة.",
  },
  {
    category: "READY",
    name: "جاهز للتنفيذ",
    meaning: "المهمة واضحة ويمكن البدء بها.",
    moveWhen: "عندما تكتمل تفاصيلها ويعرف المنفّذ ما المطلوب منه.",
  },
  {
    category: "IN_PROGRESS",
    name: "قيد التنفيذ",
    meaning: "هناك من يعمل على المهمة الآن.",
    moveWhen: "عند بدء العمل عليها فعليًا.",
  },
  {
    category: "DONE",
    name: "تم التنفيذ",
    meaning: "أُنجز العمل المطلوب.",
    moveWhen: "عند الانتهاء من التنفيذ، قبل التأكّد النهائي من النتيجة.",
    notes: [
      "تُحتسب المهمة منجَزة في التقارير من أول مرة تصل فيها إلى هذه الحالة. إعادتها إلى الخلف ثم نقلها إليها مجددًا لا يحسبها مرتين.",
    ],
  },
  {
    category: "CLOSED",
    name: "انتهى",
    meaning: "سُلّمت المهمة وتم التأكّد منها.",
    moveWhen: "بعد مراجعة النتيجة وتسليمها لصاحب الطلب.",
    notes: [
      "لا ينقل المهمة إلى هنا إلا مالك اللوحة أو المسؤولون عن المهمة نفسها.",
      "تعرض هذه الحالة المهام التي وصلت إليها خلال آخر 30 يومًا فقط. اضغط «عرض الأقدم» أسفلها لرؤية البقية.",
    ],
  },
];

const isCompleted = (s: StatusEntry) => s.category === "DONE" || s.category === "CLOSED";

export default function GuideScreen() {
  const router = useRouter();

  return (
    <Screen edges={{ top: true, bottom: true }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="رجوع"
          onPress={() => router.back()}
          style={{ minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: "flex-start", justifyContent: "center" }}
        >
          <Ionicons name="chevron-forward" size={22} color={colors.muted} />
        </Pressable>
        <AppText size="title" weight="bold">
          دليل الاستخدام
        </AppText>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl * 2 }}>
        <AppText size="heading" weight="bold" accessibilityRole="header">
          حالات المهام
        </AppText>
        <AppText style={{ marginTop: spacing.sm }}>
          تمرّ كل مهمة في اللوحة بخمس حالات، بالترتيب نفسه دائمًا. تظهر الحالات أعلى شاشة اللوحة: اضغط اسم الحالة
          أو اسحب أفقيًا للتنقّل بينها.
        </AppText>

        <WorkflowSummary />

        <View style={{ marginTop: spacing.xxl, gap: spacing.xl }}>
          {STATUSES.map((status) => (
            <StatusDetail key={status.category} status={status} />
          ))}
        </View>

        <CompletedNote />
        <HowToMove />

        <AppText size="small" color={colors.muted} style={{ marginTop: spacing.xxl }}>
          قد تجد في بعض اللوحات القديمة حالة إضافية مثل «بانتظار تقييم». المهام فيها تُعامَل كمهام لم تكتمل بعد.
        </AppText>
      </ScrollView>
    </Screen>
  );
}

/** The five statuses in board order; the completed pair is grouped because the app counts both as done. */
function WorkflowSummary() {
  return (
    <View
      style={{
        marginTop: spacing.xl,
        backgroundColor: colors.surface,
        borderRadius: radii.card,
        borderWidth: 1,
        borderColor: colors.line,
        padding: spacing.lg,
        gap: spacing.sm,
      }}
    >
      {STATUSES.filter((s) => !isCompleted(s)).map((status) => (
        <StatusPill key={status.category} status={status} />
      ))}
      <View
        style={{
          borderRadius: radii.field,
          borderWidth: 1,
          borderColor: colors.line,
          padding: spacing.sm,
          gap: spacing.sm,
        }}
      >
        {STATUSES.filter(isCompleted).map((status) => (
          <StatusPill key={status.category} status={status} />
        ))}
        <AppText size="caption" weight="semibold" color={colors.muted} style={{ paddingHorizontal: spacing.xs }}>
          تُحتسب مكتملة
        </AppText>
      </View>
    </View>
  );
}

function StatusDot({ category, size }: { category: ListStatusCategory; size: number }) {
  return <View style={{ width: size, height: size, borderRadius: radii.chip, backgroundColor: statusColors[category] }} />;
}

function StatusPill({ status }: { status: StatusEntry }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        backgroundColor: colors.canvas,
        borderRadius: radii.field,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <StatusDot category={status.category} size={10} />
      <AppText size="small" weight="semibold">
        {status.name}
      </AppText>
    </View>
  );
}

function StatusDetail({ status }: { status: StatusEntry }) {
  return (
    <View style={{ flexDirection: "row", gap: spacing.md }}>
      <View style={{ alignItems: "center", gap: spacing.sm, paddingTop: spacing.sm }}>
        <StatusDot category={status.category} size={12} />
        <View style={{ width: 1, flex: 1, backgroundColor: colors.line }} />
      </View>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <AppText size="title" weight="bold" accessibilityRole="header">
          {status.name}
        </AppText>
        <AppText>{status.meaning}</AppText>
        <AppText size="small">
          <AppText size="small" weight="semibold">
            متى أنقلها إلى هنا؟{" "}
          </AppText>
          {status.moveWhen}
        </AppText>
        {status.notes?.map((note) => (
          <AppText key={note} size="small">
            {note}
          </AppText>
        ))}
      </View>
    </View>
  );
}

function Bullet({ children }: { children: string }) {
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      <AppText size="small" color={colors.muted}>
        •
      </AppText>
      <AppText size="small" style={{ flex: 1 }}>
        {children}
      </AppText>
    </View>
  );
}

function CompletedNote() {
  return (
    <View
      style={{
        marginTop: spacing.xxl,
        backgroundColor: colors.surface,
        borderRadius: radii.card,
        borderWidth: 1,
        borderColor: colors.line,
        padding: spacing.lg,
        gap: spacing.xs,
      }}
    >
      <AppText weight="bold">عندما تصل المهمة إلى «تم التنفيذ» أو «انتهى»</AppText>
      <Bullet>تختفي من «مهامي»، لأنها لم تعد تنتظر منك عملًا.</Bullet>
      <Bullet>تدخل في عدد المهام المكتملة ونسبة الإنجاز على بطاقة اللوحة.</Bullet>
    </View>
  );
}

function HowToMove() {
  const items: { title: string; body: string }[] = [
    {
      title: "في التطبيق",
      body: "اضغط السهم «←» على بطاقة المهمة لنقلها إلى الحالة التالية، أو اضغط عليها مطوّلًا لتختار أي حالة من «نقل إلى».",
    },
    { title: "على الويب", body: "اسحب البطاقة وأفلتها في عمود الحالة الجديدة." },
    {
      title: "من يستطيع ذلك؟",
      body: "أي عضو في اللوحة يستطيع نقل المهمة بين الحالات، عدا النقل إلى «انتهى»: هذا لمالك اللوحة والمسؤولين عن المهمة فقط، ويظهر معطّلًا لغيرهم. لا يمكن نقل المهام في لوحة مؤرشفة، ولا عند الاطّلاع على لوحة من «المتابعة».",
    },
  ];

  return (
    <View style={{ marginTop: spacing.xxl, gap: spacing.md }}>
      <AppText size="title" weight="bold" accessibilityRole="header">
        كيف أغيّر حالة المهمة؟
      </AppText>
      {items.map((item) => (
        <View key={item.title}>
          <AppText size="small" weight="semibold">
            {item.title}
          </AppText>
          <AppText size="small">
            {item.body}
          </AppText>
        </View>
      ))}
    </View>
  );
}
