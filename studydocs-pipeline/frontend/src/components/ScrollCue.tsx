import { motion } from 'framer-motion';

// Landed's hero ends in a bouncing chevron that scrolls to the next
// section — the same "there's more below" cue, done with an anchor scroll.
export default function ScrollCue({ targetId }: { targetId: string }) {
  return (
    <motion.a
      href={`#${targetId}`}
      aria-label="Bajar a la siguiente sección"
      className="mt-14 flex h-10 w-10 items-center justify-center rounded-full border border-border text-text-muted transition-colors hover:border-accent hover:text-accent"
      animate={{ y: [0, 8, 0] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      onClick={(event) => {
        event.preventDefault();
        document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth' });
      }}
    >
      ↓
    </motion.a>
  );
}
