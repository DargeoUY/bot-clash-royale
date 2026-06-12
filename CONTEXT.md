# Bot Clash Royale — Contexto para nueva sesión

## 🚨 GUÍA DE ONBOARDING PARA IAs — LEER PRIMERO

### Flujo de trabajo al recibir una tarea
1. Leé este documento entero
2. `git pull` para tener el código más reciente
3. Hacé los cambios en `G:\Otros ordenadores\Mi PC\Bot_Clash_Royale\src\`
4. Sincronizá con: `robocopy "G:\...\Bot_Clash_Royale\src" "C:\Users\George\Proyectos\bot-clash-royale\src" /MIR /NFL /NDL /NJH /NJS /NC /NS /XD node_modules`
5. Build: `cd "C:\Users\George\Proyectos\bot-clash-royale" && npm run build`
6. Commit + push: `git add -A && git commit -m "..." && git push`
7. Sync al VPS: `robocopy "G:\...\Bot_Clash_Royale\src" "G:\...\Proyectos-En-Progrso\Bot_Clash_Royale\src" /E /NFL /NDL /NJH /NJS /XD node_modules`
8. El usuario reconstruye en el VPS

### ⚠️ PELIGROS — Lo que rompe todo

| Acción | Consecuencia | Cómo evitarlo |
|---|---|---|
| `docker compose down -v` | **Borra toda la DB de MariaDB.** Se pierde BotConfig, Players, Clan, TODO. | Solo usar si MariaDB está corrupto (InnoDB error). Después reconfigurar TODO en Discord. |
| Editar `.env` sin resync | El VPS usa el `.env` de Google Drive. Si cambiás el local pero no el de GDrive, no surte efecto. | Siempre copiar `.env` a `G:\...\Proyectos-En-Progrso\Bot_Clash_Royale\.env` |
| `network_mode: host` | No funciona en Docker Desktop Windows | Mantenerlo removido (red bridge por defecto) |
| `DATABASE_URL` con `localhost` | El container no ve localhost del host, ve `mysql:3306` | Siempre usar `@mysql:3306` |
| Borrar `openssl` del Dockerfile | Prisma necesita OpenSSL para MySQL/MariaDB | No sacar `apt-get install -y openssl` |
| Hacer rename masivo con regex | Se rompen tipos de API (PlayerInfo, ClanMember) y interfaces internas | Solo renombrar explícitamente en contexto Prisma |

### 🔄 Qué reconfigurar después de `docker compose down -v`
Ejecutar en Discord, en orden:
1. `/setup #28P8RQUY`
2. `/config telegram-chat -1003975004023`
3. `/config canal-ranking` + `/config canal-guerra` + `/config canal-alertas` + `/config canal-torneo`
4. `/config link-whatsapp`
5. `/config bienvenida-telegram` (opcional)
6. `/auto-setup` (si se perdieron roles/canales)

Los datos de ranking (PuntoGuardado, DeltaDiario, etc.) se regeneran automáticamente.

### 🧪 Diagnóstico rápido
```bash
# En el VPS:
docker compose logs bot --tail 30      # ver si arrancó todo
docker compose exec mysql mysql -uclashbot -pEllaNoTeAma clashbot -e "SELECT `key`, value FROM BotConfig"  # ver config
```
En Discord: `/diagnostico` (testea API, DB, Telegram)

### 📋 Checklist para verificar que el bot está 100% funcional
- [ ] `docker compose logs bot` muestra "Bot conectado como Asistente Royale"
- [ ] `docker compose logs bot` muestra "Telegram polling started"
- [ ] `docker compose logs bot` muestra "API OK — Clan UruguayConQueso"
- [ ] Sin errores 409 (Telegram conflict) — si aparecen, revisar mutex en polling
- [ ] Comandos de Discord funcionan (`/diagnostico`)
- [ ] Comandos de Telegram funcionan (`/help` en el grupo)
- [ ] Ranking diario accesible con `/ranking stats`

---

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
