# Plan de implementación — StudyDocs v2

Roadmap acordado a partir de `funcionalidad2.0.md`, con prioridades ajustadas al presupuesto real:
**2 semanas**, sin acceso al ordenador potente durante la primera semana (fuera de Madrid).

Fase 1 (auth) ya está hecha y commiteada en `feature/studydocs-v2`. Este documento cubre desde la Fase 2.

---

## Semana 1 (resto) — sin IA

### Fase 2 — Extracción y estructuración del PDF

1. Puerto `DocumentTextExtractor` (`application/documents/`): `extract(buffer) → { pages: [{ page, text }] }`.
2. Adaptador `PdfTextExtractor` con `pdf-parse` (pura JS, sin compilación nativa).
3. Limpieza de texto: espacios duplicados, saltos de línea, páginas vacías.
4. Chunking: fragmentos de ~500-1000 tokens con solapamiento, por página.
5. Entidad `Chunk` (`chunkId`, `documentId`, `ownerId`, `page`, `position`, `content`) + colección Mongo `chunks` + `ChunkRepository` (puerto + adaptador), mismo patrón que `DocumentRepository`.
6. El worker, tras indexar metadatos (como ahora): extrae → limpia → trocea → guarda chunks.
7. **Mejora funcional real ya en esta fase**: indexar el `content` de los chunks en Elasticsearch, para que la búsqueda full-text encuentre texto *dentro* del PDF, no solo metadatos.
8. Nuevos estados de dominio `EXTRACTING` / `CHUNKING`, añadidos ahora porque el paso ya existe de verdad (no como refactor separado — ver nota sobre la Fase 7 original más abajo).
9. Tests: extractor con PDF real, chunking (límites/solapamiento), persistencia de chunks, búsqueda por contenido extraído.

---

## Semana 2 (con el ordenador potente) — núcleo de IA

### Fase 3 — Ollama

- Puerto `LLMProvider` (`generate()`, `summarize()`) + adaptador `OllamaLLMProvider`.
- Config vía `OLLAMA_URL` / `OLLAMA_MODEL` / `OLLAMA_TIMEOUT`.
- Timeout y distinción `TransientProcessingError`/`PermanentProcessingError` desde el primer commit (reutilizando el patrón que ya existe en el pipeline).
- Caso de uso: `POST /documents/:id/summary`. Estado `SUMMARIZING` → `READY`.

### Fase 4 — Embeddings

- Puerto `EmbeddingProvider` (`embed(text)`) sobre Ollama.
- El worker genera embedding por chunk tras el chunking.
- Ampliar el índice de Elasticsearch con el vector por chunk (`dense_vector`).

### Fase 5 — Búsqueda híbrida

- Combinar BM25 (ya existe) + kNN vectorial de Elasticsearch en un único ranking.
- No hace falta la fórmula perfecta a la primera; que funcione y se pueda explicar.

### Fase 6 — RAG

- `POST /documents/:id/ask`: pregunta → embedding → top-K chunks → contexto → Ollama → respuesta con `sources: [{ page, chunkId }]`.
- Prompt explícito: responder solo con el contexto dado; si no está, decirlo.
- Tests: pregunta con respuesta, sin información suficiente, documento de otro usuario (403), Ollama caído.

> Testing no es una fase aparte (antes "Fase 14"): cada pieza se entrega con sus tests, manteniendo la suite en verde en cada paso, igual que en la Fase 1.
>
> La máquina de estados (antes "Fase 7") tampoco es un refactor aparte: los estados nuevos (`EXTRACTING`, `CHUNKING`, `SUMMARIZING`, `READY`...) se añaden en la fase donde el paso correspondiente se implementa de verdad.

---

## Si sobra tiempo en la semana 2 (opcional, en este orden)

1. Rate limiting en `/auth/login`, `/auth/register` y `/documents/:id/ask` (barato, y los endpoints de IA son caros).
2. Circuit breaker sobre Ollama (ya habrá timeouts + retries; esto es la guinda).
3. SSE para progreso en tiempo real (el polling ya funciona; SSE es mejora de UX, no de funcionalidad).

---

## Aparcado fuera de estas 2 semanas (y por qué)

- **Prometheus + Grafana**: señal de "sé operar esto en producción", no algo que 2 usuarios reales necesiten.
- **CORS / headers de seguridad**: no aplica de verdad — frontend y backend los sirve el mismo proceso Fastify, mismo origen.
- **Learning Analytics + IA para profesores** (`Teacher`/`Course`/`Student`/`Topic`/`LearningEvent`): es un **producto distinto**, no una fase más — cambia el pitch de "asistente de apuntes con IA" a "plataforma de analítica para profesores". No cabe junto con Ollama+embeddings+RAG en 2 semanas sin que ninguna de las dos mitades quede sólida. Queda como visión a futuro para mencionar en la entrevista, no como código.
- **CI/CD completo con Docker build + entornos dev/test/prod**: el CI actual (typecheck+lint+test) basta. Además, los tests de Ollama deben quedar fuera del CI normal para no descargar un modelo enorme en cada push (ya lo decía `funcionalidad2.0.md`).
- **README final / vídeo / landing con ArcadiaX**: al final, cuando RAG funcione de verdad de punta a punta — como se hizo con el v1.
