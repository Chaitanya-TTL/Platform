"use client";
import { useCallback, useEffect, useState, type RefObject } from "react";
export function useBomNativeFullscreen(panelRef: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement === panelRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [panelRef]);
  const toggleFullscreen = useCallback(async () => {
    const panel = panelRef.current;
    if (!panel) return;
    try {
      if (document.fullscreenElement === panel) await document.exitFullscreen();
      else {
        if (document.fullscreenElement) await document.exitFullscreen();
        await panel.requestFullscreen({ navigationUI: "hide" });
      }
    } catch (error) { console.error("Unable to toggle BOM fullscreen", error); }
  }, [panelRef]);
  return { isFullscreen, toggleFullscreen };
}
