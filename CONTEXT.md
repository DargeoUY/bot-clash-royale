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
- **DB:** MariaDB 11 (Docker, imagen `mariadb:11`)
- **API:** proxy.royaleapi.dev/v1 (IP fija 45.79.218.79)
- **Deploy:** Docker Compose (red bridge, sin `network_mode: host`)

## Archivos clave

| Archivo | Propósito |
|---|---|
| `src/bot.ts` | Arranque del bot, cron jobs, healthcheck |
| `src/config/index.ts` | Variables de entorno (zod) |
| `prisma/schema.prisma` | Schema MariaDB (17 tablas) |
| `docker-compose.yml` | MariaDB + bot (red Docker bridge) |
| `Dockerfile` | node:20-slim, openssl, mysql-client, retry DB |
| `CONTEXT.md` | Este documento |

## Base de datos (MariaDB) — 17 tablas

### Tablas de configuración
| Tabla | Propósito |
|---|---|
| `Clan` | Clanes registrados (tag, nombre, miembros) |
| `Player` | Jugadores (tag, discordId, telegramId, status) |
| `BotConfig` | Config clave-valor (canales, links, chat IDs) |
| `ClanHistory` | Historial de altas/bajas |

### Ranking (0% JSON, 100% datos en columnas SQL)
| Tabla | Frecuencia | Campos |
|---|---|---|
| `PuntoGuardado` | 00:00 | dia, mes, anio, partidasGanadas, partidasPerdidas, cartasDonadas, trofeos |
| `DeltaDiario` | cada 5 min | dia, mes, anio, hora, minuto, partidasGanadas, partidasPerdidas, cartasDonadas, trofeos, fama |
| `AcumuladoSemanal` | diario (09:00) | inicioSemana, partidasGanadas, partidasPerdidas, cartasDonadas, trofeos, fama |
| `AcumuladoMensual` | diario (09:00) | mes, anio, trofeos, fama |

### Puntos, actividad, guerra
| Tabla | Propósito |
|---|---|
| `PlayerPoint` | Puntos por jugador/temporada |
| `PointHistory` | Historial de puntos |
| `InactivityLog` | Log de inactividad |
| `Vacation` | Modo vacaciones |
| `DonationLog` | Donaciones por jugador |
| `WarLog` | Registro de guerras |
| `WarParticipant` | Participación en guerra |

## Cron jobs

| Hora | Tarea | API calls |
|---|---|---|
| 00:00 | Snapshot completo (todos los jugadores) | ~51 |
| cada 5 min | Light update (solo copas) | 1 |
| 09:00 | Ranking diario en Discord (ayer completo, 0 calls) | 0 |
| 09:00 lun. | Ranking semanal + reset | 1 |
| cada 1h | Sync de clan (miembros) | 1 |
| cada 30min | Sync de guerra | 1 |
| cada 6h | Check de inactividad | 1 |
| día 1 03:00 | Cleanup >30 días | 0 |
| día 1 12:00 | Ganadores mensuales | 0 |

## Comandos Discord
**Jugadores:** `/registrar`, `/perfil`, `/clan`, `/guerra`, `/ayuda`, `/whatsapp`, `/ausencia`, `/puntos`
**Líderes:** `/inactivos`, `/ranking stats`, `/ranking semanal`, `/rankingn`, `/torneo`, `/exportar`, `/diagnostico`, `/config *`, `/vincular`, `/auto-setup`, `/setup`

## Comandos Telegram
`/help`, `/registrar`, `/perfil`, `/ranking`, `/rankingn` (líderes), `/clan`

## Deploy
```bash
# En el VPS:
docker compose down
docker compose build --no-cache
docker compose up -d
docker compose logs bot --tail 30

# Si MariaDB se corrompe (InnoDB error):
docker compose down -v   # borra el volumen de datos
docker compose up -d
docker compose logs bot --tail 30
```

## Variables de entorno (.env)
```
DISCORD_TOKEN, CR_API_KEY, CR_API_BASE_URL,
DATABASE_URL=mysql://user:pass@mysql:3306/db?sslmode=disable,
DB_USER, DB_PASSWORD, DB_ROOT_PASSWORD, CLAN_TAG,
INACTIVITY_THRESHOLD_DAYS, TELEGRAM_BOT_TOKEN,
HEALTHCHECK_PORT, LOG_LEVEL
```

**IMPORTANTE:** `DATABASE_URL` usa `@mysql:3306` (nombre del servicio Docker), NO `@localhost`.

## Decisiones de diseño
- Un solo bot de Telegram para todos los clanes (token en .env)
- Cada grupo de Telegram se vincula a un clan vía código automático + `/vincular`
- Ranking diario: deltas reales (medianoche vs medianoche), sin negativos
- Ranking semanal: suma de deltas diarios positivos
- `/ranking stats`: 0 API calls (lee tablas SQL)
- `/rankingn`: líderes ven todos + guerra al privado
- Request queue: 250 req/min, 200ms entre requests
- Bootstrap: solo resetea contadores el primer día (verifica con `PuntoGuardado`)

## Bugs arreglados (12/jun)
1. `detectMemberChanges` corría después del upsert (nunca detectaba miembros nuevos)
2. `clanStanding?.clan.participants.length` crash con undefined
3. Fechas de guerra inválidas (`new Date('')`)
4. `#28P8RQUY` hardcodeado → `config.CLAN_TAG`
5. `INACTIVITY_THRESHOLD_DAYS` ignoraba umbrales de advertencia

## Ubicación archivos
- **Desarrollo:** `C:\Users\George\Proyectos\bot-clash-royale\` (git + build)
- **Google Drive:** `G:\Otros ordenadores\Mi PC\Proyectos-En-Progrso\Bot_Clash_Royale\`
- **VPS:** `C:\Users\georg\Proyectos-En-Progrso\Bot_Clash_Royale\` (Docker)
- **GitHub:** `github.com/DargeoUY/bot-clash-royale` (privado)

## Notas
- Tablas de ranking con nombres en español (PuntoGuardado, DeltaDiario, AcumuladoSemanal, AcumuladoMensual)
- Campos en español (partidasGanadas, partidasPerdidas, cartasDonadas, trofeos, fama)
- Cero JSON para datos de usuarios/stats en BotConfig
- MariaDB (~130MB) elegido sobre MySQL (~500MB) por ser más liviano
- Docker sin `network_mode: host` (compatible con Docker Desktop Windows)
- `prisma db push --accept-data-loss` en Dockerfile CMD (migraciones automáticas)
