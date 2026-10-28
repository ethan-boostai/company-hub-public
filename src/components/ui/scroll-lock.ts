"use client";

import { useEffect } from "react";

let locks = 0;

// While any drawer or modal is open, the page behind it does not scroll.
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const gap = window.innerWidth - root.clientWidth;
    locks += 1;
    root.classList.add("scroll-locked");
    if (gap > 0) root.style.paddingRight = `${gap}px`;
    return () => {
      locks -= 1;
      if (locks === 0) {
        root.classList.remove("scroll-locked");
        root.style.paddingRight = "";
      }
    };
  }, [active]);
}
