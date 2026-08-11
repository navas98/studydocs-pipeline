# Architecture Decision Records

Registro de por qué el proyecto está construido así, no solo qué hace. La misma información está
disponible en formato visual en `/decisions` una vez levantado el proyecto.

| ADR | Título | Categoría |
|---|---|---|
| [001](001-hexagonal-architecture.md) | Arquitectura hexagonal | Diseño |
| [002](002-optimistic-concurrency.md) | Concurrencia optimista en MongoDB | Persistencia |
| [003](003-at-least-once-idempotency.md) | Procesamiento asíncrono idempotente vía SQS | Fiabilidad |
| [004](004-elasticsearch-mapping.md) | Elasticsearch con mapping explícito | Búsqueda |
| [005](005-testing-without-mocks.md) | Tests contra infraestructura real | Testing |
| [006](006-correlation-ids.md) | Correlation IDs de extremo a extremo | Observabilidad |
| [007](007-centralized-error-handling.md) | Manejo de errores centralizado | API |
| [008](008-react-frontend.md) | Frontend en React servido como build estático | Demo |
