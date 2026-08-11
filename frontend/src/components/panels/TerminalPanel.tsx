import { motion } from 'framer-motion';

const LINES = [
  { text: 'POST /documents → 201 Created', color: 'text-[#8fb2ff]' },
  { text: 'POST /documents/:id/complete-upload → 202 Accepted', color: 'text-[#8fb2ff]' },
  { text: 'SQS → worker: PROCESSING', color: 'text-[#ffcf6b]' },
  { text: 'Elasticsearch: INDEXED ✓', color: 'text-[#6bffa0]' },
];

// Stands in for a product screenshot: a fake terminal replaying the actual
// HTTP → SQS → worker flow, so the "image" half of the section is honest
// about what the project does instead of generic stock photography.
export default function TerminalPanel() {
  return (
    <div className="glass w-full rounded-2xl p-5 font-mono text-sm shadow-[0_16px_40px_rgba(0,0,0,0.4)]">
      <div className="mb-3 flex gap-1.5">
        <span className="h-3 w-3 rounded-full bg-[#ff6b6b]/70" />
        <span className="h-3 w-3 rounded-full bg-[#ffcf6b]/70" />
        <span className="h-3 w-3 rounded-full bg-[#6bffa0]/70" />
      </div>
      <div className="flex flex-col gap-2">
        {LINES.map((line, index) => (
          <motion.p
            key={line.text}
            initial={{ opacity: 0, x: -6 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.25, duration: 0.4 }}
            className={line.color}
          >
            <span className="text-text-muted">$</span> {line.text}
          </motion.p>
        ))}
      </div>
    </div>
  );
}
