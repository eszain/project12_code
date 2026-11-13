"use client";

// Theme provider for the whole site. Every page except /site-visit stays forced to dark, as before.
// /site-visit lets the reader choose light or dark with the toggle in its header.

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "next-themes";

export function ThemeShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const choosable = pathname.startsWith("/site-visit");
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      forcedTheme={choosable ? undefined : "dark"}
      storageKey="cads-theme"
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
