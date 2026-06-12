# Bot Clash Royale — Contexto para nueva sesión

## Arquitectura
```
┌──────────┐     ┌──────────────┐     ┌───────────┐
│ Discord  │────▶│  Node.js 20  │────▶│  MariaDB  │
│ Telegram │◀────│  TypeScript  │◀────│  (Docker) │
└──────────┘     └──────┬───────┘     └───────────┘
                        │
                  ┌─────▼─────┐
                  │ CR API    │
                  │ (proxy)   │
                  └───────────┘
```

## Stack
- **Runtime:** Node.js 20 + TypeScript
- **Bot:** discord.js v14
- **ORM:** Prisma v5
- **DB:** MariaDB 11 (Docker)
- **API:** proxy.royaleapi.dev/v1 (IP fija 45.79.218.79)
- **Deploy:** Docker Compose (net=host)

## Archivos clave

| Archivo | Propósito |
|---|---|
| `src/bot.ts` | Arranque del bot, cron jobs, healthcheck |
| `src/config/index.ts` | Variables de entorno (zod) |
| `prisma/schema.prisma` | Schema MariaDB (16 tablas) |
| `docker-compose.yml` | MariaDB + bot (network_mode: host) |
| `Dockerfile` | node:20-slim, prisma generate + db push al arrancar |

## Base de datos (MariaDB) — 16 tablas

### Tablas principales
| Tabla | Propósito |
|---|---|
| `Clan` | Clanes registrados (tag, nombre, miembros) |
| `Player` | Jugadores (tag, discordId, telegramId, status) |
| `BotConfig` | Configuración clave-valor (canales, tokens, links) |
| `ClanHistory` | Historial de altas/bajas |

### Ranking (datos numéricos, sin JSON)
| Tabla | Frecuencia | Campos |
|---|---|---|
| `PuntoGuardado` | 00:00 | dia, mes, anio, partidasGanadas, partidasPerdidas, cartasDonadas, trofeos |
| `DeltaDiario` | cada 5 min | dia, mes, anio, hora, minuto, partidasGanadas, partidasPerdidas, cartasDonadas, trofeos, fama |
| `AcumuladoSemanal` | diario (09:00) | inicioSemana, partidasGanadas, partidasPerdidas, cartasDonadas, trofeos, fama |
| `AcumuladoMensual` | diario (09:00) | mes, anio, trofeos, fama |

### Puntos y actividad
| Tabla | Propósito |
|---|---|
| `PlayerPoint` | Puntos acumulados por jugador/temporada |
| `PointHistory` | Historial de puntos otorgados/quitados |
| `InactivityLog` | Log de inactividad detectada |
| `Vacation` | Modo vacaciones |
| `DonationLog` | Donaciones por jugador/temporada |

### Guerra
| Tabla | Propósito |
|---|---|
| `WarLog` | Registro de guerras (seasonId, fama, participantes) |
| `WarParticipant` | Participación individual en guerra |

## Cron jobs

| Hora | Tarea | API calls |
|---|---|---|
| 00:00 | Snapshot completo (todos los jugadores) | ~51 |
| cada 5 min | Light update (solo copas) | 1 |
| 09:00 | Publicar ranking diario (ayer completo) | 0 (lee DB) |
| 09:00 lun. | Publicar ranking semanal + reset | 1 |
| cada 1h | Sync de clan (miembros) | 1 |
| cada 30min | Sync de guerra | 1 |
| cada 6h | Check de inactividad | 1 |
| día 1 03:00 | Cleanup >30 días | 0 |
| día 1 12:00 | Ganadores mensuales | 0 |

## Comandos Discord
**Jugadores:** `/registrar`, `/perfil`, `/clan`, `/guerra`, `/ayuda`, `/whatsapp`, `/ausencia`, `/puntos`
**Líderes:** `/inactivos`, `/ranking stats`, `/ranking semanal`, `/rankingn`, `/torneo`, `/exportar`, `/diagnostico`, `/config *`, `/vincular`, `/auto-setup`, `/setup`

## Comandos Telegram
`/help`, `/registrar`, `/perfil`, `/ranking`, `/rankingn`, `/clan`

## Deploy
```bash
# En el VPS (Linux):
docker compose down
docker compose build --no-cache
docker compose up -d
docker compose logs bot --tail 30
```

## Variables de entorno (.env)
```
DISCORD_TOKEN, CR_API_KEY, CR_API_BASE_URL, DATABASE_URL (mysql://),
DB_USER, DB_PASSWORD, DB_ROOT_PASSWORD, CLAN_TAG,
INACTIVITY_THRESHOLD_DAYS, TELEGRAM_BOT_TOKEN, HEALTHCHECK_PORT, LOG_LEVEL
```

## Decisiones de diseño
- Un solo bot de Telegram para todos los clanes (token en .env)
- Cada grupo de Telegram se vincula a un clan vía `/vincular` (código automático)
- Ranking diario: deltas reales (medianoche vs medianoche), sin negativos
- Ranking semanal: suma de deltas diarios positivos (lunes 09:00)
- `/ranking stats`: 0 API calls (lee tablas SQL)
- `/rankingn`: líderes ven todos los jugadores + guerra al privado
- Request queue: 250 req/min, 200ms entre requests

## Ubicación archivos
- **Desarrollo:** `C:\Users\George\Proyectos\bot-clash-royale\` (git + build)
- **Google Drive:** `G:\Otros ordenadores\Mi PC\Proyectos-En-Progrso\Bot_Clash_Royale\` (sync al VPS)
- **VPS:** `C:\Users\georg\Proyectos-En-Progrso\Bot_Clash_Royale\` (Docker)
- **GitHub:** `github.com/DargeoUY/bot-clash-royale` (privado)

## Notas
- Todas las tablas de ranking usan nombres en español
- Cero JSON en BotConfig para datos de usuarios/stats
- MariaDB elegido por ser MySQL-compatible y liviano (~130MB)
- El nombre del bot de Telegram se puede cambiar sin afectar nada
