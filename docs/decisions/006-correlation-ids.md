# ADR-006: Correlation IDs de extremo a extremo

**Estado:** Aceptada
**Categoría:** Observabilidad

## Contexto

Una petición HTTP dispara un mensaje SQS que procesa el worker de forma asíncrona, en un proceso
distinto. Sin un identificador común, depurar un fallo implica cruzar logs de dos procesos a mano por
timestamp aproximado — lento y propenso a error.

## Decisión

El id de petición de Fastify (`request.id`) acepta un `x-correlation-id` entrante si el cliente lo envía,
o genera uno nuevo si no. Ese id viaja dentro del mensaje SQS (`correlationId`) y aparece en todos los
logs estructurados del worker para esa operación. La respuesta HTTP lo devuelve en el header
`x-correlation-id`, así el cliente también puede correlar su propia petición con los logs del servidor.

## Consecuencias

- Un solo id permite reconstruir el recorrido completo de un documento en los logs, de API a worker, con
  un simple `grep`.
- No añade infraestructura nueva (no hace falta un sistema de tracing distribuido) — apropiado para el
  tamaño de este proyecto; en un sistema con más servicios, esto evolucionaría hacia trazas OpenTelemetry.
