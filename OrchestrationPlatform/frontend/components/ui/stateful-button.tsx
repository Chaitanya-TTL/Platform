"use client";

import type { HTMLMotionProps } from "motion/react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

type Props = HTMLMotionProps<"button"> & {
  loading?: boolean;
  loadingText?: string;
};

export function Button({
  children,
  loading = false,
  loadingText = "Working...",
  disabled,
  className,
  type = "button",
  ...props
}: Props) {
  const isDisabled = disabled || loading;

  return (
    <motion.button
      {...props}
      type={type}
      disabled={isDisabled}
      whileHover={isDisabled ? undefined : { y: -1 }}
      whileTap={isDisabled ? undefined : { scale: 0.98 }}
      className={cn(
        "inline-flex items-center justify-center transition disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {loading ? (
        <>
          <span
            className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
          <span>{loadingText}</span>
        </>
      ) : (
        children
      )}
    </motion.button>
  );
}