# ADR-004: Elasticsearch con mapping explícito, no dinámico

**Estado:** Aceptada
**Categoría:** Búsqueda

## Contexto

Se necesita full-text sobre título/asignatura y, además, filtros por asignatura/universidad que toleren
texto parcial ("Sevilla" debe encontrar "Universidad de Sevilla"), ya que en la demo son cajas de texto
libre, no desplegables con valores cerrados. El contenido es en español, así que "fisica" también debe
encontrar "Física".

## Decisión

- Mapping explícito (no dynamic mapping) con un analizador personalizado (`lowercase` + `asciifolding`)
  sobre `title`/`subject`/`university`, más subcampos `.keyword` — útiles para ordenar o agregar por
  valor exacto en el futuro, aunque hoy no se usan para filtrar.
- Los filtros de asignatura/universidad usan `match_phrase_prefix` sobre el campo analizado, no un `term`
  exacto sobre `.keyword`.
- El nombre del índice es configurable (`ELASTICSEARCH_INDEX`), así los tests usan `documents_test` en
  vez de compartir (y periódicamente vaciar) el índice de desarrollo.

## Consecuencias

- Un único índice sirve tanto full-text como filtrado, sin duplicar datos ni mantener dos almacenes.
- Los filtros se comportan como cabría esperar de un cuadro de texto libre, no como un `WHERE =` estricto.
- Cambiar el mapping (por ejemplo, el analizador) requiere recrear el índice — no hay migración de mapping
  in-place en Elasticsearch, un coste real a tener en cuenta si esto llegase a producción con datos.
