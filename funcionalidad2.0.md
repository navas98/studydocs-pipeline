# Guía paso a paso para evolucionar StudyDocs

## Objetivo final

Convertir el proyecto actual en una aplicación backend completa para estudiantes donde un usuario pueda:

* Registrarse e iniciar sesión.
* Subir sus PDFs.
* Organizar documentos por asignatura.
* Procesarlos en segundo plano.
* Extraer automáticamente el texto.
* Generar embeddings.
* Buscar información mediante búsqueda tradicional y semántica.
* Generar resúmenes mediante IA local con Ollama.
* Hacer preguntas sobre los documentos mediante RAG.
* Ver en tiempo real el estado del procesamiento.
* Tener un sistema resistente a errores.
* Ejecutar todo mediante Docker.
* Tener métricas, logs, tests y CI/CD.

La prioridad debe ser siempre que cada nueva pieza funcione correctamente antes de pasar a la siguiente.

---

# FASE 0 — Preparar el proyecto

## Paso 1. Crear una nueva rama de desarrollo

Crear una rama específica para esta evolución.

```bash
git checkout -b feature/studydocs-v2
```

No trabajar directamente sobre `main`.

## Paso 2. Comprobar que todo funciona actualmente

Antes de modificar nada:

```bash
docker compose up -d
npm install
npm run typecheck
npm run lint
npm test
```

También comprobar manualmente:

```text
Crear documento
→ subir PDF
→ S3
→ SQS
→ worker
→ Elasticsearch
→ búsqueda
```

Si algo falla ahora, arreglarlo antes de continuar.

## Resultado esperado

Tenemos una versión estable del proyecto actual sobre la que empezar a trabajar.

---

# FASE 1 — Usuarios y autenticación

## Paso 3. Crear entidad User

Crear una entidad de dominio similar a:

```text
User
├── id
├── email
├── passwordHash
├── role
├── createdAt
└── updatedAt
```

Roles iniciales:

```text
USER
ADMIN
```

## Paso 4. Crear UserRepository

En la capa `application` definir un puerto:

```text
UserRepository
```

Operaciones mínimas:

```text
create()
findById()
findByEmail()
```

Después crear el adaptador MongoDB correspondiente.

## Paso 5. Registro

Crear:

```text
POST /auth/register
```

Flujo:

```text
email + contraseña
        ↓
validación
        ↓
comprobar email duplicado
        ↓
hash contraseña
        ↓
guardar usuario
```

Usar Argon2 o bcrypt para almacenar contraseñas.

Nunca guardar una contraseña en texto plano.

## Paso 6. Login

Crear:

```text
POST /auth/login
```

Debe devolver:

```text
accessToken
refreshToken
```

## Paso 7. Middleware de autenticación

Crear middleware que valide el JWT.

A partir de ahí:

```text
request.user.id
request.user.role
```

estará disponible para los endpoints protegidos.

## Paso 8. Eliminar dependencia manual de ownerId

No permitir:

```text
GET /documents?ownerId=123
```

para acceder libremente a documentos.

Pasar a algo parecido a:

```text
GET /me/documents
```

El usuario se obtiene del JWT.

## Paso 9. Autorización

Comprobar siempre que:

```text
document.ownerId === authenticatedUser.id
```

Un usuario nunca puede leer o modificar documentos de otro usuario.

## Tests obligatorios

* Registro correcto.
* Email duplicado.
* Login correcto.
* Contraseña incorrecta.
* Token inválido.
* Token expirado.
* Acceso a documento propio.
* Intento de acceso a documento ajeno.

## Resultado esperado

Ya tenemos una aplicación multiusuario real.

---

# FASE 2 — Mejorar el procesamiento del PDF

## Paso 10. Extraer texto real

Actualmente el worker procesa el PDF.

Añadir una etapa específica:

```text
PDF
 ↓
TextExtractor
 ↓
texto limpio
```

Crear un puerto:

```text
DocumentTextExtractor
```

De esta forma la implementación concreta queda desacoplada.

## Paso 11. Limpiar el texto

Eliminar:

* Espacios duplicados.
* Saltos de línea absurdos.
* Caracteres extraños.
* Páginas vacías.

Guardar también información de página cuando sea posible.

Ejemplo:

```json
{
  "page": 12,
  "text": "La arquitectura..."
}
```

## Paso 12. Implementar chunking

Dividir el texto en fragmentos.

Por ejemplo:

```text
500-1000 tokens
```

con cierto solapamiento.

Cada chunk debería tener:

```text
chunkId
documentId
page
position
content
```

## Resultado esperado

Un PDF ya puede convertirse en fragmentos estructurados preparados para búsqueda e IA.

---

# FASE 3 — Añadir Ollama

## Paso 13. Instalar Ollama

Ollama debe ejecutarse independientemente del backend.

Ejemplo conceptual:

```text
Backend
   ↓ HTTP
Ollama
   ↓
LLM
```

## Paso 14. Crear un puerto de IA

No llamar directamente a Ollama desde los casos de uso.

Crear algo parecido a:

```text
LLMProvider
```

con operaciones como:

```text
generate()
summarize()
```

Después implementar:

```text
OllamaLLMProvider
```

## Paso 15. Configuración mediante variables de entorno

Ejemplo:

```env
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=...
OLLAMA_TIMEOUT=...
```

No hardcodear modelos ni URLs.

## Paso 16. Primer caso de uso: resumen

Crear:

```text
POST /documents/:id/summary
```

Inicialmente:

```text
documento
 ↓
texto
 ↓
Ollama
 ↓
resumen
```

Después lo integraremos mejor con el pipeline.

## Tests

Mockear el puerto `LLMProvider` para tests unitarios.

En tests de integración de Ollama, si decides hacerlos, separarlos del CI normal para no necesitar descargar un modelo enorme.

## Resultado esperado

La aplicación ya puede generar un resumen utilizando IA local.

---

# FASE 4 — Embeddings

## Paso 17. Crear EmbeddingProvider

Crear otro puerto:

```text
EmbeddingProvider
```

Operación:

```text
embed(text)
```

Puede utilizar también Ollama u otro modelo local.

## Paso 18. Generar embeddings de chunks

El worker deberá hacer:

```text
PDF
 ↓
extraer texto
 ↓
chunks
 ↓
embedding de cada chunk
```

Cada chunk tendrá un vector asociado.

## Paso 19. Indexarlos en Elasticsearch

Ampliar el índice actual.

Cada registro podría contener:

```text
documentId
chunkId
page
content
embedding
subject
university
```

## Resultado esperado

Elasticsearch puede buscar documentos tanto por palabras como por similitud semántica.

---

# FASE 5 — Búsqueda híbrida

## Paso 20. Mantener la búsqueda tradicional

No eliminar BM25/full-text.

Seguir permitiendo:

```text
/search?q=arquitectura
```

## Paso 21. Añadir búsqueda vectorial

Cuando el usuario realiza una consulta:

```text
pregunta
 ↓
EmbeddingProvider
 ↓
vector
 ↓
Elasticsearch
 ↓
chunks similares
```

## Paso 22. Combinar ambos resultados

Implementar búsqueda híbrida:

```text
BM25
+
vector search
=
ranking final
```

No hace falta empezar con una fórmula perfecta.

Lo importante es poder explicar por qué combinamos ambas.

## Resultado esperado

Una búsqueda como:

```text
"cómo funciona la memoria del ordenador"
```

puede recuperar contenido relevante aunque esas palabras exactas no aparezcan.

---

# FASE 6 — RAG

## Paso 23. Crear endpoint de preguntas

Crear:

```text
POST /documents/:id/ask
```

Body:

```json
{
  "question": "¿Qué diferencia hay entre RAM y ROM?"
}
```

## Paso 24. Pipeline RAG

Implementar:

```text
Pregunta
 ↓
embedding
 ↓
buscar chunks
 ↓
seleccionar top K
 ↓
crear contexto
 ↓
Ollama
 ↓
respuesta
```

## Paso 25. Incluir fuentes

La respuesta debería devolver algo similar a:

```json
{
  "answer": "...",
  "sources": [
    {
      "page": 12,
      "chunkId": "abc"
    },
    {
      "page": 13,
      "chunkId": "def"
    }
  ]
}
```

Eso aporta mucha credibilidad al sistema.

## Paso 26. Evitar respuestas inventadas

El prompt debe indicar al modelo que:

```text
Responda únicamente con el contexto proporcionado.
Si la información no aparece, debe indicarlo.
```

## Tests

Probar:

* Pregunta con respuesta.
* Pregunta sin información suficiente.
* Documento sin procesar.
* Documento de otro usuario.
* Ollama no disponible.

## Resultado esperado

Tenemos un sistema RAG completo sobre documentos privados.

---

# FASE 7 — Evolucionar la máquina de estados

## Paso 27. Añadir nuevos estados

Por ejemplo:

```text
CREATED
UPLOADING
QUEUED
EXTRACTING
CHUNKING
GENERATING_EMBEDDINGS
INDEXING
GENERATING_SUMMARY
READY
FAILED
RETRYING
```

No meter estados innecesarios si no aportan información.

## Paso 28. Controlar transiciones

No permitir cosas absurdas como:

```text
CREATED → READY
```

Toda transición debe pasar por el dominio.

## Resultado esperado

El estado representa de forma clara lo que está ocurriendo en el sistema.

---

# FASE 8 — SSE y progreso en tiempo real

## Paso 29. Crear endpoint de eventos

Por ejemplo:

```text
GET /documents/:id/events
```

Utilizar Server-Sent Events.

## Paso 30. Enviar cambios

El frontend podrá recibir:

```text
EXTRACTING
CHUNKING
GENERATING_EMBEDDINGS
GENERATING_SUMMARY
READY
```

sin hacer polling constantemente.

## Resultado esperado

El usuario puede observar el procesamiento en tiempo real.

---

# FASE 9 — Resiliencia

Esta fase es especialmente importante para demostrar nivel backend.

## Paso 31. Timeouts

Toda llamada a Ollama debe tener timeout.

Nunca permitir que una petición espere indefinidamente.

## Paso 32. Retries

Para errores temporales:

```text
intento 1
 ↓
1 segundo

intento 2
 ↓
2 segundos

intento 3
 ↓
4 segundos
```

## Paso 33. Diferenciar errores

Crear al menos:

```text
TransientError
PermanentError
```

Ejemplo:

```text
timeout Ollama → transitorio
PDF corrupto → permanente
```

## Paso 34. Circuit breaker

Si Ollama está fallando constantemente:

```text
CLOSED
 ↓
muchos errores
 ↓
OPEN
 ↓
espera
 ↓
HALF_OPEN
 ↓
prueba
```

Así evitamos saturar un servicio caído.

## Paso 35. Idempotencia

Si SQS entrega dos veces:

```text
documentId=123
```

procesarlo dos veces no debe corromper el sistema.

## Resultado esperado

El backend continúa funcionando incluso cuando parte de la infraestructura falla.

---

# FASE 10 — Observabilidad

## Paso 36. Mantener logs estructurados

Seguir utilizando Pino.

Todos los logs importantes deberían tener:

```text
requestId
userId
documentId
jobId
```

cuando corresponda.

## Paso 37. Prometheus

Exponer:

```text
GET /metrics
```

Métricas mínimas:

```text
http_request_duration
http_requests_total
documents_processed_total
documents_failed_total
worker_processing_duration
ollama_request_duration
ollama_errors_total
```

## Paso 38. Grafana

Crear un dashboard mostrando:

* Peticiones por minuto.
* Latencia.
* Errores.
* PDFs procesados.
* PDFs fallidos.
* Tiempo medio de procesamiento.
* Tiempo de Ollama.

## Resultado esperado

Podemos saber qué está ocurriendo en el sistema sin entrar directamente en la base de datos.

---

# FASE 11 — Seguridad

## Paso 39. Rate limiting

Limitar especialmente:

```text
/login
/register
/ask
/summary
```

Los endpoints de IA son caros.

## Paso 40. Validación completa

Validar:

* MIME type.
* Tamaño máximo PDF.
* Payloads.
* Emails.
* Passwords.
* IDs.

## Paso 41. Headers y CORS

Configurar correctamente:

* CORS.
* Security headers.
* Límites HTTP.

## Resultado esperado

El proyecto deja de asumir que el cliente siempre se comporta correctamente.

---

# FASE 12 — Testing final

## Paso 42. Tests unitarios

Especialmente:

```text
Domain
State machine
Use cases
RAG
Retry policies
Authorization
```

## Paso 43. Tests de integración

Contra:

```text
MongoDB
LocalStack
Elasticsearch
```

## Paso 44. E2E

Crear un escenario completo:

```text
Registrar usuario
 ↓
Login
 ↓
Subir PDF
 ↓
procesarlo
 ↓
READY
 ↓
buscar contenido
 ↓
generar resumen
 ↓
hacer pregunta
 ↓
obtener respuesta y fuentes
```

Este test es extremadamente valioso.

## Resultado esperado

El comportamiento crítico está cubierto automáticamente.

---

# FASE 13 — CI/CD

## Paso 45. Ampliar GitHub Actions

En cada PR:

```text
npm install
 ↓
typecheck
 ↓
lint
 ↓
unit tests
 ↓
integration tests
 ↓
build
```

## Paso 46. Docker build

Comprobar automáticamente que la imagen Docker compila.

## Resultado esperado

No puede entrar código roto fácilmente en `main`.

---

# FASE 14 — Frontend mínimo

No dedicar demasiado tiempo aquí.

Necesitamos únicamente:

```text
Login
Registro
Dashboard
Subir PDF
Lista documentos
Estado procesamiento
Resumen
Buscador
Chat/RAG
```

No hace falta convertirlo en un proyecto de diseño.

El backend es la pieza que queremos demostrar.

---

# FASE 15 — Prepararlo para portfolio

## Paso 47. README

El README final debe explicar en los primeros segundos:

```text
Qué problema resuelve
Qué hace
Cómo funciona
Arquitectura
Stack
Cómo ejecutarlo
```

## Paso 48. Diagrama de arquitectura

Mostrar:

```text
                       React
                         │
                         ▼
                     Fastify
                         │
           ┌─────────────┼──────────────┐
           ▼             ▼              ▼
        MongoDB          S3       Elasticsearch
                         │
                        SQS
                         │
                         ▼
                       Worker
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
          Embeddings              Ollama
```

## Paso 49. ADRs

Documentar decisiones importantes:

```text
¿Por qué MongoDB?
¿Por qué SQS?
¿Por qué Elasticsearch?
¿Por qué arquitectura hexagonal?
¿Por qué Ollama?
¿Por qué no microservicios?
¿Por qué SSE?
¿Por qué búsqueda híbrida?
```

## Paso 50. Vídeo

Vídeo corto, aproximadamente 2-3 minutos.

Mostrar:

```text
Login
 ↓
subir PDF
 ↓
procesamiento en tiempo real
 ↓
resumen
 ↓
pregunta
 ↓
respuesta basada en PDF
 ↓
Grafana
```

Después enseñar brevemente la arquitectura.

---

# Orden de prioridad

Si tenemos poco tiempo, este sería el orden obligatorio:

## PRIORIDAD 1

* Autenticación.
* Extracción del PDF.
* Chunking.
* Ollama.
* Embeddings.
* Elasticsearch vectorial.
* RAG.

## PRIORIDAD 2

* Resiliencia.
* Tests.
* SSE.
* Observabilidad.

## PRIORIDAD 3

* Rate limiting.
* Dashboard Grafana.
* Pulido frontend.
* Vídeo.
* Documentación final.

---

# Plan aproximado de 4 semanas

## Semana 1

```text
Auth
Usuarios
Permisos
Extracción PDF
Chunking
Integración Ollama
```

Objetivo:

```text
PDF → texto → resumen local
```

## Semana 2

```text
Embeddings
Elasticsearch vectorial
Búsqueda híbrida
RAG
Fuentes
```

Objetivo:

```text
PDF → pregunta → respuesta basada en contenido
```

## Semana 3

```text
Máquina de estados
Retries
Timeouts
Circuit breaker
SSE
Prometheus
Grafana
```

Objetivo:

Sistema resistente y observable.

## Semana 4

```text
Testing
CI/CD
Seguridad
Frontend
README
ADRs
Diagrama
Vídeo
```

Objetivo:

Proyecto preparado para entrevistas.

---

# Definición de proyecto terminado

Yo consideraría que el proyecto está terminado cuando podamos ejecutar esta demostración:

```text
1. Creo una cuenta.

2. Inicio sesión.

3. Subo un PDF de una asignatura.

4. La API guarda el archivo.

5. SQS crea el trabajo.

6. El worker comienza a procesarlo.

7. El frontend muestra:
   EXTRACTING
   CHUNKING
   GENERATING_EMBEDDINGS
   GENERATING_SUMMARY
   READY

8. Elasticsearch guarda texto + vectores.

9. Ollama genera el resumen.

10. Pregunto:
    "¿Qué tengo que saber de este tema para el examen?"

11. El sistema recupera fragmentos relevantes.

12. Ollama responde utilizando esos fragmentos.

13. La respuesta indica las páginas utilizadas.

14. Puedo buscar también mediante texto tradicional.

15. Si Ollama falla, el documento no se pierde.

16. Los logs permiten seguir toda la operación.

17. Grafana muestra las métricas.

18. Los tests verifican el flujo.

19. GitHub Actions está en verde.

20. Todo se puede levantar de forma reproducible con Docker.
```

Cuando podamos hacer esa demostración de principio a fin y explicar por qué existe cada componente, dejaría de añadir funcionalidades. A partir de ese momento el trabajo sería pulir, documentar y aprender a defender técnicamente las decisiones del proyecto.
