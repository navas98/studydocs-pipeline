const LINKS = [
  { label: 'GitHub', href: 'https://github.com/navas98/studydocs-pipeline', icon: '🐙' },
  { label: 'Email', href: 'mailto:j.navasdam@gmail.com', icon: '✉️' },
];

export default function Footer() {
  return (
    <footer className="border-t border-border/60 px-6 py-10 text-center">
      <div className="mb-4 flex justify-center gap-4">
        {LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target={link.href.startsWith('http') ? '_blank' : undefined}
            rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
            aria-label={link.label}
            className="glass flex h-10 w-10 items-center justify-center rounded-full text-base transition-transform hover:-translate-y-0.5 hover:border-accent"
          >
            {link.icon}
          </a>
        ))}
      </div>
      <p className="text-xs text-text-muted">
        StudyDocs Pipeline — proyecto de portfolio, no afiliado a Wuolah.
      </p>
    </footer>
  );
}
