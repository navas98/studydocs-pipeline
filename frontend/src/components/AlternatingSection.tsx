import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface Props {
  id?: string;
  eyebrow: string;
  title: string;
  text: string;
  panel: ReactNode;
  reverse?: boolean;
}

// Landed's split "image left/right, text on the other side" section,
// re-implemented with a mockup panel in place of a stock photo.
export default function AlternatingSection({ id, eyebrow, title, text, panel, reverse = false }: Props) {
  return (
    <section id={id} className="mx-auto flex min-h-screen max-w-6xl flex-col items-center gap-10 px-6 py-16 md:flex-row">
      <motion.div
        initial={{ opacity: 0, x: reverse ? 24 : -24 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={`w-full flex-1 ${reverse ? 'md:order-2' : ''}`}
      >
        {panel}
      </motion.div>
      <motion.div
        initial={{ opacity: 0, x: reverse ? -24 : 24 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="flex-1 text-center"
      >
        <span className="text-sm font-bold uppercase tracking-[0.2em] text-accent">{eyebrow}</span>
        <h3 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: 'var(--font-display)' }}>
          {title}
        </h3>
        <p className="mt-4 text-justify text-lg leading-relaxed text-text-muted">{text}</p>
      </motion.div>
    </section>
  );
}
