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
POST   /notifications/devices             ربط تثبيت التطبيق بالمستخدم الحالي (push)
DELETE /notifications/devices/:deviceId   فكّ ربط الجهاز عند الخروج (يبقى الرمز)
POST   /devices                           تسجيل مجهول عند فتح التطبيق (بلا مصادقة)
GET    /push/devices                      قائمة الأجهزة المسجَّلة (مشرف أو صاحب صلاحية)
POST   /push/send                         إرسال إشعار يدوي (مشرف أو صاحب صلاحية)
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
«اللوحات» و«مهامي»، مستقصى عبر TanStack Query كل 30 ثانية (`refetchInterval`).
الاستقصاء هو مسار **التطبيق المفتوح**؛ التطبيق المُغلَق أو في الخلفية يصله
إشعار نظام (push) — انظر القسم التالي. مركز الإشعارات صفحة
`app/notifications.tsx` (مجمّعة اليوم/أمس/أقدم، الضغط يفتح البطاقة ويُعلّم
الإشعار مقروءًا)، وتفضيلات الإشعارات قسم في `(tabs)/account.tsx`
(`features/account/notification-prefs-section.tsx`).

نصّ الإشعار بالعربية مُعرَّف في مكان واحد: `describeNotification` في
`packages/types/src/notification-content.ts`. يستعمله الجرس/المركز للعرض،
ويستعمله الخادم لبناء نصّ الـ push — نسختان منفصلتان كانتا ستتباعدان، وإشعار
نظام يخالف نصّ السطر الذي يفتحه خللٌ يلاحظه المستخدم فورًا.

### إشعارات النظام (Push) — FCM مباشرةً

```
POST   /devices                           { deviceId, token, platform }  تسجيل مجهول (عام)
POST   /notifications/devices             { deviceId, token, platform }  تسجيل + ربط بالمستخدم
DELETE /notifications/devices/:deviceId   فكّ الربط عند الخروج
GET    /push/devices                      PushDevice[]
POST   /push/send                         { title, body, target }  →  { targeted, delivered }
```

**الناقل:** الخادم يرسل إلى Firebase Cloud Messaging مباشرةً عبر
`firebase-admin` (`notifications/push/fcm.service.ts`)، لا عبر خدمة Expo للـ
push. هذا يوافق نهج المشروع القائم: تحديثات OTA مستضافة ذاتيًا وبناء APK
بـ Gradle، بلا حساب EAS. لذلك يطلب الجوال **رمز FCM الأصلي**
(`getDevicePushTokenAsync`) لا رمز Expo. المنصة المدعومة اليوم أندرويد فقط،
مع تخزين `platform` تحسّبًا لإضافة iOS لاحقًا دون ترحيل.

**الاعتماديات اختيارية:** إن لم تُضبط `FIREBASE_SERVICE_ACCOUNT` أو
`FIREBASE_SERVICE_ACCOUNT_PATH` يُسجَّل تحذير واحد عند الإقلاع ويُعطَّل الـ push
فقط — التطوير وCI ومركز الإشعارات داخل التطبيق تبقى تعمل. يجب ألّا يرمي هذا
المسار استثناءً أبدًا.

**`PushDevice`: صف لكل *تثبيت* للتطبيق، لا لكل مستخدم.** لا عمود على `User`،
لأن للمستخدم الواحد أجهزة متعددة (هاتف + لوح) وعمودٌ واحد كان سيُسكِت الجهاز
الأقدم صامتًا. المفتاح هو `deviceId`: UUID يولّده التطبيق عند أول تشغيل ويحفظه
في SecureStore (`apps/mobile/src/lib/device-id.ts`). لم يُستعمل رمز FCM مفتاحًا
لأنه يتبدّل، ولا معرّف تثبيت Firebase لأنه يتطلّب اعتمادية أصلية جديدة وله نفس
العمر (يُصفَّر بإعادة التثبيت). `deviceId` قابل للقيمة الفارغة فقط لصفوف سبقت
إضافته.

- **التسجيل لا ينتظر تسجيل الدخول.** التطبيق يستدعي `POST /devices` (عام، بلا
  حارس) فور فتحه، فيصبح حتى الجهاز المجهول قابلًا للإرسال إليه بـ`deviceId`.
  هذا المسار يسجّل رمزًا فقط ولا يستطيع إرسال شيء، فتركه مفتوحًا لا يكشف شيئًا.
  وهو **لا يلمس `userId` أبدًا**، لأن التطبيق يستدعيه قبل انتهاء فحص الجلسة،
  ويجب ألّا يفكّ ربط مستخدم ما زال مسجَّلًا.
- **الربط عند الدخول:** `POST /notifications/devices` (مصادَق) يضبط `userId`.
  الجهاز نفسه إذا دخل به مستخدم آخر **يُنقَل** الصف إليه، فلا يبقى الهاتف
  يستقبل مهام المستخدم السابق.
- **الخروج يفكّ الربط ولا يحذف:** `DELETE /notifications/devices/:deviceId`
  يضبط `userId = null` فقط، ويبقى الصف ورمز FCM. يتوقّف الهاتف عن تلقّي مهام
  ذلك المستخدم، ويبقى قابلًا للإرسال المجهول. الطلب مقيَّد بصاحب الجهاز حتى لا
  يفكّ مستخدمٌ ربطَ جهاز غيره. حذف المستخدم يجعل أجهزته مجهولة (`SetNull`) لا
  محذوفة.
- **`token` فريد أيضًا:** إن سُجِّل رمز ما زال مملوكًا لصف آخر (إعادة تثبيت
  ولّدت `deviceId` جديدًا، أو صف قديم بلا `deviceId`) يُحذف الصف القديم داخل
  نفس المعاملة. **الحذف الوحيد الآخر** هو حين يبلّغ FCM أن الرمز ميت.
- الكانس `PushDispatcherService` يرسل لـ`listForUsers` فقط، فالأجهزة المجهولة لا
  تتلقّى إشعارات المهام أبدًا، وإنما الإرسال اليدوي أدناه.

**الإرسال اليدوي (`POST /push/send`):** شاشة «إرسال إشعار» في الجوال
(`app/push.tsx`) تكتب عنوانًا ونصًّا وتختار الهدف: `target.kind` =
`all` (كل الأجهزة) | `devices` (`deviceIds`) | `users` (`userIds`).
`PushSenderService` يرسل **فورًا** لا عبر الكانس، لأنه لا صفّ `Notification`
خلفه: ليس عن بطاقة، وقد يستهدف أجهزة بلا مستخدم يملك الصف. يحذف الرموز الميتة
ويعيد `{ targeted, delivered }`. إن لم تُضبط بيانات Firebase على الخادم يرمي
503 بدل `delivered: 0` صامت، كي لا يبدو الخلل وكأنه «لا أجهزة».

**من يستطيع الإرسال:** المشرف (`ADMIN`) دائمًا، أو مستخدم منحه مشرفٌ صلاحية
`User.canSendNotifications`. الشرط واحد، `canSendPush()` في `packages/types`،
ويستعمله الطرفان. البوابة الحقيقية `CanSendPushGuard`
(`common/guards/can-send-push.guard.ts`) على `/push/*`، وهي تقرأ الدور والصلاحية
و`isActive` **من قاعدة البيانات** لا من JWT، فيسري السحب من الطلب التالي. المنح
عبر `PATCH /admin/users/:id/permissions` (انظر
[`07-admin.md`](./07-admin.md)). في الجوال يظهر زرّ «إرسال إشعار» في «حسابي» لمن
يملك الصلاحية فقط، وتعيد الشاشة التوجيه إن فُتحت برابط مباشر دونها.

**تشخيص الجهاز:** الشاشة نفسها تعرض `deviceId` هذا الجهاز (مع نسخه) وحالة
تسجيله أو سبب فشله، وتتيح «إعادة التسجيل».

**الإرسال عبر صندوق صادر (outbox)، لا مباشرةً من `notify`:** أُضيف عمود
`Notification.pushedAt`؛ و`PushDispatcherService` مهمة مجدولة كل 30 ثانية تكنس
الصفوف التي `pushedAt IS NULL` وترسلها. السبب أن `notify` يعمل **داخل معاملة**
المستدعي: إرسالٌ مباشر منه كان سيطلق إشعارًا لعمل قد يُلغى بالتراجع
(rollback)، وسيُبقي المعاملة مفتوحة طوال نداء شبكة. القراءة من صفوف مُثبَّتة
على مؤقّت تتفادى الأمرين، ولا تتطلّب أي تعديل في `CardsService` أو
`CommentsService`، وتنجو من إعادة تشغيل الخادم أثناء الإرسال. الثمن تأخير حتى
~30 ثانية، وهو مقبول لنظام متابعة مهام.

تفاصيل مهمّة في الكنس:
- `pushedAt` يعني «جُرِّب»، لا «وصل» — يُختم قبل الإرسال، وإلا لَعلِق رمز فاشل
  دائمًا في رأس الطابور إلى الأبد، ولنجاحٍ يعقبه تعطّل أن يُرسل مرّتين.
- الصفوف الأقدم من ساعة تُختم دون إرسال: إشعار نظام عن حدث مضى ضجيج لا خبر،
  وإقلاعٌ بعد انقطاع طويل كان سيُطلق دفعة قديمة كاملة.
- تُختم أيضًا صفوف مستخدم بلا أجهزة مسجَّلة، وإلا تراكمت كعمل دائم للكانس.
- الرموز التي يبلّغ FCM أنها ميتة (`registration-token-not-registered` وأخواتها)
  تُحذف فورًا.

**التفضيلات لا تُفحص هنا:** `notify` يفحصها *قبل* الكتابة، فكل صف موجود هو صف
وافق المستلم على تلقّيه — الـ push يرث التفضيلات الثلاثة مجانًا بلا منطق ثانٍ.

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

- **القيود** (`attachments.service.ts`): **أي نوع ملف** (كانت صورًا فقط)، حتى
  20MB للملف (`MAX_ATTACHMENT_BYTES`، يُنفَّذ عبر `multer`'s `limits` — تجاوزه
  يُرجع 413)، وحتى 10 مرفقات للبطاقة (يُتحقَّق منه في الخدمة بعد الرفع — يُحذف
  الملف من القرص فورًا إن تجاوز العدد الحد). لا `fileFilter` بعد الآن.
- **التخزين**: قرص محلي فقط (`apps/api/uploads/`، مسار قابل للتهيئة عبر
  `UPLOADS_DIR`)، لا تخزين سحابي — يوافق أسلوب المشروع
  (`docker-compose.yml`/`.env.example`). اسم الملف على القرص
  `<uuid>__<الاسم الأصلي بعد التنقية><.امتداد>` (`buildStoredFilename` في
  `common/util/uploads.util.ts`): الـUUID يُبقي الرابط غير قابل للتخمين، والاسم
  الأصلي يُحمَل داخل الاسم نفسه فيُعرَض في الواجهة (`Attachment.fileName`،
  يُشتقّ بـ`displayNameFromStored`) ويُسمّى به الملف عند التنزيل — **بلا عمود
  جديد ولا مِهجرة**. تُنقّى الأسماء: تُفكّ ترميزة latin1 التي يفرضها `multer`
  على أسماء UTF-8 (وإلا تشوّه العربية)، وتُستبدَل المحارف الخطرة (`/ \ : < > | ? * % #`
  وأحرف التحكم) بـ`_`، ويُقصّ الاسم بالبايت، ويُقيَّد الامتداد بـ`[a-z0-9]`.
  الملفات القديمة (`<uuid>.<ext>` بلا فاصل) تبقى صالحة. تُخدَّم علنًا بلا
  مصادقة عبر `ServeStaticModule` على `/uploads/*` (`app.module.ts`) — الأمان
  بالغموض (اسم غير قابل للتخمين) بدل رمز مصادقة، لتبسيط عرض الصور في `<Image>`
  على الجوال دون آلية إرفاق ترويسات.
- **أمان التقديم** (`setUploadHeaders`): لأن أي ملف يمكن رفعه (`.html`/`.svg`
  مثلًا) ويُخدَّم من أصل الـAPI، تُرسَل كل الأنواع **غير** الصور النقطية
  (`jpg`/`jpeg`/`png`/`webp`/`gif`) بـ`Content-Disposition: attachment` فتُنزَّل
  ولا تُنفَّذ في المتصفح، مع `X-Content-Type-Options: nosniff` لكل الملفات.
  `Attachment.url` الآن مُرمَّز بـ`encodeURIComponent` (الأسماء قد تحوي عربية أو
  مسافات).
- **الصلاحية**: الرفع يتطلّب نفس صلاحية فتح البطاقة (`canAccessCard`)؛ الحذف
  مسموح لرافع الصورة **أو** من يملك إدارة البطاقة (`canManageCard`: مالك
  اللوحة أو منشئ البطاقة) — أوسع من التعليقات عمدًا، لأن حذف صورة أقرب لإدارة
  محتوى البطاقة من حذف رأي شخصي.
- **الواجهات**: الصور القابلة للمعاينة (`jpeg`/`png`/`webp`/`gif` بحسب `mimeType`)
  تظهر مصغّرات، وكل ما عداها صفّ باسم الملف (`fileName`) وحجمه ورابط تنزيل. الويب:
  `AttachmentsSection` في `CardDetailPanel.tsx` (حقل ملف بلا `accept`، وفحص الحجم
  قبل الرفع من `lib/attachment-url.ts`). الجوال: `attachments-section.tsx` (ورقة
  «الكاميرا / المعرض / ملف»). `packages/api-client`'s `attachments.upload` يقبل
  `File | Blob` (الويب) أو `{ uri, name, type }` (الجوال).

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
