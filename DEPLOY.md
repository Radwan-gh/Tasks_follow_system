# النشر على Railway (Deploy to Railway)

هذا الدليل ينشر النظام على [Railway](https://railway.app) كـ **ثلاث خدمات** ضمن
مشروع واحد:

1. **Postgres** — قاعدة البيانات (إضافة جاهزة من Railway).
2. **API** — خادم NestJS (`apps/api/Dockerfile`).
3. **Web** — الواجهة الثابتة React (`apps/web/Dockerfile`).

الواجهة والـ API يعملان على **نطاقين منفصلين**؛ الواجهة تتصل بالـ API عبر المتغيّر
`VITE_API_URL` الذي يُدمَج وقت البناء. الـ API يفعّل CORS بالفعل، والهجرات تُطبَّق
تلقائيًا عند الإقلاع.

> ملاحظة: كل الملفات اللازمة موجودة في المستودع على الفرع
> `claude/next-phase-planning-c0wb0v`. لا حاجة لأي تعديل يدوي على الكود.

---

## 0) المتطلّبات

- حساب على Railway مربوط بحساب GitHub الذي يملك المستودع.
- من Railway: **New Project → Deploy from GitHub repo** واختر
  `Radwan-gh/Tasks_follow_system`، والفرع `claude/next-phase-planning-c0wb0v`.

---

## 1) قاعدة البيانات (Postgres)

- داخل المشروع: **New → Database → Add PostgreSQL**.
- ستوفّر الخدمة متغيّرًا `DATABASE_URL` سنشير إليه من خدمة الـ API.

---

## 2) خدمة الـ API

أنشئ خدمة من نفس المستودع (New → GitHub Repo)، ثم في **Settings** و**Variables**:

**Settings**
- **Root Directory**: `/` (جذر المستودع — مهم، لأن البناء يحتاج حزم الـ workspace).
- **Config / Dockerfile Path**: عيّن المتغيّر `RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile`
  (في تبويب Variables)، أو من إعدادات البناء اختر Dockerfile وحدّد `apps/api/Dockerfile`.
- **Networking → Generate Domain** لإنشاء نطاق عام (سنحتاجه في خطوة الواجهة).

**Variables**
| المتغيّر | القيمة |
|---|---|
| `RAILWAY_DOCKERFILE_PATH` | `apps/api/Dockerfile` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (مرجع لخدمة Postgres) |
| `JWT_ACCESS_SECRET` | سلسلة عشوائية طويلة (انظر أدناه) |
| `JWT_REFRESH_SECRET` | سلسلة عشوائية طويلة **مختلفة** |
| `JWT_ACCESS_TTL` | `15m` |
| `JWT_REFRESH_TTL` | `30d` |

> `PORT` توفّره Railway تلقائيًا؛ لا تضبطه يدويًا.

لتوليد الأسرار (على جهازك):
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

عند أول إقلاع يقوم الـ API تلقائيًا بـ: تطبيق الهجرات (`prisma migrate deploy`) ثم
بذر مستخدم مدير افتراضي، ثم التشغيل.

---

## 3) خدمة الواجهة (Web)

أنشئ خدمة ثانية من نفس المستودع، ثم:

**Settings**
- **Root Directory**: `/`.
- **Networking → Generate Domain**.

**Variables**
| المتغيّر | القيمة |
|---|---|
| `RAILWAY_DOCKERFILE_PATH` | `apps/web/Dockerfile` |
| `VITE_API_URL` | نطاق خدمة الـ API الكامل، مثل `https://your-api.up.railway.app` (بدون `/` في النهاية وبدون `/api`) |

> مهم: `VITE_API_URL` يُدمَج **وقت البناء**. إذا غيّرت نطاق الـ API لاحقًا، أعد نشر
> خدمة الواجهة (Redeploy) كي يُلتقط النطاق الجديد.

---

## 4) الدخول والتجربة

بعد اكتمال نشر الخدمتين، افتح نطاق **الواجهة**. حساب المدير الافتراضي المبذور:

- البريد: `admin@example.com`
- كلمة المرور: `password123`

> **غيّر كلمة المرور فورًا** (أو اضبط `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`
> كمتغيّرات في خدمة الـ API قبل النشر). المدير هو من يرى قسم **التقارير**.

لتجربة مزايا هذه المرحلة:
1. أنشئ لوحة واختر **«قالب سير عمل المهام»** → تظهر القوائم الخمس.
2. افتح بطاقة → أضِف مهامًا فرعية وأسنِدها لأعضاء.
3. انقل بطاقة إلى «تم التنفيذ».
4. من حساب المدير افتح **/reports** لرؤية التقارير.

---

## استكشاف الأخطاء

- **فشل بناء الـ API/الواجهة**: تأكّد أن **Root Directory = `/`** وأن
  `RAILWAY_DOCKERFILE_PATH` مضبوط بالمسار الصحيح — البناء يحتاج جذر المستودع لحزم
  `@app/ordering` و`@app/types`.
- **الواجهة لا تتصل بالـ API (أخطاء شبكة/401)**: راجع `VITE_API_URL` (نطاق الـ API
  الصحيح بدون `/api`)، ثم أعد نشر الواجهة.
- **أخطاء قاعدة البيانات**: تأكّد أن `DATABASE_URL` في خدمة الـ API يشير إلى
  `${{Postgres.DATABASE_URL}}`.
