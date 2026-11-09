# Despliegue y actualización

## Instalación limpia

1. Revisar `.env.example` y copiarlo a `.env`. Reemplazar todos los marcadores; no usar las credenciales de ejemplo del repositorio anterior.
2. `DB_PASSWORD` debe coincidir con la contraseña de `DATABASE_URL`. En Compose el host es `db`, puerto `3306`.
3. `docker compose config --quiet` valida la composición sin imprimir sus secretos.
4. `docker compose up -d --build --wait`.
5. `curl --fail http://127.0.0.1:3000/ready` verifica la conexión a la base de datos. `/health` solo comprueba que el proceso responde.
6. Crear administrador, sincronizar un clan y probar sus canales.

## Actualización de una instalación existente

La versión anterior usaba `prisma db push` sin historial de migraciones y no declaraba volumen persistente para MariaDB. No borrar ni recrear su contenedor de base de datos antes de obtener y comprobar un respaldo. El nuevo volumen `db_data` está vacío: no importa automáticamente los datos del contenedor anterior.

1. Detener el bot anterior para evitar escrituras y tomar un dump con el cliente MariaDB/MySQL. Guardarlo fuera del contenedor y verificar que contiene tablas y registros. Registrar la versión de MariaDB previa.
2. Probar primero restaurando ese dump en una base nueva y aislada. La actualización propuesta usa MariaDB 11.4; confirmar compatibilidad de la restauración antes del cambio definitivo.
3. Comparar el esquema restaurado con la migración `202611090001_baseline`. Este baseline refleja exactamente el `schema.prisma` previo del repositorio. Si la base real tiene diferencias, resolverlas explícitamente; no marcar un baseline que no coincida.
4. Para esa base preexistente y comprobada, marcar **solo** el baseline como aplicado:

```bash
./node_modules/.bin/prisma migrate resolve --applied 202611090001_baseline
./node_modules/.bin/prisma migrate deploy
```

Estos comandos se ejecutan con `DATABASE_URL` apuntando a la base restaurada. En Docker se puede usar una ejecución puntual de la imagen con `docker compose run --rm bot ./node_modules/.bin/prisma migrate resolve --applied 202611090001_baseline`, después de restaurar el dump en `db`. El arranque normal aplica únicamente la segunda migración y las futuras. En una base vacía no ejecutar `migrate resolve`: `migrate deploy` crea todo.

5. Revisar miembros, puntos, guerras y configuraciones; iniciar el bot con las nuevas variables. Conservar el respaldo anterior hasta terminar la validación.

## Respaldos

El proceso ejecuta `mariadb-dump` a las 04:00 según `TZ`, con transacción consistente, sin interpolación de shell y sin contraseña en argumentos. Los dumps se guardan en el volumen `backups`. Un dump no incluye las sesiones WhatsApp ni imágenes externas; guardar el volumen `whatsapp_sessions` por separado, con acceso restringido.

Respaldo manual: `docker compose exec bot npm run backup`. Extraer una copia fuera del servidor: `docker compose cp bot:/app/backups ./backups-extraidos`. Confirmar el contenido del dump y ensayar su restauración. No hay retención automática; vigilar espacio y copiar/eliminar respaldos según la política del operador.

## Prueba real antes de habilitar usuarios

- Probar `/ready`, login, logout y persistencia al reiniciar el bot.
- Crear dos comunidades y confirmar que una cuenta de un clan no accede al otro.
- Crear y consumir una invitación; probar que reutilizarla falla y que revocar el acceso tiene efecto inmediato.
- Sincronizar miembros y verificar guerra/donaciones contra el juego.
- Activar cada canal por separado y en combinación, comprobar QR del propietario, grupo correcto y que desactivar el canal impide comandos/envíos.
- Reiniciar y comprobar que WhatsApp conserva su sesión; desvincular y comprobar eliminación.
- Revisar zona horaria, respaldo, HTTPS y cookies seguras.

## Volver a una versión anterior

Conservar el commit anterior y los dumps. No ejecutar comandos destructivos automáticos. Las nuevas tablas y columnas son aditivas, pero la aplicación anterior usa credenciales y arranque inseguros: ensayar una vuelta en una copia de la base antes de aplicar un rollback real.
