# ADR-007: Manejo de errores centralizado

**Estado:** Aceptada
**Categoría:** API

## Contexto

Repetir `try/catch` en cada ruta es fácil de olvidar en alguna, y tiende a filtrar detalles internos
(stack traces, mensajes de driver) en las respuestas de error si no se tiene cuidado en cada punto.

## Decisión

Las rutas dejan propagar el error tal cual lo lanza el caso de uso; un único `setErrorHandler` de Fastify
mapea errores de dominio conocidos a códigos HTTP (`DocumentNotFoundError` → 404,
`InvalidDocumentTransitionError`/`ConcurrencyConflictError` → 409, error de validación de esquema → 400)
y cualquier otra cosa a un 500 genérico sin detalles internos.

## Consecuencias

- Taxonomía de errores consistente en toda la API: el mismo tipo de error de dominio siempre produce el
  mismo código HTTP, sin importar en qué ruta ocurra.
- Ninguna ruta puede accidentalmente exponer un stack trace o un mensaje de MongoDB al cliente.
- Añadir un nuevo tipo de error de dominio requiere una línea en el mapa del error handler, no tocar cada
  ruta que pudiera lanzarlo.
