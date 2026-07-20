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

## Seguridad

La API online requiere token temporal para leer o guardar datos, no devuelve hashes de contrasena, aplica limite de intentos de login, bloquea origenes externos y sirve solo archivos publicos de la web. Las credenciales reales deben vivir en la base de datos online o en variables seguras del proveedor, no dentro del codigo publico.
