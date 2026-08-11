const RESULTS = [
  { title: 'Apuntes de Álgebra', meta: 'Matemáticas · Universidad de Sevilla' },
  { title: 'Resumen de Física Cuántica', meta: 'Física · Universidad Complutense' },
];

// Same idea as TerminalPanel: a static mockup of the real search UI,
// standing in for a product screenshot.
export default function SearchPreviewPanel() {
  return (
    <div className="glass w-full rounded-2xl p-5 shadow-[0_16px_40px_rgba(0,0,0,0.4)]">
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text-muted">
        <span>🔍</span>
        <span>algebra</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {RESULTS.map((result) => (
          <div key={result.title} className="rounded-lg border border-border bg-bg-elevated px-3.5 py-2.5">
            <p className="font-semibold text-accent">{result.title}</p>
            <p className="text-xs text-text-muted">{result.meta}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
