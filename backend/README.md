# Backend Chic & Co

Backend local sin dependencias externas para la app Chic & Co.

## Ejecutar

Desde la carpeta principal del proyecto:

```bash
npm start
```

Tambien puedes usar Node directamente:

```bash
node backend/server.js
```

Luego abre:

```text
http://127.0.0.1:4173
```

## API

- `GET /api/health`: verifica que el backend este activo.
- `POST /api/login`: valida email y contrasena contra los usuarios guardados, aplica limite de intentos y devuelve un token temporal.
- `GET /api/state`: devuelve la base de datos sin hashes de contrasena. Requiere `Authorization: Bearer <token>`.
- `PUT /api/state`: guarda la base de datos, conserva los hashes existentes y aplica permisos de escritura por modulo desde el servidor. Requiere `Authorization: Bearer <token>`.
- `GET /api/backup`: exporta un respaldo online sin hashes de contrasena. Requiere super usuario.
- `POST /api/backup`: importa un respaldo y conserva los hashes actuales del servidor. Requiere super usuario.
- `GET /api/audit`: devuelve la bitacora de cambios guardados. Requiere administrador o super usuario.

El backend agrega cabeceras de seguridad, bloquea origenes externos, limita archivos estaticos a la web publica, aplica permisos de escritura del lado del servidor y evita exponer hashes por la API. Las contrasenas reales no deben guardarse en archivos publicos del repositorio.

Los datos reales se guardan en `backend/data/chic-co-db.json`, archivo ignorado por Git para no subir informacion privada.

Para desplegar en un hosting de backend, configura `HOST=0.0.0.0` y `PORT` segun lo indique el proveedor.
