-- =============================================================
--  DermaCare - Esquema de base de datos PostgreSQL
--  Script idempotente: puede ejecutarse varias veces sin perder datos.
-- =============================================================

-- Extensión necesaria para la restricción de exclusión (citas sin superposición)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- -------------------------------------------------------------
-- 1. ROLES
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id          SERIAL PRIMARY KEY,
    codigo      VARCHAR(20)  NOT NULL UNIQUE
                CHECK (codigo IN ('admin', 'dermatologo', 'recepcionista')),
    nombre      VARCHAR(50)  NOT NULL UNIQUE
);

INSERT INTO roles (codigo, nombre) VALUES
    ('admin', 'Administrador'),
    ('dermatologo', 'Dermatólogo'),
    ('recepcionista', 'Recepcionista')
ON CONFLICT (codigo) DO NOTHING;

-- -------------------------------------------------------------
-- 2. USUARIOS
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(120) NOT NULL CHECK (length(trim(nombre)) >= 3),
    email           VARCHAR(150) NOT NULL,
    password_hash   VARCHAR(100) NOT NULL,
    rol_id          INTEGER      NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    ultimo_acceso   TIMESTAMP,
    creado_en       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_email ON usuarios (lower(email));
CREATE INDEX IF NOT EXISTS ix_usuarios_rol ON usuarios (rol_id);

-- -------------------------------------------------------------
-- 3. PACIENTES
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pacientes (
    id                  SERIAL PRIMARY KEY,
    nombres             VARCHAR(80)  NOT NULL CHECK (length(trim(nombres)) >= 2),
    apellidos           VARCHAR(80)  NOT NULL CHECK (length(trim(apellidos)) >= 2),
    cedula              VARCHAR(20),
    fecha_nacimiento    DATE         NOT NULL CHECK (fecha_nacimiento >= DATE '1900-01-01'),
    sexo                CHAR(1)      NOT NULL CHECK (sexo IN ('M', 'F', 'O')),
    telefono            VARCHAR(20)  NOT NULL,
    email               VARCHAR(150),
    direccion           VARCHAR(255),
    antecedentes        TEXT,
    alergias            TEXT,
    fecha_registro      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    activo              BOOLEAN      NOT NULL DEFAULT TRUE,
    actualizado_en      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Cédula única cuando se proporciona (índice parcial)
CREATE UNIQUE INDEX IF NOT EXISTS ux_pacientes_cedula ON pacientes (cedula) WHERE cedula IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_pacientes_apellidos ON pacientes (lower(apellidos));
CREATE INDEX IF NOT EXISTS ix_pacientes_nombres ON pacientes (lower(nombres));
CREATE INDEX IF NOT EXISTS ix_pacientes_activo ON pacientes (activo);

-- -------------------------------------------------------------
-- 4. DERMATÓLOGOS
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dermatologos (
    id              SERIAL PRIMARY KEY,
    nombres         VARCHAR(80)  NOT NULL CHECK (length(trim(nombres)) >= 2),
    apellidos       VARCHAR(80)  NOT NULL CHECK (length(trim(apellidos)) >= 2),
    exequatur       VARCHAR(30)  NOT NULL,
    especialidad    VARCHAR(100) NOT NULL,
    telefono        VARCHAR(20)  NOT NULL,
    email           VARCHAR(150) NOT NULL,
    usuario_id      INTEGER      UNIQUE REFERENCES usuarios(id) ON DELETE SET NULL,
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_dermatologos_exequatur ON dermatologos (upper(exequatur));
CREATE INDEX IF NOT EXISTS ix_dermatologos_activo ON dermatologos (activo);

-- -------------------------------------------------------------
-- 5. HORARIOS DE ATENCIÓN (configurables por dermatólogo)
--    dia_semana: 0 = domingo ... 6 = sábado
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS horarios (
    id              SERIAL PRIMARY KEY,
    dermatologo_id  INTEGER  NOT NULL REFERENCES dermatologos(id) ON DELETE CASCADE,
    dia_semana      SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
    hora_inicio     TIME     NOT NULL,
    hora_fin        TIME     NOT NULL,
    CONSTRAINT ck_horario_rango CHECK (hora_fin > hora_inicio),
    CONSTRAINT ex_horario_solapado EXCLUDE USING gist (
        dermatologo_id WITH =,
        dia_semana WITH =,
        tsrange(DATE '2000-01-01' + hora_inicio, DATE '2000-01-01' + hora_fin) WITH &&
    )
);
CREATE INDEX IF NOT EXISTS ix_horarios_dermatologo ON horarios (dermatologo_id, dia_semana);

-- -------------------------------------------------------------
-- 6. CITAS
--    La restricción de exclusión impide, a nivel de PostgreSQL,
--    dos citas activas superpuestas para el mismo dermatólogo,
--    incluso con solicitudes simultáneas. Las canceladas no bloquean.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS citas (
    id              SERIAL PRIMARY KEY,
    paciente_id     INTEGER     NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
    dermatologo_id  INTEGER     NOT NULL REFERENCES dermatologos(id) ON DELETE RESTRICT,
    fecha_inicio    TIMESTAMP   NOT NULL,
    fecha_fin       TIMESTAMP   NOT NULL,
    motivo          VARCHAR(500) NOT NULL CHECK (length(trim(motivo)) >= 3),
    estado          VARCHAR(20) NOT NULL DEFAULT 'Pendiente'
                    CHECK (estado IN ('Pendiente', 'Confirmada', 'En consulta', 'Completada', 'Cancelada')),
    motivo_cancelacion VARCHAR(500),
    creado_por      INTEGER     REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_cita_rango CHECK (fecha_fin > fecha_inicio),
    CONSTRAINT ck_cita_mismo_dia CHECK (fecha_inicio::date = (fecha_fin - INTERVAL '1 second')::date),
    CONSTRAINT ex_cita_solapada EXCLUDE USING gist (
        dermatologo_id WITH =,
        tsrange(fecha_inicio, fecha_fin) WITH &&
    ) WHERE (estado <> 'Cancelada')
);
CREATE INDEX IF NOT EXISTS ix_citas_dermatologo_fecha ON citas (dermatologo_id, fecha_inicio);
CREATE INDEX IF NOT EXISTS ix_citas_paciente ON citas (paciente_id, fecha_inicio);
CREATE INDEX IF NOT EXISTS ix_citas_estado ON citas (estado);
CREATE INDEX IF NOT EXISTS ix_citas_fecha ON citas (fecha_inicio);

-- -------------------------------------------------------------
-- 7. CONSULTAS (una cita genera como máximo una consulta)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consultas (
    id                      SERIAL PRIMARY KEY,
    cita_id                 INTEGER   NOT NULL UNIQUE REFERENCES citas(id) ON DELETE RESTRICT,
    paciente_id             INTEGER   NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
    dermatologo_id          INTEGER   NOT NULL REFERENCES dermatologos(id) ON DELETE RESTRICT,
    fecha_atencion          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    motivo                  TEXT      NOT NULL,
    sintomas                TEXT      NOT NULL,
    examen_dermatologico    TEXT      NOT NULL,
    tratamiento             TEXT      NOT NULL,
    observaciones           TEXT,
    creado_por              INTEGER   REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_consultas_paciente ON consultas (paciente_id, fecha_atencion);
CREATE INDEX IF NOT EXISTS ix_consultas_dermatologo ON consultas (dermatologo_id, fecha_atencion);
CREATE INDEX IF NOT EXISTS ix_consultas_fecha ON consultas (fecha_atencion);

-- -------------------------------------------------------------
-- 8. DIAGNÓSTICOS (una consulta puede tener varios)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS diagnosticos (
    id              SERIAL PRIMARY KEY,
    consulta_id     INTEGER      NOT NULL REFERENCES consultas(id) ON DELETE CASCADE,
    descripcion     VARCHAR(500) NOT NULL CHECK (length(trim(descripcion)) >= 3),
    codigo_cie10    VARCHAR(10),
    tipo            VARCHAR(20)  NOT NULL DEFAULT 'Principal'
                    CHECK (tipo IN ('Principal', 'Secundario'))
);
CREATE INDEX IF NOT EXISTS ix_diagnosticos_consulta ON diagnosticos (consulta_id);

-- -------------------------------------------------------------
-- 9. AUDITORÍA (registro de acciones importantes)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auditoria (
    id          SERIAL PRIMARY KEY,
    usuario_id  INTEGER      REFERENCES usuarios(id) ON DELETE SET NULL,
    accion      VARCHAR(50)  NOT NULL,
    entidad     VARCHAR(50)  NOT NULL,
    entidad_id  INTEGER,
    detalle     VARCHAR(500),
    fecha       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_auditoria_fecha ON auditoria (fecha DESC);
