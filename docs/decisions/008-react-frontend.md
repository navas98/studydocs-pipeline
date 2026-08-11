# ADR-008: Frontend en React + Vite, servido como build estático

**Estado:** Aceptada
**Categoría:** Demo

## Contexto

El objetivo del frontend es una demo visual profesional para enseñar el pipeline funcionando y presentar
el propio proyecto — no es el foco técnico del proyecto, que es el backend.

## Decisión

React + TypeScript + Tailwind + Framer Motion, compilado con Vite a HTML/JS/CSS estáticos que Fastify
sirve directamente desde `frontend/dist` vía `@fastify/static`. Un único proceso en producción, sin CORS
ni servidor de frontend aparte. En desarrollo, el dev server de Vite hace proxy de `/documents`, `/search`
y `/health` hacia la API en `:3000` para trabajar con hot-reload.

## Consecuencias

- Cero fricción para levantar la demo completa: un solo `npm run build` y el backend ya la sirve.
- Se gana un ecosistema de componentes y animaciones fluidas a cambio de un paso de build, que no existía
  en la primera versión (HTML/JS planos sin build).
- El frontend no tiene tests automatizados propios (sí typecheck y lint) — proporcionado, dado que no es
  el foco de evaluación del proyecto; se verificó manualmente en navegador en cada iteración visual.
