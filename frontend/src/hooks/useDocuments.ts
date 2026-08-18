import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, getToken } from '../lib/api';
import type { DocumentDto } from '../types';
import { NON_TERMINAL_STATUSES } from '../types';

// Reads the server-sent /documents/:id/events stream until it closes
// (document reaches a terminal status) or `signal` aborts. Uses fetch
// instead of EventSource because EventSource can't send an Authorization
// header, and this API is Bearer-token authenticated rather than
// cookie-based.
async function streamDocumentEvents(
  id: string,
  onEvent: (doc: DocumentDto) => void,
  signal: AbortSignal,
): Promise<void> {
  const token = getToken();
  const response = await fetch(`/documents/${id}/events`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  });
  if (!response.ok || !response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const event of events) {
      const dataLine = event.split('\n').find((line) => line.startsWith('data: '));
      if (!dataLine) continue;
      onEvent(JSON.parse(dataLine.slice('data: '.length)) as DocumentDto);
    }
  }
}

export function useDocuments() {
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const streamsRef = useRef<Map<string, AbortController>>(new Map());

  const applyUpdate = useCallback((doc: DocumentDto) => {
    setDocuments((prev) => prev.map((existing) => (existing.id === doc.id ? doc : existing)));
  }, []);

  const ensureStream = useCallback(
    (doc: DocumentDto) => {
      if (streamsRef.current.has(doc.id)) return;
      const controller = new AbortController();
      streamsRef.current.set(doc.id, controller);
      streamDocumentEvents(doc.id, applyUpdate, controller.signal)
        .catch(() => {
          // Aborted (unmount/delete) or network hiccup — the next reload()
          // will re-open a stream if the document is still in flight.
        })
        .finally(() => {
          streamsRef.current.delete(doc.id);
        });
    },
    [applyUpdate],
  );

  const load = useCallback(async () => {
    const response = await apiFetch('/me/documents?limit=20');
    if (!response.ok) return;
    const docs: DocumentDto[] = await response.json();
    setDocuments(docs);
    for (const doc of docs) {
      if (NON_TERMINAL_STATUSES.has(doc.status)) {
        ensureStream(doc);
      }
    }
  }, [ensureStream]);

  useEffect(() => {
    void load();
    const streams = streamsRef.current;
    return () => {
      for (const controller of streams.values()) controller.abort();
      streams.clear();
    };
  }, [load]);

  const retry = useCallback(
    async (id: string) => {
      await apiFetch(`/documents/${id}/retry`, { method: 'POST' });
      await load();
    },
    [load],
  );

  const remove = useCallback(
    async (id: string) => {
      streamsRef.current.get(id)?.abort();
      streamsRef.current.delete(id);
      await apiFetch(`/documents/${id}`, { method: 'DELETE' });
      await load();
    },
    [load],
  );

  const polling = useMemo(() => documents.some((doc) => NON_TERMINAL_STATUSES.has(doc.status)), [documents]);

  return { documents, polling, reload: load, retry, remove };
}
