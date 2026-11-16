export type Theme = "light" | "dark" | "dark-contrast";

export const THEME_STORAGE_KEY = "clipshed:theme";
export const THEME_COOKIE = "clipshed_theme";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const THEMES: readonly Theme[] = ["light", "dark", "dark-contrast"];

export const THEME_COLORS: Record<Theme, string> = {
  light: "#f1eee6",
  dark: "#1d1a16",
  "dark-contrast": "#050505",
};

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/** Reads the saved theme. The inline script in index.html applies it before first paint. */
export function storedTheme(): Theme {
  try {
    const cookie = readCookie();
    if (isTheme(cookie)) return cookie;

    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : "light";
  } catch {
    return "light";
  }
}

/**
 * Theme is stored in a cookie because the desktop app uses a random loopback
 * port; cookies are scoped by host, while localStorage is scoped by origin
 * (host + port) and would reset on every launch.
 */
function readCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLORS[theme]);
}

export function persistTheme(theme: Theme): void {
  try {
    document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  } catch {
    // Cookies can be unavailable; fall through to localStorage.
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable in private windows; the theme still applies for this session.
  }
}
