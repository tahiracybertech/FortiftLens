// Shared Framer Motion presets — keep every duration under 300ms.
// Used by UserDashboard (card stagger, tab crossfade, progress bars),
// Login and Signup (page fade).

export const CARD_STAGGER_PARENT = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } }
};

export const CARD_STAGGER_CHILD = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } }
};

export const TAB_CROSSFADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.15 }
};

export const PAGE_FADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.15 }
};

export const PROGRESS_TRANSITION = { duration: 0.25, ease: 'easeOut' as const };
