"use client";

import { animate, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, SparklesIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import styles from "./ThoughtLine.module.css";

type ThoughtGlyph = "sparkle" | "dot" | "none" | ReactNode;

interface ThoughtLineProps {
  label?: string;
  doneLabel?: string;
  renderLabel?: (text: string, working: boolean) => ReactNode;
  glyph?: ThoughtGlyph;
  steps?: string[];
  collapsible?: boolean;
  collapseOnSettle?: boolean;
  color?: string;
  glyphColor?: string;
  fontSize?: number;
  breathPeriod?: number;
  breathDepth?: number;
  shimmer?: boolean;
  shimmerDuration?: number;
  settleDuration?: number;
  settleBlur?: number;
  working?: boolean;
  settleAfter?: number;
  elapsed?: number;
  showTimer?: boolean;
  onSettle?: (seconds: number) => void;
  className?: string;
  style?: CSSProperties;
}

const EMPTY_STEPS: string[] = [];

function formatDuration(seconds: number): string {
  return seconds < 60
    ? `${seconds.toFixed(1)}s`
    : `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(1)}s`;
}

export default function ThoughtLine({
  label = "Thinking…",
  doneLabel = "",
  renderLabel,
  glyph = "sparkle",
  steps = EMPTY_STEPS,
  collapsible = true,
  collapseOnSettle = true,
  color = "currentColor",
  glyphColor = "",
  fontSize = 16,
  breathPeriod = 1.6,
  breathDepth = 0.45,
  shimmer = true,
  shimmerDuration = 1.8,
  settleDuration = 350,
  settleBlur = 2,
  working = true,
  settleAfter = 0,
  elapsed,
  showTimer = true,
  onSettle,
  className = "",
  style,
}: ThoughtLineProps) {
  const prefersReducedMotion = useReducedMotion();
  const reduceMotion = Boolean(prefersReducedMotion);
  const [settleState, setSettleState] = useState(() => ({ working, autoSettled: false }));
  const autoSettled = settleState.working === working && settleState.autoSettled;
  const isWorking = working && !autoSettled;
  const [traceState, setTraceState] = useState(() => ({ working: isWorking, open: true }));
  const [clockState, setClockState] = useState(() => ({ working: isWorking, seconds: 0 }));
  if (settleState.working !== working) {
    setSettleState({ working, autoSettled: false });
  }
  if (traceState.working !== isWorking) {
    setTraceState({
      working: isWorking,
      open: isWorking ? true : collapseOnSettle ? false : traceState.open,
    });
  }
  if (clockState.working !== isWorking) {
    setClockState({ working: isWorking, seconds: isWorking ? 0 : clockState.seconds });
  }
  const open = traceState.open;
  const clock = clockState.seconds;
  const glyphRef = useRef<HTMLSpanElement>(null);
  const startedAt = useRef<number | null>(null);
  const previousWorking = useRef(isWorking);
  const onSettleRef = useRef(onSettle);

  const doneText = doneLabel || (showTimer ? "Thought for" : "Done thinking");
  const duration = elapsed ?? clock;
  const hasTrace = steps.length > 0;
  const trough = 1 - (reduceMotion ? Math.min(breathDepth, 0.2) : breathDepth);
  const period = reduceMotion ? breathPeriod * 1.5 : breathPeriod;
  const showShimmer = shimmer && !reduceMotion && isWorking;

  useEffect(() => {
    onSettleRef.current = onSettle;
  }, [onSettle]);

  useEffect(() => {
    if (!isWorking) return;
    startedAt.current = performance.now();
    const startTime = startedAt.current;
    const interval = window.setInterval(() => {
      setClockState((current) => ({
        ...current,
        seconds: (performance.now() - startTime) / 1_000,
      }));
    }, 100);
    return () => window.clearInterval(interval);
  }, [isWorking]);

  useEffect(() => {
    if (!isWorking || settleAfter <= 0) return;
    const timeout = window.setTimeout(() => {
      setSettleState((current) => ({ ...current, autoSettled: true }));
    }, settleAfter * 1_000);
    return () => window.clearTimeout(timeout);
  }, [isWorking, settleAfter]);

  useEffect(() => {
    if (previousWorking.current && !isWorking) {
      const seconds = elapsed ?? (
        startedAt.current === null ? clock : (performance.now() - startedAt.current) / 1_000
      );
      onSettleRef.current?.(seconds);
    }
    previousWorking.current = isWorking;
  }, [clock, elapsed, isWorking]);

  useEffect(() => {
    const glyphElement = glyphRef.current;
    if (!glyphElement) return;
    if (!isWorking) {
      const controls = animate(
        glyphElement,
        { opacity: 0.68, scale: 1, filter: [`blur(${settleBlur}px)`, "blur(0px)"] },
        { duration: reduceMotion ? 0 : settleDuration / 1_000, ease: "easeOut" },
      );
      return () => controls.stop();
    }
    if (reduceMotion) return;
    const controls = animate(
      glyphElement,
      { opacity: [1, trough, 1], scale: [1, 0.97, 1] },
      { duration: period, repeat: Infinity, ease: "easeInOut" },
    );
    return () => controls.stop();
  }, [isWorking, period, reduceMotion, settleBlur, settleDuration, trough]);

  const labelText = isWorking ? label : doneText;
  const displayedLabel = renderLabel ? renderLabel(labelText, isWorking) : labelText;
  const lineStyle = {
    ...style,
    "--thought-ink": color,
    "--thought-glyph": glyphColor || color,
    "--thought-size": `${fontSize}px`,
    "--thought-shimmer-duration": `${shimmerDuration}s`,
    "--thought-settle-duration": `${settleDuration}ms`,
    "--thought-settle-blur": `${settleBlur}px`,
  } as CSSProperties;
  const glyphNode = glyph === "sparkle"
    ? <HugeiconsIcon icon={SparklesIcon} size={16} aria-hidden="true" />
    : glyph === "dot"
      ? <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      : glyph === "none"
        ? null
        : glyph;
  const line = (
    <span className={styles.toggle}>
      <span ref={glyphRef} className={styles.glyph} aria-hidden="true">
        {glyphNode}
      </span>
      <span className={`${styles.label} ${isWorking ? styles.working : ""} ${showShimmer ? styles.shimmer : ""}`}>
        {displayedLabel}
      </span>
      {showTimer ? <span className={styles.timer}>{formatDuration(duration)}</span> : null}
      {hasTrace && collapsible ? (
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`} aria-hidden="true">
          <HugeiconsIcon icon={ArrowDown01Icon} size={14} />
        </span>
      ) : null}
    </span>
  );

  return (
    <div className={`${styles.root} ${isWorking ? styles.working : ""} ${className}`} style={lineStyle}>
      {hasTrace && collapsible ? (
        <button
          type="button"
          className="rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
          aria-expanded={open}
          onClick={() => setTraceState((current) => ({ ...current, open: !current.open }))}
        >
          {line}
        </button>
      ) : (
        <div role="status" aria-live="polite">{line}</div>
      )}
      {hasTrace && open ? (
        <ol className={styles.trace}>
          {steps.map((step, index) => (
            <li key={`${step}-${index}`} className={styles.traceItem}>
              {index < steps.length - 1 ? (
                <HugeiconsIcon className={styles.tick} icon={Tick02Icon} size={14} aria-hidden="true" />
              ) : (
                <span aria-hidden="true" className="mt-1 size-1.5 rounded-full bg-current opacity-60" />
              )}
              <span>{step}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
