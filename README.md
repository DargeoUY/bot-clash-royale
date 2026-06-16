# Bot Clash Royale para Discord

Bot de Discord para administración de clanes de Clash Royale — tracking de guerras, sistema de puntos, detección de inactividad, modo vacaciones y más.

## Stack

| Componente | Tecnología |
|---|---|
| Runtime | Node.js 20 |
| Lenguaje | TypeScript 5 |
| Bot Framework | discord.js v14 |
| ORM | Prisma v5 |
| Base de datos | PostgreSQL 16 |
| Contenedores | Docker + Docker Compose |
| Logging | Winston |
| Scheduling | node-cron |
| Validación | zod |

## Requisitos

- Node.js 20+
- Docker y Docker Compose
- Un bot de Discord creado en [Discord Developer Portal](https://discord.com/developers/applications)
- Una API Key de [Clash Royale Developer](https://developer.clashroyale.com)

## Setup rápido

1. Clonar el repositorio
2. Copiar `.env.example` a `.env` y completar las variables
3. `docker compose up -d`
4. Ejecutar `/auto-setup #CLAN_TAG` en Discord

## Desarrollo local

```bash
npm install
npm run db:generate
npm run dev          # Arranca con hot-reload
```

## Scripts

| Script | Descripción |
|---|---|
| `npm run dev` | Desarrollo con hot-reload |
| `npm run build` | Compilar TypeScript |
| `npm run start` | Ejecutar produccion |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run db:generate` | Generar Prisma Client |
| `npm run db:migrate` | Crear migración de BD |
| `npm run db:push` | Sincronizar schema sin migración |
| `npm run test` | Ejecutar tests |

## Licencia

MIT
