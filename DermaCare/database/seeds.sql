-- =============================================================
--  DermaCare - Datos iniciales FICTICIOS para demostración
--  Requiere que existan los usuarios demo (los crea el script
--  `npm run db:seed`, que cifra las contraseñas con bcrypt).
--  Las fechas son relativas a CURRENT_DATE para que el dashboard
--  siempre tenga actividad reciente.
-- =============================================================

-- Dermatólogos ficticios (dos asociados a usuarios demo)
INSERT INTO dermatologos (nombres, apellidos, exequatur, especialidad, telefono, email, usuario_id)
VALUES
 ('Laura',  'Martínez Peña', 'EXQ-10234', 'Dermatología clínica',    '809-555-0101', 'dra.martinez@dermacare.demo',
    (SELECT id FROM usuarios WHERE lower(email) = 'dra.martinez@dermacare.demo')),
 ('Carlos', 'Santos Reyes',  'EXQ-20981', 'Dermatología pediátrica', '809-555-0102', 'dr.santos@dermacare.demo',
    (SELECT id FROM usuarios WHERE lower(email) = 'dr.santos@dermacare.demo')),
 ('Ana',    'Rodríguez Gil', 'EXQ-31577', 'Dermatología estética',   '809-555-0103', 'dra.rodriguez@dermacare.demo', NULL)
ON CONFLICT DO NOTHING;

-- Horarios semanales (lunes = 1 ... sábado = 6)
INSERT INTO horarios (dermatologo_id, dia_semana, hora_inicio, hora_fin)
SELECT d.id, dia, h.ini, h.fin
FROM dermatologos d
CROSS JOIN generate_series(1, 5) AS dia
CROSS JOIN (VALUES (TIME '08:00', TIME '12:00'), (TIME '14:00', TIME '18:00')) AS h(ini, fin)
WHERE d.exequatur IN ('EXQ-10234', 'EXQ-20981', 'EXQ-31577')
  AND NOT EXISTS (SELECT 1 FROM horarios x WHERE x.dermatologo_id = d.id);

INSERT INTO horarios (dermatologo_id, dia_semana, hora_inicio, hora_fin)
SELECT d.id, 6, TIME '08:00', TIME '12:00' FROM dermatologos d
WHERE d.exequatur = 'EXQ-10234'
  AND NOT EXISTS (SELECT 1 FROM horarios x WHERE x.dermatologo_id = d.id AND x.dia_semana = 6);

-- Pacientes ficticios
INSERT INTO pacientes (nombres, apellidos, cedula, fecha_nacimiento, sexo, telefono, email, direccion, antecedentes, alergias)
VALUES
 ('María',     'González López',  '001-0000001-1', '1988-03-14', 'F', '809-555-1001', 'maria.gonzalez@correo.demo',  'Calle Duarte #12, Santo Domingo',    'Dermatitis atópica en la infancia',         'Penicilina'),
 ('José',      'Pérez Almonte',   '001-0000002-2', '1975-11-02', 'M', '809-555-1002', 'jose.perez@correo.demo',      'Av. Independencia #45, Santo Domingo', 'Hipertensión arterial controlada',          'Ninguna conocida'),
 ('Carmen',    'Díaz Herrera',    '001-0000003-3', '1992-07-21', 'F', '829-555-1003', 'carmen.diaz@correo.demo',     'Calle El Sol #8, Santiago',          'Acné juvenil tratado',                      'Sulfas'),
 ('Luis',      'Ramírez Castro',  '001-0000004-4', '1969-01-30', 'M', '829-555-1004', NULL,                          'Calle Mella #3, La Vega',            'Diabetes tipo 2',                           'Ninguna conocida'),
 ('Ana Sofía', 'Vargas Núñez',    '001-0000005-5', '2010-05-09', 'F', '849-555-1005', 'familia.vargas@correo.demo',  'Res. Las Palmas, Santo Domingo Este', 'Asma leve',                                 'Látex'),
 ('Pedro',     'Jiménez Rosario', '001-0000006-6', '1983-09-17', 'M', '809-555-1006', 'pedro.jimenez@correo.demo',   'Av. 27 de Febrero #210',             'Psoriasis diagnosticada en 2015',           'Ninguna conocida'),
 ('Lucía',     'Fernández Mota',  '001-0000007-7', '1996-12-03', 'F', '809-555-1007', 'lucia.fernandez@correo.demo', 'Calle Las Flores #5, San Cristóbal', 'Sin antecedentes relevantes',               'Ibuprofeno'),
 ('Miguel',    'Torres Batista',  '001-0000008-8', '1958-04-25', 'M', '829-555-1008', NULL,                          'Calle Principal #1, Baní',           'Exposición solar laboral prolongada',       'Ninguna conocida'),
 ('Valentina', 'Cruz Medina',     NULL,            '2016-08-11', 'F', '849-555-1009', 'familia.cruz@correo.demo',    'Calle 4 #22, Los Alcarrizos',        'Dermatitis del pañal recurrente',           'Ninguna conocida'),
 ('Ramón',     'Méndez Ureña',    '001-0000010-0', '1979-02-14', 'M', '809-555-1010', 'ramon.mendez@correo.demo',    'Av. Bolívar #77, Santo Domingo',     'Rosácea',                                   'Aspirina'),
 ('Gabriela',  'Santana Polanco', '001-0000011-1', '1990-10-28', 'F', '809-555-1011', 'gabriela.santana@correo.demo','Calle Sánchez #9, Puerto Plata',     'Melasma',                                   'Ninguna conocida'),
 ('Andrés',    'Morales Peguero', '001-0000012-2', '2001-06-06', 'M', '829-555-1012', 'andres.morales@correo.demo',  'Calle Restauración #14, Moca',       'Sin antecedentes relevantes',               'Ninguna conocida')
ON CONFLICT DO NOTHING;

-- Citas y consultas ficticias distribuidas en los últimos meses
DO $$
DECLARE
    derms   INTEGER[];
    pacs    INTEGER[];
    i       INTEGER;
    d       DATE;
    hora    TIME;
    est     VARCHAR(20);
    cid     INTEGER;
    consid  INTEGER;
    pac     INTEGER;
    der     INTEGER;
    rec     INTEGER;
    motivos TEXT[] := ARRAY['Control de acné','Revisión de lunar','Erupción en brazos','Picazón persistente','Manchas en el rostro','Caída de cabello','Control de psoriasis','Lesión por exposición solar'];
    diags   TEXT[] := ARRAY['Acné vulgar moderado','Nevo melanocítico benigno','Dermatitis de contacto','Urticaria crónica','Melasma','Alopecia areata','Psoriasis en placas','Queratosis actínica'];
    cies    TEXT[] := ARRAY['L70.0','D22.9','L25.9','L50.8','L81.1','L63.9','L40.0','L57.0'];
    trats   TEXT[] := ARRAY['Peróxido de benzoilo 5% gel nocturno durante 8 semanas','Vigilancia clínica; control en 6 meses','Evitar el agente irritante; hidrocortisona 1% crema por 7 días','Antihistamínico oral diario por 4 semanas','Protector solar FPS 50 y crema despigmentante','Corticoide tópico y control en 3 meses','Emolientes y corticoide tópico de mediana potencia','Crioterapia y protección solar estricta'];
BEGIN
    IF EXISTS (SELECT 1 FROM citas) THEN
        RETURN; -- ya existen datos, no duplicar
    END IF;

    SELECT array_agg(id ORDER BY id) INTO derms FROM dermatologos WHERE exequatur IN ('EXQ-10234','EXQ-20981','EXQ-31577');
    SELECT array_agg(id ORDER BY id) INTO pacs FROM pacientes;
    SELECT id INTO rec FROM usuarios WHERE lower(email) = 'recepcion@dermacare.demo';

    FOR i IN 0..55 LOOP
        d := CURRENT_DATE - 165 + i * 3;
        IF EXTRACT(DOW FROM d) = 0 THEN d := d + 1; END IF;      -- sin domingos
        hora := TIME '08:00' + (i % 4) * INTERVAL '1 hour';
        pac  := pacs[(i % array_length(pacs, 1)) + 1];
        der  := derms[(i % array_length(derms, 1)) + 1];

        IF d < CURRENT_DATE THEN
            est := CASE WHEN i % 7 = 0 THEN 'Cancelada' ELSE 'Completada' END;
        ELSE
            est := CASE WHEN i % 2 = 0 THEN 'Pendiente' ELSE 'Confirmada' END;
        END IF;

        INSERT INTO citas (paciente_id, dermatologo_id, fecha_inicio, fecha_fin, motivo, estado, creado_por, creado_en)
        VALUES (pac, der, d + hora, d + hora + INTERVAL '30 minutes', motivos[(i % 8) + 1], est, rec, (d - 7) + TIME '10:00')
        RETURNING id INTO cid;

        IF est = 'Completada' THEN
            INSERT INTO consultas (cita_id, paciente_id, dermatologo_id, fecha_atencion, motivo, sintomas, examen_dermatologico, tratamiento, observaciones)
            VALUES (cid, pac, der, d + hora + INTERVAL '5 minutes', motivos[(i % 8) + 1],
                    'Paciente refiere molestias de varias semanas de evolución.',
                    'Lesiones localizadas, sin signos de infección secundaria.',
                    trats[(i % 8) + 1], 'Datos ficticios de demostración.')
            RETURNING id INTO consid;
            INSERT INTO diagnosticos (consulta_id, descripcion, codigo_cie10, tipo)
            VALUES (consid, diags[(i % 8) + 1], cies[(i % 8) + 1], 'Principal');
        END IF;
    END LOOP;

    -- Citas del día de hoy
    INSERT INTO citas (paciente_id, dermatologo_id, fecha_inicio, fecha_fin, motivo, estado, creado_por) VALUES
      (pacs[1], derms[1], CURRENT_DATE + TIME '09:00', CURRENT_DATE + TIME '09:30', 'Control de dermatitis', 'Confirmada', rec),
      (pacs[6], derms[1], CURRENT_DATE + TIME '10:00', CURRENT_DATE + TIME '10:45', 'Control de psoriasis',  'Pendiente',  rec),
      (pacs[3], derms[2], CURRENT_DATE + TIME '15:00', CURRENT_DATE + TIME '15:30', 'Revisión de manchas',   'Pendiente',  rec);
END $$;
