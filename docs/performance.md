# Rendimiento: consulta de listado por propietario

Medición generada con `npm run perf:mongo` (`scripts/analyzeMongoPerformance.ts`) el 2026-08-11.

## Contexto

La API expone `GET /documents?ownerId=...`, respaldada por `MongoDocumentRepository.findByOwner()`,
que consulta `{ ownerId }` ordenando por `createdAt` descendente. Es el patrón de acceso más frecuente
de la aplicación (un usuario listando sus propios documentos), documentado como tal en la sección 11
del documento de diseño.

## Metodología

- 50,000 documentos sembrados en una base de datos MongoDB local (Docker, `mongo:7`), de los cuales
  25 pertenecen al propietario consultado — un ratio deliberadamente desfavorable
  (0.05%) para hacer visible el coste de un COLLSCAN.
- Se ejecuta `explain('executionStats')` sobre la misma consulta antes y después de crear el índice
  compuesto `{ ownerId: 1, createdAt: -1 }`.
- Entorno: portátil de desarrollo, MongoDB en Docker Desktop sin límites de recursos aplicados. **Estos
  números no son representativos de producción** (sección 17); lo relevante es la diferencia relativa
  entre ambos planes de ejecución, no los milisegundos absolutos.

## Resultados

### **Antes del índice (COLLSCAN)**

- Winning plan stage: `SORT -> COLLSCAN`
- Documents examined: 50,000
- Index keys examined: 0
- Documents returned: 25
- Execution time: 27 ms

### **Después del índice (IXSCAN)**

- Winning plan stage: `FETCH -> IXSCAN`
- Documents examined: 25
- Index keys examined: 25
- Documents returned: 25
- Execution time: 1 ms

## Interpretación

Sin el índice, MongoDB recorre la colección completa (`50,000` documentos examinados para devolver solo 25) porque no tiene forma de saltar directamente a los documentos del propietario buscado. Con el índice compuesto, el motor resuelve tanto el filtro por `ownerId` como el orden por `createdAt` directamente desde las entradas del índice, examinando 25 claves y 25 documentos — una reducción proporcional al tamaño de la colección, no al número de resultados.

## Coste del índice

Cada índice adicional tiene un coste de escritura (cada `insertOne`/`replaceOne` debe actualizar también
la entrada del índice) y de almacenamiento. Para esta colección, con escrituras poco frecuentes por
documento (creación, subida, unos pocos cambios de estado) frente a lecturas más frecuentes (listar,
consultar estado), el trade-off favorece claramente tener el índice.

## Qué cambiaría a mayor escala

- Con 10× más tráfico de lectura, el índice sigue siendo apropiado para este patrón de acceso: el plan de
  ejecución de cada consulta individual no cambia, solo depende del tamaño de la colección, no del
  tráfico. Eso no significa que el sistema entero escale gratis a ese tráfico — el pool de conexiones, la
  CPU disponible y la presión de I/O sobre MongoDB sí se ven afectados por más tráfico concurrente; ese es
  un problema de capacidad del servidor, distinto del que resuelve este índice.
- Con 100× más documentos por propietario, la paginación (ya limitada a un máximo de 100 por página en
  `ListDocumentsUseCase`) seguiría acotando el trabajo por petición; el índice compuesto sigue sirviendo
  igual de bien porque `createdAt` ya está ordenado dentro de cada `ownerId`.
- Con una tasa de escritura mucho mayor (p. ej. miles de documentos/segundo), el coste de mantenimiento
  de este índice adicional empezaría a pesar más y merecería revisión, pero está fuera del alcance
  realista de esta demo de 5 días.

## Prueba ligera de carga (endpoints representativos)

Medición generada con `npm run perf:load` (`scripts/loadTest.ts`) el 2026-08-11.

**Metodología**: 200 peticiones por endpoint, concurrencia 20, ejecutadas contra la
app real (Mongo/S3/SQS/Elasticsearch reales) vía `app.inject()` en vez de un servidor HTTP separado —
evita el coste de red/TCP, así que estos números son un límite inferior de la latencia real, no una
medición de producción. Entorno: portátil de desarrollo, sin aislamiento de recursos.

### **POST /documents (crear metadatos)**

- min: 13.2 ms
- p50: 41.3 ms
- p95: 98.5 ms
- p99: 128.7 ms
- max: 129.4 ms
- errors: 0 / 200

### **GET /documents?ownerId=... (listado paginado)**

- min: 28.6 ms
- p50: 57.5 ms
- p95: 66.0 ms
- p99: 85.4 ms
- max: 151.3 ms
- errors: 0 / 200

### Interpretación

`POST /documents` solo escribe en MongoDB (sin tocar S3/SQS/Elasticsearch), por lo que su latencia
refleja principalmente el coste de una escritura simple. `GET /documents` usa el índice
`{ownerId, createdAt}` creado en el Día 1, por lo que su p95/p99 se mantiene bajo incluso con
200 peticiones concurrentes contra los mismos datos.

### Cuellos de botella y qué cambiaría a mayor escala

- El cuello de botella más probable a mayor escala no es MongoDB (ya indexado), sino el pool de
  conexiones por defecto del driver y el hilo único de Node.js para JSON parsing/serialización bajo
  carga muy alta.
- Con 10×-100× más tráfico, el primer paso sería medir con un servidor HTTP real bajo una herramienta
  de carga dedicada (k6, autocannon) en vez de `inject()`, y considerar escalar horizontalmente la API
  (es stateless) detrás de un balanceador.
