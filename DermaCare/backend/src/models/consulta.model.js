const { query } = require('../config/database');

const SELECT = `
  SELECT con.id, con.cita_id, con.paciente_id, con.dermatologo_id, con.fecha_atencion,
         con.motivo, con.sintomas, con.examen_dermatologico, con.tratamiento, con.observaciones, con.creado_en,
         (p.nombres || ' ' || p.apellidos) AS paciente_nombre, p.cedula AS paciente_cedula,
         (d.nombres || ' ' || d.apellidos) AS dermatologo_nombre,
         COALESCE((SELECT json_agg(json_build_object('id', dg.id, 'descripcion', dg.descripcion,
                    'codigo_cie10', dg.codigo_cie10, 'tipo', dg.tipo) ORDER BY dg.tipo, dg.id)
                   FROM diagnosticos dg WHERE dg.consulta_id = con.id), '[]'::json) AS diagnosticos
    FROM consultas con
    JOIN pacientes p ON p.id = con.paciente_id
    JOIN dermatologos d ON d.id = con.dermatologo_id`;

function buildFilters(user, f) {
  const params = [];
  const where = [];
  const add = (sql, val) => {
    params.push(val);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (user && user.rol === 'dermatologo') add('con.dermatologo_id = ?', user.dermatologo_id || 0);
  if (f.paciente_id) add('con.paciente_id = ?', f.paciente_id);
  if (f.dermatologo_id) add('con.dermatologo_id = ?', f.dermatologo_id);
  if (f.desde) add('con.fecha_atencion::date >= ?::date', f.desde);
  if (f.hasta) add('con.fecha_atencion::date <= ?::date', f.hasta);
  if (f.q) add(`((p.nombres || ' ' || p.apellidos) ILIKE ?)`, `%${f.q}%`);
  return { where: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

async function list(user, filters) {
  const { where, params } = buildFilters(user, filters);
  params.push(Math.min(Number(filters.limit) || 500, 2000));
  return (await query(`${SELECT} ${where} ORDER BY con.fecha_atencion DESC LIMIT $${params.length}`, params)).rows;
}

async function findById(user, id) {
  const params = [id];
  let extra = '';
  if (user.rol === 'dermatologo') {
    params.push(user.dermatologo_id || 0);
    extra = ' AND con.dermatologo_id = $2';
  }
  const { rows } = await query(`${SELECT} WHERE con.id = $1${extra}`, params);
  return rows[0] || null;
}

module.exports = { list, findById, buildFilters };
