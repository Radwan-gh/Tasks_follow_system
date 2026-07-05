const ACCESS_KEY = "kanban.accessToken";
const REFRESH_KEY = "kanban.refreshToken";

export const tokenStore = {
  getAccessToken: () => localStorage.getItem(ACCESS_KEY),
  getRefreshToken: () => localStorage.getItem(REFRESH_KEY),
  setTokens(accessToken: string, refreshToken: string) {
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};
