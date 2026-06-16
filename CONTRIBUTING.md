# Contribuyendo

## Arquitectura del proyecto

```
src/
├── bot.ts                    # Entry point, Discord client, healthcheck, graceful shutdown
├── config/
│   ├── index.ts              # Validación zod de .env
│   └── logger.ts             # Winston (consola + logs/)
├── api/
│   ├── client.ts             # Axios HTTP client + rate limiting + CRApiError
│   ├── clan.ts               # Endpoints: clan info, members, river race
│   ├── player.ts             # Endpoints: player info, battle log
│   └── types.ts              # Interfaces de respuesta de CR API
├── database/
│   └── prisma.ts             # Singleton PrismaClient
├── services/
│   ├── clan-war.service.ts   # Sync clan/guerra CR API -> BD
│   ├── registration.service.ts # /registrar: valida + upsert BD
│   ├── inactivity.service.ts # Detección inactividad (umbrales dinámicos)
│   ├── notification.service.ts # DMs + canal alertas
│   ├── vacation.service.ts   # Modo vacaciones (20d/temporada)
│   ├── points.service.ts     # Puntos, leaderboard, historial
│   ├── donation.service.ts   # Miembros sin registrar + donaciones
│   └── auto-setup.service.ts # Crear canales, roles, guía
├── commands/
│   ├── index.ts              # Mapa commands: Map<string, BotCommand>
│   ├── registrar.ts          # /registrar <player_tag>
│   ├── clan.ts               # /clan info|no-registrados|sincronizar
│   ├── perfil.ts             # /perfil [player_tag]
│   ├── guerra.ts             # /guerra estado|semanal|mensual
│   ├── ranking.ts            # /ranking [periodo]
│   ├── puntos.ts             # /puntos ver|bonus|penalizar|historial
│   ├── ausencia.ts           # /ausencia activar|extender|cancelar
│   ├── inactivos.ts          # /inactivos
│   ├── config.ts             # /config canal-*|link-*|umbral-*
│   ├── exportar.ts           # /exportar [csv|json]
│   ├── auto-setup.ts         # /auto-setup <clan_tag>
│   ├── ayuda.ts              # /ayuda
│   └── guia.ts               # /guia
├── events/
│   └── interactionCreate.ts  # Router de comandos + permisos
├── tasks/
│   ├── sync-clan.ts          # Cron: clan 1h, guerra 30min
│   ├── check-inactivity.ts   # Cron: cada 6h
│   ├── weekly-report.ts      # Cron: lunes 00:00
│   ├── monthly-report.ts     # Cron: día 1 00:00 + season reset
│   ├── update-roles.ts       # Cron: cada 12h
│   └── backup-database.ts    # Cron: diario 04:00
├── utils/
│   ├── embeds.ts             # Helpers de embed + isAdmin()
│   └── validators.ts         # Validación de player tags
└── types/
    └── index.ts              # Interfaz BotCommand
```

## Convenciones

- TypeScript estricto (`strict: true`)
- Commits: conventional commits (`feat(scope): mensaje`)
- Variables de entorno validadas con zod en `config/index.ts`
- Comandos admin usan `setDefaultMemberPermissions('0')` + `adminOnly: true`

## Cómo agregar un comando

1. Crear archivo en `src/commands/nombre.ts`
2. Exportar `{ data: SlashCommandBuilder, execute: fn, adminOnly?: true }`
3. Registrar en `src/commands/index.ts`

## Cómo agregar un servicio

1. Crear archivo en `src/services/nombre.service.ts`
2. Importar `prisma` de `src/database/prisma.ts`
3. Importar cliente CR API de `src/api/`

## Esquema de BD

Ver `prisma/schema.prisma`. Modelos: `Clan`, `Player`, `WarLog`, `WarParticipant`, `PlayerPoint`, `PointHistory`, `InactivityLog`, `Vacation`, `DonationLog`, `BotConfig`.

## Licencia

MIT
