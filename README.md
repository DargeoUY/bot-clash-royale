# Nexus Arena · ClashRoyaleBot

Administración de comunidades de Clash Royale: web para varios clanes, Discord, Telegram y WhatsApp opcionales. Backend TypeScript, Prisma y MariaDB. Versión 0.2.0.

## Despliegue nuevo con Docker

```bash
git clone https://github.com/DargeoUY/bot-clash-royale.git
cd bot-clash-royale
git switch feat/multiclan-web-docker
cp .env.example .env
```

Editá `.env`: API key de Clash Royale, contraseña de base de datos (la misma en `DB_PASSWORD` y `DATABASE_URL`), contraseña root, `SESSION_SECRET`, `SIGNUP_TOKEN` y `BASE_URL`. Generá secretos diferentes con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Usar contraseñas hexadecimales evita problemas al componer la URL de conexión. La IP pública de salida del host debe estar autorizada en la API de Clash Royale.

```bash
docker compose up -d --build --wait
docker compose logs -f bot
```

Abrí `http://localhost:3000`. Por defecto el puerto solo se publica en loopback. Para acceso desde la red, configurá `BIND_ADDRESS` y el proxy/HTTPS. Con HTTPS: `BASE_URL=https://tu-dominio`, `COOKIE_SECURE=true`. `TRUST_PROXY=1` solo si hay exactamente un proxy de confianza delante del contenedor.

La base de datos y las sesiones web/WhatsApp persisten. Los contenedores aplican migraciones con `prisma migrate deploy`; no se permite pérdida automática de datos. No publicar `.env`, `sessions/`, backups ni QR.

## Primer administrador y nuevos clanes

1. El operador entrega `SIGNUP_TOKEN` únicamente a administradores de comunidades de confianza. Este código autoriza crear administradores para cualquier clan: no es una credencial para jugadores ni una comprobación de liderazgo dentro del juego.
2. En **Crear cuenta**, ingresá nombre, correo, contraseña, invitación del operador y tag del clan. La API valida que el clan exista.
3. En **Consultas y acciones**, ejecutá `/sync` para cargar los miembros inmediatamente. También se sincronizan cada cinco minutos.
4. Desde **Accesos**, generá invitaciones de un solo uso y vigencia de 24 horas para jugadores o administradores. Al vincular un tag, revisá la identidad del jugador; conocer un tag público no demuestra propiedad de una cuenta.
5. Una cuenta puede administrar varias comunidades desde **Agregar clan**. Cada acceso y operación se valida para el clan seleccionado. Podés revocar otros accesos desde el panel; no se permite quitarse el propio acceso.

## Canales

- **Web:** funciona sin Discord/Telegram. Cuenta y contraseña, sesiones persistentes, comandos, miembros, CSV, invitaciones y auditoría.
- **Discord:** configurá token, aplicación y OAuth redirect `${BASE_URL}/auth/discord/callback`. Registrá comandos con `docker compose exec bot node dist/discord/deploy-commands.js`. Usá `/auto-setup` para canales/roles. Un clan existente requiere el código generado en **Canales → Generar código Discord**; vence en diez minutos. El login OAuth requiere ser propietario o tener Manage Server en el servidor vinculado. Los comandos compartidos se usan como `/consulta comando:/ranking donaciones`.
- **Telegram:** configurá `TELEGRAM_TOKEN`, agregá el bot al grupo y usá `/vincular` como administrador. Pegá el código en **Canales**. Un grupo se vincula a un clan. Jugadores usan `/registrar #TAG` y los comandos compartidos. La vinculación por tag es declarativa; no es una verificación de propiedad mediante Supercell.
- **WhatsApp:** activalo, guardá y pulsá **Conectar WhatsApp → Ver estado / QR**. Escaneá con el WhatsApp del propietario de esa comunidad. Seleccioná su grupo conectado y guardá. Cada clan tiene una sesión propia. Vinculá números de jugadores desde la web para habilitar sus ausencias/perfiles. Los administradores del grupo pueden usar comandos administrativos. Baileys es una integración no oficial; debe probarse con el número real antes de darla por operativa. La compatibilidad con identificadores LID de WhatsApp depende de los IDs entregados por el proveedor.

Discord y Telegram usan los bots configurados por el operador. WhatsApp usa el número vinculado por cada propietario. Las opciones de canales controlan comandos y envío de mensajes. El número técnico del desarrollador no se utiliza como emisor.

## Comandos compartidos

| Función | Comando | Permiso |
|---|---|---|
| Ayuda | `/ayuda` | Comunidad |
| Clan | `/clan` | Comunidad |
| Perfil | `/perfil #TAG` | Jugador del clan |
| Ranking | `/ranking puntos\|trofeos\|donaciones\|guerra [semanal\|mensual]` | Comunidad |
| Guerra actual | `/guerra` | Comunidad |
| Puntos | `/puntos #TAG` | Jugador del clan |
| Ausencia propia | `/ausencia 3 motivo` o `/ausencia cancelar` | Cuenta vinculada |
| Inactivos | `/inactivos` | Administrador |
| Sincronizar | `/sync` | Administrador |
| Bonificar / penalizar | `/premiar #TAG 10 motivo` | Administrador |

En WhatsApp también se acepta `!`. Se mantienen los comandos específicos de Discord. Reportes diarios y rankings semanales/mensuales de clanes sin Discord se publican por los canales habilitados. La zona horaria se configura con `TZ`.

## Base existente, respaldos y validación

Leé [la guía de despliegue](docs/despliegue.md) antes de actualizar una instalación previa. No ejecutar `docker compose down -v` sobre una instalación con datos.

```bash
npm ci
npm run db:generate
npm run lint
npm run build
npm test
```

La CI aplica migraciones en MariaDB, ejecuta un flujo de cuentas/invitaciones y construye/inicia Docker Compose. Las pruebas de mensajería con cuentas reales requieren credenciales del operador y QR del propietario. Ver [estado y límites](docs/estado-0.2.0.md).
