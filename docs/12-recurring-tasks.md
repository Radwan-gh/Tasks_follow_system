<!-- dir: rtl -->
<div dir="rtl">

# 12. المهام الدورية والبنود الفرعية وتقرير الإنجاز

المصدر: `apps/api/src/recurring/*` (خدمة ومتحكّم ووحدة)، ومنطق البنود الفرعية
(Checklist) في `apps/api/src/cards/cards.service.ts`، وأشكال الردود/الطلبات في
`packages/types/src/domain.ts` و`packages/types/src/requests.ts`، والواجهة في
`apps/web/src/features/boards/components/RecurringTasksModal.tsx` وتبويب «المهام
الدورية» ضمن `apps/web/src/features/reports/ReportsPage.tsx`.

## الحاجة

مهام تتكرّر أسبوعيًا بنفس البنود الفرعية (مثال: «تنظيف المعهد» ← غسل الدرج / مسح
البلور / تنظيف الحمامات)، مع القدرة على استخراج تقرير شهري يجيب: **هل أُنجز كل بند
كل أسبوع؟**

## النموذج

- **`RecurringTask`** (قالب): عنوان، `targetListId` (القائمة التي تظهر فيها النسخة
  الأسبوعية)، `cadence` بقيمة `WEEKLY` (enum `RecurrenceCadence` قابل للتوسّع)،
  و`isActive`. له مجموعة ثابتة من **`RecurringSubtask`**.
- **`RecurringSubtask`**: بند فرعي للقالب. **معرّفه (`id`) ثابت عبر الأسابيع** —
  وهذا ما يجعل التقرير ممكنًا.
- **`ChecklistItem`**: بند قابل للتأشير على بطاقة. البنود المُولّدة من قالب دوري
  تحمل `recurringSubtaskId` (للربط في التقرير) مع لقطة من `label`؛ والبنود العادية
  على أي بطاقة تحمل `recurringSubtaskId = null`. يخزّن `isCompleted`/`completedAt`/
  `completedById`.
- على **`Card`**: `recurringTaskId` و`occurrenceStart` (يوم الإثنين 00:00 بتوقيت
  UTC للأسبوع الذي تمثّله البطاقة)، مع قيد فريد `@@unique([recurringTaskId,
  occurrenceStart])`.

> ملاحظة: يتعايش هذا مع كيان `Subtask` (المهام الفرعية المُسنَدة، انظر
> [`10-subtasks-and-assignment.md`](./10-subtasks-and-assignment.md)) — الأول
> «بنود تحقّق» لأغراض التتبّع والتقرير، والثاني مهام فرعية قابلة للإسناد.

## التوليد الأسبوعي (idempotent)

`POST /recurring-tasks/:id/generate` يُنشئ — داخل معاملة (transaction) — بطاقةً
واحدة لأسبوع `startOfIsoWeek(now)` (`common/util/week.util.ts`)، ويزرع
`ChecklistItem` من كل `RecurringSubtask`، ويسجّل `CREATED` في سجل البطاقة. بفضل
القيد الفريد، **استدعاؤه مرة أخرى في نفس الأسبوع يُعيد البطاقة القائمة بدل
تكرارها**. لا يوجد مجدوِل خلفي؛ التوليد يدوي عبر زر «إنشاء هذا الأسبوع».

## البنود الفرعية على البطاقة

`GET/POST /cards/:id/checklist` و`PATCH/DELETE /checklist-items/:itemId`
(في `CardsService`). تأشير بند يضبط `completedAt`/`completedById` ويكتب
`CHECKLIST_ITEM_COMPLETED`/`_UNCOMPLETED` في نفس معاملة التعديل، فتظهر في سجل
البطاقة. يُضمّن `checklist` داخل تفاصيل اللوحة (`serializeCard`) لعرض شارة التقدّم
على البطاقة دون طلب إضافي.

## التقرير

`GET /boards/:boardId/recurring-report?from=&to=` (الافتراضي: الشهر الميلادي
السابق، `previousMonthRange`). يجمّع بطاقات النسخ ضمن المدى ويبنى شبكة لكل قالب:
صفوف = البنود الفرعية، أعمدة = الأسابيع، وكل خلية مُنجَز/غير مُنجَز، مع ملخّص
`مُنجَز/الإجمالي` لكل بند. يُعرض كتبويب «المهام الدورية» في صفحة التقارير مع منتقي
لوحة ومدى تاريخ.

## الصلاحيات

كل مسارات `recurring` تمرّ عبر `BoardsService.assertMembership` (عضوية اللوحة). أما
تبويب التقرير في الواجهة فيقع داخل صفحة `/reports` المحكومة بدور `ADMIN` (انظر
[`11-reports.md`](./11-reports.md))، لذا يظهر رابط «التقارير» في ترويسة اللوحة
لمن دوره `ADMIN` فقط، بينما زر «المهام الدورية» متاح لأعضاء اللوحة.

</div>
