const { parseId } = require('../utils/validators');
const { asyncHandler, notFound } = require('../utils/httpError');
const { query } = require('../config/database');

/** Diagnósticos registrados (consulta de catálogo de diagnósticos por paciente o consulta). */
const list = asyncHandler(async (req, res) => {
  const params = [];
  const where = [];
  if (req.query.paciente_id) {
    params.push(parseId(req.query.paciente_id));
    where.push(`con.paciente_id = $${params.length}`);
  }
  if (req.query.consulta_id) {
    params.push(parseId(req.query.consulta_id));
    where.push(`dg.consulta_id = $${params.length}`);
  }
  if (req.user.rol === 'dermatologo') {
    params.push(req.user.dermatologo_id || 0);
    where.push(`con.dermatologo_id = $${params.length}`);
  }
  const { rows } = await query(
    `SELECT dg.id, dg.consulta_id, dg.descripcion, dg.codigo_cie10, dg.tipo, con.fecha_atencion,
            (p.nombres || ' ' || p.apellidos) AS paciente_nombre
       FROM diagnosticos dg
       JOIN consultas con ON con.id = dg.consulta_id
       JOIN pacientes p ON p.id = con.paciente_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY con.fecha_atencion DESC LIMIT 500`,
    params
  );
  res.json(rows);
});

/** Diagnósticos más frecuentes (estadística). */
const frecuentes = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT dg.descripcion, dg.codigo_cie10, COUNT(*)::int AS total
       FROM diagnosticos dg GROUP BY dg.descripcion, dg.codigo_cie10 ORDER BY total DESC LIMIT 10`
  );
  res.json(rows);
});

const getOne = asyncHandler(async (req, res) => {
  const params = [parseId(req.params.id)];
  let extra = '';
  if (req.user.rol === 'dermatologo') {
    params.push(req.user.dermatologo_id || 0);
    extra = ' AND con.dermatologo_id = $2';
  }
  const { rows } = await query(
    `SELECT dg.* FROM diagnosticos dg JOIN consultas con ON con.id = dg.consulta_id WHERE dg.id = $1${extra}`,
    params
  );
  if (!rows.length) throw notFound('Diagnóstico no encontrado');
  res.json(rows[0]);
});

module.exports = { list, frecuentes, getOne };
