# Plan de integracion Hacienda Costa Rica

Estado: Fase 1 - auditoria y arquitectura. No listo para produccion.
Fecha: 2026-08-06.

## Fuentes oficiales obligatorias

Esta integracion debe implementarse usando solo documentacion oficial:

- Anexos y Estructuras para la Emision de Comprobantes Electronicos v4.4: https://www.hacienda.go.cr/docs/ANEXOS_Y_ESTRUCTURAS_V4.4.pdf
- API oficial de Comprobantes Electronicos: https://www.hacienda.go.cr/docs/ComprobantesElectronicosAPI.html
- Guia del Identity Provider: https://www.hacienda.go.cr/docs/Guia_IdP.pdf
- Esquemas XML v4.4: https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/

Notas relevantes verificadas en la fuente oficial v4.4:

- La version 4.4 rige a partir del 01 de setiembre de 2025 y sustituye 4.3 para nuevos comprobantes.
- Version 4.4 agrega/ajusta campos como Proveedor de Sistemas, codificacion de clave y consecutivo, y tipo de comprobante 10 Recibo Electronico de Pago.
- El API de Hacienda recibe comprobantes y HTTP 201 significa recibido/pendiente de validacion, no aceptado final.

## Resultado de auditoria del repositorio actual

El texto original asumia una aplicacion ASP.NET MVC/Razor con rutas como /Facturacion, /Facturacion/Caja y /Admin/Configuracion. Ese no es el repositorio actual de Chic & Co.

Arquitectura real encontrada:

- Aplicacion web estatica servida por un backend Node.js propio.
- No hay .NET, ASP.NET MVC, Razor, Entity Framework, EF Core ni Dapper.
- Frontend principal: `index.html`, `styles.css`, `app.js`.
- Mejoras de frontend: `enhancements.js`, `agenda-upgrade.js`, `production-tools.js`, `security-upgrade.js`.
- Backend principal: `backend/server.js`.
- Dependencias actuales: solo `pg` para Postgres.
- Deploy online: Render mediante `render.yaml`.
- Base de datos online: Postgres en Render usando `DATABASE_URL`.
- Modelo actual de persistencia: una sola fila `app_state` con un JSON completo de la aplicacion.
- Fallback local: `backend/data/chic-co-db.json` cuando no hay `DATABASE_URL`.
- Estado frontend de apoyo: `localStorage`, pero la fuente online debe ser Postgres.
- Autenticacion actual: login por `/api/login`, token temporal en memoria del backend, bearer token para `/api/state`, `/api/backup`, `/api/audit` y `/api/events`.
- Sin sistema formal de migraciones.
- Sin ORM.
- Sin sistema de jobs formal.
- Sin manejo de secretos cifrados propio mas alla de no exponer hashes por API.
- Multi-sucursal actual: `branchOptions` y `state.branches` con datos separados para `rohrmoser` y `alajuela`.

## Archivos revisados

- `package.json`: confirma Node.js, scripts `start`, `dev`, `test`, dependencia `pg`.
- `README.md`: confirma backend Node, Postgres online y localStorage solo como apoyo.
- `render.yaml`: define servicio Render, `DATABASE_URL` desde Postgres.
- `backend/server.js`: API, seguridad, sesiones, Postgres JSON, auditoria, backup, realtime events.
- `app.js`: modulos, datos, facturacion, agenda, sucursales, login y sync.
- `enhancements.js`: CRUD extendido, edicion/eliminacion de facturas y validaciones.
- `production-tools.js`: reportes y backup/audit UI.
- `security-upgrade.js`: limpieza/sincronizacion y protecciones adicionales.
- `agenda-upgrade.js`: agenda avanzada y validacion de conflictos.

## Modelos reales encontrados

No existen clases de modelo ni tablas normalizadas. Los modelos viven como objetos JavaScript dentro de `state`:

- Clientes: `state.clients`.
- Inventario/productos: `state.products`.
- Movimientos de inventario: `state.stockMovements`.
- Procedimientos/servicios: `state.procedures`.
- Procedimientos en curso: `state.activeProcedures`.
- Planes: `state.plans`.
- Citas: `state.appointments`.
- Facturas: `state.invoices`.
- Usuarios: `state.users`.
- Sucursales: `state.branches[branchId]`.

Campos actuales de factura en `addInvoice()`:

- `id` con prefijo `FAC` generado en frontend.
- `date`.
- `clientId`.
- `area`.
- `procedureId`.
- `productId`.
- `productQty`.
- `serviceAmount`.
- `productAmount`.
- `ivaRate`.
- `paid`.
- `paymentMethod` con valores `Efectivo` o `Tarjeta`.
- `notes`.

Limitaciones fiscales actuales:

- No hay CABYS por producto/servicio.
- No hay tipo de impuesto por linea.
- No hay exoneraciones.
- No hay moneda/tipo de cambio por factura.
- No hay identificacion fiscal completa del cliente.
- No hay actividad economica del emisor/receptor.
- No hay datos fiscales completos de empresa/sucursal/terminal.
- No hay consecutivo fiscal Hacienda.
- No hay clave de 50 posiciones.
- No hay XML, XSD, firma, token Hacienda, envio o polling.

## Punto exacto donde la venta queda confirmada

El flujo actual confirma una factura en `app.js`, funcion `addInvoice(data)`:

1. Valida stock si hay producto.
2. Crea un objeto `invoice` con `id: nextId("FAC", state.invoices)`.
3. Inserta la factura con `state.invoices.unshift(invoice)`.
4. Si hay producto, descuenta inventario y registra `stockMovement`.
5. Limpia `prefill`.
6. Llama `persistAndRender("Factura guardada")`.
7. `persistAndRender()` llama `saveState()`.
8. `saveState()` sincroniza datos al backend con `PUT /api/state`.

Este es el punto de integracion inicial para generar el registro de comprobante, pero no conviene poner toda la logica Hacienda en `app.js`. La integracion fiscal debe vivir en backend.

## Multiempresa / multisalon

El sistema actual tiene sucursales, no empresas fiscales completas:

- `rohrmoser`: Chic & Co Rohrmoser.
- `alajuela`: Chic & Co Alajuela.

Cada sucursal tiene sus propios clientes, productos, procedimientos, citas, planes y facturas dentro de `state.branches`.

Para Hacienda se debe crear configuracion fiscal por sucursal/empresa. Inicialmente se puede mapear `branchId` a `EmpresaId`, pero el modelo debe permitir que varias sucursales pertenezcan a una misma sociedad o que cada sucursal tenga su propio emisor fiscal.

## Integracion existente con Hacienda o proveedor anterior

No se encontro integracion real con Hacienda ni SuFacturaFacil en el repo actual mediante busqueda de:

- `Hacienda`.
- `sufacturafacil`.
- `Comprobantes`.
- rutas ASP.NET o controladores .NET.

La facturacion actual es interna y operativa, no fiscal electronica.

## Problema de arquitectura antes de implementar

La solicitud exige atomicidad de consecutivos, idempotencia, XML, firma, secretos cifrados, jobs, auditoria y multiempresa. El modelo actual de una sola fila JSON no es suficiente para una integracion fiscal robusta.

Antes de enviar a Hacienda se debe agregar una capa backend con tablas normalizadas para la parte fiscal, manteniendo la facturacion actual intacta.

## Tablas nuevas propuestas

Como el proyecto ya usa Postgres, se propone agregar tablas mediante SQL ejecutado por el backend al inicializar, sin introducir un ORM en la primera fase.

### `hacienda_company_settings`

Configuracion por empresa/sucursal/contribuyente:

- `id` uuid primary key.
- `branch_id` text not null.
- `enabled` boolean not null default false.
- `direct_submission_enabled` boolean not null default false.
- `legacy_provider_enabled` boolean not null default true.
- `environment` text not null default 'Sandbox'.
- `issuer_id_type` text.
- `issuer_id_number` text.
- `issuer_legal_name` text.
- `issuer_trade_name` text.
- `economic_activity_code` text.
- `branch_code` char(3).
- `terminal_code` char(5).
- `api_username` text.
- `api_password_encrypted` text.
- `p12_storage_ref` text.
- `p12_encrypted` bytea nullable si se almacena en DB.
- `p12_pin_encrypted` text.
- `issuer_email` text.
- `province` text.
- `canton` text.
- `district` text.
- `other_address` text.
- `default_currency` text default 'CRC'.
- `system_provider` text.
- `submission_method` text default 'LegacyProvider'.
- `callback_url` text nullable.
- `created_at`, `updated_at`.

### `hacienda_consecutive_counters`

Control transaccional de consecutivos:

- `id` uuid primary key.
- `company_settings_id` uuid not null.
- `document_type` char(2) not null.
- `branch_code` char(3) not null.
- `terminal_code` char(5) not null.
- `last_number` bigint not null default 0.
- `created_at`, `updated_at`.

Indice unico:

- `(company_settings_id, branch_code, terminal_code, document_type)`.

Asignacion atomica recomendada:

- `BEGIN`.
- `SELECT ... FOR UPDATE` sobre contador.
- Incrementar `last_number`.
- Crear comprobante con ese consecutivo.
- `COMMIT`.

No usar `MAX(consecutivo) + 1`.

### `hacienda_electronic_documents`

Registro fiscal del comprobante:

- `id` uuid primary key.
- `branch_id` text not null.
- `invoice_id` text not null.
- `document_type` char(2) not null.
- `clave` char(50) unique not null.
- `consecutivo` char(20) not null.
- `issued_at` timestamptz not null.
- `environment` text not null.
- `internal_status` text not null.
- `hacienda_status` text.
- `xml_original` text.
- `xml_signed` text.
- `xml_hacienda_response` text.
- `json_sent` jsonb.
- `http_status` integer.
- `location_header` text.
- `hacienda_error` text.
- `attempt_count` integer not null default 0.
- `last_attempt_at` timestamptz.
- `sent_at` timestamptz.
- `response_at` timestamptz.
- `next_status_check_at` timestamptz.
- `created_at`, `updated_at`.

Indices unicos:

- `clave`.
- `(branch_id, document_type, consecutivo)`.
- `(branch_id, invoice_id, document_type)` cuando aplique.

### `hacienda_audit_log`

Auditoria fiscal:

- `id` uuid primary key.
- `branch_id` text.
- `document_id` uuid nullable.
- `user_id` text.
- `action` text.
- `details` jsonb redacted.
- `created_at`.

## Servicios propuestos

En Node.js, adaptar nombres a modulos CommonJS dentro de `backend/hacienda/`:

- `hacienda-config-service.js`.
- `hacienda-auth-service.js`.
- `hacienda-api-client.js`.
- `hacienda-consecutive-service.js`.
- `clave-generator.js`.
- `xml44-generator.js`.
- `xml-schema-validator.js`.
- `xades-epes-signer.js`.
- `hacienda-submission-service.js`.
- `hacienda-status-service.js`.
- `comprobante-pdf-service.js`.
- `comprobante-delivery-service.js`.
- `hacienda-worker.js`.

Los controladores/rutas en `backend/server.js` solo deben coordinar. La logica de XML, firma, autenticacion, envio y polling debe estar fuera del controlador.

## Endpoints internos propuestos

Agregar rutas protegidas por sesion y permisos:

- `GET /api/hacienda/config?branchId=...`.
- `PUT /api/hacienda/config` solo administradores.
- `POST /api/hacienda/test-credentials` solo administradores, sandbox por defecto.
- `POST /api/hacienda/test-certificate` solo administradores.
- `GET /api/hacienda/documents`.
- `GET /api/hacienda/documents/:id`.
- `POST /api/hacienda/documents/:id/send`.
- `POST /api/hacienda/documents/:id/status`.
- `POST /api/hacienda/documents/:id/retry`.
- `GET /api/hacienda/documents/:id/xml-original`.
- `GET /api/hacienda/documents/:id/xml-signed`.
- `GET /api/hacienda/documents/:id/xml-response`.
- `GET /api/hacienda/documents/:id/pdf`.

## Feature flags iniciales

Valores iniciales obligatorios:

- `HaciendaIntegrationEnabled=false`.
- `HaciendaDirectSubmissionEnabled=false`.
- `HaciendaEnvironment=Sandbox`.
- `LegacyInvoiceProviderEnabled=true`.

En este proyecto deben vivir en tabla `hacienda_company_settings` y opcionalmente en variables de entorno para defaults globales.

## Ambientes oficiales

Centralizar en un solo modulo, nunca dispersar URLs.

Sandbox:

- Reception base URL: `https://api.comprobanteselectronicos.go.cr/recepcion-sandbox/v1/`.
- Token URL: `https://idp.comprobanteselectronicos.go.cr/auth/realms/rut-stag/protocol/openid-connect/token`.
- Client ID: `api-stag`.

Produccion:

- Reception base URL: `https://api.comprobanteselectronicos.go.cr/recepcion/v1/`.
- Token URL: `https://idp.comprobanteselectronicos.go.cr/auth/realms/rut/protocol/openid-connect/token`.
- Client ID: `api-prod`.

## Flujo propuesto

```mermaid
flowchart TD
  A[Usuario guarda factura en Facturacion] --> B[Frontend guarda factura interna actual]
  B --> C[PUT /api/state sincroniza estado]
  B --> D[POST /api/hacienda/documents desde backend o cola]
  D --> E[Transaccion Postgres]
  E --> F[Reservar consecutivo con SELECT FOR UPDATE]
  F --> G[Crear clave de 50 caracteres]
  G --> H[Crear registro hacienda_electronic_documents]
  H --> I[Generar XML 4.4]
  I --> J[Validar contra XSD oficial]
  J --> K[Firmar XAdES-EPES]
  K --> L[Obtener/reusar token IdP]
  L --> M[POST /recepcion]
  M --> N{HTTP 201?}
  N -->|Si| O[Estado Received/PendingValidation]
  N -->|No temporal| P[TemporaryError con backoff]
  N -->|No permanente| Q[PermanentError]
  O --> R[Worker consulta GET /recepcion/{clave}]
  R --> S[Guardar XML respuesta]
  S --> T[Aceptado/Rechazado/Procesando]
```

## Estrategia de migracion sin romper facturacion actual

1. Mantener `state.invoices` y todo el modulo Facturacion intacto.
2. Agregar tablas fiscales separadas en Postgres.
3. Desplegar con integracion apagada y proveedor anterior habilitado.
4. Agregar pantalla `/Hacienda` como modulo interno sin enviar a produccion.
5. Agregar configuracion por sucursal/empresa en Sandbox.
6. Agregar validador de datos fiscales faltantes antes de generar XML.
7. Agregar generacion de clave/consecutivo y pruebas unitarias.
8. Agregar XML 4.4 para Factura Electronica, Tiquete Electronico y Nota de Credito.
9. Agregar validacion XSD oficial.
10. Agregar firma XAdES-EPES con biblioteca mantenida.
11. Agregar autenticacion y envio a Sandbox.
12. Agregar polling de estado.
13. Agregar PDF y descargas.
14. Solo despues de pruebas exitosas en Sandbox habilitar envio directo por sucursal.
15. Produccion requiere checklist manual, credenciales reales y respaldo de base de datos.

## Dependencias propuestas y riesgos

### XML/XSD

- Usar `libxmljs2` o validacion mediante proceso aislado compatible con XSD.
- Riesgo: compatibilidad de librerias nativas en Render.
- Alternativa: servicio interno de validacion o paquete puro JS si valida XSD 1.0 correctamente.

### Firma XAdES-EPES

Node.js no tiene soporte robusto nativo para XAdES-EPES completo. Se debe evaluar antes de implementar:

- `xadesjs` + `node-webcrypto-ossl` o alternativa mantenida.
- Riesgo: soporte real de XAdES-EPES, policy oficial y compatibilidad con .p12.
- Alternativa recomendada si Node no cumple: microservicio .NET o Java solo para firma XAdES, llamado desde el backend Node.

No se debe usar una firma XML simplificada.

### PDF

- Generar PDF desde plantilla HTML server-side.
- Riesgo: no debe incluir secretos ni XML real en logs.

### Jobs

- Inicialmente usar worker liviano con `setInterval` en `backend/server.js` o modulo separado.
- Riesgo: multiples instancias podrian duplicar polling.
- Mitigacion: locks por Postgres (`FOR UPDATE SKIP LOCKED`) si Render escala a mas de una instancia.

## Riesgos principales

- El modelo actual JSON unico no garantiza atomicidad fiscal si se intenta manejar Hacienda dentro de `state`.
- No existen datos fiscales obligatorios: CABYS, cedulas, actividad economica, ubicacion, moneda/tipo cambio, tratamiento tributario por linea.
- La facturacion actual permite IVA global; Hacienda requiere impuestos por linea y reglas oficiales.
- Firma XAdES-EPES es el componente mas riesgoso tecnicamente.
- Guardar .p12/PIN/API password requiere cifrado real; no debe vivir en frontend ni localStorage.
- Render puede tener limitaciones para dependencias nativas de firma o XSD.
- Reintentos mal disenados pueden duplicar comprobantes o consecutivos.
- HTTP 201 no significa aceptado.
- Produccion no debe activarse automaticamente.

## Rollback inicial

Mientras `HaciendaIntegrationEnabled=false`, rollback consiste en:

1. Desactivar integracion en settings.
2. Mantener `LegacyInvoiceProviderEnabled=true`.
3. Ignorar tablas `hacienda_*` sin borrar datos.
4. Volver al flujo actual de `state.invoices`.
5. Restaurar backup de Postgres solo si una migracion fiscal corrompe datos, no por errores de Hacienda.

## Checklist antes de produccion

No activar produccion hasta que:

- XML 4.4 valide contra XSD oficial.
- Firma XAdES-EPES sea verificada criptograficamente.
- Sandbox acepte comprobantes reales de prueba.
- Pruebas de concurrencia de consecutivos pasen.
- Secretos esten cifrados en reposo.
- Exista respaldo de base de datos.
- Exista rollback probado.
- Administrador confirme datos fiscales reales.
- Se hayan probado rechazos y reintentos idempotentes.

## Datos que el administrador debe obtener de Hacienda

- Usuario API de Hacienda.
- Contrasena API.
- Llave criptografica `.p12`.
- PIN de llave criptografica.
- Tipo y numero de identificacion del emisor.
- Razon social.
- Nombre comercial.
- Actividad economica.
- Direccion fiscal completa.
- Correo emisor.
- Codigo de sucursal de 3 digitos.
- Codigo de terminal de 5 digitos.
- Confirmacion de regimen/condicion tributaria.
- CABYS y tratamiento fiscal para cada servicio/producto.

## Proxima fase recomendada

Fase 2 no debe empezar creando XML todavia. Primero se debe implementar la base segura:

1. Agregar tablas `hacienda_*` en inicializacion Postgres.
2. Agregar feature flags apagados.
3. Agregar endpoint `/api/hacienda/config` protegido.
4. Agregar UI `/Hacienda` de solo configuracion/estado.
5. Agregar validacion de datos faltantes por factura.

Solo despues se debe avanzar a clave/consecutivo y XML 4.4.
