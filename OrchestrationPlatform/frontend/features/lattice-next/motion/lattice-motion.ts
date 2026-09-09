import type { Transition, Variants } from "motion/react";
export const latticeMotion = {
  position: { type: "spring", stiffness: 280, damping: 30, mass: 0.8 } as Transition,
  enter: { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] } as Transition,
  exit: { duration: 0.16, ease: [0.4, 0, 1, 1] } as Transition,
  value: { duration: 0.16, ease: "easeOut" } as Transition,
  label: { duration: 0.14, ease: "easeOut" } as Transition,
  edge: { duration: 0.26, ease: [0.2, 0.8, 0.2, 1] } as Transition,
};
export const nodeVariants: Variants = {
  hidden: ({ x, y }: { x: number; y: number }) => ({ opacity: 0, scale: 0.98, x: x * 8, y: y * 8 }),
  visible: (index = 0) => ({ opacity: 1, scale: 1, x: 0, y: 0, transition: { ...latticeMotion.enter, delay: Math.min(index, 4) * 0.024 } }),
  exit: ({ x, y }: { x: number; y: number }) => ({ opacity: 0, scale: 0.985, x: x * 5, y: y * 5, transition: latticeMotion.exit }),
};
export const valueVariants: Variants = { hidden: { opacity: 0, y: 3 }, visible: { opacity: 1, y: 0, transition: { ...latticeMotion.value, delay: 0.035 } } };
export const directionVector = (direction?: string) => direction === "EAST" ? { x: -1, y: 0 } : direction === "WEST" ? { x: 1, y: 0 } : direction === "NORTH" ? { x: 0, y: 1 } : { x: 0, y: -1 };
