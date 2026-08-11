interface Props {
  icon: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
}

// The icon-above-a-thin-rule-above-heading pattern is the signature motif
// of html5up's "Landed" template — reused here as the header for every
// major section instead of the plain card headings used before.
export default function SectionHeading({ icon, eyebrow, title, subtitle }: Props) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center text-center">
      <span className="glass mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-2xl shadow-[0_0_24px_rgba(91,140,255,0.18)]">
        {icon}
      </span>
      <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent">{eyebrow}</span>
      <div className="my-3 h-px w-12 bg-gradient-to-r from-accent via-accent-2 to-accent-3" />
      <h2 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ fontFamily: 'var(--font-display)' }}>
        {title}
      </h2>
      {subtitle && <p className="mt-3 text-justify text-sm text-text-muted">{subtitle}</p>}
    </div>
  );
}
