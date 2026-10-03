"use client";

import { useEffect, useState } from "react";

import { MoonIcon, SunIcon } from "@/components/share/icons";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Zu hellem Design wechseln" : "Zu dunklem Design wechseln"}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-ink transition hover:border-muted/50 ${className}`}
    >
      {/* Sonne / Mond, ohne Layout-Sprung vor Mount */}
      {mounted && dark ? (
        <SunIcon className="h-[18px] w-[18px]" />
      ) : (
        <MoonIcon className="h-[18px] w-[18px]" />
      )}
    </button>
  );
}
