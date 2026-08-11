# ADR-001: Arquitectura hexagonal (dominio → aplicación → infraestructura)

**Estado:** Aceptada
**Categoría:** Diseño

## Contexto

El dominio (`Document` y su máquina de estados) no debe depender de MongoDB, S3 o Elasticsearch para
poder razonar sobre las reglas de negocio, y para poder testearlas, sin necesidad de infraestructura real.

## Decisión

Puertos definidos en `application/` (`DocumentRepository`, `ObjectStorage`, `DocumentQueue`,
`SearchIndex`...) con adaptadores concretos implementados en `infrastructure/`. Los casos de uso
dependen únicamente de las interfaces; nunca importan un driver de Mongo, el SDK de AWS o el cliente de
Elasticsearch directamente.

Los *composition roots* (`interfaces/http/server.ts` y `worker/index.ts`) son los únicos puntos del
código donde se instancian los adaptadores concretos y se inyectan en los casos de uso.

## Consecuencias

- Los casos de uso se testean con dobles en memoria, rápido y sin Docker.
- Cada adaptador se testea por separado contra infraestructura real (ver [ADR-005](005-testing-without-mocks.md)).
- Cambiar de MongoDB a otra base de datos, en teoría, solo tocaría `infrastructure/mongodb/` y el
  composition root — el dominio y los casos de uso no se enterarían.
- Coste: una capa más de indirección (interfaces) que un CRUD simple no necesitaría.
