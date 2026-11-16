import { describe, expect, it } from "vitest";
import { isTheme, THEME_COLORS } from "./theme";

describe("isTheme", () => {
  it.each(["light", "dark", "dark-contrast"])("accepts %s", (value) => {
    expect(isTheme(value)).toBe(true);
  });

  it.each([undefined, null, "", "system", "DARK"])("rejects %s", (value) => {
    expect(isTheme(value)).toBe(false);
  });

  it("defines a browser theme-color for every theme", () => {
    expect(Object.keys(THEME_COLORS).sort()).toEqual(["dark", "dark-contrast", "light"]);
  });
});
