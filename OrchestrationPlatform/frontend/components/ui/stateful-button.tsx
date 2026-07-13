"use client";
import { cn } from "@/lib/utils";
import React, { useEffect, useState } from "react";
import { motion, useAnimate } from "motion/react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
  children: React.ReactNode;
  isLoading?: boolean;
}

export const Button = ({ className, children, isLoading = false, ...props }: ButtonProps) => {
  const [scope, animate] = useAnimate();
  const [isInternalLoading, setIsInternalLoading] = useState(false);
  const shouldShowLoader = isLoading || isInternalLoading;

  useEffect(() => {
    if (shouldShowLoader) {
      void animate(
        ".loader",
        {
          width: "20px",
          scale: 1,
          display: "block",
        },
        {
          duration: 0.2,
        },
      );
      void animate(
        ".check",
        {
          width: "0px",
          scale: 0,
          display: "none",
        },
        {
          duration: 0.15,
        },
      );
      return;
    }

    void animate(
      ".loader",
      {
        width: "0px",
        scale: 0,
        display: "none",
      },
      {
        duration: 0.2,
      },
    );
    void animate(
      ".check",
      {
        width: "0px",
        scale: 0,
        display: "none",
      },
      {
        duration: 0.15,
      },
    );
  }, [animate, shouldShowLoader]);

  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsInternalLoading(true);

    if (event.currentTarget.type === "submit" && event.currentTarget.form) {
      event.currentTarget.form.requestSubmit();
    }

    try {
      await onClick?.(event);
    } finally {
      if (!isLoading) {
        setIsInternalLoading(false);
      }
    }
  };

  const {
    onClick,
    onDrag,
    onDragStart,
    onDragEnd,
    onAnimationStart,
    onAnimationEnd,
    ...buttonProps
  } = props;

  return (
    <motion.button
      ref={scope}
      className={cn(
        "flex min-w-[140px] cursor-pointer items-center justify-center gap-2 rounded-none border-0 bg-cyan-400/10 px-4 py-3 font-medium text-white ring-offset-2 transition duration-200 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...buttonProps}
      onClick={handleClick}
    >
      <motion.div layout className="flex items-center gap-2">
        <Loader />
        <CheckIcon />
        <motion.span layout>{children}</motion.span>
      </motion.div>
    </motion.button>
  );
};

const Loader = () => {
  return (
    <motion.svg
      animate={{
        rotate: [0, 360],
      }}
      initial={{
        scale: 0,
        width: 0,
        display: "none",
      }}
      style={{
        scale: 0.5,
        display: "none",
      }}
      transition={{
        duration: 0.3,
        repeat: Infinity,
        ease: "linear",
      }}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="loader text-white"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M12 3a9 9 0 1 0 9 9" />
    </motion.svg>
  );
};

const CheckIcon = () => {
  return (
    <motion.svg
      initial={{
        scale: 0,
        width: 0,
        display: "none",
      }}
      style={{
        scale: 0.5,
        display: "none",
      }}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="check text-white"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M9 12l2 2l4 -4" />
    </motion.svg>
  );
};
