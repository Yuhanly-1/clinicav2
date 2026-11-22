/* DermaCare — Inicio de sesión y redirección inicial */
(function () {
  const App_HOME = { admin: '/pages/dashboard.html', dermatologo: '/pages/citas.html', recepcionista: '/pages/citas.html' };
  const form = document.getElementById('loginForm');

  // index.html: redirigir según la sesión
  if (!form) {
    API.get('/auth/me')
      .then((s) => { window.location.replace(App_HOME[s.usuario.rol]); })
      .catch(() => { window.location.replace('/login.html'); });
    return;
  }

  if (UI.param('expirada')) UI.toast('Su sesión ha expirado. Inicie sesión nuevamente.', 'warning');

  // Si ya hay sesión activa, ir directamente al inicio
  API.get('/auth/me').then((s) => window.location.replace(App_HOME[s.usuario.rol])).catch(() => {});

  document.getElementById('pwToggle').addEventListener('click', () => {
    const pw = form.querySelector('[name="password"]');
    const show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    document.querySelector('#pwToggle i').className = show ? 'bi bi-eye-slash' : 'bi bi-eye';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!UI.validateForm(form)) return;
    const btn = form.querySelector('[type="submit"]');
    UI.setLoading(btn, true, 'Verificando...');
    try {
      const r = await API.post('/auth/login', UI.formData(form));
      UI.toast(`Bienvenido(a), ${r.usuario.nombre}`);
      window.location.href = App_HOME[r.usuario.rol];
    } catch (err) {
      UI.showFormErrors(form, err);
      UI.setLoading(btn, false);
    }
  });
})();
