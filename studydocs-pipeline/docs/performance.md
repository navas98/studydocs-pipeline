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

- Con 10× más tráfico de lectura, este índice sigue siendo suficiente: el coste por consulta no depende
  del tráfico, solo del tamaño de la colección y el índice ya lo acota.
- Con 100× más documentos por propietario, la paginación (ya limitada a un máximo de 100 por página en
  `ListDocumentsUseCase`) seguiría acotando el trabajo por petición; el índice compuesto sigue sirviendo
  igual de bien porque `createdAt` ya está ordenado dentro de cada `ownerId`.
- Con una tasa de escritura mucho mayor (p. ej. miles de documentos/segundo), el coste de mantenimiento
  de este índice adicional empezaría a pesar más y merecería revisión, pero está fuera del alcance
  realista de esta demo de 5 días.
