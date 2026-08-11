import { motion } from 'framer-motion';
import type { DocumentStatus } from '../types';

const STYLES: Record<DocumentStatus, string> = {
  CREATED: 'bg-[#2a3a5c] text-[#8fb2ff]',
  UPLOADING: 'bg-[#2a3a5c] text-[#8fb2ff]',
  QUEUED: 'bg-[#2a3a5c] text-[#8fb2ff]',
  PROCESSING: 'bg-[#5c4a1f] text-[#ffcf6b]',
  RETRYING: 'bg-[#5c4a1f] text-[#ffcf6b]',
  INDEXED: 'bg-[#1f5c33] text-[#6bffa0]',
  FAILED: 'bg-[#5c1f1f] text-[#ff6b6b]',
};

const PULSING = new Set<DocumentStatus>(['PROCESSING', 'RETRYING']);

export default function StatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <motion.span
      layout
      className={`flex-shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[0.72rem] font-bold uppercase tracking-wide ${STYLES[status]}`}
      animate={PULSING.has(status) ? { boxShadow: ['0 0 0 0 rgba(255,207,107,0.35)', '0 0 0 5px rgba(255,207,107,0)'] } : {}}
      transition={PULSING.has(status) ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : {}}
    >
      {status}
    </motion.span>
  );
}
