import * as SecureStore from "expo-secure-store";

const USERNAME_KEY = "kanban.savedUsername";
const PASSWORD_KEY = "kanban.savedPassword";

export interface SavedCredentials {
  username: string;
  password: string;
}

/**
 * «تذكّرني» on the login screen. The password is a real credential, so it goes
 * into the Keychain / Android Keystore alongside the tokens — never
 * `AsyncStorage`. Nothing is stored unless the user ticks the switch, and
 * signing in with it off wipes whatever an earlier sign-in saved.
 *
 * Logging out deliberately keeps these: prefilling the next sign-in is the
 * whole point of the feature.
 */
export async function loadSavedCredentials(): Promise<SavedCredentials | null> {
  const [username, password] = await Promise.all([
    SecureStore.getItemAsync(USERNAME_KEY),
    SecureStore.getItemAsync(PASSWORD_KEY),
  ]);
  return username && password ? { username, password } : null;
}

export async function saveCredentials({ username, password }: SavedCredentials) {
  await SecureStore.setItemAsync(USERNAME_KEY, username);
  await SecureStore.setItemAsync(PASSWORD_KEY, password);
}

export async function clearSavedCredentials() {
  await SecureStore.deleteItemAsync(USERNAME_KEY);
  await SecureStore.deleteItemAsync(PASSWORD_KEY);
}

/**
 * After a password change, a remembered password for *this* user is stale —
 * swap it for the new one so the next prefilled sign-in doesn't fail. Compared
 * case-insensitively because usernames are stored lowercase server-side while
 * the saved copy is whatever the user typed.
 */
export async function updateSavedPassword(username: string, newPassword: string) {
  const saved = await loadSavedCredentials();
  if (saved && saved.username.toLowerCase() === username.toLowerCase()) {
    await SecureStore.setItemAsync(PASSWORD_KEY, newPassword);
  }
}
