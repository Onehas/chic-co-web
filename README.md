# Chic & Co

Aplicacion web para administrar un salon de belleza Chic & Co.

## Modulos

- Clientes
- Inventario
- Procedimientos
- En curso
- Planes
- Citas y agenda
- Usuarios y permisos
- Facturacion
- Sucursales con datos separados

## Uso

Para levantar la app con backend, ejecuta:

```bash
npm start
```

Luego visita:

```text
http://127.0.0.1:4173
```

## Deploy online

El repositorio incluye `render.yaml` para desplegar la app completa como servicio Node en Render. El backend sirve la web y la API desde el mismo dominio, y en Render guarda los datos en Postgres usando `DATABASE_URL`.

## Herramientas online

El super usuario puede exportar respaldos, importar respaldos y descargar la bitacora de cambios desde la interfaz publicada.

## Nota importante

La version online guarda los datos en Postgres y valida el login desde la API. El almacenamiento del navegador queda solo como apoyo de sesion y recuperacion visual.

## Variables de entorno

| Variable | Para que sirve |
| --- | --- |
| `DATABASE_URL` | Postgres online. Sin ella los datos van a `backend/data/chic-co-db.json`. |
| `CHIC_BOOTSTRAP_EMAIL` | Correo del super usuario que se crea al arrancar con la base vacia. |
| `CHIC_BOOTSTRAP_PASSWORD` | Contrasena de ese super usuario. Se guarda cifrada con scrypt. |
| `CHIC_RECEPCION_PASSWORD_HASH` | Hash inicial de la cuenta de recepcion. |
| `CHIC_MONICA_PASSWORD_HASH` | Hash inicial de la cuenta de Monica. |
| `HACIENDA_SECRET_KEY` | Cifra los secretos fiscales. Minimo 24 caracteres. |
| `RESEND_API_KEY` | Clave de Resend. Sin ella no se envia ningun correo, pero nada mas se rompe. |
| `RESEND_FROM` | Remitente verificado en Resend, p. ej. `Chic & Co <citas@chicco.cr>`. |
| `RESEND_REPLY_TO` | Opcional. A donde contestan las clientas si responden un correo. |
| `CHIC_STAFF_EMAILS` | Separados por coma. Reciben el aviso de cada reserva y el reporte de cierre. |
| `CHIC_REPORT_SECRET` | Protege `POST /api/reports/daily`. Sin ella esa ruta no existe. |
| `CHIC_REPORT_HOUR` | Hora local del reporte de cierre. Por defecto 20. |
| `CHIC_OPENING_TIME`, `CHIC_CLOSING_TIME` | Horario que ofrece la agenda publica. Por defecto 08:30 y 19:00. |
| `CHIC_CLOSED_WEEKDAYS` | Dias cerrados, 0 = domingo. Por defecto `0`. Vacio para abrir los siete. |
| `CHIC_PUBLIC_CAPACITY` | Cuantas citas caben a la misma hora. Por defecto, el numero de especialistas. |
| `CHIC_MIN_LEAD_MINUTES` | Antelacion minima para reservar en linea. Por defecto 120. |
| `CHIC_MAX_HORIZON_DAYS` | Hasta cuando se puede reservar. Por defecto 60. |
| `TRUST_PROXY_HOPS` | Cuantos proxys propios hay delante. En Render, `1`. Sin ella se usa la conexion real y el limite de intentos de login cuenta por cuenta en vez de por visitante. |
| `ALEGRA_EMAIL` | Correo de la cuenta de Alegra (facturacion electronica). Sin el, el envio a Alegra queda apagado. |
| `ALEGRA_TOKEN` | Token de API de Alegra (Configuracion -> API). |
| `ALEGRA_TAX_ID` | Opcional. Id del impuesto IVA 13% en esa cuenta de Alegra. |
| `CHIC_BACKUP_KEEP` | Cuantas instantaneas de respaldo se conservan. Por defecto 30. |
| `CHIC_MAX_IMAGES` | Tope de fotos de producto guardadas. Por defecto 4000. |
| `HOST`, `PORT` | Segun lo indique el proveedor. En Render, `HOST=0.0.0.0`. |

En una instalacion nueva, define `CHIC_BOOTSTRAP_EMAIL` y `CHIC_BOOTSTRAP_PASSWORD` antes del primer arranque. Sin ellas el estado inicial se crea igual, pero sin ninguna cuenta capaz de entrar.

## Identidad del negocio

El nombre y el logotipo son editables desde el sistema: un super usuario abre
**Personalizacion** en el menu de su cuenta, sube el logo y escribe el nombre.
Se aplican en la pantalla de acceso, la barra lateral, la barra superior y la
pagina publica de reservas. El logo vive en el almacen de imagenes; su id y el
nombre en `state.branding`.

## Cuentas y cambio de usuario

Cada persona entra con su propia cuenta. En una computadora compartida se puede
cambiar de usuario desde el menu, pero **cambiar a otra cuenta pide su
contrasena** y hace un inicio de sesion real nuevo: nadie puede actuar como otra
persona sin su clave, y el servidor registra siempre al autor correcto porque
decide todo por el token, no por lo que diga el navegador. El token anterior se
revoca al cambiar.

## Facturacion con Alegra

`backend/alegra.js` traduce cada factura al formato de Alegra y la envia cuando
se definen `ALEGRA_EMAIL` y `ALEGRA_TOKEN`. En el modulo de Facturacion, cada
factura tiene un boton **Enviar a Alegra** y muestra el numero de la factura
electronica con enlace al PDF. Un fallo de Alegra no altera la factura: solo se
registra el intento para reintentarlo.

## Persistencia y respaldo

El estado principal vive en un documento JSON (`app_state`) con tope de 2 MB por
guardado. Para que las colecciones que solo crecen no llenen ese documento, se
migran a tablas propias (overlay), de forma transparente para el navegador:
`backend/collection-store.js`. La primera migrada es la de movimientos de
inventario (`stockMovements`), que solo se agrega y nunca se edita ni se borra,
asi que la migracion no puede perder datos. Las facturas son el siguiente paso
(necesitan una accion de anular en vez de borrado crudo).

Ademas, cada dia se guarda una instantanea completa del estado en Postgres
(`state_backups`), conservando las ultimas 30 (`CHIC_BACKUP_KEEP`). Aun si el
documento principal se dañara, siempre hay de donde recuperar el dia anterior.

## Agenda publica

Las clientas reservan desde `/reservar.html`. Ese enlace es lo unico del sistema
que funciona sin sesion, asi que es tambien la unica superficie que puede tocar
un desconocido.

Lo que llega **no es una cita**: es una solicitud que aparta el horario y espera
en la bandeja del modulo de Citas hasta que recepcion la confirme o la rechace.
Confirmar crea la cita, registra a la clienta si es nueva y le manda el correo.

Las solicitudes se guardan en su propia tabla (`booking_requests`), nunca dentro
del documento de estado. El estado se sincroniza entero en cada guardado con un
tope de 2 MB: si las reservas publicas escribieran ahi, cualquiera podria
inflarlo hasta que nadie -tampoco el personal- pudiera guardar nada.

Limites del endpoint publico: seis solicitudes por hora y por visitante, cuatro
por correo, campo trampa contra robots, y validacion de correo y celular. El
horario elegido se vuelve a comprobar contra la agenda justo antes de guardar,
por si se ocupo mientras la clienta llenaba el formulario.

### Reporte de fin de dia

Sale una vez al dia a las `CHIC_REPORT_HOUR` (hora de Costa Rica) hacia
`CHIC_STAFF_EMAILS`. Lo dispara un temporizador interno, que solo funciona si el
servicio esta despierto. Para que sea fiable, configure ademas un Cron Job que
llame a la ruta protegida:

```
curl -X POST https://<su-dominio>/api/reports/daily -H "X-Report-Secret: <CHIC_REPORT_SECRET>"
```

El envio es idempotente por fecha: si las dos vias coinciden, el reporte sale una
sola vez.

## Seguridad

La API online requiere token temporal para leer o guardar datos, no devuelve hashes de contrasena, aplica limite de intentos de login, bloquea origenes externos y sirve solo archivos publicos de la web. Las credenciales reales deben vivir en la base de datos online o en variables seguras del proveedor, no dentro del codigo publico.

Las contrasenas se guardan con scrypt y sal por usuario. Las cuentas que todavia tengan un hash sha256 heredado siguen entrando, y su hash se actualiza solo la primera vez que inician sesion. Cualquier usuario puede cambiar su contrasena desde el menu de su nombre; un super usuario puede restablecer la de otra cuenta con `POST /api/password`.

Guardar aplica control de concurrencia: el navegador envia la revision sobre la que trabajaba y el servidor rechaza la escritura si otra persona guardo primero. El navegador fusiona entonces sus cambios sobre el estado del servidor y reintenta, de modo que dos personas editando modulos distintos no se pisan.
