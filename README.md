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
| `HOST`, `PORT` | Segun lo indique el proveedor. En Render, `HOST=0.0.0.0`. |

En una instalacion nueva, define `CHIC_BOOTSTRAP_EMAIL` y `CHIC_BOOTSTRAP_PASSWORD` antes del primer arranque. Sin ellas el estado inicial se crea igual, pero sin ninguna cuenta capaz de entrar.

## Seguridad

La API online requiere token temporal para leer o guardar datos, no devuelve hashes de contrasena, aplica limite de intentos de login, bloquea origenes externos y sirve solo archivos publicos de la web. Las credenciales reales deben vivir en la base de datos online o en variables seguras del proveedor, no dentro del codigo publico.

Las contrasenas se guardan con scrypt y sal por usuario. Las cuentas que todavia tengan un hash sha256 heredado siguen entrando, y su hash se actualiza solo la primera vez que inician sesion. Cualquier usuario puede cambiar su contrasena desde el menu de su nombre; un super usuario puede restablecer la de otra cuenta con `POST /api/password`.

Guardar aplica control de concurrencia: el navegador envia la revision sobre la que trabajaba y el servidor rechaza la escritura si otra persona guardo primero. El navegador fusiona entonces sus cambios sobre el estado del servidor y reintenta, de modo que dos personas editando modulos distintos no se pisan.
