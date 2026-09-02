<!-- dir: rtl -->
<div dir="rtl">

# 10. المهام الفرعية والإسناد (Subtasks & Assignment)

المصدر: `apps/api/src/subtasks/*`، دالة `CardsService.updateAssignees`
(`apps/api/src/cards/cards.service.ts`)، `apps/api/src/my-tasks/*`، والكيانات
`Subtask` و `CardAssignee` و `SubtaskAssignee` في `apps/api/prisma/schema.prisma`
(وأشكالها في `packages/types/src/domain.ts` و `requests.ts` و `my-tasks.ts`).

## المهام الفرعية (Subtasks)

**مهمة فرعية** تنتمي لبطاقة واحدة (المهمة الأساسية)، ولها:
- `title` (عنوان)، `isDone` (منجَزة/غير منجَزة)، و`position` (ترتيب داخل البطاقة
  بنفس الفهرسة الكسرية المستخدمة للقوائم والبطاقات — انظر [`06-ordering.md`](./06-ordering.md)).
- `createdById` (منشئها).
- مجموعة **مُسنَدين** (عدة أشخاص) عبر `SubtaskAssignee`.

### المسارات (Endpoints)

```
GET    /cards/:cardId/subtasks        عرض المهام الفرعية للبطاقة
POST   /cards/:cardId/subtasks        إنشاء (تُضاف في نهاية القائمة)
PATCH  /subtasks/:id                  { title?, isDone?, move? }
PATCH  /subtasks/:id/assignees        { userIds: string[] }
DELETE /subtasks/:id                  حذف
```

- الإنشاء يحسب الموضع بعد آخر مهمة فرعية (`generateKeyBetween`).
- إعادة الترتيب تستخدم نفس شكل `move: { beforeId, afterId }` الموحّد، ويُعاد حساب
  الموضع على الخادم داخل معاملة (انظر [`05-boards-lists-cards.md`](./05-boards-lists-cards.md)).

### الصلاحية

المهام الفرعية **ترث صلاحية البطاقة الأمّ**: أي مستخدم يستطيع فتح البطاقة يستطيع
إدارة مهامها الفرعية. لذلك تمرّ كل عملية عبر `assertMembership` ثم نفس دالة
`canAccessCard` المستخدمة للبطاقة نفسها — لا منطق صلاحية مستقل (انظر
[`04-authorization.md`](./04-authorization.md)).

## الإسناد (Assignment) — لعدة أشخاص

القرار المُثبَّت: يمكن إسناد المهمة أو المهمة الفرعية **لعدة أشخاص**. لذلك يُمثَّل
الإسناد بجدولَي ربط منفصلين عن قائمة الوصول (`CardMember`):

- `CardAssignee` — ربط `(cardId, userId)` فريد.
- `SubtaskAssignee` — ربط `(subtaskId, userId)` فريد.

**تمييز مهم:** `CardMember` هو **قائمة وصول** (من يرى بطاقة مقيّدة)، بينما
`CardAssignee` هو **إسناد/مسؤولية عن العمل**. الاثنان مستقلّان.

### المسارات

```
PATCH /cards/:id/assignees      { userIds: string[] }   (استبدال كامل ذرّي)
PATCH /subtasks/:id/assignees   { userIds: string[] }   (استبدال كامل ذرّي)
```

- كل عملية إسناد هي **استبدال كامل** لمجموعة المُسنَدين (تُحذف القديمة وتُكتب الجديدة
  داخل معاملة) — على نمط `PATCH /cards/:id/access`.
- **كل مُسنَد يجب أن يكون عضوًا في اللوحة**؛ إن وُجد معرّف لغير عضو يُرفض الطلب بـ
  "Every assignee must be a member of the board".
- أي عضو لديه وصول للبطاقة يستطيع تعديل إسنادها (ليست حكرًا على المالك/المنشئ).

### تسجيل النشاط (Activity)

إسناد **البطاقة** يُسجَّل في سجلّ البطاقة `CardActivity` بنوع جديد:
- `ASSIGNED` — `toValue` يحمل لقطة بأسماء المُسنَدين بعد التغيير (مفصولة بفواصل).
- `UNASSIGNED` — عند مسح كل المُسنَدين.

يُكتب السجلّ **فقط عند تغيّر فعلي** لمجموعة المُسنَدين، داخل نفس معاملة الكتابة.
إسناد **المهام الفرعية** لا يُسجَّل في `CardActivity` في هذه المرحلة (لتقليل النطاق).

## الواجهة (Web)

في `apps/web/src/features/boards/components/CardDetailModal.tsx`:
- قسم "المسؤولون عن المهمة" — قائمة اختيار متعدّد فوق أعضاء اللوحة.
- قسم "المهام الفرعية" — إضافة/إنجاز/حذف، مع مُنتقي إسناد متعدّد لكل مهمة فرعية،
  وعدّاد إنجاز (`مكتمل/الكل`).
- على وجه البطاقة (`CardItem.tsx`) تظهر إشارة بعدد المُسنَدين (👤 N).

## الواجهة (الجوال)

`apps/mobile/src/app/card/[id].tsx` يطابق نفس تقسيم الويب: قسم مسؤولين
بشرائح + زر "+" يفتح `AssigneePickerSheet` (`features/cards/`، مكوّن عامّ
يُستخدم أيضًا لتقييد الوصول)، وقسم مهام فرعية (`features/cards/subtasks-section.tsx`)
بشريط تقدّم + صفوف قابلة للتحديد/الحذف/الإسناد.

## `GET /my-tasks` — كل ما أُسنِد إليّ

المصدر: `apps/api/src/my-tasks/*`، والشكل `MyTasksResponse`/`MyTaskItem` في
`packages/types/src/my-tasks.ts`.

**ليست تقريرًا:** لا `AdminGuard` — أي مستخدم مسجَّل يستدعيها ليرى إسناداته
هو فقط، عبر كل لوحة هو عضو فيها. تجمع صفًّا لكل:
- **بطاقة** أُسنِدت إليّ مباشرةً (`CardAssignee`).
- **مهمة فرعية** أُسنِدت إليّ (`SubtaskAssignee`) — حتى لو لم تكن البطاقة الأمّ
  نفسها مُسنَدة إليّ. يحمل الصفّ `parentCardTitle` لعرضه، و`cardId` يشير دائمًا
  إلى البطاقة الأمّ (لا شاشة تفاصيل مستقلّة للمهمة الفرعية).

تُستبعَد البطاقات المؤرشفة وأي بطاقة/مهمة فرعية في قائمة `isCompleted()`
(`DONE`/`CLOSED` — انظر [`09-list-status-templates.md`](./09-list-status-templates.md))،
وتُستبعَد أي بطاقة مقيّدة لا يملك المستخدم صلاحية فتحها فعليًا (`canAccessCard`)
حتى لو ظهر إسنادها قبل تشديد الوصول لاحقًا.

**الترتيب والتجميع مسؤولية العميل**، لا الخادم — على نمط قسم التقارير: يرسل
الخادم قائمة مسطّحة، ويطبّق تطبيق الجوال (`app/(tabs)/my-tasks.tsx`) القرار
المعتمد في `v2-new-style.md` §7.1: **المتأخّرة أولًا** (قسم واحد يجمع كل لوحة)،
**ثم الباقي مجمّعًا حسب اللوحة**.

</div>
