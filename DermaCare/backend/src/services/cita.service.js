const { query, withTransaction } = require('../config/database');
const { badRequest, conflict, notFound } = require('../utils/httpError');
const citaModel = require('../models/cita.model');

const SLOT_STEP_MIN = 30;

const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/**
 * Valida y guarda (crea o reprograma) una cita dentro de una transacción.
 * - Bloqueo consultivo por dermatólogo: serializa solicitudes simultáneas.
 * - La restricción EXCLUDE de la tabla `citas` es la garantía final en PostgreSQL.
 */
async function guardarCita({ paciente_id, dermatologo_id, fecha, hora, duracion, motivo }, user, citaId = null) {
  return withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(7001, $1)', [dermatologo_id]);

    const pac = await client.query('SELECT activo FROM pacientes WHERE id = $1', [paciente_id]);
    if (!pac.rows.length) throw badRequest('El paciente seleccionado no existe');
    if (!pac.rows[0].activo) throw badRequest('El paciente seleccionado está inactivo');

    const der = await client.query('SELECT activo FROM dermatologos WHERE id = $1', [dermatologo_id]);
    if (!der.rows.length) throw badRequest('El dermatólogo seleccionado no existe');
    if (!der.rows[0].activo) throw badRequest('El dermatólogo seleccionado está inactivo');

    const { rows: t } = await client.query(
      `SELECT ($1::date + $2::time) AS inicio,
              ($1::date + $2::time + make_interval(mins => $3)) AS fin,
              ($1::date + $2::time) > LOCALTIMESTAMP AS futura,
              EXTRACT(DOW FROM $1::date)::int AS dow`,
      [fecha, hora, duracion]
    );
    const { inicio, fin, futura, dow } = t[0];
    if (!futura) throw badRequest('La fecha y hora de la cita deben ser posteriores al momento actual');
    if (fin.slice(0, 10) !== fecha && fin.slice(11, 16) !== '00:00') {
      throw badRequest('La cita debe terminar el mismo día');
    }

    const horario = await client.query(
      `SELECT 1 FROM horarios WHERE dermatologo_id = $1 AND dia_semana = $2
          AND hora_inicio <= $3::time AND hora_fin >= ($3::time + make_interval(mins => $4))
          AND ($3::time + make_interval(mins => $4)) > $3::time`,
      [dermatologo_id, dow, hora, duracion]
    );
    if (!horario.rows.length) {
      throw badRequest('El horario solicitado está fuera del horario de atención configurado para el dermatólogo');
    }

    const choque = await client.query(
      `SELECT id, to_char(fecha_inicio, 'HH24:MI') AS ini, to_char(fecha_fin, 'HH24:MI') AS fin
         FROM citas
        WHERE dermatologo_id = $1 AND estado <> 'Cancelada' AND id <> $4
          AND tsrange(fecha_inicio, fecha_fin) && tsrange($2::timestamp, $3::timestamp)
        LIMIT 1`,
      [dermatologo_id, inicio, fin, citaId || 0]
    );
    if (choque.rows.length) {
      const c = choque.rows[0];
      throw conflict(`El dermatólogo ya tiene una cita de ${c.ini} a ${c.fin}. Seleccione otro horario.`);
    }

    let id = citaId;
    if (citaId) {
      await client.query(
        `UPDATE citas SET paciente_id = $2, dermatologo_id = $3, fecha_inicio = $4, fecha_fin = $5,
                motivo = $6, actualizado_en = CURRENT_TIMESTAMP WHERE id = $1`,
        [citaId, paciente_id, dermatologo_id, inicio, fin, motivo]
      );
    } else {
      const ins = await client.query(
        `INSERT INTO citas (paciente_id, dermatologo_id, fecha_inicio, fecha_fin, motivo, estado, creado_por)
         VALUES ($1, $2, $3, $4, $5, 'Pendiente', $6) RETURNING id`,
        [paciente_id, dermatologo_id, inicio, fin, motivo, user.id]
      );
      id = ins.rows[0].id;
    }
    return citaModel.findById(id, client);
  });
}

/** Horarios configurados, citas ocupadas y espacios libres de un día. */
async function disponibilidad(dermatologoId, fecha, duracion, excluirCitaId = 0) {
  const der = await query('SELECT id, activo, nombres, apellidos FROM dermatologos WHERE id = $1', [dermatologoId]);
  if (!der.rows.length) throw notFound('Dermatólogo no encontrado');

  const { rows: meta } = await query(
    `SELECT EXTRACT(DOW FROM $1::date)::int AS dow, CURRENT_DATE::text AS hoy,
            to_char(LOCALTIMESTAMP, 'HH24:MI') AS ahora`,
    [fecha]
  );
  const { dow, hoy, ahora } = meta[0];

  const { rows: horarios } = await query(
    `SELECT to_char(hora_inicio, 'HH24:MI') AS hora_inicio, to_char(hora_fin, 'HH24:MI') AS hora_fin
       FROM horarios WHERE dermatologo_id = $1 AND dia_semana = $2 ORDER BY hora_inicio`,
    [dermatologoId, dow]
  );
  const { rows: ocupadas } = await query(
    `SELECT c.id, to_char(c.fecha_inicio, 'HH24:MI') AS hora_inicio, to_char(c.fecha_fin, 'HH24:MI') AS hora_fin, c.estado
       FROM citas c
      WHERE c.dermatologo_id = $1 AND c.fecha_inicio::date = $2::date AND c.estado <> 'Cancelada' AND c.id <> $3
      ORDER BY c.fecha_inicio`,
    [dermatologoId, fecha, excluirCitaId]
  );

  const libres = [];
  const minAhora = fecha === hoy ? toMin(ahora) : fecha < hoy ? 24 * 60 : -1;
  for (const h of horarios) {
    for (let s = toMin(h.hora_inicio); s + duracion <= toMin(h.hora_fin); s += SLOT_STEP_MIN) {
      const e = s + duracion;
      if (s <= minAhora) continue;
      const choca = ocupadas.some((o) => s < toMin(o.hora_fin) && e > toMin(o.hora_inicio));
      if (!choca) libres.push(toHHMM(s));
    }
  }
  return {
    dermatologo: { id: der.rows[0].id, nombre: `${der.rows[0].nombres} ${der.rows[0].apellidos}`, activo: der.rows[0].activo },
    fecha,
    duracion,
    dia_semana: dow,
    horarios,
    ocupadas,
    libres,
  };
}

module.exports = { guardarCita, disponibilidad };
