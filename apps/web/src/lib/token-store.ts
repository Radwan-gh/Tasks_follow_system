import type { TokenStorage } from "@app/api-client";

const ACCESS_KEY = "kanban.accessToken";
const REFRESH_KEY = "kanban.refreshToken";
const REMEMBER_KEY = "kanban.rememberMe";
const USERNAME_KEY = "kanban.lastUsername";

/**
 * Where this browser keeps the token pair, decided by the "تذكرني" checkbox on
 * the login screen:
 *
 * - **checked** → `localStorage`: the session survives closing the browser.
 * - **unchecked** → `sessionStorage`: the tokens die with the tab, so walking
 *   away from a shared machine does not leave an open session behind.
 *
 * The flag itself lives in `localStorage` (it must outlive the tab to be read
 * on the next visit) and is absent for sessions created before the feature
 * existed — those are treated as remembered so nobody is signed out by the
 * upgrade. The server enforces the same choice independently via the refresh
 * token's TTL; this only decides where the tokens sit on the client.
 */
function isRemembered(): boolean {
  return localStorage.getItem(REMEMBER_KEY) !== "0";
}

function activeStore(): Storage {
  return isRemembered() ? localStorage : sessionStorage;
}

/** The web adapter for `@app/api-client`'s `TokenStorage`. */
export const tokenStore = {
  getAccessToken: () => activeStore().getItem(ACCESS_KEY),
  getRefreshToken: () => activeStore().getItem(REFRESH_KEY),
  setTokens(accessToken: string, refreshToken: string) {
    const store = activeStore();
    store.setItem(ACCESS_KEY, accessToken);
    store.setItem(REFRESH_KEY, refreshToken);
  },
  clear() {
    // Clear both stores, never just the active one: the flag may have flipped
    // since the tokens were written, and a stray pair left in the other store
    // would be picked up again by the next login with the opposite choice.
    for (const store of [localStorage, sessionStorage]) {
      store.removeItem(ACCESS_KEY);
      store.removeItem(REFRESH_KEY);
    }
  },
} satisfies TokenStorage;

/**
 * Records the "تذكرني" choice. Called *before* `setTokens` at login so the
 * pair lands in the right store, and it clears whatever the previous session
 * left in the other one.
 */
export function setRemembered(remembered: boolean) {
  localStorage.setItem(REMEMBER_KEY, remembered ? "1" : "0");
  tokenStore.clear();
}

/**
 * The username to pre-fill on the login screen. Only kept for a remembered
 * login — an unchecked box also means "don't leave my name on this device".
 */
export function rememberUsername(username: string, remembered: boolean) {
  if (remembered) localStorage.setItem(USERNAME_KEY, username);
  else localStorage.removeItem(USERNAME_KEY);
}

export function getRememberedUsername(): string {
  return localStorage.getItem(USERNAME_KEY) ?? "";
}

export function getRememberedPreference(): boolean {
  return isRemembered();
}
