import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Reveal from '../components/Reveal';
import Card from '../components/Card';
import SectionHeading from '../components/SectionHeading';
import DocumentRow from '../components/DocumentRow';
import { useDocuments } from '../hooks/useDocuments';
import { apiFetch, openDocumentFile } from '../lib/api';
import type { SearchHit } from '../types';

const inputClass =
  'rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text transition-[border-color,box-shadow] focus:border-accent focus:shadow-[0_0_0_3px_rgba(91,140,255,0.15)] focus:outline-none hover:border-border-hover';

const primaryButtonClass = 'btn-neo btn-neo-primary self-start';

export default function Demo() {
  const { documents, polling, reload, retry, remove } = useDocuments();

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [university, setUniversity] = useState('');
  const [tags, setTags] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadError, setUploadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [searchText, setSearchText] = useState('');
  const [searchSubject, setSearchSubject] = useState('');
  const [searchUniversity, setSearchUniversity] = useState('');
  const [searchResults, setSearchResults] = useState<SearchHit[] | null>(null);

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setSubmitting(true);
    setUploadError(false);
    setUploadStatus('Creando metadatos...');

    try {
      const createResponse = await apiFetch('/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          subject,
          university,
          tags: tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        }),
      });
      if (!createResponse.ok) {
        throw new Error(`No se pudo crear el documento (HTTP ${createResponse.status})`);
      }
      const created = await createResponse.json();

      setUploadStatus('Subiendo PDF...');
      const formData = new FormData();
      formData.append('file', file);
      const uploadResponse = await apiFetch(`/documents/${created.id}/complete-upload`, {
        method: 'POST',
        body: formData,
      });
      if (!uploadResponse.ok) {
        const body = await uploadResponse.json().catch(() => ({}));
        throw new Error(body.error ?? `No se pudo subir el archivo (HTTP ${uploadResponse.status})`);
      }

      setUploadStatus('Documento en cola de procesamiento.');
      setTitle('');
      setSubject('');
      setUniversity('');
      setTags('');
      setFile(null);
      await reload();
    } catch (error) {
      setUploadError(true);
      setUploadStatus(error instanceof Error ? error.message : 'Error inesperado');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (searchText.trim()) params.set('text', searchText.trim());
    if (searchSubject.trim()) params.set('subject', searchSubject.trim());
    if (searchUniversity.trim()) params.set('university', searchUniversity.trim());

    const response = await apiFetch(`/search?${params.toString()}`);
    const result = await response.json();
    setSearchResults(result.items);
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 pb-16 pt-4">
      <div className="pt-10 pb-2">
        <SectionHeading
          icon="🧪"
          eyebrow="En vivo"
          title="Demo interactiva"
          subtitle="Sube un PDF, míralo pasar por el pipeline en tiempo real y búscalo."
        />
      </div>

      <Reveal>
        <Card>
          <h2 className="mb-4 text-lg font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
            1. Subir un documento
          </h2>
          <form onSubmit={handleUpload} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Título
              <input
                className={inputClass}
                placeholder="Apuntes de Álgebra"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Asignatura
              <input
                className={inputClass}
                placeholder="Matemáticas"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Universidad
              <input
                className={inputClass}
                placeholder="Universidad de Sevilla"
                value={university}
                onChange={(event) => setUniversity(event.target.value)}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Etiquetas (separadas por coma)
              <input className={inputClass} placeholder="algebra, examen" value={tags} onChange={(event) => setTags(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Archivo PDF
              <input
                className={inputClass}
                type="file"
                accept="application/pdf"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                required
              />
            </label>
            <button type="submit" disabled={submitting} className={primaryButtonClass}>
              Crear y subir
            </button>
          </form>
          {uploadStatus && <p className={`mt-2 min-h-[1.2em] text-sm ${uploadError ? 'text-[#ff6b6b]' : 'text-text-muted'}`}>{uploadStatus}</p>}
        </Card>
      </Reveal>

      <Reveal delay={0.05}>
        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
            2. Mis documentos
            {polling && (
              <motion.span
                className="text-[0.7rem] text-[#6bffa0]"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                ●
              </motion.span>
            )}
          </h2>
          <button
            type="button"
            onClick={() => void reload()}
            className="btn-neo mb-3"
          >
            Actualizar
          </button>
          <ul className="flex flex-col gap-2.5">
            <AnimatePresence initial={false}>
              {documents.length === 0 ? (
                <li className="text-sm text-text-muted">Sin documentos todavía. Sube uno arriba.</li>
              ) : (
                documents.map((doc) => (
                  <DocumentRow key={doc.id} doc={doc} onRetry={(id) => void retry(id)} onDelete={(id) => void remove(id)} />
                ))
              )}
            </AnimatePresence>
          </ul>
        </Card>
      </Reveal>

      <Reveal delay={0.1}>
        <Card>
          <h2 className="mb-4 text-lg font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
            3. Buscar
          </h2>
          <form onSubmit={handleSearch} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Texto
              <input className={inputClass} placeholder="algebra" value={searchText} onChange={(event) => setSearchText(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Asignatura
              <input className={inputClass} value={searchSubject} onChange={(event) => setSearchSubject(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Universidad
              <input className={inputClass} value={searchUniversity} onChange={(event) => setSearchUniversity(event.target.value)} />
            </label>
            <button type="submit" className={primaryButtonClass}>
              Buscar
            </button>
          </form>
          {searchResults && (
            <ul className="mt-3 flex flex-col gap-2.5">
              {searchResults.length === 0 ? (
                <li className="text-sm text-text-muted">Sin resultados.</li>
              ) : (
                searchResults.map((item) => (
                  <li key={item.documentId} className="rounded-lg border border-border bg-bg-elevated px-3.5 py-2.5">
                    <button
                      type="button"
                      onClick={() => void openDocumentFile(item.documentId)}
                      className="text-left font-semibold text-accent hover:text-accent-2 hover:underline"
                    >
                      {item.title}
                    </button>
                    <div className="text-[0.8rem] text-text-muted">
                      {[item.subject, item.university, item.tags.join(', ')].filter(Boolean).join(' · ')}
                    </div>
                  </li>
                ))
              )}
            </ul>
          )}
        </Card>
      </Reveal>
    </main>
  );
}
