import { useEffect, useState } from "react";

export function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    const stored = window.localStorage.getItem("cloudtalk-theme") as "light" | "dark" | null;
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    window.localStorage.setItem("cloudtalk-theme", theme);
  }, [theme]);

  return { theme, toggleTheme: () => setTheme((prev) => (prev === "dark" ? "light" : "dark")) };
}
