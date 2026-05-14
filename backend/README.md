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
- `GET /api/state`: devuelve la base de datos completa.
- `PUT /api/state`: guarda la base de datos completa.
- `POST /api/login`: valida email y contrasena contra los usuarios guardados.

Los datos reales se guardan en `backend/data/chic-co-db.json`, archivo ignorado por Git para no subir informacion privada.

Para desplegar en un hosting de backend, configura `HOST=0.0.0.0` y `PORT` segun lo indique el proveedor.
