/**
 * The page an MCP client (claude.ai, Claude Desktop, Claude Code…) opens in the
 * user's browser during OAuth: sign in with your غِراس username and password
 * to let that client act on your boards. Plain server-rendered HTML — it is the
 * only page the API serves, so it carries its own minimal brand styling
 * (palette and mark from `logo/README.md`) rather than pulling in a frontend.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const MARK_SVG = `<svg width="56" height="56" viewBox="0 0 96 96" aria-hidden="true"><path d="M14 54 L36 76 L64 42" fill="none" stroke="#1F7A5C" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><path d="M64 42 C64 24 75 12 92 12 C92 30 81 42 64 42 Z" fill="#5FB08C"/><path d="M66 40 L84 22" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round"/></svg>`;

export interface LoginPageOptions {
  /** The client's self-declared name from dynamic registration, e.g. "Claude". */
  clientName: string;
  /** Signed, short-lived token carrying the pending authorization request. */
  requestToken: string;
  /** Where the form posts — `/oauth/login`. */
  action: string;
  username?: string;
  error?: string;
}

export function renderLoginPage({ clientName, requestToken, action, username, error }: LoginPageOptions): string {
  const name = escapeHtml(clientName);
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#1F7A5C">
<title>غِراس — ربط ${name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;800&display=swap" rel="stylesheet">
<style>
  :root { --green: #1F7A5C; --leaf: #5FB08C; --mint: #CFF2E0; --ink: #16241E; --muted: #5B6273; --line: #E3E7EC; --bg: #F5F8F6; --danger: #B3261E; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px;
         background: var(--bg); color: var(--ink); font-family: Cairo, system-ui, sans-serif; line-height: 1.7; }
  main { width: 100%; max-width: 400px; background: #fff; border: 1px solid var(--line); border-radius: 20px; padding: 32px 28px; }
  .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
  .brand strong { font-size: 28px; font-weight: 800; color: var(--green); }
  h1 { font-size: 20px; font-weight: 800; margin: 0 0 4px; }
  p.lead { margin: 0 0 20px; color: var(--muted); font-size: 15px; }
  ul.scope { margin: 0 0 24px; padding: 12px 16px; list-style: none; background: var(--mint); border-radius: 12px; font-size: 14px; }
  ul.scope li::before { content: "✓"; color: var(--green); font-weight: 800; margin-inline-end: 8px; }
  label { display: block; font-weight: 600; font-size: 14px; margin: 0 0 6px; }
  input { width: 100%; font: inherit; padding: 10px 14px; border: 1px solid var(--line); border-radius: 12px; margin-bottom: 16px; background: #fff; color: var(--ink); }
  input:focus { outline: 2px solid var(--leaf); outline-offset: 1px; border-color: var(--leaf); }
  input[name=username] { direction: ltr; text-align: right; }
  button { width: 100%; font: inherit; font-weight: 800; padding: 12px; border: 0; border-radius: 12px; background: var(--green); color: #fff; cursor: pointer; }
  button:hover { filter: brightness(1.08); }
  .error { background: #FCEEEE; color: var(--danger); border-radius: 12px; padding: 10px 14px; margin-bottom: 16px; font-size: 14px; }
  .note { margin: 16px 0 0; color: var(--muted); font-size: 13px; text-align: center; }
</style>
</head>
<body>
<main>
  <div class="brand">${MARK_SVG}<strong>غِراس</strong></div>
  <h1>ربط ${name} بحسابك</h1>
  <p class="lead">سجّل الدخول للسماح لـ<bdi>${name}</bdi> بالعمل على لوحاتك باسمك.</p>
  <ul class="scope">
    <li>قراءة لوحاتك ومهامك</li>
    <li>إضافة المهام وتعديلها ونقلها</li>
    <li>إنشاء اللوحات وإضافة الأعضاء إليها</li>
  </ul>
  ${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ""}
  <form method="post" action="${escapeHtml(action)}">
    <input type="hidden" name="request" value="${escapeHtml(requestToken)}">
    <label for="username">اسم المستخدم</label>
    <input id="username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required value="${escapeHtml(username ?? "")}">
    <label for="password">كلمة المرور</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button type="submit">تسجيل الدخول والسماح</button>
  </form>
  <p class="note">لن يحصل ${name} على كلمة مرورك. يمكنك إلغاء الربط من إعدادات ${name} في أي وقت.</p>
</main>
</body>
</html>`;
}
