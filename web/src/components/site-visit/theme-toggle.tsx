"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const subscribe = () => () => {};

/** Light or dark for this page. The icon shows the theme the button switches to. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // Render the icon only after the browser knows the saved theme, so the server and client markup match.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const isLight = mounted && resolvedTheme === "light";
  const next = isLight ? "dark" : "light";
  const label = `Switch to ${next} theme`;
  return (
    <Button variant="outline" size="icon" aria-label={label} title={label} onClick={() => setTheme(next)}>
      {isLight ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
    </Button>
  );
}
