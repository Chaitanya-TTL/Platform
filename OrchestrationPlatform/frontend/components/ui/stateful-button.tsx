"use client";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  isLoading?: boolean;
}
export const Button = ({
  className,
  children,
  isLoading = false,
  onClick,
  ...props
}: Props) => (
  <motion.button
    whileHover={props.disabled ? undefined : { y: -1 }}
    whileTap={props.disabled ? undefined : { scale: 0.98 }}
    className={cn(
      "flex cursor-pointer items-center justify-center gap-2 border-0 transition disabled:cursor-not-allowed disabled:opacity-60",
      className,
    )}
    onClick={onClick}
    {...props}
  >
    {isLoading ? (
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
        aria-hidden="true"
      />
    ) : null}
    <span>{children}</span>
  </motion.button>
);
