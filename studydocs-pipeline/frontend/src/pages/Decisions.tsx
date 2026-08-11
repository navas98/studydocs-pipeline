import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import SectionHeading from '../components/SectionHeading';

interface Adr {
  title: string;
  category: string;
  context: string;
  decision: string;
  consequences: string;
}

const adrs: Adr[] = [
  {
    title: 'Arquitectura hexagonal (dominio → aplicación → infraestructura)',
    category: 'Diseño',
    context: 'El dominio (Document, transiciones de estado) no debe depender de MongoDB, S3 o Elasticsearch.',
    decision:
      'Puertos definidos en application/ (DocumentRepository, ObjectStorage, DocumentQueue, SearchIndex...) con adaptadores concretos en infrastructure/.',
    consequences:
      'Los casos de uso se testean con dobles en memoria; los adaptadores se testean contra infraestructura real por separado.',
  },
  {
    title: 'Concurrencia optimista en MongoDB, no bloqueos',
    category: 'Persistencia',
    context:
      'Dos actualizaciones concurrentes sobre el mismo documento (p. ej. el worker indexando y el usuario editando metadatos) no deben pisarse en silencio.',
    decision:
      'Campo version en el agregado; updateWithVersionCheck hace updateOne({_id, version: esperada}) y falla si no coincide.',
    consequences: 'Sin locks pesimistas ni contención; el llamador decide cómo reaccionar ante un conflicto (409).',
  },
  {
    title: 'Procesamiento asíncrono vía SQS con reintentos e idempotencia',
    category: 'Fiabilidad',
    context:
      'SQS entrega mensajes "at-least-once": el mismo documento se puede procesar más de una vez, y los fallos transitorios (red, S3 caído) no deben perder el mensaje.',
    decision:
      'Errores transitorios se distinguen de los permanentes (TransientProcessingError vs PermanentProcessingError); visibility timeout + política de redrive a una DLQ; endpoint manual POST /documents/:id/retry para fallos permanentes.',
    consequences:
      'El worker puede reintentar sin intervención humana en la mayoría de casos, y un documento nunca queda "colgado" sin explicación.',
  },
  {
    title: 'Elasticsearch con mapping explícito, no dinámico',
    category: 'Búsqueda',
    context:
      'Se necesita full-text sobre título/asignatura y, además, filtros por asignatura/universidad que toleren texto parcial ("Sevilla" debe encontrar "Universidad de Sevilla"), ya que en la demo son cajas de texto libre, no desplegables con valores cerrados.',
    decision:
      'Mapping explícito con subcampos .keyword (útiles para ordenar o agregar por valor exacto en el futuro) junto a los campos de texto analizados; los filtros de asignatura/universidad usan match_phrase_prefix sobre el campo analizado en vez de un term exacto sobre .keyword.',
    consequences:
      'Un único índice sirve ambos casos de uso sin duplicar datos ni mantener dos almacenes de búsqueda, y los filtros se comportan como cabría esperar de un cuadro de texto libre.',
  },
  {
    title: 'Tests contra infraestructura real, sin mocks',
    category: 'Testing',
    context:
      'Los mocks pueden divergir del comportamiento real de Mongo/SQS/Elasticsearch y esconder bugs (por ejemplo, semántica exacta de at-least-once o de un update condicional).',
    decision:
      'Tests de integración y e2e corren contra MongoDB, LocalStack (S3+SQS) y Elasticsearch reales, orquestados con Docker Compose; solo los tests unitarios de dominio usan dobles en memoria.',
    consequences:
      'Suite más lenta y con fileParallelism: false para evitar condiciones de carrera entre ficheros, pero varios bugs reales (mutación de estado, doble conteo de reintentos) solo aparecieron gracias a esto.',
  },
  {
    title: 'Correlation IDs de extremo a extremo',
    category: 'Observabilidad',
    context:
      'Una petición HTTP dispara un mensaje SQS que procesa el worker; sin un identificador común, depurar un fallo implica cruzar logs a mano.',
    decision:
      'El id de petición de Fastify (aceptando x-correlation-id si se envía) viaja en el mensaje SQS y aparece en todos los logs estructurados del worker para esa operación.',
    consequences: 'Un solo id permite reconstruir el recorrido completo de un documento en los logs, de API a worker.',
  },
  {
    title: 'Manejo de errores centralizado',
    category: 'API',
    context:
      'Repetir try/catch en cada ruta es fácil de olvidar y tiende a filtrar detalles internos en las respuestas de error.',
    decision:
      'Las rutas dejan propagar el error; un setErrorHandler único mapea errores de dominio a códigos HTTP (404, 409, 400) y todo lo demás a un 500 genérico sin detalles internos.',
    consequences: 'Taxonomía de errores consistente en toda la API y ninguna ruta puede accidentalmente exponer un stack trace.',
  },
  {
    title: 'Frontend en React + Vite, servido como build estático',
    category: 'Demo',
    context: 'El objetivo es una demo visual profesional para enseñar el pipeline funcionando.',
    decision:
      'React + TypeScript + Tailwind + Framer Motion, compilado con Vite a HTML/JS/CSS estáticos que Fastify sirve directamente — un solo proceso, sin CORS ni servidor de frontend aparte en producción.',
    consequences:
      'Se gana un ecosistema de componentes y animaciones fluidas a cambio de un paso de build; en desarrollo, Vite hace proxy de la API para trabajar con hot-reload.',
  },
];

function AccordionItem({ adr, isOpen, onToggle }: { adr: Adr; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="glass overflow-hidden rounded-2xl">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex-shrink-0 rounded-full border border-accent px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-wider text-accent">
            {adr.category}
          </span>
          <h3 className="truncate text-base font-semibold sm:text-lg">{adr.title}</h3>
        </div>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.25 }}
          className="flex-shrink-0 text-text-muted"
        >
          ▾
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <dl className="grid grid-cols-1 gap-x-3 gap-y-3 border-t border-border px-5 py-5 text-sm sm:grid-cols-[max-content_1fr]">
              <dt className="font-semibold text-text-muted">Contexto</dt>
              <dd className="text-justify">{adr.context}</dd>
              <dt className="font-semibold text-text-muted">Decisión</dt>
              <dd className="text-justify">{adr.decision}</dd>
              <dt className="font-semibold text-text-muted">Consecuencias</dt>
              <dd className="text-justify">{adr.consequences}</dd>
            </dl>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Decisions() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 pb-16 pt-4">
      <div className="pt-10 pb-2">
        <SectionHeading icon="📐" eyebrow="ADRs" title="Decisiones técnicas" subtitle="Por qué está construido así, no solo qué hace." />
      </div>

      <div className="flex flex-col gap-3">
        {adrs.map((adr, index) => (
          <AccordionItem
            key={adr.title}
            adr={adr}
            isOpen={openIndex === index}
            onToggle={() => setOpenIndex(openIndex === index ? null : index)}
          />
        ))}
      </div>
    </main>
  );
}
