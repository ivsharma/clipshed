import { useCallback, useEffect, useState } from "react";
import { applyTheme, persistTheme, storedTheme, type Theme } from "../lib/theme";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(storedTheme);

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);

  return { theme, setTheme };
}
