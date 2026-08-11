import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocumentDto } from '../types';
import { NON_TERMINAL_STATUSES } from '../types';

const POLL_INTERVAL_MS = 2000;

export function useDocuments(ownerId: string) {
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [polling, setPolling] = useState(false);
  const timerRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/documents?ownerId=${encodeURIComponent(ownerId)}&limit=20`);
    const docs: DocumentDto[] = await response.json();
    setDocuments(docs);

    const anyInFlight = docs.some((doc) => NON_TERMINAL_STATUSES.has(doc.status));
    setPolling(anyInFlight);
  }, [ownerId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (polling && timerRef.current === null) {
      timerRef.current = window.setInterval(() => void load(), POLL_INTERVAL_MS);
    } else if (!polling && timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [polling, load]);

  const retry = useCallback(
    async (id: string) => {
      await fetch(`/documents/${id}/retry`, { method: 'POST' });
      await load();
    },
    [load],
  );

  return { documents, polling, reload: load, retry };
}
