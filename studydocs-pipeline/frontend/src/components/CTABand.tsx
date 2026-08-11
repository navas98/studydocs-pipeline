import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function CTABand() {
  return (
    <section className="flex min-h-screen flex-col items-center justify-center px-6 py-20 text-center">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="glass mx-auto max-w-4xl rounded-3xl px-8 py-14 shadow-[0_24px_60px_rgba(0,0,0,0.4)]"
      >
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ fontFamily: 'var(--font-display)' }}>
          ¿Le echamos un vistazo juntos?
        </h2>
        <p className="mx-auto mt-3 max-w-[48ch] text-justify text-sm text-text-muted">
          Sube un PDF y mira el pipeline completo en acción, o lee por qué cada pieza está construida como está.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link to="/demo" className="btn-neo btn-neo-primary">
            Probar la demo
          </Link>
          <Link to="/decisions" className="btn-neo">
            Decisiones técnicas
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
