import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import type { Variants } from 'motion/react';

/**
 * Shared scroll-reveal primitives — the same motion language used by Landing.tsx,
 * extracted so the public + auth pages can reuse it without duplicating config.
 *
 * Rules kept intentionally tight: every reveal fires once, durations stay inside
 * 0.25–0.5s, and nothing loops.
 */

const REVEAL_VIEWPORT = { once: true, margin: '-60px' } as const;
const REVEAL_TRANSITION = { duration: 0.45, ease: 'easeOut' as const };

/** Single band/card fade + rise, triggered the first time it enters the viewport. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 16,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={REVEAL_VIEWPORT}
      transition={{ ...REVEAL_TRANSITION, delay }}
    >
      {children}
    </motion.div>
  );
}

const PARENT_VARIANTS: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const CHILD_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: REVEAL_TRANSITION },
};

/** Grid/list container that orchestrates its StaggerChild descendants. */
export function StaggerParent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={PARENT_VARIANTS}
      initial="hidden"
      whileInView="visible"
      viewport={REVEAL_VIEWPORT}
    >
      {children}
    </motion.div>
  );
}

/** One staggered item — inherits its timing from the nearest StaggerParent. */
export function StaggerChild({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={CHILD_VARIANTS}>
      {children}
    </motion.div>
  );
}

/** Token-driven gradient payoff word (teal → primary → amber), via `.txt-gradient`. */
export function GradientWord({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={className ? `txt-gradient ${className}` : 'txt-gradient'}>{children}</span>;
}
