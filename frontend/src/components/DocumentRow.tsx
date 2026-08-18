import { motion } from 'framer-motion';
import StatusBadge from './StatusBadge';
import { openDocumentFile } from '../lib/api';
import type { DocumentDto } from '../types';

interface Props {
  doc: DocumentDto;
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function DocumentRow({ doc, onRetry, onDelete }: Props) {
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
          <button
            type="button"
            onClick={() => void openDocumentFile(doc.id)}
            className="truncate text-left font-semibold text-accent hover:text-accent-2 hover:underline"
          >
            {doc.title}
          </button>
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
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`¿Eliminar "${doc.title}"? Esta acción no se puede deshacer.`)) {
              onDelete(doc.id);
            }
          }}
          aria-label="Eliminar documento"
          title="Eliminar documento"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm text-text-muted transition-colors hover:border-[#ff6b6b] hover:text-[#ff6b6b]"
        >
          🗑️
        </button>
      </div>
    </motion.li>
  );
}
