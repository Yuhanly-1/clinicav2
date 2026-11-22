/* DermaCare — Estructura común: sidebar por rol, encabezado, notificaciones y cierre de sesión */
(function () {
  const MENU = [
    { section: 'Principal' },
    { id: 'dashboard', href: '/pages/dashboard.html', icon: 'grid-1x2', label: 'Dashboard', roles: ['admin'] },
    { id: 'citas', href: '/pages/citas.html', icon: 'calendar2-week', label: 'Citas y agenda', roles: ['admin', 'recepcionista'] },
    { id: 'citas', href: '/pages/citas.html', icon: 'calendar2-week', label: 'Mi agenda', roles: ['dermatologo'] },
    { id: 'pacientes', href: '/pages/pacientes.html', icon: 'people', label: 'Pacientes', roles: ['admin', 'recepcionista', 'dermatologo'] },
    { id: 'dermatologos', href: '/pages/dermatologos.html', icon: 'person-badge', label: 'Dermatólogos', roles: ['admin', 'recepcionista'] },
    { section: 'Clínica', roles: ['admin', 'dermatologo'] },
    { id: 'consultas', href: '/pages/consultas.html', icon: 'clipboard2-pulse', label: 'Consultas', roles: ['admin', 'dermatologo'] },
    { id: 'historial', href: '/pages/historial.html', icon: 'journal-medical', label: 'Historial médico', roles: ['admin', 'dermatologo'] },
    { section: 'Administración', roles: ['admin'] },
    { id: 'usuarios', href: '/pages/usuarios.html', icon: 'shield-lock', label: 'Usuarios', roles: ['admin'] },
    { id: 'reportes', href: '/pages/reportes.html', icon: 'file-earmark-bar-graph', label: 'Reportes', roles: ['admin'] },
  ];

  const HOME = { admin: '/pages/dashboard.html', dermatologo: '/pages/citas.html', recepcionista: '/pages/citas.html' };

  function renderSidebar(user, current) {
    const items = MENU.filter((m) => !m.roles || m.roles.includes(user.rol))
      .map((m) =>
        m.section
          ? `<li class="sidebar-section">${m.section}</li>`
          : `<li><a href="${m.href}" class="${m.id === current ? 'active' : ''}" data-testid="nav-${m.id}"><i class="bi bi-${m.icon}"></i><span>${m.label}</span></a></li>`
      ).join('');
    document.getElementById('sidebar').innerHTML = `
      <a class="sidebar-brand" href="${HOME[user.rol]}" data-testid="sidebar-logo">
        <span class="brand-mark"><i class="bi bi-heart-pulse"></i></span>
        <span class="brand-name">DermaCare<small>CLÍNICA DERMATOLÓGICA</small></span>
      </a>
      <ul class="sidebar-nav">${items}</ul>
      <div class="sidebar-footer"><i class="bi bi-shield-check me-1"></i> Sesión protegida · ${UI.esc(user.rol_nombre)}</div>`;
  }

  function renderTopbar(user, hoy, title) {
    document.getElementById('topbar').innerHTML = `
      <button class="btn btn-soft btn-icon d-lg-none" id="menuToggle" aria-label="Abrir menú" data-testid="mobile-menu-toggle"><i class="bi bi-list fs-5"></i></button>
      <div class="me-auto">
        <p class="topbar-title" data-testid="topbar-title">${UI.esc(title)}</p>
        <div class="topbar-date d-none d-sm-block" data-testid="topbar-date"><i class="bi bi-calendar3 me-1"></i>${UI.longDate(hoy)}</div>
      </div>
      <div class="dropdown">
        <button class="btn btn-soft btn-icon notif-btn" data-bs-toggle="dropdown" aria-label="Notificaciones" data-testid="notifications-btn">
          <i class="bi bi-bell"></i><span class="notif-dot d-none" id="notifCount" data-testid="notifications-count"></span>
        </button>
        <div class="dropdown-menu dropdown-menu-end p-0 shadow border-0" style="width:300px" data-testid="notifications-menu">
          <div class="px-3 py-2 border-bottom fw-semibold small">Notificaciones de hoy</div>
          <div id="notifList" class="p-2 small text-muted">Cargando...</div>
        </div>
      </div>
      <div class="dropdown">
        <button class="user-chip" data-bs-toggle="dropdown" data-testid="user-menu-btn">
          <span class="avatar">${UI.esc(UI.initials(user.nombre))}</span>
          <span class="u-text text-start"><span class="u-name d-block" data-testid="current-user-name">${UI.esc(user.nombre)}</span><span class="u-role" data-testid="current-user-role">${UI.esc(user.rol_nombre)}</span></span>
          <i class="bi bi-chevron-down small text-muted me-1"></i>
        </button>
        <ul class="dropdown-menu dropdown-menu-end shadow border-0">
          <li><span class="dropdown-item-text small text-muted">${UI.esc(user.email)}</span></li>
          <li><hr class="dropdown-divider"></li>
          <li><button class="dropdown-item text-danger" id="logoutBtn" data-testid="logout-btn"><i class="bi bi-box-arrow-right me-2"></i>Cerrar sesión</button></li>
        </ul>
      </div>`;

    document.getElementById('menuToggle').addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
    document.getElementById('sidebarBackdrop').addEventListener('click', () => document.body.classList.remove('sidebar-open'));
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      try { await API.post('/auth/logout'); } catch { /* sin acción */ }
      window.location.href = '/login.html';
    });
  }

  async function loadNotifications() {
    const list = document.getElementById('notifList');
    try {
      const n = await API.get('/dashboard/notificaciones');
      const dot = document.getElementById('notifCount');
      if (n.total > 0) {
        dot.textContent = n.total;
        dot.classList.remove('d-none');
      }
      list.innerHTML = n.items.length
        ? n.items.map((i) => `<a href="/pages/citas.html?fecha=hoy" class="dropdown-item rounded small py-2 text-wrap"><i class="bi bi-dot text-${i.tipo}"></i>${UI.esc(i.texto)}</a>`).join('')
        : '<div class="p-2 text-muted"><i class="bi bi-check2-circle me-1"></i>No hay notificaciones pendientes</div>';
    } catch {
      list.textContent = 'No se pudieron cargar las notificaciones';
    }
  }

  /** Inicializa la página: valida sesión y rol, dibuja la estructura y resuelve la sesión. */
  async function init() {
    const body = document.body;
    const allowed = (body.dataset.roles || '').split(',').filter(Boolean);
    let session;
    try {
      session = await API.get('/auth/me');
    } catch {
      window.location.href = '/login.html';
      return new Promise(() => {});
    }
    const user = session.usuario;
    if (allowed.length && !allowed.includes(user.rol)) {
      window.location.href = HOME[user.rol];
      return new Promise(() => {});
    }
    renderSidebar(user, body.dataset.page);
    renderTopbar(user, session.hoy, body.dataset.title || 'DermaCare');
    loadNotifications();
    document.querySelectorAll('[data-roles-show]').forEach((el) => {
      if (!el.dataset.rolesShow.split(',').includes(user.rol)) el.remove();
    });
    body.classList.add('ready');
    return session;
  }

  window.App = { ready: init(), HOME };
})();
