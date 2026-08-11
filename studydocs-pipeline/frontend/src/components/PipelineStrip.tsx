import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const STAGES = ['CREATED', 'UPLOADING', 'QUEUED', 'PROCESSING', 'INDEXED'];
const STEP_MS = 1400;

// A small looping animation that visually tells the story of the pipeline:
// one stage lights up at a time, echoing the real status badges used in the
// live demo, so the home page previews the product before you touch it.
export default function PipelineStrip() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setActive((i) => (i + 1) % STAGES.length), STEP_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {STAGES.map((stage, index) => (
        <div key={stage} className="flex items-center gap-2">
          <motion.span
            animate={{
              scale: index === active ? 1.06 : 1,
              opacity: index === active ? 1 : 0.55,
            }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-full border px-3 py-1.5 text-xs font-semibold tracking-wide"
            style={{
              borderColor: index === active ? 'var(--color-accent)' : 'var(--color-border)',
              background: index === active ? 'rgba(91,140,255,0.14)' : 'transparent',
              color: index === active ? '#cddcff' : 'var(--color-text-muted)',
              boxShadow: index === active ? '0 0 18px rgba(91,140,255,0.35)' : 'none',
            }}
          >
            {stage}
          </motion.span>
          {index < STAGES.length - 1 && <span className="text-text-muted/40">→</span>}
        </div>
      ))}
    </div>
  );
}
