<!-- dir: rtl -->
<div dir="rtl">

# 15. خادم MCP البعيد (ربط Claude بغِراس)

المصدر: `apps/api/src/mcp/` — `mcp.controller.ts` و `mcp-server.factory.ts` (الأدوات)،
`oauth/oauth.provider.ts` (خادم التفويض)، `oauth/oauth-login.controller.ts` و
`oauth/login-page.ts` (صفحة الدخول)، `mount.ts` (تركيب موجّهات الـ SDK)، و
`mcp.config.ts` (العناوين العامة).

## الفكرة العامة

**MCP (Model Context Protocol)** بروتوكول يتيح لمساعد ذكي مثل Claude أن يستدعي
"أدوات" نظام خارجي. يستضيف الـ API خادم MCP على **`/mcp`** (نقل Streamable HTTP)،
فيستطيع **أي مستخدم** في غِراس أن يربط Claude بحسابه ثم يطلب منه بلغة طبيعية:
"ما مهامي المتأخرة؟"، "أنشئ مهمة لكتابة التقرير وأسندها لفلان"، "انقل هذه المهمة إلى
قيد التنفيذ"…

قاعدتان حاكمتان:

1. **كل أداة تعمل باسم المستخدم الذي سجّل الدخول، وبصلاحياته هو فقط.** الأدوات
   تستدعي **نفس دوال الخدمات** التي تستدعيها متحكّمات الـ REST (`BoardsService`،
   `CardsService`، `SubtasksService`، `CommentsService`، `AttachmentsService`،
   `MyTasksService`)، فتسري
   تلقائيًا كل قواعد [`04-authorization.md`](./04-authorization.md): `assertMembership`،
   البطاقات المقيّدة، قاعدة النقل إلى «انتهى»… طبقة MCP **لا تضيف أي منطق صلاحيات
   خاص بها**.
2. **لا يُنشئ MCP قوائم.** كل لوحة تُنشأ عبر MCP تأتي بالقوائم الخمس القياسية
   (انظر [`09-list-status-templates.md`](./09-list-status-templates.md))، ولا توجد أداة
   لإنشاء قائمة أو تعديلها أو حذفها.

## كيف يربط المستخدم Claude بحسابه

- **claude.ai / Claude Desktop / الجوال:** الإعدادات ← Connectors ← Add custom
  connector ← الصق العنوان `https://<عنوان الـ API>/mcp` (في الإنتاج:
  `https://api-production-b27a.up.railway.app/mcp`) ← تفتح صفحة دخول غِراس ←
  أدخل اسم المستخدم وكلمة المرور ← تمّ.
- **Claude Code:** `claude mcp add --transport http ghiras https://<عنوان الـ API>/mcp`
  ثم `/mcp` لتسجيل الدخول.

لا يحصل Claude على كلمة المرور أبدًا؛ يحصل فقط على رموز مقيّدة بـ `/mcp`.

## المصادقة: OAuth 2.1

العملاء مثل claude.ai يشترطون OAuth، لذا الـ API هو نفسه **خادم التفويض** (Authorization
Server) و**خادم الموارد** (`/mcp`). الموجّهات القياسية تأتي من حزمة
`@modelcontextprotocol/sdk` (`mcpAuthRouter`، `requireBearerAuth`)، والمنطق الخاص بنا
في `McpOAuthProvider`.

| المسار | الوظيفة |
|---|---|
| `GET /.well-known/oauth-protected-resource/mcp` | يعلن أن `/mcp` محمي ومن هو خادم التفويض |
| `GET /.well-known/oauth-authorization-server` | بيانات خادم التفويض (المسارات، PKCE S256…) |
| `POST /register` | تسجيل عميل ديناميكي (RFC 7591) ← صفّ `OAuthClient` |
| `GET /authorize` | يتحقّق الـ SDK من العميل و`redirect_uri`، ثم نعرض صفحة الدخول |
| `POST /oauth/login` | استمارة صفحة الدخول: تحقّق من الاعتماد، إصدار رمز تفويض، وإعادة توجيه |
| `POST /token` | استبدال الرمز (`authorization_code` + PKCE) أو التجديد (`refresh_token`) |
| `POST /revoke` | إبطال رمز تحديث يخصّ هذا العميل |
| `POST /mcp` | نقطة MCP نفسها (تتطلّب `Authorization: Bearer`) |

### التسلسل

1. يطلب Claude `/mcp` بلا رمز ← `401` مع ترويسة `WWW-Authenticate` تشير إلى بيانات
   المورد ← يكتشف خادم التفويض ويسجّل نفسه عبر `/register`.
2. يفتح `/authorize` في متصفّح المستخدم ← `McpOAuthProvider.authorize` يعرض صفحة
   الدخول (عربية، RTL، بهوية غِراس). معطيات الطلب (العميل، `redirect_uri`، تحدّي
   PKCE، `state`) تُحمَل في الاستمارة **كرمز موقَّع قصير العمر** (15 دقيقة) بمفتاح
   مختلف عن مفتاحي الرموز، فلا يمكن تعديلها لتوجيه الرمز إلى عميل آخر.
3. `POST /oauth/login` يتحقّق بـ `AuthService.validateCredentials` — **نفس قواعد
   `POST /auth/login`** (اسم مستخدم غير حسّاس لحالة الأحرف، bcrypt، رفض الحساب المعطّل).
   الحساب الذي عليه `mustChangePassword` يُطلب منه تعيين كلمة مرور جديدة من التطبيق
   أولًا.
4. يُنشأ **رمز تفويض** عشوائي: يُخزَّن فقط تجزئته (`OAuthAuthorizationCode.codeHash`)،
   صالح 5 دقائق، **لاستعمال واحد** (يُعلَّم `usedAt` ذرّيًا)، ومقيّد بالعميل و
   `redirect_uri` وتحدّي PKCE.
5. `POST /token`: يتحقّق الـ SDK من PKCE، ثم نتحقّق من العميل و`redirect_uri` و
   `resource` ونصدر زوج رموز عبر `AuthService.issueOAuthTokens`.

### الرموز: نفس آلية التطبيقات مع تقييد الجمهور

رموز MCP هي نفس رموز JWT التي يصدرها `AuthService` (انظر
[`03-authentication.md`](./03-authentication.md))، بفارقين:

- **رمز الدخول يحمل `aud = <PUBLIC_API_URL>/mcp`** و`client_id`. `/mcp` لا يقبل إلا
  هذا الجمهور، و`JwtStrategy` (الـ REST) **يرفض أي رمز فيه `aud`** — فرمز MCP لا يصلح
  للـ REST، ورمز التطبيق لا يصلح لـ `/mcp`.
- **رمز التحديث مربوط بالعميل** (`RefreshToken.oauthClientId`): يُجدَّد فقط عبر
  `/token` ومن العميل نفسه، ويُرفض على `/auth/refresh`. التدوير والإبطال وإعادة قراءة
  حالة المستخدم عند كل تجديد كلها كما هي للتطبيقات.

رموز الدخول عديمة الحالة (JWT) فلا تُبطَل بـ `/revoke`، بل تنتهي خلال مدتها القصيرة
(`JWT_ACCESS_TTL`).

### سرّ العميل

يُخزَّن `OAuthClient.clientSecret` كنصّ صريح لأن الـ SDK يقارنه حرفيًا، ولا تنتهي صلاحيته
(`clientSecretExpirySeconds: 0`) كي لا يتعطّل الربط بعد 30 يومًا. حمايته محدودة القيمة
عمدًا: أي رمز يتطلّب دائمًا دخول المستخدم نفسه + PKCE.

### العنوان العام (`PUBLIC_API_URL`)

يجب أن تعلن بيانات OAuth العنوان الذي يصل إليه العميل فعلًا. الترتيب في `mcpUrls()`:
`PUBLIC_API_URL` إن وُجد، وإلا `https://$RAILWAY_PUBLIC_DOMAIN` (يحقنه Railway
تلقائيًا)، وإلا `http://localhost:$PORT` محليًا. خلف وكيل Railway يُضبط
`trust proxy` كي يعمل تحديد معدّل الطلبات في مسارات OAuth لكل عميل لا لكل وكيل.

## نقطة `/mcp`

**عديمة الحالة (Stateless):** كل طلب `POST /mcp` يُنشئ خادم MCP ونقلًا جديدين مربوطين
بالمستخدم (`McpServerFactory.create(userId)`)، فلا يوجد مخزن جلسات وأي نسخة من الـ API
تستطيع الرد. `GET`/`DELETE` تُرجع `405`.

**حجم الطلب:** `/mcp` له محلّل JSON خاص به (`mcpJsonParser` في `mount.ts`) بحدّ يتّسع
لأكبر مرفق بترميز base64 (`MCP_MAX_ATTACHMENT_BYTES` × 4/3 + 1MB)، بينما تبقى بقية
المسارات على حدّ Nest الافتراضي (100kb). يُركَّب **بعد** فحص الرمز، فلا يستطيع عميل
مجهول أن يجعل الـ API يحمّل جسمًا كبيرًا في الذاكرة. واسمه ليس `jsonParser` عمدًا:
Nest يتخطّى تسجيل محلّله العام إن وجد وسيطًا بهذا الاسم (`isMiddlewareApplied`).

**الأخطاء:** استثناءات الخدمات (`403` ليس عضوًا، `404` بطاقة مقيّدة، `400` نقل غير
صالح…) تُعاد كنتيجة أداة بـ `isError: true` ونصّ مفهوم، لا كخطأ بروتوكول، كي يشرح
المساعد السبب للمستخدم.

**مخطّطات المدخلات** مأخوذة من مخطّطات zod في `packages/types` نفسها
(`CreateCardRequestSchema`، `UpdateCardRequestSchema`…)، فأي حقل جديد في البطاقة يظهر
تلقائيًا في أدوات MCP. وما يُكتب في `.describe()` على تلك المخطّطات يصل إلى Claude
كتوثيق للحقل — هكذا يُشرح التكرار (انظر أدناه).

## الأدوات

| الأداة | تستدعي | ملاحظات |
|---|---|---|
| `list_boards` | `BoardsService.listForUser` | لوحات المستخدم غير المؤرشفة |
| `get_board` | `BoardsService.getDetail` | الأعضاء (بمعرّفاتهم وأدوارهم) والقوائم بالترتيب وبطاقاتها — منها تُعرف معرّفات القوائم والبطاقات والأشخاص |
| `get_card` | `CardsService.getDetail` + المهام الفرعية + التعليقات + المرفقات | كل حقول البطاقة، قائمتها (حالتها)، المُسنَدون، الوصول، المهام الفرعية، التعليقات، والمرفقات (المعرّف، الاسم، النوع، الحجم، الرافع، والرابط المطلق `/uploads/...` على `PUBLIC_API_URL`) |
| `get_card_history` | `CardsService.getHistory` | سجلّ النشاط |
| `my_tasks` | `MyTasksService.list` | مهامي المفتوحة عبر كل اللوحات |
| `list_all_boards` | `OversightService.boardsList` | **للمتابع فقط** (`isSupervisor`): كل لوحات النظام مع مالكها — انظر [`16-oversight.md`](./16-oversight.md) |
| `search_all_tasks` | `OversightService.tasks` | **للمتابع فقط**: البطاقات عبر كل اللوحات بمرشّحات `GET /oversight/tasks` و`nextCursor`. `get_board`/`get_card` تعمل للمتابع على أي لوحة للقراءة فقط (`supervised: true`)، وأدوات الكتابة تُرفض |
| `create_card` | `CardsService.create` (+ `updateAssignees`) | كل حقول الإنشاء: العنوان، الوصف، الاستحقاق ووقته، الأولوية، التكلفة وملاحظتها، التكرار، والمُسنَدون |
| `update_card` | `CardsService.update` | أي حقل قابل للتعديل بما فيه الأرشفة؛ `null` يمسح الحقل |
| `move_card` | `CardsService.update` (`targetListId` + `move`) | تغيير الحالة = النقل إلى قائمة أخرى؛ الموضع `top`/`bottom`/بعد بطاقة معيّنة. الأداة تحسب **معرّفات الجيران فقط** والخادم يحسب المفتاح عبر `computeMovePosition` (انظر [`06-ordering.md`](./06-ordering.md)) |
| `set_card_assignees` | `CardsService.updateAssignees` | |
| `set_card_access` | `CardsService.updateAccess` | تقييد البطاقة بأعضاء محدّدين أو فتحها للوحة |
| `add_subtask` / `update_subtask` / `set_subtask_assignees` | `SubtasksService` | إضافة، إعادة تسمية، إنجاز/إلغاء إنجاز، إعادة ترتيب، إسناد. `update_subtask` يقبل `position` (`top`/`bottom`/`{ afterSubtaskId }`) ويحوّله إلى `move` بمعرّفات الجيران كما في `move_card` (الدالة المشتركة `neighbours`) |
| `delete_subtask` | `SubtasksService.remove` | حذف نهائي؛ `destructiveHint: true` |
| `add_comment` | `CommentsService.create` | تُطلق الإشعارات المعتادة |
| `read_attachment` | `AttachmentsService.read` | يفتح مرفقًا: الصور (`png`/`jpeg`/`gif`/`webp`) تعود صورةً يراها النموذج، والملفات النصّية نصًّا، وغيرها (PDF، Word…) موردًا بترميز base64. ما فوق `MCP_MAX_ATTACHMENT_BYTES` (5MB) يُرفض بـ 413 قبل القراءة من التخزين |
| `add_attachment` | `AttachmentsService.create` | خادم MCP البعيد لا يرى ملفّات المستخدم، فيُرسَل **المحتوى نفسه**: إمّا `contentBase64` أو `text` (لملفّ نصّي) — واحد فقط. حتى 5MB (أقل من 20MB في التطبيق لأن الملف يمرّ داخل استدعاء الأداة)، وتسري قاعدة 10 مرفقات للبطاقة وكل فحوص الرفع العادي |
| `delete_attachment` | `AttachmentsService.remove` | للرافع أو منشئ البطاقة أو مالك اللوحة؛ `destructiveHint: true` |
| `create_board` | `BoardsService.create` | المستخدم يصبح المالك؛ **`template` غير مكشوف** فتأتي اللوحة دائمًا بالقوائم الخمس |
| `find_users_to_add` | `BoardsService.listMemberCandidates` | للمالك فقط |
| `add_board_member` | `BoardsService.addMember` | للمالك فقط؛ الدور `MEMBER` أو `VIEWER` |

**غير متاح عمدًا:** إنشاء القوائم أو تعديلها، حذف البطاقات والتعليقات (البطاقة تُؤرشَف
بـ `update_card`)، وإدارة المستخدمين. حذف المهام الفرعية والمرفقات متاح لأنه لا بديل له:
بدونه اضطرّ Claude إلى إعادة إنشاء البطاقة كاملة لحذف بنود منها، فضاع معرّفها وسجلّها.
أدوات الحذف مُعلَّمة `destructiveHint: true` فيطلب العميل تأكيد المستخدم.

## المهام المتكرّرة كما يراها Claude

حقل `recurrence` في `create_card`/`update_card` بلا شرح لا يكفي النموذج ليعرف متى
تعود المهمة، لذلك يحمل `RecurrenceRuleSchema` (`packages/types/src/domain.ts`)
وصفًا (`.describe()`) يصل إلى Claude مع مخطّط الأداة:

- `weekdays`: ‏0 = الأحد … 6 = السبت (ترقيم `getDay()`).
- النسخة التالية تُولَّد **فقط** عند النقل إلى «انتهى» (`CLOSED`) لا «منجز» (`DONE`)،
  وتظهر في «جديد».
- موعدها = الموعد السابق + الدورة، لا تاريخ اليوم — فإغلاق بطاقة متأخرًا قد يولّد نسخة
  متأخرة أصلًا.
- ما يُنقل إليها: العنوان، الوصف، الأولوية، المُسنَدون، وجود وقت للموعد، تقييد الوصول،
  القاعدة، والمهام الفرعية (غير منجزة)؛ التكلفة لا تُنسخ.

تفاصيل الحساب (ومنها المنطقة الزمنية) في
[`14-notifications-comments-attachments.md`](./14-notifications-comments-attachments.md#توليد-المهمة-المتكررة-recurrence).
إن تغيّر ما تنقله `spawnNextRecurrence` فحدّث هذا الوصف معه.

</div>
