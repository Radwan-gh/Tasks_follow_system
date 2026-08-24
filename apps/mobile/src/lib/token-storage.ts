import * as SecureStore from "expo-secure-store";
import type { TokenStorage } from "@app/api-client";

const ACCESS_KEY = "kanban.accessToken";
const REFRESH_KEY = "kanban.refreshToken";

/**
 * The mobile adapter for `@app/api-client`'s `TokenStorage`. Tokens go into the
 * Keychain / Android Keystore rather than `AsyncStorage`, because a refresh
 * token is long-lived and rotating — a stolen one is a session until it is used.
 *
 * Every method is async, which is exactly why `TokenStorage` allows promises.
 */
export const tokenStorage: TokenStorage = {
  getAccessToken: () => SecureStore.getItemAsync(ACCESS_KEY),
  getRefreshToken: () => SecureStore.getItemAsync(REFRESH_KEY),
  async setTokens(accessToken, refreshToken) {
    await SecureStore.setItemAsync(ACCESS_KEY, accessToken);
    await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
  },
  async clear() {
    await SecureStore.deleteItemAsync(ACCESS_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
};
