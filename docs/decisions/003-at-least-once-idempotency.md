# ADR-003: Procesamiento asíncrono vía SQS con reintentos e idempotencia

**Estado:** Aceptada
**Categoría:** Fiabilidad

## Contexto

SQS entrega mensajes "at-least-once": el mismo documento se puede procesar más de una vez. Además, los
fallos transitorios (red, S3 caído un instante) no deben perder el mensaje ni marcar el documento como
fallido permanentemente por un problema pasajero.

## Decisión

- Errores transitorios (`TransientProcessingError`) se distinguen de los permanentes
  (`PermanentProcessingError`, por ejemplo un PDF corrupto).
- Visibility timeout + política de redrive a una DLQ (`maxReceiveCount`) para los reintentos automáticos.
- `POST /documents/:id/retry` para que un fallo permanente pueda reintentarse manualmente una vez
  resuelta su causa (por ejemplo, subiendo un PDF válido).
- El procesamiento es idempotente por diseño: volver a indexar un documento ya `INDEXED` es una operación
  redundante, no incorrecta (ver el trade-off de "Elasticsearch derivado, MongoDB fuente de verdad" en el
  README), así que reprocesar un mensaje duplicado no corrompe nada.

## Consecuencias

- El worker puede reintentar sin intervención humana en la mayoría de los casos.
- Un documento nunca queda "colgado" sin explicación: siempre hay un `status` y, si aplica, un
  `failureReason` legible.
- Coste: hay que pensar explícitamente en "qué pasa si esto se ejecuta dos veces" en cada paso del
  procesamiento, en vez de asumir entrega exactamente una vez.
