import { motion } from 'framer-motion';
import StatusBadge from './StatusBadge';
import type { DocumentDto } from '../types';

interface Props {
  doc: DocumentDto;
  onRetry: (id: string) => void;
}

export default function DocumentRow({ doc, onRetry }: Props) {
  const hasFile = doc.status !== 'CREATED';
  const meta = [doc.subject, doc.university, doc.tags.length ? doc.tags.join(', ') : null, doc.failureReason ? `⚠ ${doc.failureReason}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-elevated px-3.5 py-2.5 transition-[border-color,transform] hover:translate-x-0.5 hover:border-border-hover"
    >
      <div className="min-w-0 flex flex-col gap-0.5">
        {hasFile ? (
          <a
            href={`/documents/${doc.id}/file`}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate font-semibold text-accent hover:text-accent-2 hover:underline"
          >
            {doc.title}
          </a>
        ) : (
          <span className="truncate font-semibold">{doc.title}</span>
        )}
        <span className="text-[0.8rem] text-text-muted">{meta}</span>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <StatusBadge status={doc.status} />
        {doc.status === 'FAILED' && (
          <button
            type="button"
            onClick={() => onRetry(doc.id)}
            className="btn-neo-danger"
          >
            Reintentar
          </button>
        )}
      </div>
    </motion.li>
  );
}
