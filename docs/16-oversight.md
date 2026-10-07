<!-- dir: rtl -->
<div dir="rtl">

# 16. المتابعة — الاطلاع على كل اللوحات والمهام (Oversight)

المصدر: `apps/api/src/oversight/*`، `apps/api/src/common/guards/supervisor.guard.ts`،
`BoardsService.assertMembership` / `isSupervisor` / `listAll` في
`apps/api/src/boards/boards.service.ts`، الأنواع في `packages/types/src/oversight.ts`
و`canSupervise()` في `packages/types/src/domain.ts`. الواجهات:
`apps/web/src/features/oversight/OversightPage.tsx` و`apps/mobile/src/app/oversight.tsx`.

## الفكرة

العضوية في اللوحة هي الأساس: لا يرى أحدٌ لوحةً لم يُضَف إليها. «المتابعة» استثناء
**للقراءة فقط** يتيح لشخص مخوَّل أن يطّلع على **كل اللوحات المشتركة ومهامها** في
النظام، بما فيها لوحات ليس عضوًا فيها، دون أن يستطيع تعديل أيٍّ منها.

**اللوحات الشخصية خارج المتابعة تمامًا** (`Board.kind = PERSONAL`): هي لصاحبها وحده،
فلا تُسرد ولا تُبحث مهامها ولا تُفتح بمعرّفها، حتى لـ ADMIN. انظر
[`18-board-sharing.md`](./18-board-sharing.md).

> التسمية: في الواجهة «المتابعة» لا «الإشراف»، لأن كلمة «مشرف» تعني دور `ADMIN`
> في شاشات الإدارة. في الكود: `oversight` / `SupervisorGuard` / `canSupervise`.

## من يملك هذه الصلاحية؟

- القاعدة واحدة، `canSupervise(user) = role === "ADMIN" || canViewAllBoards`،
  معرَّفة في `packages/types` ويستعملها الخادم والجوال. الويب يحمل نسخة مطابقة في
  `apps/web/src/lib/can-supervise.ts` لأن `packages/types` تُبنى CommonJS ولا يستطيع
  Rollup استيراد قيم تشغيلية منها — أبقِ النسختين متطابقتين.
- **`ADMIN` يملكها دائمًا** (على غرار `canSendPush()`).
- لمستخدم `USER`: عمود `User.canViewAllBoards` (افتراضيًا `false`).
- **لا يمنحها أو يسحبها إلا ADMIN**، عبر `PATCH /admin/users/:id/permissions`
  `{ canViewAllBoards }` المحمي بـ `AdminGuard`. صاحب الصلاحية نفسه لا يستطيع منحها
  لغيره ولا لنفسه، ولا يوجد تحت `/oversight/*` أي مسار يكتب صلاحيات.
- الحساب المعطَّل (`isActive = false`) لا يُعدّ مخوَّلًا حتى لو كان العمود مفعّلًا.
- الدور والعمود يُقرآن من **قاعدة البيانات** في كل طلب (`BoardsService.isSupervisor`)،
  لا من JWT — فالسحب يسري من الطلب التالي دون إبطال الجلسات (القاعدة الذهبية في
  [`04-authorization.md`](./04-authorization.md)).

## كيف تتحقّق «للقراءة فقط»؟ — منفذ واحد داخل `assertMembership`

`assertMembership(userId, boardId, minRole)` يبقى المصدر الوحيد للحقيقة. أُضيف إليه
مسار احتياطي واحد:

1. إن وُجدت عضوية حقيقية فهي الحاكمة دائمًا (فعضو اللوحة يحتفظ بدوره حتى لو كان
   صاحب صلاحية متابعة).
2. إن **لم** يكن عضوًا **وكان `minRole === "VIEWER"`** وكان `isSupervisor` صحيحًا
   **وكانت اللوحة مشتركة**، يُقبل بدور `VIEWER` ويُعاد `{ role: "VIEWER", supervised: true }`.
3. غير ذلك: `403`.

كل مسارات **القراءة** تطلب `VIEWER` صراحةً، وكل مسارات **الكتابة** تطلب `MEMBER` أو
`OWNER`. لذلك يعمل المتابع تلقائيًا على: تفاصيل اللوحة، تفاصيل البطاقة، سجلّها،
التعليقات، المرفقات، المهام الفرعية، وقوالب اللوحة — ويُرفض في كل تعديل (نقل، تعديل،
تعليق، رفع مرفق، أرشفة، إدارة أعضاء…) بلا أي فحص إضافي.

### البطاقات المقيّدة

المتابع يرى **كل البطاقات بما فيها المقيّدة** (`isRestricted`). كل موضع قراءة يفحص
`canAccessCard` بعد `assertMembership(..., "VIEWER")` يتخطّاه حين
`access.supervised`: `BoardsService.getDetail` (ومعه `hiddenClosedCount`)،
`CardsService.getDetail` و`getHistory`، `CommentsService.list`،
`AttachmentsService.list`، و`SubtasksService.assertCardAccess`. مسارات الكتابة لا
تتأثّر لأنها لا تصل إلى هذا الفرع أصلًا.

### `BoardDetail.supervised`

`GET /boards/:id` يعيد `supervised: true` حين يرى الطالب اللوحة عبر المتابعة فقط.
الواجهتان تعاملانها كلوحة «للعرض فقط»: لا سحب، لا «+ مهمة»، لا إعدادات، لا تعليق،
مع شريط «وضع المتابعة — لست عضوًا في هذه اللوحة، فهي معروضة للقراءة فقط».
`members` لا تتضمّن المتابع (هو ليس عضوًا).

## المسارات — `/oversight/*`

كلها `@UseGuards(JwtAuthGuard, SupervisorGuard)`، للقراءة فقط، ولا تمرّ عبر
`assertMembership` (تشمل كل اللوحات، كقسم التقارير).

| المسار | الوظيفة |
|---|---|
| `GET /oversight/boards?archived=true\|false` | كل اللوحات **المشتركة** (النشطة افتراضيًا) بنفس تجميعات قائمة اللوحات، مع `owner` |
| `GET /oversight/tasks` | البطاقات عبر كل اللوحات **المشتركة**، مع ترشيح وتقسيم صفحات بالمؤشّر |
| `GET /oversight/users` | كل المستخدمين `{id, username, displayName, isActive}` لمرشّح «المسؤول» — المتابع ليس بالضرورة ADMIN فلا يصل إلى `/admin/users` |

### `GET /oversight/tasks` — قواعد الترشيح

- `assigneeId`، `boardId`، `statusCategory`، `dueFrom`/`dueTo`، `overdue`،
  `includeCompleted`، `q` (بحث في العنوان دون حساسية لحالة الأحرف)، `cursor`، `limit`
  (حتى 100، افتراضيًا 50).
- لا تظهر بطاقات اللوحات الشخصية أبدًا، ولو حُدِّد `boardId` لوحةٍ شخصية (تعود القائمة
  فارغة).
- لا تظهر البطاقات المؤرشفة ولا بطاقات القوائم المؤرشفة أبدًا. بطاقات **اللوحات
  المؤرشفة** لا تظهر إلا حين يُحدَّد `boardId` تلك اللوحة.
- المكتملة (`DONE`/`CLOSED`) مستبعدة افتراضيًا، إلا مع `includeCompleted` أو
  `statusCategory` صريح. القوائم بلا فئة (`statusCategory = null`) تُعدّ غير مكتملة.
- `overdue`: تاريخ الاستحقاق مضى والبطاقة غير مكتملة، مرتّبة بالأقدم استحقاقًا.
  غير ذلك: الأحدث تحديثًا أولًا.
- الاستجابة `{ items, nextCursor }`؛ يُعاد `nextCursor` كـ `cursor` لجلب الصفحة التالية،
  و`null` حين لا مزيد.

## الواجهات

- **الويب:** بند «المتابعة» في الشريط الجانبي يظهر لمن `canSupervise`، والمسار
  `/oversight` محميّ بـ `SupervisorRoute`. تبويبان: «اللوحات» (شبكة `BoardCard` مع
  اسم المالك ومفتاح «المؤرشفة») و«المهام» (جدول بمرشّحات البحث والمسؤول واللوحة
  والحالة و«المتأخّرة فقط» و«إظهار المكتملة»، و«عرض المزيد»). فتح لوحة أو مهمة ينقل
  إلى صفحة اللوحة العادية (`/boards/:id?card=…`) بوضع القراءة فقط. منح الصلاحية من
  «المستخدمون والصلاحيات» بزرّ «الاطلاع على كل اللوحات» وشارة «يطّلع على كل اللوحات».
- **الجوال:** انظر [`12-mobile-app.md`](./12-mobile-app.md).
- **MCP:** الأداتان `list_all_boards` و`search_all_tasks`، انظر
  [`15-mcp-server.md`](./15-mcp-server.md).

</div>
