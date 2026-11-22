# DermaCare — Sistema web de gestión de una clínica dermatológica

Proyecto de **Laboratorio de Programación III**. Aplicación web real e integrada para administrar pacientes, dermatólogos, citas, consultas dermatológicas, historial médico, estadísticas y reportes.

| Capa | Tecnología |
|---|---|
| Frontend | HTML5, CSS3, JavaScript puro (Vanilla JS), Bootstrap 5, Bootstrap Icons, Chart.js, Fetch API |
| Backend | Node.js, Express.js, API REST, arquitectura MVC |
| Base de datos | PostgreSQL (SQL puro, consultas parametrizadas, transacciones) |
| Seguridad | JWT (cookie httpOnly), bcrypt, Helmet, rate limiting, autorización por roles |
| Reportes | ExcelJS (Excel) y PDFKit (PDF) |

> Todos los datos de demostración son **ficticios**.

---

## 1. Estructura del proyecto

```
DermaCare/
├── backend/
│   ├── src/
│   │   ├── config/        database.js (pool PostgreSQL + transacciones), env.js
│   │   ├── controllers/   auth, usuario, paciente, dermatologo, cita, consulta, diagnostico, dashboard, reporte
│   │   ├── middlewares/   auth.middleware.js (JWT), role.middleware.js (roles), error.middleware.js
│   │   ├── models/        consultas SQL por entidad
│   │   ├── routes/        index.js (todos los endpoints /api)
│   │   ├── services/      cita.service.js (disponibilidad), reporte.service.js (Excel/PDF)
│   │   ├── utils/         validators, httpError, audit, initDb (esquema, admin, datos demo)
│   │   ├── app.js         Express: seguridad, API y archivos estáticos del frontend
│   │   └── server.js      arranque
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── assets/css/styles.css
│   ├── assets/js/         api.js, ui.js, layout.js, auth.js, dashboard.js, pacientes.js, dermatologos.js,
│   │                      citas.js, consultas.js, historial.js, usuarios.js, reportes.js
│   ├── assets/img/
│   ├── pages/             dashboard, pacientes, dermatologos, citas, consultas, historial, usuarios, reportes
│   ├── index.html
│   └── login.html
├── database/
│   ├── dermacare.sql      esquema completo (idempotente)
│   └── seeds.sql          datos ficticios
├── tests/api.test.js      pruebas de integración (node:test)
├── reports/
├── render.yaml            blueprint opcional de Render
├── package.json
└── README.md
```

Express sirve el frontend y la API desde **un único servicio**.

## 2. Roles y permisos (validados en el backend)

| Módulo | Administrador | Dermatólogo | Recepcionista |
|---|:-:|:-:|:-:|
| Dashboard y estadísticas | ✔ | — | — |
| Usuarios | ✔ | — | — |
| Pacientes: ver | ✔ | solo sus pacientes | ✔ |
| Pacientes: registrar / editar / desactivar | ✔ | — | ✔ |
| Dermatólogos: ver, horarios y agenda | ✔ | ✔ | ✔ |
| Dermatólogos: crear / editar / horario / desactivar | ✔ | — | — |
| Citas: ver | todas | solo las suyas | todas |
| Citas: agendar / reprogramar / cancelar / confirmar | ✔ | — | ✔ |
| Citas: iniciar atención («En consulta») | — | ✔ (propias) | — |
| Consultas: registrar | — | ✔ (propias) | — |
| Consultas e historial médico: ver | ✔ | solo sus pacientes | — |
| Reportes Excel/PDF | ✔ | — | — |

Ocultar un botón no basta: cada ruta usa `authenticate` (JWT + usuario activo en BD) y `authorize(...roles)`. Si se desactiva un usuario, su sesión deja de funcionar de inmediato.

## 3. Reglas de negocio implementadas

- **Citas sin superposición**: restricción `EXCLUDE USING gist` en PostgreSQL (`dermatologo_id` + `tsrange(inicio, fin)`, ignorando canceladas). Además se usa un bloqueo `pg_advisory_xact_lock` por dermatólogo dentro de una transacción. Se probaron 6 solicitudes simultáneas al mismo horario: 1 se guardó y 5 recibieron `409`.
- Las citas solo pueden agendarse en el **futuro**, el **mismo día**, dentro del **horario semanal configurado** para el dermatólogo (módulo Dermatólogos → Horario), con paciente y dermatólogo **activos**.
- Solo se reprograman o cancelan citas `Pendiente` o `Confirmada`. Las canceladas **liberan** el horario.
- Estados: `Pendiente → Confirmada` (recepción/admin) → `En consulta` (dermatólogo) → `Completada` (automático al guardar la consulta). `Cancelada` en cualquier momento antes de la atención.
- **Consulta**: una por cita (`UNIQUE cita_id`); se guarda en transacción junto con sus diagnósticos (1..10, CIE-10 opcional) y la cita pasa a `Completada`.
- **Los pacientes nunca se borran**: solo se desactivan. Las claves foráneas usan `ON DELETE RESTRICT`, así que su historial no puede eliminarse por accidente.
- Cédula única cuando se proporciona; exequátur único; detección de pacientes duplicados (mismo nombre, apellidos y fecha de nacimiento).
- Auditoría de acciones importantes (tabla `auditoria`), visible en el dashboard.

## 4. Instalación local

Requisitos: Node.js 18+ y PostgreSQL 13+.

```bash
git clone https://github.com/<usuario>/DermaCare.git
cd DermaCare
npm run build                    # instala dependencias del backend
cp backend/.env.example backend/.env
```

Cree la base de datos:

```sql
CREATE DATABASE dermacare;
```

Edite `backend/.env` (vea la tabla de la sección 6) y luego:

```bash
npm run db:seed    # crea el esquema, el administrador, los usuarios demo y los datos ficticios
npm start          # http://localhost:3000
```

El esquema también se aplica automáticamente cada vez que arranca el servidor (es idempotente). Si prefiere ejecutar el SQL manualmente:

```bash
psql "$DATABASE_URL" -f database/dermacare.sql
```

> `seeds.sql` necesita que existan los usuarios demo, porque sus contraseñas se cifran con bcrypt en Node. Por eso se carga con `npm run db:seed`.

### Usuarios de demostración

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | valor de `ADMIN_EMAIL` | valor de `ADMIN_PASSWORD` |
| Dermatóloga | dra.martinez@dermacare.demo | valor de `DEMO_PASSWORD` |
| Dermatólogo | dr.santos@dermacare.demo | valor de `DEMO_PASSWORD` |
| Recepcionista | recepcion@dermacare.demo | valor de `DEMO_PASSWORD` |

Las contraseñas **no están en el código**: salen de las variables de entorno.

## 5. Pruebas

Con el servidor en marcha:

```bash
BASE_URL=http://localhost:3000 ADMIN_PASSWORD='...' DEMO_PASSWORD='...' npm test
```

Cubren autenticación, autorización por rol, el dashboard, el CRUD con validaciones y duplicados, la disponibilidad, las citas simultáneas, la consulta y su duplicado, el historial y los reportes Excel/PDF.

## 6. Variables de entorno

| Variable | Descripción |
|---|---|
| `PORT` | Puerto (Render lo asigna automáticamente) |
| `DATABASE_URL` | Cadena de conexión PostgreSQL |
| `DATABASE_SSL` | `true` si el proveedor exige SSL (Render, Neon, Railway) |
| `JWT_SECRET` | Clave larga y aleatoria para firmar los JWT |
| `JWT_EXPIRES_IN` | Duración de la sesión (por defecto `8h`) |
| `APP_TIMEZONE` | Zona horaria de la clínica (por defecto `America/Santo_Domingo`) |
| `CORS_ORIGIN` | Solo si el frontend se sirve desde otro dominio |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Administrador inicial: se crea al arrancar si no existe (mín. 8 caracteres) |
| `SEED_DEMO_DATA` | `true` para cargar los datos ficticios si la base está vacía |
| `DEMO_PASSWORD` | Contraseña de los usuarios demo (mín. 8 caracteres) |

`.env` está excluido de Git mediante `.gitignore`.

## 7. Documentación de la API REST

Base: `/api`. JSON en las peticiones y las respuestas. La sesión viaja en una cookie httpOnly `dermacare_token`; también se acepta `Authorization: Bearer <jwt>`. Los errores tienen la forma `{ "error": "mensaje", "detalles": { "campo": "mensaje" } }`.

Códigos: `200/201` éxito · `400` validación · `401` sin sesión · `403` sin permiso · `404` no encontrado · `409` duplicado o horario ocupado · `429` demasiados intentos.

### Autenticación
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/auth/login` | público (10 intentos fallidos / 15 min) | `{email, password}` → crea la cookie de sesión |
| POST | `/auth/logout` | público | Cierra la sesión |
| GET | `/auth/me` | autenticado | Usuario actual y fecha del servidor |

### Usuarios (solo admin)
`GET /usuarios?q&rol&estado&sin_dermatologo` · `GET /usuarios/:id` · `POST /usuarios {nombre,email,rol,password}` · `PUT /usuarios/:id` (contraseña opcional) · `PATCH /usuarios/:id/estado {activo}`

### Pacientes
| Método | Ruta | Roles |
|---|---|---|
| GET | `/pacientes?q&campo=nombre\|apellido\|cedula&estado&sexo` | admin, recep, derm (solo sus pacientes) |
| GET | `/pacientes/:id` | admin, recep, derm |
| POST | `/pacientes` | admin, recep |
| PUT | `/pacientes/:id` | admin, recep |
| PATCH | `/pacientes/:id/estado {activo}` | admin, recep |
| GET | `/pacientes/:id/historial` | admin, derm (solo sus pacientes) |

Campos: `nombres*, apellidos*, cedula, fecha_nacimiento*, sexo* (M/F/O), telefono*, email, direccion, antecedentes, alergias`.

### Dermatólogos
`GET /dermatologos?q&estado` · `GET /dermatologos/:id` · `GET /dermatologos/:id/horarios` (todos los roles) · `POST /dermatologos` · `PUT /dermatologos/:id` · `PATCH /dermatologos/:id/estado` · `PUT /dermatologos/:id/horarios {horarios:[{dia_semana,hora_inicio,hora_fin}]}` (solo admin)

### Citas
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/citas?fecha&desde&hasta&estado&dermatologo_id&paciente_id&q` | todos (derm: solo las suyas) | Agenda |
| GET | `/citas/disponibilidad?dermatologo_id&fecha&duracion[&excluir_cita_id]` | todos | Horario del día, citas ocupadas y espacios libres |
| GET | `/citas/:id` | todos | Detalle |
| POST | `/citas {paciente_id,dermatologo_id,fecha,hora,duracion,motivo}` | admin, recep | Agendar |
| PUT | `/citas/:id` | admin, recep | Reprogramar |
| PATCH | `/citas/:id/cancelar {motivo}` | admin, recep | Cancelar |
| PATCH | `/citas/:id/estado {estado}` | admin/recep: `Confirmada`; derm: `En consulta` | Cambiar estado |

### Consultas y diagnósticos
`GET /consultas?q&desde&hasta&paciente_id&dermatologo_id` · `GET /consultas/:id` (admin, derm) · `POST /consultas {cita_id,motivo,sintomas,examen_dermatologico,tratamiento,observaciones,diagnosticos:[{descripcion,codigo_cie10,tipo}]}` (derm) · `GET /diagnosticos` · `GET /diagnosticos/frecuentes` · `GET /diagnosticos/:id`

### Dashboard
`GET /dashboard/estadisticas` · `/citas-mensuales` · `/citas-estado` · `/consultas-periodo` · `/actividad` · `/proximas-citas` (admin) · `/notificaciones` (todos)

### Reportes (admin, descarga de archivo)
`GET /reportes/pacientes?desde&hasta&estado` (Excel) · `/reportes/dermatologos?estado` (Excel) · `/reportes/citas?desde&hasta&estado&dermatologo_id` (Excel) · `/reportes/consultas?desde&hasta&dermatologo_id` (PDF) · `/reportes/actividad?desde&hasta` (PDF)

## 8. Publicación en GitHub y despliegue en Render

1. **Crear el repositorio** en GitHub (por ejemplo `DermaCare`, público o privado). No marque «Add README».
2. **Subir el proyecto** desde la carpeta `DermaCare`:
   ```bash
   git init
   git add .
   git commit -m "DermaCare: versión inicial"
   git branch -M main
   git remote add origin https://github.com/<usuario>/DermaCare.git
   git push -u origin main
   ```
   Antes de subir, confirme con `git status` que **`.env` no aparece**.
3. **Crear la base de datos PostgreSQL** en Render: *New → PostgreSQL* (nombre `dermacare-db`, plan Free). Copie la **Internal Database URL**.
4. **Crear el servicio web**: *New → Web Service*.
5. **Conectar con GitHub**: autorice Render y elija el repositorio. Configure:
   - Runtime: **Node** · Root Directory: *(vacío)*
   - Build Command: `npm run build` · Start Command: `npm start`
   - Health Check Path: `/api/salud`
6. **Variables de entorno** (*Environment*): `NODE_ENV=production`, `DATABASE_URL=<Internal Database URL>`, `DATABASE_SSL=true`, `JWT_SECRET=<clave aleatoria>`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SEED_DEMO_DATA=true`, `DEMO_PASSWORD`, `APP_TIMEZONE=America/Santo_Domingo`.
   Para generar la clave: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
7. **Script SQL / migraciones**: no hace falta ningún paso manual. Al arrancar, el servidor ejecuta `database/dermacare.sql` (idempotente), crea el administrador y, si `SEED_DEMO_DATA=true` y la base está vacía, carga los datos ficticios. Si quiere hacerlo a mano: `psql "<External Database URL>" -f database/dermacare.sql`.
   > Alternativa: *New → Blueprint* con `render.yaml` crea la base de datos y el servicio a la vez. Solo tendrá que completar `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `DEMO_PASSWORD`.
8. **Desplegar**: pulse *Create Web Service*. Los registros deben mostrar `Esquema verificado` y `Servidor escuchando`.
9. **Enlace público**: Render asigna una URL del tipo `https://dermacare.onrender.com`.
10. **Probar el sistema publicado**: abra `<URL>/api/salud` (debe responder `{"estado":"ok"}`), inicie sesión con cada rol y repita los procesos A, B y C. También puede ejecutar `BASE_URL=<URL> ADMIN_PASSWORD=... DEMO_PASSWORD=... npm test`.

Notas: el plan Free de Render suspende el servicio cuando está inactivo (la primera carga tarda unos segundos) y la base de datos gratuita tiene vencimiento. Consulte las condiciones vigentes en Render.

## 9. Seguridad

- Contraseñas con bcrypt (12 rondas); nunca se devuelven en la API.
- JWT firmado con `JWT_SECRET`, en una cookie `httpOnly`, `SameSite=Strict` y `Secure` en producción.
- Helmet con una política CSP estricta (sin scripts en línea ni CDNs: Bootstrap, los iconos, Chart.js y las fuentes se sirven desde `node_modules`).
- Límite de intentos de inicio de sesión; mensajes de error genéricos en producción.
- Todas las consultas SQL son parametrizadas (`$1, $2…`).
- Validación en el navegador (HTML5) y en el servidor (validadores propios y restricciones `CHECK`/`UNIQUE`/`FK` en PostgreSQL).
- Información médica limitada a administradores y al dermatólogo tratante; los accesos al historial quedan auditados.
