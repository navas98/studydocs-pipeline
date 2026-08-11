import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Spotlight from '../components/Spotlight';
import PipelineStrip from '../components/PipelineStrip';
import ScrollCue from '../components/ScrollCue';
import SectionHeading from '../components/SectionHeading';
import AlternatingSection from '../components/AlternatingSection';
import CTABand from '../components/CTABand';
import TerminalPanel from '../components/panels/TerminalPanel';
import SearchPreviewPanel from '../components/panels/SearchPreviewPanel';

const features = [
  { icon: '📤', title: 'Sube y procesa', text: 'Documento creado, subido a S3 y encolado en SQS para procesamiento asíncrono.' },
  { icon: '📡', title: 'Estado en vivo', text: 'CREATED → UPLOADING → QUEUED → PROCESSING → INDEXED, en tiempo real.' },
  { icon: '🛡️', title: 'Falla con dignidad', text: 'Reintentos automáticos en errores transitorios; reintento manual en los permanentes.' },
  { icon: '🔍', title: 'Busca al instante', text: 'Texto libre, asignatura y universidad vía Elasticsearch.' },
  { icon: '🔒', title: 'Concurrencia segura', text: 'Actualizaciones optimistas por versión: sin pisadas silenciosas de datos.' },
  { icon: '🩺', title: 'Observable', text: 'Correlation IDs, logs estructurados y health checks reales.' },
];

const stack = [
  { icon: '🟢', label: 'Node.js + TypeScript' },
  { icon: '⚡', label: 'Fastify' },
  { icon: '🍃', label: 'MongoDB' },
  { icon: '☁️', label: 'AWS S3 + SQS' },
  { icon: '🔎', label: 'Elasticsearch' },
  { icon: '🐳', label: 'Docker Compose' },
  { icon: '✅', label: 'Vitest' },
  { icon: '⚛️', label: 'React + Vite' },
  { icon: '🧩', label: 'Arquitectura hexagonal' },
];

export default function Home() {
  return (
    <main>
      <Spotlight className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="mb-5 inline-block rounded-full border border-border bg-bg-elevated px-3 py-1 text-xs font-semibold uppercase tracking-widest text-text-muted"
          >
            Proyecto de portfolio backend
          </motion.span>
          <h1
            className="text-gradient text-5xl font-bold tracking-tight sm:text-7xl"
            style={{ fontFamily: 'var(--font-display)', animation: 'shine 7s linear infinite' }}
          >
            El pipeline ha
            <br />
            aterrizado.
          </h1>
          <p className="mx-auto mt-5 max-w-[58ch] text-justify text-text-muted">
            Subida, procesamiento asíncrono y búsqueda de apuntes en PDF. Arquitectura hexagonal, S3 + SQS,
            Elasticsearch, concurrencia optimista en MongoDB y observabilidad de extremo a extremo — no es el
            producto real de Wuolah, es la demo de cómo abordo un sistema backend de principio a fin.
          </p>

          <div className="mt-9">
            <PipelineStrip />
          </div>

          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link
              to="/demo"
              className="btn-neo btn-neo-primary"
            >
              Probar la demo
            </Link>
            <Link
              to="/decisions"
              className="btn-neo"
            >
              Ver decisiones técnicas
            </Link>
          </div>
        </motion.div>

        <ScrollCue targetId="features" />
      </Spotlight>

      <section id="features" className="flex min-h-screen flex-col justify-center px-6 py-20">
        <SectionHeading icon="🧩" eyebrow="Capacidades" title="Qué hace" />
        <div className="mx-auto mt-12 grid max-w-6xl grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.45, delay: (index % 3) * 0.08 }}
              className="text-center"
            >
              <span className="glass mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl text-xl">
                {feature.icon}
              </span>
              <h3 className="mb-1.5 text-base font-semibold">{feature.title}</h3>
              <p className="text-justify text-sm text-text-muted">{feature.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <AlternatingSection
        eyebrow="De extremo a extremo"
        title="Del HTTP a la cola, en un correlation ID"
        text="Crear un documento dispara una subida a S3 y un mensaje en SQS que un worker consume de forma asíncrona. Cada paso queda escrito en logs estructurados bajo el mismo identificador de correlación, para poder seguir un documento concreto de principio a fin."
        panel={<TerminalPanel />}
      />

      <AlternatingSection
        eyebrow="Búsqueda"
        title="Encuéntralo por texto, asignatura o universidad"
        text="Una vez indexado, cada documento es buscable al instante vía Elasticsearch, con mapping explícito para combinar full-text con filtros exactos."
        panel={<SearchPreviewPanel />}
        reverse
      />

      <section className="flex min-h-screen flex-col justify-center px-6 py-16">
        <SectionHeading icon="🛠️" eyebrow="Bajo el capó" title="Stack" />
        <div className="mx-auto mt-10 grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-3">
          {stack.map((item, index) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: (index % 6) * 0.05 }}
              className="stack-card"
            >
              <div className="stack-card-inner">
                <span className="text-xl">{item.icon}</span>
                <span className="text-sm font-semibold text-text">{item.label}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <CTABand />
    </main>
  );
}
