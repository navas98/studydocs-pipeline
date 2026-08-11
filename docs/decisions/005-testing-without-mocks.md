# ADR-005: Tests contra infraestructura real, sin mocks

**Estado:** Aceptada
**Categoría:** Testing

## Contexto

Los mocks pueden divergir del comportamiento real de MongoDB/SQS/Elasticsearch y esconder bugs — por
ejemplo, la semántica exacta de la entrega "at-least-once" de SQS, o de un `updateOne` condicional en
Mongo. Un mock solo es tan fiel como lo que su autor imaginó que pasaría.

## Decisión

Los tests de integración y e2e corren contra MongoDB, LocalStack (S3+SQS) y Elasticsearch reales,
orquestados con Docker Compose (los mismos servicios que usa el proyecto en desarrollo). Solo los tests
unitarios de dominio y de casos de uso usan dobles en memoria.

## Consecuencias

- Suite más lenta que con mocks, y con `fileParallelism: false` en Vitest para evitar condiciones de
  carrera entre ficheros que comparten la misma infraestructura.
- A cambio, varios bugs reales solo aparecieron gracias a esto durante el desarrollo: una mutación de
  estado compartido entre un `Document` y su copia persistida, y un doble conteo de `processingAttempts`
  al reanudar desde `RETRYING`. Ninguno de los dos se habría detectado con un repositorio mockeado que
  simplemente devolviera lo que se le pidiera.
- Requiere Docker en CI y en local para poder ejecutar la suite completa (ver `.github/workflows/ci.yml`).
