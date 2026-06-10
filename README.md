# Bot Clash Royale para Discord

Bot de Discord para administración de clanes de Clash Royale. Tracking de guerras, inactividad, vacaciones, ranking diario, grupo de WhatsApp, y más.

## Stack

| Componente | Tecnología |
|---|---|
| Runtime | Node.js 20 |
| Lenguaje | TypeScript 5 |
| Bot | discord.js v14 |
| ORM | Prisma v5 |
| DB | PostgreSQL 16 |
| Deploy | Docker + Compose |
| Logging | Winston |
| Tareas | node-cron |
| Validación | zod |

## Requisitos

- Docker y Docker Compose
- Bot de Discord: [Discord Developer Portal](https://discord.com/developers/applications)
- API Key de Clash Royale: [developer.clashroyale.com](https://developer.clashroyale.com)
- **Whitelistear IP del proxy: `45.79.218.79`** (al crear la key en el portal de Supercell)

## Setup rápido

```bash
git clone https://github.com/DargeoUY/bot-clash-royale.git
cd bot-clash-royale
cp .env.example .env   # editar con tus tokens
docker compose up -d
```

En Discord: `/auto-setup #CLAN_TAG`

---

## Comandos

### 👤 Jugadores

| Comando | Descripción | Cooldown |
|---|---|---|
| `/perfil #TAG` | Perfil completo + últimas 5 batallas (V/D/WR) | — |
| `/registrar #TAG` | Vincular cuenta CR con Discord | — |
| `/puntos ver #TAG` | Ver puntos acumulados | — |
| `/guerra estado` | Estado actual de la guerra de clanes | — |
| `/ausencia <dias>` | Activar modo vacaciones | — |
| `/whatsapp` | Abre formulario para verificar nombre y obtener link del grupo | — |
| `/ayuda` | Mostrar guía de uso | — |

### ⚙️ Líderes

| Comando | Descripción | Cooldown |
|---|---|---|
| `/inactivos` | Miembros inactivos (consulta directa a la API) | — |
| `/ranking stats` | Ranking diario: V/D, Donaciones, Copas, Guerra | 5 min |
| `/ranking puntos` | Ranking de puntos (semanal/mensual/general) | — |
| `/clan info` | Información del clan | — |
| `/clan sincronizar` | Forzar sync desde la API de CR | — |
| `/clan no-registrados` | Miembros sin Discord vinculado | — |
| `/config canal-*` | Configurar canales del bot | — |
| `/config link-whatsapp <url>` | Setear link del grupo de WhatsApp | — |
| `/config link-reglamento <url>` | Setear link del reglamento | — |
| `/config umbral-inactividad <dias>` | Cambiar umbral de inactividad | — |
| `/setup #TAG` | Vincular servidor a un clan | — |
| `/auto-setup` | Crear canales, roles y categoría automáticamente | — |
| `/puntos bonus` | Otorgar puntos manualmente | — |
| `/puntos penalizar` | Quitar puntos | — |
| `/puntos historial` | Ver historial de puntos de un jugador | — |
| `/exportar` | Exportar datos del clan a CSV | — |
| `/diagnostico` | Testear API, DB y conexiones | 2 min |

---

## Tareas Automáticas

| Tarea | Frecuencia | Descripción | Canal |
|---|---|---|---|
| Sync de clan | Cada 1 hora | Importa miembros y stats desde la API de CR | — |
| Sync de guerra | Cada 30 min | Sincroniza datos de River Race | — |
| Ranking de stats | Cada 24h (8 AM UTC) | Publica ranking diario: V/D, Donaciones, Copas, Guerra | `ranking` |
| Check inactividad | Cada 6 horas | Detecta miembros inactivos y envía notificaciones | `alertas` |
| Reporte semanal | Cada lunes | Reporte semanal de guerra y actividad | `guerra` |
| Reporte mensual | Día 1 del mes | Reporte mensual con resumen | `guerra` |
| Actualizar roles | Cada 12 horas | Sincroniza roles de Discord con actividad | — |
| Backup BD | Cada 24h (4 AM) | Backup de la base de datos PostgreSQL | — |

---

## Canales

Creados automáticamente por `/auto-setup` dentro de la categoría `🏰 CLASH ROYALE`:

| Canal | Uso |
|---|---|
| `📋・guia-de-uso` | Guía de comandos (solo lectura) |
| `👋・registro` | Miembros se registran con /registrar |
| `⚔️・guerra-reportes` | Reportes de guerra semanales/mensuales |
| `🚨・alertas-inactividad` | Notificaciones de inactividad |
| `🏆・ranking-premios` | Ranking diario de stats |
| `👥・cambios-miembros` | Altas y bajas del clan |

---

## Roles

Creados automáticamente por `/auto-setup`:

| Rol | Color | Se asigna a |
|---|---|---|
| `🏆 Campeón del Mes` | Dorado | Top 1 del ranking mensual |
| `⚔️ Guerrero Élite` | Púrpura | Top guerra semanal |
| `💎 Donador Legendario` | Rosa | Top donador |
| `✅ Activo` | Verde | Miembros activos |
| `🏖️ Ausente` | Naranja | Modo vacaciones activado |
| `⛔ Inactivo` | Rojo | Inactivo detectado |
| `🆕 Recluta` | Azul | Recién registrado |

---

## Sistema de Permisos

- **Comandos de líder**: solo usable por usuarios con rol `leader` o `coLeader` en el clan (verificado contra la API de CR)
- **Cooldowns**: comandos pesados (`/ranking stats` 5 min, `/diagnostico` 2 min) tienen límite de uso para no saturar la API
- **Multi-servidor**: cada guild de Discord tiene su propia configuración de clan, canales y link de WhatsApp. Los datos no se mezclan entre servidores

---

## Mecánica de Inactividad

Umbrales configurables (default 2 días). Escala según tamaño del clan:

| Tamaño | Aviso | Inactivo | Expulsión sugerida |
|---|---|---|---|
| 43-50 | 2 días | 4 días | 6 días |
| 30-42 | 2 días | 5 días | 10 días |
| <30 | 2 días | 7 días | 14 días |

- **Modo vacaciones**: `/ausencia <dias>` pausa las notificaciones (máx 20 días por mes)
- Las notificaciones se publican en el canal `🚨・alertas-inactividad`

---

## Grupo de WhatsApp

1. **Líder** configura el link: `/config link-whatsapp https://chat.whatsapp.com/...`
2. **Miembro** usa `/whatsapp` → completa nombre en el juego y celular
3. El bot verifica que el nombre coincida con un miembro del clan
4. Si coincide → muestra el link del grupo
5. Si no → "No verificado, el nombre no está en el clan"

---

## Sistema de Puntos

| Acción | Puntos |
|---|---|
| Batalla de guerra ganada | +3 |
| Batalla de guerra jugada | +1 |
| Deck usado en guerra | +1 |
| Fama en River Race | +0.5 |
| Defensa de barco | +2 |
| Participación completa semanal | +5 |
| Top donador mensual | +10 |
| Inactividad (por día) | -2 |

Los puntos se resetean al inicio de cada mes.

---

## API Rate Limits

El bot usa un sistema de cola (`RequestQueue`) con:
- **Máximo 250 requests/minuto** (límite del tier Silver de Supercell)
- **200ms de delay entre requests** para no exceder el rate limit
- **Proxy `proxy.royaleapi.dev`** para IP fija (`45.79.218.79`)

---

## Variables de Entorno

| Variable | Descripción |
|---|---|
| `DISCORD_TOKEN` | Token del bot de Discord |
| `DISCORD_CLIENT_ID` | Client ID de la aplicación |
| `CR_API_KEY` | API Key de Clash Royale (JWT) |
| `CR_API_BASE_URL` | URL base de la API (default: proxy.royaleapi.dev) |
| `DATABASE_URL` | URL de conexión PostgreSQL |
| `CLAN_TAG` | Tag del clan por defecto |
| `INACTIVITY_THRESHOLD_DAYS` | Días para considerar inactivo (default: 2) |
| `VACATION_MAX_DAYS` | Días máximos de vacaciones por mes (default: 20) |

---

## Desarrollo Local

```bash
npm install
npm run db:generate
npm run build
npm run dev
```

## Licencia

MIT
