# غِراس — ملفات الشعار (1b)

الألوان: أخضر رئيسي #1F7A5C · ورقة #5FB08C · فاتح #CFF2E0 · داكن #16241E · الخط Cairo 800

- ghiras-icon.svg / -square / -maskable: أيقونة التطبيق
- ghiras-mark*.svg: الرمز وحده (فاتح، داكن، أبيض)
- ghiras-notification-icon.svg: أيقونة إشعار أندرويد (مربّع أبيض والرمز مقصوص منه) — مصدر `apps/mobile/assets/images/notification-icon.png`
- ghiras-logo-light.png / -dark.png: الشعار مع الاسم
- splash-layers.js: يولّد طبقتَي شاشة البداية المتحرّكة في الجوال (`splash-check.png` و`splash-leaf.png`) من هندسة ghiras-icon.svg، مطابقتين لـ `splash-icon.png`
- ios/: AppIcon-1024 للمتجر + أحجام Xcode (iOS يقصّ الزوايا تلقائيًا)
- android/: Play Store 512 + mipmap + طبقة أمامية للأيقونة التكيّفية (خلفية #1F7A5C)
- web/: favicon + apple-touch-icon + PWA manifest

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#1F7A5C">
```
