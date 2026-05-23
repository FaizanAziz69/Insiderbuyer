"use client";
import { motion, useReducedMotion } from "framer-motion";
import { ReactNode } from "react";

type Direction = "up" | "down" | "left" | "right" | "scale" | "blur";

interface RevealProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  direction?: Direction;
  amount?: number;
  once?: boolean;
  className?: string;
}

const initialFor = (d: Direction) => {
  switch (d) {
    case "up":
      return { opacity: 0, y: 40 };
    case "down":
      return { opacity: 0, y: -40 };
    case "left":
      return { opacity: 0, x: 40 };
    case "right":
      return { opacity: 0, x: -40 };
    case "scale":
      return { opacity: 0, scale: 0.92 };
    case "blur":
      return { opacity: 0, filter: "blur(14px)", y: 24 };
  }
};

const animateFor = (d: Direction) => {
  switch (d) {
    case "up":
    case "down":
      return { opacity: 1, y: 0 };
    case "left":
    case "right":
      return { opacity: 1, x: 0 };
    case "scale":
      return { opacity: 1, scale: 1 };
    case "blur":
      return { opacity: 1, filter: "blur(0px)", y: 0 };
  }
};

export function Reveal({
  children,
  delay = 0,
  duration = 0.85,
  direction = "up",
  amount = 0.2,
  once = true,
  className,
}: RevealProps) {
  const reduced = useReducedMotion();
  if (reduced) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      initial={initialFor(direction)}
      whileInView={animateFor(direction)}
      viewport={{ once, amount }}
      transition={{ duration, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function RevealStagger({
  children,
  delay = 0,
  stagger = 0.08,
  className,
}: {
  children: ReactNode;
  delay?: number;
  stagger?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.15 }}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: stagger, delayChildren: delay } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({
  children,
  className,
  direction = "up",
}: {
  children: ReactNode;
  className?: string;
  direction?: Direction;
}) {
  return (
    <motion.div
      variants={{
        hidden: initialFor(direction),
        show: {
          ...animateFor(direction),
          transition: { duration: 0.75, ease: [0.22, 1, 0.36, 1] },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
