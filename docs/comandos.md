# Documentación de Comandos — Asistente Royale

## Estructura de la Base de Datos

Modelos Prisma utilizados por los comandos:

| Modelo | Descripción |
|--------|-------------|
| `Clan` | Clan de CR vinculado a un servidor Discord |
| `Jugador` | Miembro del clan con sus datos de CR, Discord y Telegram |
| `PuntoJugador` | Puntos internos por temporada (guerra, actividad, extra) |
| `HistorialPunto` | Registro de cada movimiento de puntos |
| `RegistroInactividad` | Log de notificaciones de inactividad |
| `Vacacion` | Períodos de modo vacaciones |
| `RegistroGuerra` | Historial de guerras (River Race) |
| `ParticipanteGuerra` | Participación de cada jugador en una guerra |
| `RegistroDonacion` | Donaciones por temporada |
| `ConfiguracionBot` | Configuración clave/valor por servidor Discord |
| `ConexionTelegram` | Códigos de vinculación temporales para Telegram |

---

# COMANDOS DE DISCORD

## 1. `/registrar <player_tag>`

**Propósito:** Vincular una cuenta de Clash Royale con un usuario de Discord.

**Flujo lógico:**
1. Recibe el tag del jugador y el ID de Discord del usuario
2. Valida formato del tag (### o #####)
3. Obtiene el clanTag del servidor desde `ConfiguracionBot`
4. Llama a `registerPlayer()` en `registration.service.ts`
5. Verifica que el jugador exista en la API de CR
6. Verifica que el jugador pertenezca al clan del servidor
7. Guarda la asociación Discord → jugador en DB
8. Responde con confirmación y datos del jugador

**Interacción con DB:**
- **Lee:** `ConfiguracionBot` (clan_tag_{guildId}), `Jugador` (verifica tag existente)
- **Escribe:** `Jugador.idDiscord` y `Jugador.registrado = true`

---

## 2. `/perfil [player_tag]`

**Propósito:** Mostrar estadísticas de un jugador desde la API de CR.

**Flujo lógico:**
1. Si recibe un tag, lo valida y lo usa
2. Si no recibe tag, busca el tag registrado del usuario en DB
3. Consulta `GET /v1/players/{tag}` a la API de CR
4. Construye un embed con: tag, nivel, trofeos, récord, victorias, donaciones, arena, clan
5. Muestra el embed al usuario

**Interacción con DB:**
- **Lee:** `Jugador` (solo si no se especifica tag, busca por idDiscord)
- **Escribe:** Nada (solo lectura de API externa)

---

## 3. `/clan info | no-registrados | sincronizar`

**Propósito:** Información y gestión del clan.

### info
1. Obtiene clanTag del servidor
2. Consulta `GET /v1/clans/{tag}` a la API
3. Muestra: nombre, tag, miembros, tipo, trofeos requeridos, trofeos guerra, donaciones
- **Sin interacción con DB** (solo API externa)

### no-registrados
1. Obtiene clanTag del servidor
2. Busca en DB los jugadores del clan que NO tienen idDiscord
3. Muestra la lista de los que faltan registrarse
- **Lee:** `Jugador` (jugadores con clanTag y sin idDiscord)

### sincronizar
1. Obtiene clanTag del servidor
2. Llama a `syncClanData()` que:
   - Consulta `GET /v1/clans/{tag}` → actualiza `Clan`
   - Consulta `GET /v1/clans/{tag}/members` → upsert de cada `Jugador` con todos sus campos
   - Ejecuta `detectMemberChanges()` para detectar altas/bajas
   - Publica cambios en el canal de miembros
   - Renombra la categoría con el conteo actualizado
- **Lee:** `ConfiguracionBot` (clan_tag_{guildId})
- **Escribe:** `Clan` (name, description, totalMiembros), `Jugador` (todos los campos), `HistorialClan` (eventos join/leave)

---

## 4. `/ranking <tipo> <periodo>`

**Propósito:** Mostrar rankings del clan por distintos criterios.

**Flujo lógico:**
1. Según el tipo (`trofeos`, `donaciones`, `guerra`, `puntos`) selecciona el servicio:
   - **trofeos:** `getWeeklyTrophyRanking()` o `getMonthlyTrophyRanking()`
     - Calcula delta = trofeos actuales - trofeosInicioSemana/trofeosInicioMes
     - Ordena por delta descendente
   - **donaciones:** `getDonationRanking()` — suma donaciones de `RegistroDonacion`
   - **guerra:** `getWarRanking()` — suma fama de `ParticipanteGuerra` del mes actual
   - **puntos:** `getLeaderboard()` — puntos totales de `PuntoJugador`

**Interacción con DB:**
- **trofeos:** Lee `Jugador.trophies`, `Jugador.trofeosInicioSemana`, `Jugador.trofeosInicioMes`
- **donaciones:** Lee `RegistroDonacion.donations`
- **guerra:** Lee `ParticipanteGuerra.fame` + `RegistroGuerra`
- **puntos:** Lee `PuntoJugador.puntosTotales`

---

## 5. `/puntos ver | bonus | penalizar | historial`

**Propósito:** Sistema de puntos interno del clan.

### ver
1. Obtiene los puntos del jugador para la temporada actual
2. Muestra desglose: total, guerra, actividad, bonus
- **Lee:** `PuntoJugador` (tagJugador + season)

### bonus
1. Recibe tag, cantidad y motivo
2. Llama a `addPoints(tag, cantidad, 'bonus', motivo)`
3. Suma los puntos extras en `PuntoJugador`

### penalizar
1. Recibe tag, cantidad y motivo
2. Llama a `addPoints(tag, -cantidad, 'penalty', motivo)`
3. Resta los puntos extras

### historial
1. Recibe tag
2. Obtiene los últimos 20 movimientos de `HistorialPunto`
3. Muestra cada entrada con signo (+/-), razón y descripción

**Interacción con DB:**
- **Escribe:** `PuntoJugador` (upsert por tagJugador + season), `HistorialPunto` (cada movimiento)
- **Lee:** `PuntoJugador`, `HistorialPunto`

---

## 6. `/guerra estado | semanal | mensual`

**Propósito:** Consultar estado de la guerra del clan.

### estado
1. Consulta `GET /v1/clans/{tag}/currentriverrace`
2. Muestra: fama del clan, participantes, estado
3. Top 5 participantes por fama

### semanal / mensual
1. Obtiene leaderboard de puntos semanal/mensual
2. Muestra top por puntos
- **Lee:** `PuntoJugador`

---

## 7. `/inactivos`

**Propósito:** Listar miembros inactivos según los umbrales configurados.

**Flujo lógico:**
1. Obtiene clanTag del servidor
2. Llama a `checkInactivity(clanTag, guildId)`:
   - Obtiene umbrales según cantidad de miembros (≥43: 2/4/6 días)
   - Recorre todos los jugadores del clan con `ultimaActividad`
   - Calcula días inactivos = (ahora - ultimaActividad) / 24h
   - Clasifica: aviso (🟡), inactivo (🔴), expulsión (⛔)
   - Si es primera vez o empeoró, registra en `RegistroInactividad`
3. Muestra los resultados agrupados por nivel de gravedad

**Interacción con DB:**
- **Lee:** `Clan` (totalMiembros), `Jugador` (ultimaActividad, vacaciones), `RegistroInactividad`
- **Escribe:** `RegistroInactividad` (cuando corresponde notificar), `Jugador.status`

---

## 8. `/ausencia activar | extender | cancelar`

**Propósito:** Gestionar modo vacaciones para pausar el control de inactividad.

### activar
1. Recibe tag, días y motivo opcional
2. Verifica que no exceda el máximo de 20 días por temporada
3. Verifica que no tenga una vacación activa
4. Crea registro en `Vacacion` con startDate, endDate, activo=true
5. Responde con confirmación

### extender
1. Suma días adicionales a la vacación activa
2. Actualiza `Vacacion.endDate`

### cancelar
1. Marca `Vacacion.activo = false`

**Interacción con DB:**
- **Lee:** `Vacacion` (activa del jugador)
- **Escribe:** `Vacacion` (crear, extender endDate, o marcar activo=false)

---

## 9. `/config <subcomando> <valor>`

**Propósito:** Configurar canales, links y umbrales del bot.

**Subcomandos:**
- `canal-guia`, `canal-guerra`, `canal-alertas`, `canal-ranking`, `canal-miembros`
  - Guarda el ID del canal en `ConfiguracionBot`
  - Clave: `channel_{tipo}_{guildId}`, Valor: ID del canal
- `link-whatsapp`: guarda URL en `link_whatsapp_{guildId}`
- `link-reglamento`: guarda URL en `link_rules_{guildId}`
- `umbral-inactividad`: guarda días en `inactivity_days_{guildId}`

**Interacción con DB:**
- **Escribe:** `ConfiguracionBot` (upsert por clave)

---

## 10. `/auto-setup`

**Propósito:** Configuración completa del bot en el servidor (líderes).

**Flujo lógico:**
1. Muestra un modal con: clanTag, API key (opcional), ID del chat de Telegram (opcional)
2. En `auto-create-setup()`:
   - Busca o crea la categoría `🏰 CLASH ROYALE`
   - Busca o crea 6 canales: guía, registro, guerra, alertas, ranking, miembros
   - Busca o crea 12 roles: Líder, Co-Líder, Campeón Semanal, Campeón Mensual, Donador Legendario/Épico/Poco Común, Guerrero Celestial/Legendario/Épico, Veterano, Recluta
   - Vincula el chat de Telegram si se proporcionó
   - Guarda TODAS las configuraciones en `ConfiguracionBot`
   - Publica la guía de comandos en el canal de guía y la fija

**Interacción con DB:**
- **Escribe:** `ConfiguracionBot` (hasta 20+ claves por servidor), `Clan` (idServidorDiscord, idChatTelegram)
- **Lee:** `ConfiguracionBot` (verificar si ya existe cada canal/rol)

---

## 11. `/setup <clan_tag> [api_key]`

**Propósito:** Vincular un servidor Discord con un clan de CR.

**Flujo lógico:**
1. Valida que el clan exista en la API de CR
2. Guarda clan_tag en `ConfiguracionBot`
3. Si se proporciona API key, la guarda también
4. Crea o actualiza el registro del clan en DB
5. Responde con confirmación

**Interacción con DB:**
- **Escribe:** `ConfiguracionBot` (clan_tag_{guildId}, opcional cr_api_key_{guildId}), `Clan` (upsert)

---

## 12. `/sync`

**Propósito:** Forzar sincronización manual de datos.

**Flujo lógico:**
1. Obtiene clanTag del servidor
2. Llama a `syncClanData()` (misma función que el cron de 5 min)
3. Llama a `syncCurrentWar()` para guerra activa
4. Responde con resumen de cambios

**Interacción con DB:**
- **Lee:** `ConfiguracionBot` (clan_tag_{guildId})
- **Escribe:** `Clan`, `Jugador`, `HistorialClan`, `RegistroGuerra`, `ParticipanteGuerra`

---

## 13. `/guia`

**Propósito:** Mostrar enlace al canal de guía configurado.

**Flujo lógico:**
1. Busca `channel_guide_{guildId}` en `ConfiguracionBot`
2. Si existe, menciona el canal
3. Si no existe, sugiere ejecutar `/auto-setup`

**Interacción con DB:**
- **Lee:** `ConfiguracionBot`

---

## 14. `/ayuda`

**Propósito:** Mostrar lista completa de comandos disponibles.

**Flujo lógico:**
1. Construye un embed con todos los comandos del bot agrupados por categoría
2. Incluye comandos de Discord y Telegram
3. Envía el embed al canal

**Interacción con DB:** Ninguna

---

## 15. `/exportar [formato]`

**Propósito:** Exportar datos del clan a CSV o JSON.

**Flujo lógico:**
1. Obtiene clanTag del servidor
2. Busca todos los jugadores del clan con sus puntos
3. Según el formato, genera un archivo CSV o JSON
4. Envía el archivo adjunto al canal

**Interacción con DB:**
- **Lee:** `Jugador` (todos los del clan), `PuntoJugador`

---

# COMANDOS DE TELEGRAM

Todos los comandos de Telegram requieren que el usuario esté registrado (`/registrar`) excepto `/registrar`, `/ayuda`, `/guia`, `/start`.

## 1. `/registrar <tag>`

**Flujo lógico:**
1. Recibe el tag y el chatId de Telegram
2. Valida formato del tag
3. Verifica que el jugador exista en API de CR
4. Verifica que pertenezca al clan vinculado al chat de Telegram
5. Asocia el idTelegram al jugador en DB

**Interacción con DB:**
- **Lee:** `Clan` (por idChatTelegram), `Jugador`
- **Escribe:** `Jugador.idTelegram`, `Jugador.registrado = true`

---

## 2. `/clan`

Muestra info básica del clan vinculado al chat.
- **Lee:** `Clan` (por idChatTelegram)

---

## 3. `/perfil [tag]`

Muestra perfil del jugador. Sin tag, muestra el perfil del propio usuario registrado.
- **Lee:** `Jugador` (por idTelegram si no hay tag)
- **API CR:** GET /v1/players/{tag}

---

## 4. `/ranking <tipo> <periodo>`

Mismos tipos/periodos que Discord. Usa los mismos servicios de ranking.
- **Lee:** `PuntoJugador`, `Jugador`, `RegistroDonacion`, `ParticipanteGuerra`

---

## 5. `/guerra`

Muestra estado actual de la guerra del clan vinculado.
- **API CR:** GET /v1/clans/{tag}/currentriverrace

---

## 6. `/puntos <tag>`

Muestra puntos del jugador.
- **Lee:** `PuntoJugador`

---

## 7. `/ausencia <dias> [motivo]`

Activa modo vacaciones (solo activar, sin extender/cancelar como en Discord).
- **Lee:** `Jugador` (por idTelegram), `Vacacion`
- **Escribe:** `Vacacion`

---

## 8. `/inactivos`

Lista miembros inactivos. Usa el mismo `checkInactivity()` que Discord.
- **Lee:** `ConfiguracionBot` (clan_tag_{guildId}), `Jugador`, `RegistroInactividad`, `Vacacion`
- **Escribe:** `RegistroInactividad`

---

## 9. `/guia`

Muestra una guía breve de comandos.

---

## 10. `/start`

Mensaje de bienvenida con lista de comandos.

---

## 11. `/ayuda`

Lista completa de comandos con descripciones.

---

# TAREAS AUTOMÁTICAS (CRON)

## 1. Sync de Clan (cada 5 minutos)

**`sync-clan.ts`**
1. Obtiene todos los `clan_tag_{guildId}` de `ConfiguracionBot`
2. Para cada clan, llama a `syncClanData()`:
   - Actualiza `Clan` desde API
   - Actualiza cada `Jugador` con datos frescos
   - Detecta altas/bajas y publica cambios
3. Llama a `syncCurrentWar()` para guerra activa

**DB:** Lee `ConfiguracionBot` | Escribe `Clan`, `Jugador`, `HistorialClan`, `RegistroGuerra`, `ParticipanteGuerra`

---

## 2. Control de Inactividad (cada 6 horas + diario a las 8:00)

**`check-inactivity.ts`**
1. Procesa vacaciones vencidas (`processExpiredVacations`)
2. Para cada clan, ejecuta `checkInactivity()`:
   - Calcula días inactivos de cada jugador
   - Clasifica en aviso/inactivo/expulsión
   - Registra en `RegistroInactividad`
   - Envía DM al jugador por Discord
   - Publica alerta en canal configurado + Telegram
3. A las 8:00 AM publica un reporte diario resumido

**DB:** Lee `Jugador`, `Vacacion`, `RegistroInactividad`, `ConfiguracionBot`
**Escribe:** `Vacacion` (expirar), `RegistroInactividad`

---

## 3. Ranking Semanal (lunes 8:00)

**`weekly-ranking.ts`**
1. Genera ranking de trofeos semanal (delta)
2. Publica en el canal de ranking
3. Resetea `trofeosInicioSemana` de cada jugador a sus trofeos actuales

**DB:** Lee `Jugador` | Escribe `Jugador.trofeosInicioSemana`

---

## 4. Ranking Mensual (1° del mes 9:00)

**`monthly-ranking.ts`**
1. Genera ranking de trofeos mensual
2. Publica en el canal de ranking
3. Resetea `trofeosInicioMes` de cada jugador

**DB:** Lee `Jugador` | Escribe `Jugador.trofeosInicioMes`

---

## 5. Reporte Semanal (lunes 0:00)

**`weekly-report.ts`**
1. Publica top 10 de puntos de guerra semanal
2. Asigna rol de Campeón Semanal

**DB:** Lee `PuntoJugador` | Escribe (rol vía Discord)

---

## 6. Reporte Mensual (1° del mes 0:00)

**`monthly-report.ts`**
1. Publica leaderboard mensual
2. Resetea puntos de temporada
3. Asigna rol de Campeón Mensual

**DB:** Lee `PuntoJugador` | Escribe `PuntoJugador` (reset)

---

## 7. Actualización de Roles (cada 10 minutos)

**`update-roles.ts`**
1. Busca el rol `role_recluta_{guildId}` en `ConfiguracionBot`
2. Para cada jugador registrado con Discord, verifica que tenga el rol
3. Si no lo tiene, se lo asigna

**DB:** Lee `ConfiguracionBot`, `Jugador` | Escribe (rol vía Discord API)

---

## 8. Backup de Base de Datos (diario 4:00)

**`backup-database.ts`**
1. Ejecuta `mysqldump` contra la base de datos
2. Guarda el archivo .sql en `backups/` con timestamp
3. Limpia backups viejos (>30 días)

**DB:** Lectura global (dump completo)

---

## 9. Verificador de IP (cada 10 minutos)

**`check-ip.ts`**
1. Consulta la IP pública del servidor
2. Si cambió, intenta actualizar la whitelist de la API key de CR
3. Si no puede, notifica al administrador

**Interacción con DB:** Ninguna (solo API externa)

---

# WEB (PANEL DE ADMINISTRACIÓN)

## `/health` (GET)
- Health check: responde `{ status: "ok", uptime }`

## `/auth/discord` (GET)
- Redirige al usuario a Discord OAuth2 con scopes `identify` + `guilds`

## `/auth/discord/callback` (GET)
1. Recibe `code` del callback de Discord
2. Intercambia el code por un access_token
3. Obtiene datos del usuario (`/users/@me`)
4. Obtiene sus servidores (`/users/@me/guilds`)
5. Filtra servidores que están vinculados a un clan en DB
6. Verifica que el usuario tenga permisos (owner o Manage Server) en ese servidor
7. Crea sesión y redirige a `/dashboard`

**DB:** Lee `Clan` (busca por idServidorDiscord)

## `/auth/logout` (GET)
- Destruye la sesión y redirige a `/`

## `/` (GET)
- Si autenticado → redirige a `/dashboard`
- Si no → muestra login con botón "Iniciar sesión con Discord"

## `/dashboard` (GET)
1. Obtiene datos del clan desde API de CR (nombre, badge, stats)
2. Obtiene leaderboard mensual de puntos
3. Obtiene lista de miembros con sus conexiones (Discord/Telegram)
4. Renderiza HTML con estadísticas, ranking y tabla de miembros

**DB:** Lee `PuntoJugador` (leaderboard), `Jugador` (lista de miembros)
