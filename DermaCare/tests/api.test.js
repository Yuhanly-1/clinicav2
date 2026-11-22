/**
 * Pruebas de integración de la API de DermaCare (node:test + fetch).
 * Requieren el servidor en marcha y los datos demo cargados.
 *
 *   BASE_URL=http://localhost:3000 ADMIN_EMAIL=... ADMIN_PASSWORD=... DEMO_PASSWORD=... npm test
 */
const test = require('node:test');
const assert = require('node:assert');

const BASE = (process.env.BASE_URL || 'http://localhost:3000') + '/api';
const ADMIN = { email: process.env.ADMIN_EMAIL || 'admin@dermacare.demo', password: process.env.ADMIN_PASSWORD };
const RECEP = { email: 'recepcion@dermacare.demo', password: process.env.DEMO_PASSWORD };
const DERM = { email: 'dra.martinez@dermacare.demo', password: process.env.DEMO_PASSWORD };

async function login(cred) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cred),
  });
  assert.strictEqual(r.status, 200, `login ${cred.email}`);
  return r.headers.get('set-cookie').split(';')[0];
}

const call = (cookie, method, path, body) =>
  fetch(BASE + path, {
    method,
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

// Próximo lunes (dentro del horario semanal de los datos demo)
function nextMonday(weeksAhead = 1) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7) + 7 * (weeksAhead - 1));
  return d.toISOString().slice(0, 10);
}

test('autenticación: credenciales inválidas y rutas protegidas', async () => {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN.email, password: 'incorrecta' }),
  });
  assert.strictEqual(r.status, 401);
  assert.strictEqual((await fetch(`${BASE}/pacientes`)).status, 401);
});

test('autorización por roles validada en el backend', async () => {
  const recep = await login(RECEP);
  const derm = await login(DERM);
  assert.strictEqual((await call(recep, 'GET', '/reportes/citas')).status, 403);
  assert.strictEqual((await call(recep, 'GET', '/pacientes/1/historial')).status, 403);
  assert.strictEqual((await call(derm, 'GET', '/usuarios')).status, 403);
  assert.strictEqual((await call(derm, 'POST', '/citas', {})).status, 403);
});

test('dashboard con estadísticas reales', async () => {
  const admin = await login(ADMIN);
  const r = await call(admin, 'GET', '/dashboard/estadisticas');
  assert.strictEqual(r.status, 200);
  const s = await r.json();
  assert.ok(Number.isInteger(s.total_pacientes));
});

test('CRUD paciente + validaciones + cita sin superposición + consulta', async () => {
  const recep = await login(RECEP);
  const derm = await login(DERM);
  const stamp = Date.now().toString().slice(-7);

  const invalid = await call(recep, 'POST', '/pacientes', { nombres: 'A', email: 'malo' });
  assert.strictEqual(invalid.status, 400);

  const pr = await call(recep, 'POST', '/pacientes', {
    nombres: 'TEST Prueba', apellidos: `Automatizada ${stamp}`, cedula: `TST-${stamp}`,
    fecha_nacimiento: '1990-05-05', sexo: 'F', telefono: '809-555-0000',
  });
  assert.strictEqual(pr.status, 201);
  const paciente = await pr.json();

  const dup = await call(recep, 'POST', '/pacientes', {
    nombres: 'Otro', apellidos: 'Nombre', cedula: `TST-${stamp}`, fecha_nacimiento: '1991-01-01', sexo: 'M', telefono: '809-555-0001',
  });
  assert.strictEqual(dup.status, 409);

  const derms = await (await call(recep, 'GET', '/dermatologos?estado=activo')).json();
  const dermId = derms.find((d) => d.exequatur === 'EXQ-10234').id;
  const fecha = nextMonday(3);
  const disp = await (await call(recep, 'GET', `/citas/disponibilidad?dermatologo_id=${dermId}&fecha=${fecha}&duracion=30`)).json();
  assert.ok(disp.libres.length > 0, 'debe haber espacios libres');
  const hora = disp.libres[disp.libres.length - 1];

  const body = { paciente_id: paciente.id, dermatologo_id: dermId, fecha, hora, duracion: 30, motivo: 'TEST automatizado' };
  const results = await Promise.all([1, 2, 3, 4].map(() => call(recep, 'POST', '/citas', body)));
  const codes = results.map((r) => r.status).sort();
  assert.deepStrictEqual(codes, [201, 409, 409, 409], 'solo una cita simultánea debe guardarse');
  const cita = await results.find((r) => r.status === 201).json();

  const start = await call(derm, 'PATCH', `/citas/${cita.id}/estado`, { estado: 'En consulta' });
  assert.strictEqual(start.status, 200);
  const cons = await call(derm, 'POST', '/consultas', {
    cita_id: cita.id, motivo: 'TEST', sintomas: 'Prurito', examen_dermatologico: 'Eritema leve',
    tratamiento: 'Emolientes', diagnosticos: [{ descripcion: 'Dermatitis de prueba', codigo_cie10: 'L30.9' }],
  });
  assert.strictEqual(cons.status, 201);
  const again = await call(derm, 'POST', '/consultas', {
    cita_id: cita.id, motivo: 'TEST', sintomas: 'x x x', examen_dermatologico: 'x x x', tratamiento: 'x x x', diagnosticos: [{ descripcion: 'abc' }],
  });
  assert.strictEqual(again.status, 409, 'no se permiten consultas duplicadas');

  const hist = await (await call(derm, 'GET', `/pacientes/${paciente.id}/historial`)).json();
  assert.strictEqual(hist.consultas.length, 1);
  assert.strictEqual(hist.citas[0].estado, 'Completada');

  const off = await call(recep, 'PATCH', `/pacientes/${paciente.id}/estado`, { activo: false });
  assert.strictEqual(off.status, 200);
});

test('reportes Excel y PDF', async () => {
  const admin = await login(ADMIN);
  for (const [path, type] of [['/reportes/pacientes', 'spreadsheetml'], ['/reportes/citas', 'spreadsheetml'], ['/reportes/dermatologos', 'spreadsheetml'], ['/reportes/consultas', 'pdf'], ['/reportes/actividad', 'pdf']]) {
    const r = await call(admin, 'GET', path);
    assert.strictEqual(r.status, 200, path);
    assert.ok(r.headers.get('content-type').includes(type), path);
  }
});
