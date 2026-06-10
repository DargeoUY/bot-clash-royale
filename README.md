# Bot Clash Royale para Discord

Bot de Discord para administración de clanes de Clash Royale. Tracking de guerras, sistema de puntos, detección de inactividad, modo vacaciones, ranking de estadísticas diarias, y más.

## Características

- **Sync automático** — importa miembros del clan cada 1h vía Clash Royale API
- **Inactividad** — detecta miembros inactivos (2+ días) con umbrales configurables
- **Ranking diario** — Victorias/Derrotas, Donaciones, Copas y Guerra de Clanes (stats diarias con delta)
- **Guerra de Clanes** — estado en tiempo real, fama, decks, reportes semanales/mensuales
- **Sistema de puntos** — bonus, penalizaciones, historial
- **Modo vacaciones** — los miembros pueden declarar ausencia sin perder puntos
- **Perfil de jugador** — stats completos + últimas 5 batallas
- **Auto-setup** — crea canales, roles y categoría automáticamente
- **Multi-servidor** — cada guild de Discord puede tener su propio clan
- **Cooldowns** — protección anti-spam en comandos pesados

## Stack

| Componente | Tecnología |
|---|---|
| Runtime | Node.js 20 |
| Lenguaje | TypeScript 5 |
| Bot | discord.js v14 |
| ORM | Prisma v5 |
| DB | PostgreSQL 16 |
| Deploy | Docker + Docker Compose |

## Requisitos

- Docker y Docker Compose
- Un bot de Discord: [Discord Developer Portal](https://discord.com/developers/applications)
- Una API Key de Clash Royale: [developer.clashroyale.com](https://developer.clashroyale.com)
- Whitelistear la IP del proxy: **`45.79.218.79`**

## Setup rápido

```bash
# 1. Clonar
git clone https://github.com/DargeoUY/bot-clash-royale.git
cd bot-clash-royale

# 2. Configurar
cp .env.example .env
# Editar .env con tu DISCORD_TOKEN, DISCORD_CLIENT_ID, CR_API_KEY

# 3. Levantar
docker compose up -d

# 4. En Discord
/auto-setup #CLAN_TAG
```

## Comandos

### Jugadores
| Comando | Descripción |
|---|---|
| `/perfil #TAG` | Perfil completo + últimas 5 batallas |
| `/registrar #TAG` | Vincular cuenta CR con Discord |
| `/puntos ver #TAG` | Ver puntos acumulados |
| `/guerra estado` | Estado actual de la guerra |
| `/ausencia <dias>` | Activar modo vacaciones |

### Líderes
| Comando | Descripción |
|---|---|
| `/inactivos` | Miembros inactivos (consulta directa a la API) |
| `/ranking stats` | Ranking diario: V/D, Donaciones, Copas, Guerra |
| `/ranking puntos` | Ranking de puntos (semanal/mensual/general) |
| `/clan info` | Información del clan |
| `/clan sincronizar` | Forzar sync desde la API |
| `/clan no-registrados` | Miembros sin Discord vinculado |
| `/config` | Configurar canales del bot |
| `/setup #TAG` | Vincular servidor a un clan |

## Desarrollo

```bash
npm install
npm run build
npm run dev
```

## Licencia

MIT
