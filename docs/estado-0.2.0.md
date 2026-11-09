# Estado de la versión 0.2.0

Esta rama convierte el bot existente en una base para administración de varios clanes y despliegue reproducible. No representa la implementación completa de la visión de largo plazo NEXUS ARENA.

## Implementado

| Área | Entrega |
|---|---|
| Web | Interfaz adaptable con resumen, miembros, consultas, canales, accesos y auditoría |
| Cuentas | Contraseñas scrypt con sal, sesiones en MariaDB, invitaciones de un uso, permisos por clan y revocación |
| Clanes | Alta validada en API, múltiples comunidades por cuenta y selección visual |
| Comandos | Núcleo compartido para web/Telegram/WhatsApp y `/consulta` en Discord |
| Canales | Activación independiente por comunidad; sesiones QR por clan para WhatsApp |
| Discord | Preserva comandos y auto-setup; código web para vincular comunidades existentes |
| Telegram | Inicio independiente de Discord, vinculación por código emitido por administrador y guerra desde river-race |
| WhatsApp | Baileys, QR limitado a administradores, selección de grupo, vinculación de jugadores, reconexión limitada y cierre de sesión |
| Datos | Corrección de detección de ingresos/retornos, estadísticas filtradas por clan y guerra por sección de temporada |
| Administración | Invitaciones, revocación de accesos, puntos manuales, ausencias propias y exportación CSV |
| Seguridad | OAuth state de un uso, rotación de sesión al entrar, CSRF, límites por IP, CSP, presentación de texto sin HTML de usuarios, CSV contra fórmulas |
| Docker | MariaDB persistente, espera de salud, usuario sin root, migraciones aditivas y volumen de sesiones WhatsApp |
| Respaldo | MariaDB dump diario y manual, sin shell ni contraseña en argumentos |

## Verificación

- Compilación TypeScript y lint ejecutados localmente.
- 25 pruebas locales de seguridad, permisos, aislamiento, comandos y regresiones. La prueba adicional de MariaDB se ejecuta en CI; no se cuenta como aprobada localmente.
- Flujo de cuentas, invitaciones de un uso y revocación definido como prueba de integración con MariaDB real.
- Workflow de GitHub Actions para instalación limpia, migraciones, arranque sin Discord y construcción/arranque con Docker Compose.
- No hay Docker ni MariaDB instalados en el entorno de edición. Hasta que termine CI, esas verificaciones están pendientes.
- La verificación visual con Chromium depende de la disponibilidad de su binario. No confundir pruebas HTTP con revisión visual.
- Las conexiones reales de Clash Royale, Discord, Telegram y WhatsApp dependen de tokens/IP/QR de la instalación. No se hicieron envíos a comunidades ni se vinculó ningún teléfono durante el desarrollo.

## Límites y próximos trabajos

- Operación inicial prevista con una réplica de la aplicación. El limitador, estado de conexiones y QR son locales al proceso; varias réplicas requieren coordinación y almacenamiento compartido adecuado.
- El código del operador autoriza nuevos administradores: no hay prueba de propiedad del clan dentro del juego. Las vinculaciones declarativas por tag tampoco demuestran propiedad de la cuenta Supercell.
- Telegram/Discord usan los tokens globales del despliegue; no hay panel para ingresar un token de bot distinto por clan.
- Baileys no es oficial. Probar recepción, IDs LID, reconexión y persistencia con los teléfonos concretos antes de habilitar producción. En esta etapa las credenciales se guardan en archivos con volumen restringido; no hay cifrado adicional en aplicación.
- Las automatizaciones específicas de roles y algunas alertas heredadas siguen siendo de Discord. Web/Telegram/WhatsApp comparten consultas y acciones del nuevo núcleo; no se afirma paridad de cada subcomando heredado ni de administración de canales/roles de Discord.
- La auditoría registra las nuevas acciones web y del núcleo compartido. No se ha convertido toda acción de comandos antiguos en eventos de auditoría.
- El cálculo histórico de puntos heredado requiere revisión adicional para acreditación automática idempotente de guerras. Esta versión no activa una nueva acreditación automática ni un motor predictivo.
- El ranking de puntos semanal conserva el comportamiento mensual heredado; los rankings semanales de trofeos sí tienen baseline semanal. No presentar ese ranking de puntos como una medición semanal independiente.
- Ausencias: se validan días enteros positivos, pero el cupo y la reserva de días simultáneos necesitan una revisión transaccional adicional antes de operar a gran escala.
- Sin recuperación de contraseñas por correo ni verificación de correo; el operador gestiona accesos en esta fase.
- CSV disponible; nuevos reportes PDF, entrenador IA, torneos, reclutamiento, misiones y predicciones permanecen fuera de esta entrega.
- Respaldos sin rotación automática. Los volúmenes de sesión WhatsApp requieren respaldo separado y protección del host.
