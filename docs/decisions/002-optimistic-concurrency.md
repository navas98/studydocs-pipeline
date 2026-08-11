# ADR-002: Concurrencia optimista en MongoDB, no bloqueos

**Estado:** Aceptada
**Categoría:** Persistencia

## Contexto

Dos actualizaciones concurrentes sobre el mismo documento (por ejemplo, el worker indexándolo mientras el
usuario edita sus metadatos) no deben pisarse en silencio: una de las dos escrituras tiene que fallar de
forma explícita, no perderse.

## Decisión

Campo `version` en el agregado `Document`. `updateWithVersionCheck` ejecuta
`updateOne({ _id, version: esperada }, { $set: ... })` y comprueba `matchedCount === 1`; si la versión ya
cambió, la escritura no encuentra el documento y falla. La capa HTTP traduce ese fallo a `409 Conflict`.

## Consecuencias

- Sin locks pesimistas ni contención: las lecturas nunca bloquean, y las escrituras concurrentes no
  compatibles simplemente una de ellas pierde la carrera.
- El llamador decide cómo reaccionar ante un 409 (reintentar con los datos frescos, avisar al usuario).
- No protege contra escrituras que nunca comprueban la versión (todas las escrituras de este proyecto
  pasan por `updateWithVersionCheck`, así que no aplica aquí, pero es una responsabilidad del código
  llamador, no algo que la base de datos imponga por sí sola).
