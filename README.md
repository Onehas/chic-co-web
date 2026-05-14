# Chic & Co

Aplicacion web estatica para administrar un salon de belleza Chic & Co.

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

## Uso local

Para usar solo la demo estatica, abre `index.html` directamente en el navegador.

Para usar la app con backend y base de datos local, ejecuta:

```bash
npm start
```

Luego visita:

```text
http://127.0.0.1:4173
```

## Deploy online

El repositorio incluye `render.yaml` para desplegar la app completa como servicio Node en Render. El backend sirve la web y la API desde el mismo dominio.

## Nota importante

La version estatica publicada en GitHub Pages usa `localStorage` como base de datos demo. Cuando se abre desde el backend Node, la app guarda los datos en `backend/data/chic-co-db.json` y valida el login desde la API.
