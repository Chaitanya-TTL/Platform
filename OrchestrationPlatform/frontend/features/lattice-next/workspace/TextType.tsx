"use client";

import { createElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { gsap } from "gsap";
import styles from "./TextType.module.css";

type DeleteMode = "backspace" | "select";
type CursorStyle = "character" | "bar" | "block" | "underscore";
type TypeEffect = "none" | "fade" | "blur" | "rise";
type VariableSpeed = { min: number; max: number };
type TypoState = { plan: string[]; tail: string[]; fixing: boolean };

export interface TextTypeProps extends Omit<HTMLAttributes<HTMLElement>, "prefix"> {
  text: string | string[];
  as?: ElementType;
  prefix?: string;
  prefixColor?: string;
  typingSpeed?: number;
  initialDelay?: number;
  pauseDuration?: number;
  deletingSpeed?: number;
  deleteMode?: DeleteMode;
  typeEffect?: TypeEffect;
  mistakes?: number;
  variableSpeed?: VariableSpeed;
  loop?: boolean;
  showCursor?: boolean;
  cursorStyle?: CursorStyle;
  cursorCharacter?: ReactNode;
  cursorColor?: string;
  cursorBlinkDuration?: number;
  cursorGlide?: boolean;
  hideCursorWhileTyping?: boolean;
  cursorClassName?: string;
  textColors?: string[];
  onSentenceComplete?: (sentence: string, index: number) => void;
  onTextChange?: (text: string) => void;
  onComplete?: () => void;
  startOnVisible?: boolean;
  reverseMode?: boolean;
}

const NEIGHBORS: Record<string, string> = {
  a: "qwsz", b: "vghn", c: "xdfv", d: "serfcx", e: "wsdr", f: "drtgvc",
  g: "ftyhbv", h: "gyujnb", i: "ujko", j: "huikmn", k: "jiolm", l: "kop",
  m: "njk", n: "bhjm", o: "iklp", p: "ol", q: "wa", r: "edft", s: "awedxz",
  t: "rfgy", u: "yhji", v: "cfgb", w: "qase", x: "zsdc", y: "tghu", z: "asx",
  "0": "9p", "1": "2q", "2": "13w", "3": "24e", "4": "35r", "5": "46t",
  "6": "57y", "7": "68u", "8": "79i", "9": "80o",
};

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function graphemes(value: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value),
      (part) => part.segment,
    );
  }
  return Array.from(value);
}

function typoFor(character: string): string | null {
  const keys = NEIGHBORS[character.toLowerCase()];
  if (!keys) return null;
  const replacement = keys[Math.floor(Math.random() * keys.length)];
  return character === character.toLowerCase() ? replacement : replacement.toUpperCase();
}

export default function TextType({
  text,
  as: Component = "span",
  prefix = "",
  prefixColor = "currentColor",
  typingSpeed = 50,
  initialDelay = 0,
  pauseDuration = 2_000,
  deletingSpeed = 30,
  deleteMode = "backspace",
  typeEffect = "none",
  mistakes = 0,
  variableSpeed,
  loop = true,
  showCursor = true,
  cursorStyle = "character",
  cursorCharacter = "|",
  cursorColor = "currentColor",
  cursorBlinkDuration = 0.5,
  cursorGlide = true,
  hideCursorWhileTyping = false,
  cursorClassName = "",
  textColors = [],
  onSentenceComplete,
  onTextChange,
  onComplete,
  startOnVisible = false,
  reverseMode = false,
  className = "",
  ...props
}: TextTypeProps) {
  const textKey = Array.isArray(text) ? text.join("\u0000") : String(text ?? "");
  const textArray = useMemo(() => textKey.split("\u0000"), [textKey]);
  const [textIndex, setTextIndex] = useState(0);
  const [count, setCount] = useState(0);
  const [selected, setSelected] = useState(0);
  const [typo, setTypo] = useState<TypoState | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isVisible, setIsVisible] = useState(!startOnVisible);
  const [reduceMotion, setReduceMotion] = useState(false);
  const containerRef = useRef<HTMLElement | null>(null);
  const caretRef = useRef<HTMLSpanElement | null>(null);
  const cursorRef = useRef<HTMLSpanElement | null>(null);
  const blinkRef = useRef<HTMLSpanElement | null>(null);
  const blinkTimeline = useRef<gsap.core.Timeline | null>(null);
  const blinkResume = useRef<gsap.core.Tween | null>(null);
  const caretPosition = useRef<{ x: number; y: number } | null>(null);
  const placeCursor = useRef<(instant: boolean) => void>(() => {});
  const lastTypo = useRef(-1);
  const completeNotified = useRef(false);
  const previousTextKey = useRef(textKey);
  const onSentenceCompleteRef = useRef(onSentenceComplete);
  const onTextChangeRef = useRef(onTextChange);
  const onCompleteRef = useRef(onComplete);

  const index = textIndex % textArray.length;
  const chars = useMemo(() => graphemes(textArray[index]), [index, textArray]);
  const total = chars.length;
  const shown = Math.min(count, total);
  const minSpeed = variableSpeed?.min ?? typingSpeed;
  const maxSpeed = variableSpeed?.max ?? typingSpeed;
  const pace = (minSpeed + maxSpeed) / 2;
  const glideTime = Math.min(0.18, Math.max(0.06, pace * 0.0016));

  useEffect(() => {
    onSentenceCompleteRef.current = onSentenceComplete;
    onTextChangeRef.current = onTextChange;
    onCompleteRef.current = onComplete;
  }, [onComplete, onSentenceComplete, onTextChange]);

  useEffect(() => {
    if (previousTextKey.current === textKey) return;
    previousTextKey.current = textKey;
    completeNotified.current = false;
    lastTypo.current = -1;
    setTextIndex(0);
    setCount(0);
    setSelected(0);
    setTypo(null);
    setIsDeleting(false);
  }, [textKey]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!startOnVisible || !containerRef.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setIsVisible(true);
      observer.disconnect();
    }, { threshold: 0.1 });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [startOnVisible]);

  useEffect(() => {
    const blink = blinkRef.current;
    if (!showCursor || !blink) return;
    gsap.set(blink, { opacity: 1 });
    if (reduceMotion || cursorBlinkDuration <= 0) return;
    const hold = cursorBlinkDuration * 0.7;
    const fade = cursorBlinkDuration * 0.45;
    const timeline = gsap.timeline({ repeat: -1 });
    timeline
      .to(blink, { opacity: 0, duration: fade, ease: "sine.inOut" }, hold)
      .to(blink, { opacity: 1, duration: fade, ease: "sine.inOut" }, hold + fade + cursorBlinkDuration * 0.4);
    blinkTimeline.current = timeline;
    return () => {
      timeline.kill();
      blinkResume.current?.kill();
      gsap.killTweensOf(blink);
      blinkTimeline.current = null;
    };
  }, [cursorBlinkDuration, reduceMotion, showCursor]);

  useIsomorphicLayoutEffect(() => {
    caretPosition.current = null;
  }, [showCursor]);

  useIsomorphicLayoutEffect(() => {
    placeCursor.current = (instant) => {
      const caret = caretRef.current;
      const cursor = cursorRef.current;
      if (!caret || !cursor) return;
      const x = caret.offsetLeft;
      const y = caret.offsetTop;
      const last = caretPosition.current;
      if (last && Math.abs(last.x - x) < 0.5 && Math.abs(last.y - y) < 0.5) return;
      caretPosition.current = { x, y };

      if (instant || !last || !cursorGlide || reduceMotion || Math.abs(last.y - y) > 1) {
        gsap.killTweensOf(cursor);
        gsap.set(cursor, { x, y });
      } else {
        gsap.to(cursor, { x, y, duration: glideTime, ease: "power3.out", overwrite: true });
      }

      const timeline = blinkTimeline.current;
      const blink = blinkRef.current;
      if (instant || !timeline || !blink) return;
      timeline.pause();
      blinkResume.current?.kill();
      gsap.to(blink, { opacity: 1, duration: 0.12, ease: "power1.out" });
      blinkResume.current = gsap.delayedCall(0.12, () => timeline.restart());
    };
    placeCursor.current(false);
  });

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => placeCursor.current(true));
    observer.observe(node);
    return () => observer.disconnect();
  }, [Component]);

  useEffect(() => {
    onTextChangeRef.current?.(chars.slice(reverseMode ? total - shown : 0, reverseMode ? total : shown).join(""));
  }, [chars, reverseMode, shown, total]);

  useEffect(() => {
    if (!isVisible) return;
    let timeout: ReturnType<typeof setTimeout>;
    const wait = (ms: number, next: () => void) => {
      timeout = setTimeout(next, ms);
    };
    const speed = () => minSpeed + Math.random() * (maxSpeed - minSpeed);

    if (!isDeleting) {
      if (typo) {
        if (reduceMotion) {
          wait(0, () => setTypo(null));
        } else if (!typo.fixing) {
          if (typo.tail.length < typo.plan.length) {
            wait(speed(), () => setTypo({ ...typo, tail: typo.plan.slice(0, typo.tail.length + 1) }));
          } else {
            wait(260 + Math.random() * 320, () => setTypo({ ...typo, fixing: true }));
          }
        } else if (typo.tail.length) {
          wait(Math.max(45, deletingSpeed), () => setTypo({ ...typo, tail: typo.tail.slice(0, -1) }));
        } else {
          wait(90 + Math.random() * 140, () => setTypo(null));
        }
      } else if (shown < total) {
        const lead = shown === 0 ? initialDelay : 0;
        const next = reverseMode ? total - shown - 1 : shown;
        const wrong = mistakes > 0 && shown > 0 && lastTypo.current !== next ? typoFor(chars[next]) : null;

        if (reduceMotion) {
          wait(lead, () => setCount(total));
        } else if (wrong && Math.random() < Math.min(1, mistakes) * 0.16) {
          lastTypo.current = next;
          const plan = [wrong];
          const follow = chars[reverseMode ? next - 1 : next + 1];
          if (follow && follow.trim() && Math.random() < 0.4) plan.push(follow);
          wait(lead + speed(), () => setTypo({ plan, tail: [wrong], fixing: false }));
        } else {
          wait(lead + speed(), () => setCount(shown + 1));
        }
      } else if (loop || index < textArray.length - 1) {
        wait(pauseDuration, () => setIsDeleting(true));
      } else if (!completeNotified.current) {
        completeNotified.current = true;
        onCompleteRef.current?.();
      }
    } else if (shown > 0) {
      if (reduceMotion) {
        wait(0, () => setCount(0));
      } else if (deleteMode === "select") {
        if (selected < shown) {
          wait(deletingSpeed, () => setSelected(selected + 1));
        } else {
          wait(Math.max(160, deletingSpeed * 8), () => {
            setSelected(0);
            setCount(0);
          });
        }
      } else {
        wait(deletingSpeed, () => setCount(shown - 1));
      }
    } else {
      onSentenceCompleteRef.current?.(textArray[index], index);
      lastTypo.current = -1;
      setSelected(0);
      setIsDeleting(false);
      setTextIndex((index + 1) % textArray.length);
    }

    return () => clearTimeout(timeout);
  }, [
    chars,
    deleteMode,
    deletingSpeed,
    index,
    initialDelay,
    isDeleting,
    isVisible,
    loop,
    maxSpeed,
    minSpeed,
    mistakes,
    pauseDuration,
    reduceMotion,
    reverseMode,
    selected,
    shown,
    textArray,
    total,
    typo,
  ]);

  const animateChar = useCallback((node: HTMLSpanElement | null) => {
    if (!node || typeEffect === "none" || reduceMotion) return;
    const className = typeEffect === "fade" ? styles.fade : typeEffect === "blur" ? styles.blur : styles.rise;
    node.classList.add(className);
  }, [reduceMotion, typeEffect]);

  const start = reverseMode ? total - shown : 0;
  const marked = Math.min(selected, shown);
  const correct = chars.slice(start, start + shown).map((character, i) => {
    const isMarked = reverseMode ? i < marked : i >= shown - marked;
    return (
      <span
        key={start + i}
        ref={animateChar}
        className={`${styles.character} ${isMarked ? styles.selected : ""}`}
      >
        {character}
      </span>
    );
  });
  const mistyped = (typo?.tail ?? []).map((character, i) => (
    <span key={`typo-${i}`} ref={animateChar} className={styles.character}>
      {character}
    </span>
  ));
  if (reverseMode) mistyped.reverse();

  const caret = <span ref={caretRef} className={styles.caret}>{"\u200B"}</span>;
  const color = textColors.length ? textColors[index % textColors.length] : "inherit";
  const typing = shown < total || isDeleting || typo !== null;
  const hideCursor = hideCursorWhileTyping && typing;
  const cursorColorStyle = cursorColor && cursorColor !== "currentColor" ? { color: cursorColor } : undefined;
  const cursorClass = cursorStyle === "character" ? styles.characterCursor : styles[cursorStyle];

  return createElement(
    Component,
    {
      ...props,
      ref: containerRef,
      className: `${styles.root} ${className}`,
    },
    <span className={styles.screenReader}>{prefix + textArray.join(" ")}</span>,
    <span aria-hidden="true">
      {prefix ? <span style={{ color: prefixColor }}>{prefix}</span> : null}
      {reverseMode && caret}
      <span style={{ color }}>
        {reverseMode ? [...mistyped, ...correct] : [...correct, ...mistyped]}
      </span>
      {!reverseMode && caret}
    </span>,
    showCursor ? (
      <span
        ref={cursorRef}
        aria-hidden="true"
        className={`${styles.cursor} ${cursorClass} ${hideCursor ? styles.cursorHidden : ""} ${cursorClassName}`}
        style={cursorColorStyle}
      >
        <span ref={blinkRef} className={styles.blink}>
          {cursorStyle === "character" ? cursorCharacter : <span className={styles.shape} />}
        </span>
      </span>
    ) : null,
  );
}
