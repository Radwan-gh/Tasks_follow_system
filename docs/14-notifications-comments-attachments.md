<!-- dir: rtl -->
<div dir="rtl">

# 14. الإشعارات، التعليقات، المرفقات، التكرار، وإعادة تعيين كلمة المرور

المصدر: `apps/api/src/notifications/*` (`NotificationsService`،
`ScheduledJobsService`)، `apps/api/src/cards/comments.service.ts`،
`apps/api/src/cards/attachments.service.ts`، `CardsService.spawnNextRecurrence`
و`nextRecurrenceDate` (`apps/api/src/common/util/recurrence.util.ts`)،
`UsersService.resetPassword`، والكيانات `Comment`/`Attachment`/`Notification`
في `apps/api/prisma/schema.prisma` (مُقدَّمة أولًا في [`02-domain-model.md`](./02-domain-model.md)).
هذه كلها ميزات المجموعة 3a — انظر تتبّع التقدّم في
[`13-redesign-completion-plan.md`](./13-redesign-completion-plan.md).

## الإشعارات (Notifications)

### الأنواع والمسارات

```
GET   /notifications              أحدث 100 إشعار للمستخدم الحالي + عدد غير المقروء
PATCH /notifications/:id/read     تعليم إشعار واحد مقروءًا
POST  /notifications/read-all     تعليم الكل مقروءًا
GET   /me/notification-prefs      قراءة التفضيلات الثلاثة
PATCH /me/notification-prefs      تحديث جزئي للتفضيلات
```

أنواع الإشعار (`NotificationType` في `packages/types`): `ASSIGNED` (إسناد إليك)،
`DUE_SOON` (اقتراب الموعد)، `OVERDUE` (تأخّر)، `COMMENT` (تعليق على بطاقة أنت
معنيّ بها)، `CARD_CLOSED` (نُقلت بطاقة أنشأتها إلى «انتهى»).

### آلية الإنشاء: `NotificationsService.notify`

كل إشعار يُنشَأ عبر `NotificationsService.notify(tx, {...})`، والذي:
1. **لا يُشعِر الفاعل بفعله هو** (`userId === actorId` يُسقِط الاستدعاء بصمت) —
   حارس مستقل حتى لو نسي المستدعي استبعاد الفاعل.
2. **يحترم تفضيلات المستلم** (`User.notificationPrefs`، ثلاثة مفاتيح: `assignmentsAndComments`
   يُغلق `ASSIGNED`/`COMMENT`، `dueDatesAndOverdue` يُغلق `DUE_SOON`/`OVERDUE`،
   `myCardsMoved` يُغلق `CARD_CLOSED`) — إشعار مُعطَّل التفضيل لا يُكتب أصلًا،
   لا يُكتب ثم يُخفى.
3. يقبل عميل معاملة Prisma (`tx`) حتى يُكتب الإشعار **ضمن نفس معاملة** الحدث
   الذي أطلقه (إسناد، تعليق، نقل بطاقة) — لا استدعاء منفصل قد يفشل بعد نجاح
   الحدث الأصلي.

نقاط الإطلاق الفعلية:
- **`ASSIGNED`**: `CardsService.updateAssignees` — للمُسنَدين **الجدد فقط**
  (الفرق بين المجموعة السابقة والجديدة)، لا لكل من بقي مُسنَدًا من قبل.
- **`COMMENT`**: `CommentsService.create` — لكل من "معنيّ بالبطاقة": منشئها،
  المُسنَدون إليها، وأعضاء الوصول المقيّد إن كانت مقيَّدة (`isRestricted`) —
  باستثناء كاتب التعليق نفسه.
- **`CARD_CLOSED`**: `CardsService.update` — عند نقل البطاقة فعليًا إلى قائمة
  `statusCategory === "CLOSED"`، يُشعَر منشئ البطاقة (`createdById`) إن لم يكن
  هو من نقلها.
- **`DUE_SOON` / `OVERDUE`**: `ScheduledJobsService.runDueDateSweep`، مهمة
  مجدولة يومية (`@Cron(CronExpression.EVERY_DAY_AT_1AM)`، أول اعتماد لـ
  `@nestjs/schedule` في المشروع) تفحص كل بطاقة غير مؤرشفة وغير منجَزة
  (`statusCategory` ليست ضمن `COMPLETED_CATEGORIES`) لها موعد خلال 24 ساعة
  القادمة أو ماضٍ، وتُشعِر مُسنَديها (أو منشئها إن لم يكن لها مُسنَدون). تستخدم
  `NotificationsService.notifyOnce`، الذي **لا يكرّر** الإشعار لنفس
  `(userId, type, cardId)` مطلقًا — تنبيه واحد عند الاقتراب وواحد عند التأخّر لكل
  بطاقة، لا تذكيرًا يوميًا متكررًا.

### الجوال

جرس + شارة عدّاد (`features/notifications/notification-bell.tsx`) في رأسَي
«اللوحات» و«مهامي»، مستقصى عبر TanStack Query كل 30 ثانية (`refetchInterval`) —
لا push حقيقي، هذا بند منفصل غير مجدوَل في `apps/mobile/TASKS.md`. مركز
الإشعارات صفحة `app/notifications.tsx` (مجمّعة اليوم/أمس/أقدم، الضغط يفتح
البطاقة ويُعلّم الإشعار مقروءًا)، وتفضيلات الإشعارات قسم في `(tabs)/account.tsx`
(`features/account/notification-prefs-section.tsx`).

## التعليقات (Comments)

```
GET    /cards/:cardId/comments
POST   /cards/:cardId/comments     { body: string }
DELETE /cards/:cardId/comments/:commentId
```

تعليق نصّي بسيط (`Comment` — `cardId`, `authorId`, `body`, `createdAt`)، يُدمَج
مع `CardActivity` في **خيط زمني واحد على العميل** (`features/cards/history-section.tsx`
يفرز المصفوفتين معًا حسب `createdAt`) — وليس في مخطّط استجابة واحد على الخادم،
لأن أحداث السجل والتعليقات شكلاهما مختلفان تمامًا وفرضهما في نوع واحد كان
سيُعقِّد الأمر أكثر من دمج خفيف على العميل. الصلاحية تتبع صلاحية البطاقة الأمّ
(`canAccessCard`، نفس نمط المهام الفرعية — انظر [`10-subtasks-and-assignment.md`](./10-subtasks-and-assignment.md)).
**حذف تعليق مقصور على كاتبه فقط**، بلا استثناء لمالك اللوحة أو منشئ البطاقة.

## المرفقات (Attachments)

```
GET    /cards/:cardId/attachments
POST   /cards/:cardId/attachments     multipart/form-data, حقل "file"
DELETE /cards/:cardId/attachments/:attachmentId
```

- **القيود** (`attachments.service.ts`): صور فقط
  (`image/jpeg`|`image/png`|`image/webp`|`image/gif`)، حتى 5MB للصورة (يُنفَّذ
  عبر `multer`'s `fileFilter`/`limits`)، وحتى 10 صور للبطاقة (يُتحقَّق منه في
  الخدمة بعد الرفع — تُحذف الصورة من القرص فورًا إن تجاوز العدد الحد).
- **التخزين**: قرص محلي فقط (`apps/api/uploads/`، مسار قابل للتهيئة عبر
  `UPLOADS_DIR`)، لا تخزين سحابي — يوافق أسلوب المشروع
  (`docker-compose.yml`/`.env.example`). أسماء الملفات UUID عشوائية
  (`randomUUID() + امتداد`)، تُخدَّم علنًا بلا مصادقة عبر `ServeStaticModule`
  على `/uploads/*` (`app.module.ts`) — الأمان بالغموض (اسم غير قابل للتخمين)
  بدل رمز مصادقة، لتبسيط عرض الصور في `<Image>` على الجوال دون آلية إرفاق
  ترويسات.
- **الصلاحية**: الرفع يتطلّب نفس صلاحية فتح البطاقة (`canAccessCard`)؛ الحذف
  مسموح لرافع الصورة **أو** من يملك إدارة البطاقة (`canManageCard`: مالك
  اللوحة أو منشئ البطاقة) — أوسع من التعليقات عمدًا، لأن حذف صورة أقرب لإدارة
  محتوى البطاقة من حذف رأي شخصي.

## توليد المهمة المتكررة (Recurrence)

`Card.recurrence` (`RecurrenceRule` في `packages/types`: `DAILY` | `WEEKLY`
بأيام أسبوع | `MONTHLY` بيوم شهر) يُكتب فعليًا الآن عبر `POST .../cards` و
`PATCH /cards/:id` (كان في المخطّط فقط منذ المرحلة 1).

عند نقل بطاقة **فعليًا** (`targetListId` يتغيّر، لا كل PATCH) إلى قائمة
`statusCategory === "CLOSED"` وكانت `recurrence` مضبوطة، ينفّذ
`CardsService.spawnNextRecurrence` — **ضمن نفس معاملة النقل**:
1. يجد قائمة اللوحة ذات `statusCategory === "NEW"` (أقدمها بالترتيب اليدوي إن
   تعدّدت). لا توجد قائمة NEW؟ لا نسخة تُنشأ (تفويت صامت، لا خطأ).
2. يحسب الموعد التالي عبر `nextRecurrenceDate(rule, dueDate ?? الآن)`:
   يوميًا = +1 يوم؛ أسبوعيًا = أقرب يوم من `weekdays` بعد الموعد الحالي (يُفحص
   يومًا فيومًا حتى 7 محاولات)؛ شهريًا = نفس `dayOfMonth` في الشهر التالي،
   مُقرَّبًا لآخر يوم في الشهر إن لم يوجد (مثال: يوم 31 في فبراير → آخر يوم في
   فبراير).
3. ينشئ بطاقة جديدة تحمل نفس العنوان والوصف والأولوية وقاعدة التكرار
   (**تستمر السلسلة تلقائيًا** — لا حاجة لحقل "معرّف سلسلة" لأن كل نسخة تحمل
   نفس القاعدة وتولّد التالية عند إغلاقها، نمط واحد-يدخل-واحد-يخرج يمنع
   التراكم بلا حاجة لتتبّع إضافي) ونفس المُسنَدين، بموعد الاستحقاق الجديد.
   **لا تُنسَخ المهام الفرعية** حاليًا (نطاق مؤجَّل).
4. يسجّل نشاط `CREATED` للبطاقة الجديدة، بفاعل = منشئ البطاقة الأصلية (استمرارية
   الملكية، لا فاعل النقل).

### الجوال

ورقة `components/recurrence-sheet.tsx` (بدون/يومي/أسبوعي برقائق أيام/شهري
باختيار يوم، مع سطر ملخّص حي وخيار «إيقاف التكرار») مشتركة بين شاشة «إضافة
مهمة» وتفاصيل البطاقة. أيقونة ↻ صغيرة على وجه البطاقة
(`features/boards/card-item.tsx`) بجانب شريحة الموعد عندما `card.recurrence`
مضبوطة.

## إعادة تعيين كلمة المرور (Admin Password Reset)

```
POST /admin/users/:id/reset-password   { } → { temporaryPassword: string }
```

يختلف عن `PATCH /admin/users/:id/password` (تعيين يدوي قائم من قبل، يبقى
مستخدَمًا في `apps/web`'s `UsersAdminPage.tsx` فقط): هذا المسار **يولّد** كلمة
مرور مؤقتة عشوائية (10 أحرف من أبجدية تستبعد الرموز المتشابهة بصريًا مثل
`0`/`O` و`1`/`l`/`I` — `generateTemporaryPassword` في `common/util/password.util.ts`)،
يضبط `User.mustChangePassword = true`، يُبطِل كل رموز التحديث الحالية للمستخدم
الهدف، ويُعيد كلمة المرور **مرة واحدة فقط** — لا تُخزَّن ولا تُستعاد لاحقًا.

`AuthService.changePassword` (المسار الذاتي `POST /auth/change-password`)
يصفّر `mustChangePassword` دائمًا كأثر جانبي — هو نفسه المسار الذي تُكمِل به
شاشة الجوال «عيّن كلمة مرور جديدة» العملية.

### تدفّق الجوال (بلا مسار خادم إضافي)

الشاشة الجديدة **لا تطلب كلمة المرور المؤقتة مجددًا** (حقلان فقط: الجديدة
والتأكيد) رغم أن `changePassword` يتطلّب `currentPassword`. الحل بالكامل على
العميل: `AuthProvider.login` (`features/auth/auth-context.tsx`) يحتفظ بكلمة
المرور التي أُدخِلت للتو في حالة عابرة (`pendingReauthPassword`، في الذاكرة
فقط) عندما يعود `mustChangePassword: true` من `GET /auth/me`. شاشة
`app/change-password-required.tsx` تستدعي `completePasswordReset(newPassword)`
التي تُمرِّر تلك القيمة المحفوظة كـ`currentPassword` تلقائيًا. `_layout.tsx`'s
`RootNavigator` يحجب كل مسار آخر (`Stack.Protected guard={!!user &&
needsPasswordReset}`) حتى تكتمل. إعادة تشغيل التطبيق قبل الإكمال تُفقِد كلمة
المرور المؤقتة من الذاكرة عمدًا — `AuthProvider`'s launch-check يمسح الجلسة
المخزَّنة إن وجد `mustChangePassword: true` بلا كلمة مرور عابرة، ويعيد المستخدم
لشاشة الدخول بدل حجزه في شاشة بلا مخرج.

</div>
