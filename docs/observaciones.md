# Observaciones del Sistema — Asistente Royale

> **⚠️ LEY: Este documento NO puede ser editado en su totalidad y de una sola vez.**
> Solo puede ser modificado por secciones individuales.
> Ninguna inteligencia artificial, bajo ninguna condición, puede editar este documento por completo.
> Cualquier modificación debe limitarse a una sección a la vez.
> Esta restricción es una ley inquebrantable del sistema.

## 1. Resumen General

Bot multiplataforma (Discord + Telegram + Web) para administración del clan **UruguayConQueso** (`#28P8RQUY`, ~43 miembros). Se conecta a la API oficial de Clash Royale para sincronizar miembros, guerras y actividad, y ofrece:

- Sincronización automática de miembros cada 5 minutos
- Rankings por delta de trofeos (semanal/mensual), donaciones y guerra
- Sistema de inactividad con umbrales dinámicos según tamaño del clan
- Sistema de vacaciones (pausa el control de inactividad)
- Roles automáticos en Discord (Campeón, Donador, Guerrero, Recluta, etc.)
- Panel web con login exclusivo Discord OAuth para líderes/co-líderes
- Notificaciones multiplataforma (Discord DM, canal de Discord, Telegram)
- Auto-setup de canales y roles en servidores Discord
- Backups diarios de base de datos y verificador de IP

---

## 2. Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Container (bot)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │ Discord  │  │ Telegram │  │   Web    │  │   Cron    │  │
│  │   Bot    │  │   Bot    │  │  Server  │  │   Tasks   │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬─────┘  │
│       └──────┬──────┘      └──────┬──────┘        │        │
│              ▼                    ▼                ▼        │
│        ┌──────────────────────────────────────┐              │
│        │          Servicios (src/services/)   │              │
│        │  clan-war  ranking  inactivity       │              │
│        │  points  registration  vacation      │              │
│        │  member-tracking  notification       │              │
│        │  role-manager  auto-setup            │              │
│        │  cross-platform  request-queue       │              │
│        │  telegram-link  ip-updater           │              │
│        └──────────┬──────────────────────────┘              │
│                   │                                         │
│        ┌──────────▼──────────┐    ┌──────────────────┐      │
│        │  Prisma ORM (MySQL) │    │  CR API Client   │      │
│        │  database/prisma.ts │    │  api/client.ts   │      │
│        └─────────────────────┘    └──────────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
                    ┌───────┴───────┐
                    ▼               ▼
              ┌──────────┐   ┌──────────────┐
              │  MariaDB │   │  CR API      │
              │  :3306   │   │  api.clash-  │
              │          │   │  royale.com  │
              └──────────┘   └──────────────┘
```

### 2.1 Proceso Único

Discord y Telegram corren en **un solo proceso** (`node dist/bot-discord.js`). El bot de Telegram se inicia desde el evento `ready` de Discord (`src/discord/index.ts:49`). Esto evita tener que manejar dos procesos separados y simplifica el sharing de la DB y servicios.

Entradas del proceso:
- `src/bot-discord.ts` → `startDiscordBot()` (entry point oficial)
- `src/bot-telegram.ts` → `startTelegramBot()` (entry point alternativo, standalone)
- Dockerfile CMD ejecuta `node dist/bot-discord.js`

### 2.2 Stack Tecnológico

| Componente | Tecnología | Versión |
|------------|-----------|---------|
| Runtime | Node.js | 20 (slim) |
| Lenguaje | TypeScript | 5.4 |
| ORM | Prisma | 5.15 |
| DB | MariaDB | 10.6 |
| Discord API | discord.js | 14.15 |
| Telegram API | grammy | 1.20 |
| Web server | Express | 4.19 |
| HTTP client | Axios | 1.7 |
| Logging | Winston | 3.13 |
| Validación | Zod | 3.23 |
| Cron | node-cron | 3.0 |
| Testing | Vitest | 1.6 |
| Linting | ESLint | 8.57 |
| Formatter | Prettier | 3.3 |
| Contenedor | Docker | multi-stage |
| Orquestación | Docker Compose | 3 servicios |

---

## 3. Base de Datos

### 3.1 Esquema Prisma (`prisma/schema.prisma`)

**11 modelos**, 195 líneas. Motor: MySQL (MariaDB 10.6).

#### Modelo: `Clan`
Representa un clan de Clash Royale vinculado a un servidor Discord y opcionalmente a un grupo de Telegram.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | Int (PK) | Autoincremental |
| tag | String (único) | Tag del clan (#28P8RQUY) |
| name | String | Nombre del clan |
| description | String? | Descripción |
| level | Int? | Nivel estimado |
| totalMiembros | Int? | Cantidad de miembros |
| idServidorDiscord | String? | Guild ID de Discord |
| idChatTelegram | BigInt? | Chat ID de Telegram |
| esPrincipal | Boolean | Default false |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

Relaciones: `jugadores[]`, `registrosGuerra[]`, `configuraciones[]`

#### Modelo: `Jugador`
Representa un jugador del clan con sus datos sincronizados de CR, Discord y Telegram.

| Campo | Tipo | Descripción |
|---|---|---|
| id | Int (PK) | Autoincremental |
| tag | String (único) | Tag del jugador |
| nombre | String | Nombre en CR |
| rol | String? | Rol en el clan |
| nivel | Int? | Nivel de experiencia |
| trofeos | Int? | Trofeos actuales |
| clanTag | String? | FK al clan |
| idDiscord | String? | ID de Discord |
| idTelegram | String? | ID de Telegram |
| registrado | Boolean | Si vinculó Discord o Telegram |
| estado | String | 'active' o 'left' |
| ultimaActividad | DateTime? | Último lastSeen de CR |
| salioEn | DateTime? | Cuándo salió del clan |
| trofeosInicioSemana | Int? | Baseline semanal |
| trofeosInicioMes | Int? | Baseline mensual |
| fechaCreacion | DateTime | Auto |
| fechaActualizacion | DateTime | Auto |

Relaciones: `clan`, `participaciones[]`, `puntos[]`, `registrosInactividad[]`, `historialPuntos[]`, `vacaciones[]`, `donaciones[]`, `historialClan[]`

> **Nota:** Ya no se usa `@map`. Los nombres de campo en Prisma y en la base de datos son los mismos (español).

#### Modelo: `RegistroGuerra`
Historial de River Races.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | Int (PK) | Auto |
| clanTag | String | FK al clan |
| idTemporada | String? | ID de temporada |
| tipoGuerra | String | 'riverRace' |
| startDate | DateTime | Inicio |
| endDate | DateTime? | Fin |
| participantes | Int? | Cantidad |
| batallasJugadas | Int? | |
| wins | Int? | |
| losses | Int? | |
| fame | Int? | Fama total del clan |
| createdAt | DateTime | Auto |

#### Modelo: `ParticipanteGuerra`
Participación individual en una guerra.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | Int (PK) | Auto |
| idRegistroGuerra | Int | FK |
| tagJugador | String | FK |
| batallasJugadas | Int | Default 0 |
| batallasGanadas | Int | Default 0 |
| batallasPerdidas | Int | Default 0 |
| mazosUsados | Int | Default 0 |
| mazosUsadosHoy | Int? | |
| barcosAtacados | Int? | |
| puntosReparacion | Int? | |
| fame | Int? | Fama individual |
| createdAt | DateTime | Auto |

Unique: `[idRegistroGuerra, tagJugador]`

#### Modelo: `PuntoJugador`
Puntos internos del bot por temporada.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | Int (PK) | Auto |
| tagJugador | String | FK |
| puntosTotales | Int | Default 0 |
| puntosGuerra | Int | Default 0 |
| puntosActividad | Int | Default 0 |
| puntosExtra | Int | Default 0 |
| season | String? | "2026-06" |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

Unique: `[tagJugador, season]`

#### Modelo: `HistorialPunto`
Cada movimiento de puntos.

| Campo | Tipo |
|-------|------|
| id | Int (PK) |
| tagJugador | String |
| points | Int |
| razon | String |
| description | String? |
| season | String? |
| createdAt | DateTime |

#### Modelo: `RegistroInactividad`
Log de notificaciones de inactividad.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | Int (PK) | Auto |
| tagJugador | String | FK |
| diasInactivo | Int | Días al momento de la notificación |
| notificadoEn | DateTime? | Cuándo se notificó |
| vecesNotificado | Int | Default 0 |
| status | String | 'warning', 'inactive', 'kick_suggested' |
| ultimaNotificacion | DateTime? | |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

#### Modelo: `Vacacion`
Períodos de ausencia que pausan el control de inactividad.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | Int (PK) | Auto |
| tagJugador | String | FK |
| reason | String? | Motivo |
| startDate | DateTime | Inicio |
| endDate | DateTime | Fin |
| activo | Boolean | Default true |
| creadoPor | String | Discord ID o "telegram:{id}" |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

#### Modelo: `RegistroDonacion`
Donaciones por temporada (para roles de donador).

| Campo | Tipo |
|-------|------|
| id | Int (PK) |
| tagJugador | String |
| donations | Int |
| donacionesRecibidas | Int |
| season | String? |
| createdAt | DateTime |
| updatedAt | DateTime |

Unique: `[tagJugador, season]`

#### Modelo: `ConfiguracionBot`
Almacenamiento clave/valor para configuración por servidor Discord.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | Int (PK) | Auto |
| clanTag | String? | FK opcional al clan |
| clave | String (único) | Ej: `channel_war_123456789` |
| valor | String | ID del canal, rol, etc. |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

Claves registradas por servidor (sufijo `_{guildId}`):
- `clan_tag_{guildId}` — Tag del clan vinculado
- `cr_api_key_{guildId}` — API key personalizada
- `channel_guide_{guildId}` — Canal de guía
- `channel_war_{guildId}` — Canal de guerra
- `channel_alerts_{guildId}` — Canal de alertas
- `channel_ranking_{guildId}` — Canal de ranking
- `channel_members_{guildId}` — Canal de miembros (altas/bajas)
- `role_lider_{guildId}` a `role_recluta_{guildId}` — 12 roles
- `link_whatsapp_{guildId}` — Link de WhatsApp
- `link_rules_{guildId}` — Link de reglamento
- `inactivity_days_{guildId}` — Umbral de inactividad personalizado
- `first_sync_done_{guildId}` — Flag de primera sincronización
- `last_public_ip` — Última IP pública detectada (global)

#### Modelo: `HistorialClan`
Registro de eventos de entrada/salida del clan.

| Campo | Tipo |
|-------|------|
| id | Int (PK) |
| tagJugador | String |
| clanTag | String |
| evento | String ('joined' / 'left') |
| nombreJugador | String? |
| createdAt | DateTime |

#### Modelo: `ConexionTelegram`
Códigos temporales para vincular chats de Telegram con Discord.

| Campo | Tipo |
|-------|------|
| id | Int (PK) |
| codigo | String (único) |
| chatId | BigInt? |
| guildId | String? |
| usado | Boolean (default false) |
| expiraEn | DateTime |
| createdAt | DateTime |

---

## 4. API de Clash Royale

### 4.1 Cliente HTTP (`src/api/client.ts`)

- **Base URL:** `https://api.clashroyale.com/v1` (configurable vía `CR_API_BASE_URL`)
- **Autenticación:** Bearer token (`CR_API_KEY`)
- **Timeout:** 10 segundos
- **Error handling:** Errores Axios se transforman a `CRApiError(status, code, message)`

### 4.2 Rate Limiting (`src/services/request-queue.service.ts`)

`RequestQueue` singleton (`crQueue`):
- **Máximo:** 250 requests por minuto (límite de CR API)
- **Intervalo mínimo:** 200ms entre requests
- **Comportamiento:** Si se alcanza el límite, espera hasta que se reinicie la ventana de 60s + 1s de margen
- **Uso:** Todas las llamadas a CR API pasan por `crQueue.enqueue(fn, description)`

### 4.3 Endpoints Utilizados

| Endpoint | Función | Frecuencia |
|----------|---------|------------|
| `GET /v1/clans/{tag}` | `getClanInfo()` | Cada 5 min + on-demand |
| `GET /v1/clans/{tag}/members` | `getClanMembers()` | Cada 5 min |
| `GET /v1/clans/{tag}/currentriverrace` | `getCurrentRiverRace()` | Cada 5 min |
| `GET /v1/clans/{tag}/riverracelog` | `getRiverRaceLog()` | No usado actualmente |
| `GET /v1/players/{tag}` | `getPlayerInfo()` | On-demand (registro/perfil) |
| `GET /v1/players/{tag}/battlelog` | `getPlayerBattleLog()` | No usado actualmente |

### 4.4 Tipos de API (`src/api/types.ts`)

Define interfaces TypeScript para:
- `ClanMember`, `ClanInfo`, `ClanSearchResult`
- `RiverRaceClan`, `RiverRaceParticipant`, `CurrentRiverRace`, `RiverRacePeriodLog`
- `PlayerInfo`, `PlayerCard`, `PlayerBadge`, `BattleLogEntry`

---

## 5. Bot de Discord

### 5.1 Inicialización (`src/discord/index.ts`)

- Intents: solo `GatewayIntentBits.Guilds`
- Eventos: `ClientReady`, `GuildCreate`, `Error`, `Warn`, `InteractionCreate`
- Al conectarse:
  1. Testea conexión a CR API
  2. Inicia bot de Telegram (`startTelegramBot()`)
  3. Sincronización inmediata de TODOS los clanes (`syncClanData()` + `syncCurrentWar()`)
  4. Inicia todas las tareas cron
- Setea actividad: `/ayuda | Clash Royale`

### 5.2 Comandos Slash (15)

Registrados en `src/discord/deploy-commands.ts`. Handler central en `src/discord/events/interactionCreate.ts`.

| Comando | Archivo | AdminOnly | RegisteredOnly | Descripción |
|---------|---------|-----------|----------------|-------------|
| `/registrar` | `registrar.ts` | No | No | Vincular cuenta CR con Discord |
| `/perfil` | `perfil.ts` | No | Sí | Ver perfil de jugador |
| `/clan` | `clan.ts` | No | Sí | Info, no-registrados, sincronizar |
| `/ranking` | `puntos.ts` | No | Sí | Ranking por tipo/periodo |
| `/puntos` | `puntos.ts` | No | Sí | Ver, bonus, penalizar, historial |
| `/guerra` | `guerra.ts` | No | Sí | Estado, semanal, mensual |
| `/inactivos` | `inactivos.ts` | Sí | Sí | Lista de inactivos |
| `/ausencia` | `ausencia.ts` | No | Sí | Activar, extender, cancelar |
| `/config` | `config.ts` | Sí | No | Configurar canales, links, umbrales |
| `/auto-setup` | `auto-setup.ts` | Sí | No | Setup completo (modal) |
| `/setup` | `setup.ts` | Sí | No | Vincular clan al servidor |
| `/sync` | `sync.ts` | No | No | Forzar sincronización |
| `/exportar` | `exportar.ts` | Sí | Sí | Exportar datos a CSV/JSON |
| `/guia` | `guia.ts` | No | No | Mostrar guía |
| `/ayuda` | `ayuda.ts` | No | No | Lista de comandos |

### 5.3 Control de Acceso

En `interactionCreate.ts`:
1. **adminOnly** (requiere `ManageGuild`): `/inactivos`, `/config`, `/auto-setup`, `/setup`, `/exportar`
2. **registeredOnly** (requiere estar registrado en DB): todos los comandos excepto los públicos
3. **Públicos** (sin restricción): `/registrar`, `/ayuda`, `/guia`, `/setup`, `/auto-setup`, `/config`, `/sync`

Para comandos registeredOnly se llama `interaction.deferReply({ ephemeral: true })` automáticamente **antes** de ejecutar el comando. Los comandos no deben llamar `deferReply` de nuevo.

### 5.4 Middleware (`src/discord/middleware/guild-check.ts`)

`checkRegistered()`: verifica que el usuario tenga un registro en la DB (Jugador con idDiscord = userId) y pertenezca al clan del servidor.

---

## 6. Bot de Telegram

### 6.1 Inicialización (`src/telegram/index.ts`)

- Dependencia: `TELEGRAM_TOKEN` en .env. Si no está definido, el bot se desactiva silenciosamente.
- Se inicia desde `startDiscordBot()` en el evento `ready` de Discord.
- Handler `my_chat_member`: detecta cuándo el bot se agrega/sale de un grupo.
  - Al agregarse: genera código de vinculación de 1 hora de validez.
  - Al salir: limpia `idChatTelegram` del clan correspondiente.
- Limpieza de códigos expirados cada 10 minutos.

### 6.2 Comandos (11)

Registrados en `src/telegram/comandos.ts`. Requieren registro excepto `/registrar`, `/ayuda`, `/guia`, `/start`.

| Comando | Descripción |
|---------|-------------|
| `/registrar <tag>` | Vincular cuenta CR con Telegram |
| `/clan` | Info del clan vinculado al chat |
| `/perfil [tag]` | Perfil de jugador (sin tag: propio) |
| `/ranking <tipo> <periodo>` | Rankings (mismos servicios que Discord) |
| `/guerra` | Estado de guerra |
| `/puntos <tag>` | Puntos del jugador |
| `/ausencia <días> [motivo]` | Activar vacaciones |
| `/inactivos` | Lista de inactivos |
| `/guia` | Guía breve |
| `/start` | Bienvenida con comandos |
| `/ayuda` | Lista de comandos |

### 6.3 Control de Acceso (`src/telegram/middleware.ts`)

- `checkTelegramMember()`: verifica que el usuario esté registrado en DB (Jugador con idTelegram)
- Se aplica a comandos registrados por el bot mediante el callback `bot.use()`

---

## 7. Servicios

### 7.1 `clan-war.service.ts`
Sincronización de clan y guerra con CR API.

- **`syncClanData(clanTag, client?)`**: Función principal de sincronización.
  1. Obtiene info del clan desde API → upsert en `Clan`
  2. Obtiene miembros desde API → upsert en `Jugador` (todos los campos)
  3. Inicializa `trofeosInicioSemana` y `trofeosInicioMes` en jugadores nuevos
  4. Procesa `lastSeen` con `parseSafeDate()` para normalizar formato
  5. Detecta altas/bajas/reingresos mediante `detectMemberChanges()`
  6. Si hay client Discord: renombra categoría con conteo, publica cambios, publica test de primer sync
- **`syncCurrentWar(clanTag)`**: Sincroniza guerra activa.
  1. Obtiene `currentriverrace` y lee `race.clan.participants`
  2. Crea o actualiza `RegistroGuerra` para la temporada activa
  3. Upsert de `ParticipanteGuerra` para cada participante (fama, mazos, barcos, etc.)
- **`parseSafeDate(value)`**: Convierte el formato `YYYYMMDDTHHmmss.sssZ` de CR API a Date válido.

### 7.2 `member-tracking.service.ts`
Detección de cambios de membresía.

- **`detectMemberChanges(clanTag, currentMembers)`**:
  1. Obtiene jugadores existentes en DB
  2. Compara contra miembros actuales de CR API
  3. Detecta: nuevos (joined), reingresos (rejoined), salidas (left)
  4. Actualiza `Jugador.status` ('active'/'left'), `salioEn`, `clanTag`
  5. Registra eventos en `HistorialClan`
- **`getClanStats(clanTag)`**: Estadísticas de joined/left del mes.

### 7.3 `inactivity.service.ts`
Control de inactividad con umbrales dinámicos.

- **`checkInactivity(clanTag, guildId)`**:
  1. Lee `Clan.totalMiembros` para determinar umbrales
  2. Obtiene jugadores activos del clan
  3. Por cada jugador: calcula días desde `ultimaActividad`
  4. Clasifica según umbrales:
     - ≥43 miembros: aviso 2d, inactivo 4d, expulsión 6d
     - ≥30 miembros: aviso 2d, inactivo 5d, expulsión 10d
     - <30 miembros: aviso 2d, inactivo 7d, expulsión 14d
  5. Si es primera notificación o empeoró, registra en `RegistroInactividad`
  6. Excluye jugadores con vacaciones activas
- **`statusDisplay(status)`**: Traduce status interno a español (aviso, inactivo, expulsión, activo).
- **`getInactivitySummary(clanTag)`**: Agrupa resultados por nivel de gravedad.

### 7.4 `registration.service.ts`
Registro de jugadores.

- **`registerPlayer(playerTag, discordId, clanTag, guild?)`**:
  1. Obtiene datos del jugador desde CR API
  2. Verifica que pertenezca al clan del servidor
  3. Verifica que no esté vinculado a otro Discord
   4. Upsert en `Jugador` con `idDiscord`, `registrado=true`, `nivel`, `trofeos`
  5. Si hay guild: asigna rol Recluta automáticamente
  6. Devuelve `RegistrationResult` con datos del jugador

### 7.5 `ranking.service.ts`
Cálculo de rankings.

- **Ranking semanal de trofeos** (`getWeeklyTrophyRanking`):
  - Delta = `trofeos` - `trofeosInicioSemana` (usa `trofeosInicioSemana` si existe, sino `trofeos`)
  - Ordena por delta descendente, top 10
- **Ranking mensual de trofeos** (`getMonthlyTrophyRanking`):
  - Delta = `trofeos` - `trofeosInicioMes`
  - Misma lógica que semanal pero con baseline mensual
- **Ranking de donaciones** (`getDonationRanking`):
  - Últimas donaciones de `RegistroDonacion` por temporada
- **Ranking de guerra** (`getWarRanking`):
  - Suma `ParticipanteGuerra.fame` del mes actual
- **Reseteo de baselines** (`resetWeeklyBaseline`, `resetMonthlyBaseline`):
  - SQL raw: `UPDATE Jugador SET trofeosInicioSemana = trofeos WHERE clanTag = ?`
  - Se ejecuta DESPUÉS de publicar cada ranking

### 7.6 `points.service.ts`
Sistema de puntos internos.

- **`addPoints(tag, points, reason, desc?)`**: Upsert en `PuntoJugador` + create en `HistorialPunto`
- **`getPlayerPoints(tag)`**: Puntos del jugador en la temporada actual
- **`getPointHistory(tag)`**: Últimos 20 movimientos
- **`getLeaderboard(clanTag, period)`**: Top 20 por puntos (semanal/mensual/general)
- **`calculateWarPoints(clanTag, warLogId)`**: Calcula puntos de guerra para todos los participantes

### 7.7 `role-manager.service.ts`
Asignación de roles en Discord.

| Rol | Nombre | Asignado por |
|-----|--------|-------------|
| 👑 Líder | `ROLE_NAMES.leader` | Manual |
| 🔱 Co-Líder | `ROLE_NAMES.coLeader` | Manual |
| 🏆 Campeón Semanal de Copas | `campeonSemanal` | Ranking semanal |
| 🏆 Campeón Mensual de Copas | `campeonMensual` | Ranking mensual |
| 💎 Donador Legendario | `donadorLegendario` | 3+ meses top donaciones |
| 💎 Donador Épico | `donadorEpico` | 2 meses top donaciones |
| 💎 Donador Poco Común | `donadorPocoComun` | 1 mes top donaciones |
| 🌟 Guerrero Celestial | `guerreroCelestial` | Top 1 guerra |
| 🌟 Guerrero Legendario | `guerreroLegendario` | Top 2 guerra |
| 🌟 Guerrero Épico | `guerreroEpico` | Top 3 guerra |
| 🏅 Veterano | `veterano` | Manual |
| 🆕 Recluta | `recluta` | Al registrarse |

### 7.8 `notification.service.ts`
Notificaciones multiplataforma.

- **`notifyInactivePlayer(client, player)`**: Envía DM por Discord al jugador inactivo con mensaje según nivel de gravedad
- **`notifyInactivityChannel(client, guildId, results)`**: Publica alertas en el canal configurado + envía a Telegram
- **`notifyDailyInactivitySummary(client, guildId, results)`**: Reporte diario resumido a las 8:00 AM

### 7.9 `cross-platform.service.ts`
Puente entre Discord y Telegram para enviar mensajes a ambas plataformas.

- **`sendToChannel(guildId, channelKey, content)`**: Envía a un canal de Discord
- **`sendToTelegram(guildId, text)`**: Envía al grupo de Telegram vinculado
- **`broadcastToGuild(guildId, text)`**: Envía a ambas plataformas simultáneamente

### 7.10 `vacation.service.ts`
Gestión de modo vacaciones.

- **`activateVacation(tag, days, reason, createdBy)`**: Crea vacación con validaciones (máx 20 días/temporada, sin vacación activa previa)
- **`extendVacation(tag, additionalDays)`**: Extiende vacación activa
- **`cancelVacation(tag)`**: Marca vacación como inactiva
- **`processExpiredVacations()`**: Marca como inactivas las vacaciones vencidas

### 7.11 `telegram-link.service.ts`
Vinculación de chats de Telegram con servidores Discord.

- Flujo: Bot agregado a grupo → genera código de 6 caracteres → usuario ingresa código en `/auto-setup` de Discord → se vincula el chat
- Códigos expiran a la hora
- Limpieza automática cada 10 minutos

### 7.12 `auto-setup.service.ts`
Configuración completa de un servidor Discord.

- Crea categoría `🏰 CLASH ROYALE` (o reusa existente)
- Crea/busca 6 canales: guía (solo lectura), registro, guerra-reportes, alertas, ranking, miembros
- Crea/busca 12 roles (Líder a Recluta)
- Vincula clan con servidor en DB
- Guarda todas las configuraciones en `ConfiguracionBot`
- Publica y fija guía de comandos

### 7.13 `donation.service.ts`
- **`getUnregisteredMembers(clanTag)`**: Lista miembros del clan que NO tienen `registrado=true` en DB

### 7.14 `ip-updater.service.ts`
Actualización automática de IP en Developer Portal de CR.

- Obtiene IP pública desde ipify/ifconfig/icanhazip
- Si la IP cambió y hay credenciales de developer, inicia sesión en developer.clashroyale.com
- Busca la API key por ID
- Actualiza CIDR ranges con la nueva IP

---

## 8. Tareas Automáticas (Cron)

Todas se inician desde `src/discord/index.ts` en el evento `ready`.

| Tarea | Archivo | Schedule | Descripción |
|-------|---------|----------|-------------|
| Sync de clan | `sync-clan.ts` | `*/5 * * * *` | Sincroniza miembros desde CR API |
| Sync de guerra | `sync-clan.ts` | `*/5 * * * *` | Sincroniza guerra activa |
| Inactividad | `check-inactivity.ts` | `0 8 * * *` | Reporte diario de inactividad 8 AM (UTC-3) |
| Ranking semanal | `weekly-ranking.ts` | `0 8 * * 1` | Lunes 8:00, publica + resetea baseline |
| Ranking mensual | `monthly-ranking.ts` | `0 9 1 * *` | 1° del mes 9:00, publica + resetea baseline |
| Reporte semanal guerra | `weekly-report.ts` | `0 0 * * 1` | Lunes 0:00, top puntos semanal |
| Reporte mensual | `monthly-report.ts` | `0 0 1 * *` | 1° del mes 0:00, top puntos mensual + roles |
| Reset temporada | `monthly-report.ts` | `5 0 1 * *` | 1° 0:05, resetea roles y puntos |
| Actualizar roles | `update-roles.ts` | `*/10 * * * *` | Asigna Recluta a registrados |
| Backup DB | `backup-database.ts` | `0 4 * * *` | mysqldump a `backups/` |
| Check IP | `check-ip.ts` | `*/10 * * * *` | Verifica IP pública cada 10 min |

---

## 9. Panel Web

### 9.1 Servidor Express (`src/web/index.ts`)

- Puerto: 3000 (configurable vía `HEALTHCHECK_PORT`)
- Sesiones: express-session con `SESSION_SECRET`
- Rutas:
  - `GET /health` — Health check (status, uptime)
  - `GET /auth/discord` — Redirige a Discord OAuth2
  - `GET /auth/discord/callback` — Callback OAuth
  - `GET /auth/logout` — Cerrar sesión
  - `GET /` — Login o redirección a dashboard
  - `GET /dashboard` — Panel administrativo

### 9.2 Autenticación OAuth (`src/web/auth.ts`)

1. Usuario hace clic en "Iniciar sesión con Discord"
2. Redirige a Discord OAuth2 con scopes `identify` + `guilds`
3. Discord redirige a `/auth/discord/callback` con `code`
4. Se intercambia code por access_token
5. Se obtienen datos del usuario (`/users/@me`) y sus servidores (`/users/@me/guilds`)
6. Se filtran servidores que están vinculados a un clan en DB (campo `Clan.idServidorDiscord`)
7. De esos, se verifica que el usuario sea owner o tenga permiso `ManageGuild` (bit 0x20) usando `BigInt`
8. Se crea sesión con `{ id, username, clanTag, guildId }`
9. Se redirige a `/dashboard`

### 9.3 Dashboard (`src/web/dashboard.ts`)

Renderizado server-side con HTML + CSS (sin framework frontend). Incluye:
- Fondo de pantalla: imagen de CR desde alphacoders
- Logo: Clash Royale desde sportskeeda
- Glassmorphism en tarjetas
- Estadísticas del clan (trofeos, guerra, donaciones, miembros)
- **Rankings con tabs**: 5 pestañas con datos en tiempo real
  - `Puntos` — Ranking mensual de puntos (getLeaderboard)
  - `Trofeos Semanal` — Delta semanal (getWeeklyTrophyRanking)
  - `Trofeos Mensual` — Delta mensual (getMonthlyTrophyRanking)
  - `Donaciones` — Top donaciones (getDonationRanking)
  - `Guerra` — Fama mensual (getWarRanking)
- Los tabs se actualizan automáticamente cada 30 segundos vía `GET /dashboard/data` (JSON)
- Tab switching client-side con JavaScript (sin recargar la página)
- Tabla de miembros con conexiones (Discord/Telegram) y badges
- Endpoint `/dashboard/data` devuelve JSON con todos los rankings para el auto-refresh

---

## 10. Configuración y Despliegue

### 10.1 Variables de Entorno (`.env`)

| Variable | Requerido | Default | Descripción |
|----------|-----------|---------|-------------|
| DISCORD_TOKEN | Sí | — | Token del bot de Discord |
| DISCORD_CLIENT_ID | No | — | Client ID para OAuth web |
| DISCORD_CLIENT_SECRET | No | — | Secret para OAuth web |
| CR_API_KEY | Sí | — | API key de CR |
| CR_API_BASE_URL | No | `https://api.clashroyale.com/v1` | URL base de CR API |
| DATABASE_URL | Sí | — | `mysql://user:pass@host:port/db` |
| DB_PASSWORD | Sí | — | Password del usuario de DB |
| CLAN_TAG | No | `#28P8RQUY` | Tag del clan por defecto |
| INACTIVITY_THRESHOLD_DAYS | No | 2 | Días mínimos para considerar inactivo |
| VACATION_MAX_DAYS | No | 20 | Máximo de días de vacaciones por temporada |
| HEALTHCHECK_PORT | No | 3000 | Puerto del servidor web |
| TELEGRAM_TOKEN | No | — | Token del bot de Telegram |
| SESSION_SECRET | No | — | Secreto de sesión web |
| LOG_LEVEL | No | info | Nivel de logging |
| CR_DEV_EMAIL | No | — | Email dev portal para auto-update IP |
| CR_DEV_PASSWORD | No | — | Password dev portal |
| CR_API_KEY_ID | No | — | ID de la API key en dev portal |

### 10.2 Docker

**Dockerfile** (multi-stage):
1. **Builder** (`node:20-slim`): instala dependencias, genera Prisma client, compila TypeScript
2. **Production** (`node:20-slim`): solo devDependencies de producción, copia dist, prisma, node_modules

CMD: `npx prisma db push --skip-generate --accept-data-loss && node dist/bot-discord.js`

**docker-compose.yml** (3 servicios):

| Servicio | Imagen | Puerto expuesto | Descripción |
|----------|--------|-----------------|-------------|
| `db` | mariadb:10.6 | 3307:3306 | Base de datos |
| `phpmyadmin` | phpmyadmin | 8080:80 | Administración web de DB |
| `bot` | build local | 3000:3000 | Bot + web server |

Particularidades:
- MariaDB usa `command: --skip-ssl` para evitar problemas de SSL
- phpMyAdmin conecta al host `db` (red interna Docker)
- Volúmenes montados: `logs/` y `backups/`
- El tag `v1.0.0-stable` está creado en GitHub

### 10.3 Compilación

- TypeScript `target: ES2022`, `module: commonjs`
- Build: `npm run build` → compila `src/` a `dist/`
- Desarrollo: `tsx watch src/discord/index.ts`
- **Nota:** npm local no funciona en Windows (errores de tar). Todo build se hace en VPS via Docker.

### 10.4 Despliegue (VPS)

- IP fija: `13.140.185.223`
- Directorio: `/root/Bot_Clash_Royale`
- Redirect URI Discord OAuth: `http://13.140.185.223:3000/auth/discord/callback`
- La IP del VPS debe estar whitelisted en la CR API key
- Repositorio: `https://github.com/DargeoUY/bot-clash-royale`

---

## 11. Flujos Críticos

### 11.1 Registro de Jugador

```
Usuario envía /registrar #TAG
  → interactionCreate.ts: deferReply (ephemeral)
  → checkRegistered() [no aplica porque /registrar es público]
  → registrar.ts: validateTag → formatPlayerTag
  → registration.service.ts: registerPlayer(tag, discordId, clanTag)
    → api/player.ts: getPlayerInfo(tag) (CR API)
    → Verifica que player.clan.tag === clanTag
    → Verifica que no esté vinculado a otro Discord
    → Prisma: jugador.upsert (tag único)
    → Si hay guild: asigna rol Recluta
  → Embed de confirmación con datos del jugador
```

### 11.2 Sincronización de Clan

```
[Al iniciar el bot] o [cron cada 5 min] o [/clan sincronizar]
  → getAllClanConfigs() (ConfiguracionBot: clan_tag_{guildId})
  → syncClanData(clanTag, client?)
    → getClanInfo(clanTag) → upsert Clan
    → getClanMembers(clanTag) → para cada member:
        → parseSafeDate(member.lastSeen) → normaliza fecha
        → jugador.upsert(tag): actualiza nombre, rol, nivel, trofeos, clanTag, estado, ultimaActividad
        → si es create: inicializa trofeosInicioSemana = member.trophies, trofeosInicioMes = member.trophies
    → detectMemberChanges(clanTag, members)
      → compara DB vs API
      → joined: status='active', HistorialClan evento='joined'
      → left: status='left', salioEn=now, clanTag=null, HistorialClan evento='left'
      → rejoined: status='active', salioEn=null, clanTag, HistorialClan evento='joined'
    → Si hay client: updateCategoryName, publishMemberChanges, publishFirstSyncTest
  → syncCurrentWar(clanTag)
    → getCurrentRiverRace(clanTag)
    → Crea o actualiza RegistroGuerra para la temporada activa con datos de race.clan.participants
    → Upsert de ParticipanteGuerra por cada participante (fama, mazos, etc.)
```

### 11.3 Control de Inactividad

```
[8:00 AM UTC-3] o [/inactivos]
  → processExpiredVacations() (marca activo=false las vencidas)
  → checkInactivity(clanTag, guildId)
    → Lee Clan.totalMiembros → determina umbrales
    → Por cada jugador activo (con ultimaActividad y sin vacaciones activas):
        → díasInactivo = (now - ultimaActividad) / 24h
        → Si días < INACTIVITY_THRESHOLD_DAYS (2): skip
        → Clasifica según umbrales
        → Si debe notificar: upsert RegistroInactividad
    → Retorna array de InactivityCheck
  → notifyInactivePlayer(client, player): DM por Discord
  → notifyInactivityChannel(client, guildId, results): canal + Telegram
```

### 11.4 Rankings Semanal y Mensual

```
[Lunes 8:00] o [1° del mes 9:00]
  → generateWeeklyReport(clanTag) o generateMonthlyReport(clanTag)
    → getWeeklyTrophyRanking(clanTag): calcula delta para cada jugador
    → Ordena por delta descendente, top 10
    → Formatea texto con medallas y signos (+/-)
  → broadcastToGuild(guildId, report)
    → sendToChannel: canal de ranking en Discord
    → sendToTelegram: grupo de Telegram
  → resetWeeklyBaseline(clanTag) o resetMonthlyBaseline(clanTag)
    → SQL raw: UPDATE Jugador SET trofeosInicioSemana = trofeos WHERE clanTag = ?
```

### 11.5 Asignación de Roles

```
[Después de publicar ranking semanal/mensual]
  → assignWeeklyChampion(guild, clanTag) o assignMonthlyChampion(guild, clanTag)
    → getLeaderboard → top 1
    → Busca/quita rol del campeón anterior
    → Asigna rol al nuevo campeón

[cada 10 min]
  → startRoleUpdater: busca role_recluta_{guildId}
  → Para cada jugador registrado con Discord:
    → Si no tiene el rol Recluta, se lo asigna
```

---

## 12. Formato `lastSeen` de CR API

La API de Clash Royale devuelve `member.lastSeen` en un formato propio:

```
Formato:       YYYYMMDDTHHmmss.sssZ
Ejemplo:       20260617T205221.000Z
Formato ISO:   2026-06-17T20:52:21.000Z
```

**JavaScript `new Date()` NO reconoce el formato de CR API** porque faltan los guiones en la fecha y los dos puntos en la hora.

**Solución:** `parseSafeDate()` en `clan-war.service.ts` normaliza con regex:

```typescript
const normalized = value.replace(
  /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/,
  '$1-$2-$3T$4:$5:$6',
);
// "20260617T205221.000Z" → "2026-06-17T20:52:21.000Z"
```

Si `parseSafeDate()` falla (porque la API cambia el formato), `ultimaActividad` queda `null` y el jugador nunca es detectado como inactivo.

---

## 13. Nombres de Campos en DB vs Código

Todos los campos del modelo `Jugador` tienen el mismo nombre en español tanto en el código Prisma como en la base de datos. No se usa `@map`.

### Baselines

```sql
UPDATE Jugador SET trofeosInicioSemana = trofeos WHERE clanTag = ?;
UPDATE Jugador SET trofeosInicioMes = trofeos WHERE clanTag = ?;
```

El ranking calcula delta = trofeos - baseline. Sin baseline usa trofeos actuales (= delta 0).

---

## 14. Integración Multiplataforma

### 14.1 Discord → Telegram
- Bot de Telegram se inicia desde el evento `ready` de Discord
- `cross-platform.service.ts` envía mensajes a ambas plataformas
- `broadcastToGuild()` envía rankings y reportes a Discord + Telegram simultáneamente
- `sendToTelegram()` obtiene el chat ID desde `Clan.idChatTelegram` vía `obtenerChatIdPorGuild()`

### 14.2 Vinculación Telegram ↔ Discord
1. Agregar bot de Telegram al grupo
2. Bot envía código de 6 caracteres (válido 1 hora)
3. En Discord, líder ejecuta `/auto-setup` e ingresa el código
4. `auto-setup.service.ts` vincula `Clan.idChatTelegram` con el chat ID

### 14.3 Web ↔ Discord
- Login exclusivo con Discord OAuth
- Solo usuarios con `ManageGuild` (permiso 0x20) en el servidor vinculado al clan pueden acceder
- Verificación usando `BigInt` para comparar permisos

---

## 15. Seguridad y Buenas Prácticas

- `.env` nunca se sube a git
- Tokens y API keys se validan con Zod al iniciar
- Errores de API se manejan con `CRApiError` y logging estructurado
- Las interacciones fallidas se responden con mensajes de error descriptivos
- El panel web solo permite acceso a líderes/co-líderes del clan
- Las conexiones de Telegram expiran a la hora
- Backups diarios de la base de datos
- IP checker notifica si la IP del VPS cambia (y auto-actualiza la CR API key si hay credenciales)
