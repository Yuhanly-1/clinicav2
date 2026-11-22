/* DermaCare — Utilidades de interfaz (toasts, confirmaciones, formularios, formatos) */
(function () {
  const esc = (v) =>
    String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  function fmtDate(s) {
    if (!s) return '—';
    const [y, m, d] = String(s).slice(0, 10).split('-');
    return `${d} ${MESES[Number(m) - 1]} ${y}`;
  }
  function fmtDateTime(s) {
    if (!s) return '—';
    return `${fmtDate(s)} · ${String(s).slice(11, 16)}`;
  }
  function longDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${DIAS[dow]}, ${d} de ${meses[m - 1]} de ${y}`;
  }
  const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');

  function badgeEstado(estado) {
    return `<span class="badge-estado estado-${slug(estado)}" data-testid="badge-estado">${esc(estado)}</span>`;
  }
  function badgeActivo(activo) {
    return activo
      ? '<span class="badge-estado estado-activo" data-testid="badge-activo">Activo</span>'
      : '<span class="badge-estado estado-inactivo" data-testid="badge-inactivo">Inactivo</span>';
  }
  const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

  function toast(message, type = 'success') {
    let box = document.getElementById('toast-container');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toast-container';
      box.className = 'toast-container position-fixed bottom-0 end-0 p-3';
      box.style.zIndex = 1090;
      document.body.appendChild(box);
    }
    const icons = { success: 'check-circle-fill', danger: 'exclamation-octagon-fill', warning: 'exclamation-triangle-fill', info: 'info-circle-fill' };
    const colors = { success: 'text-success', danger: 'text-danger', warning: 'text-warning', info: 'text-primary' };
    const el = document.createElement('div');
    el.className = 'toast align-items-center bg-white';
    el.setAttribute('role', 'alert');
    el.setAttribute('data-testid', `toast-${type}`);
    el.innerHTML = `<div class="d-flex"><div class="toast-body d-flex gap-2 align-items-start">
        <i class="bi bi-${icons[type] || icons.info} ${colors[type] || ''} fs-5"></i><span>${esc(message)}</span></div>
        <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast" aria-label="Cerrar"></button></div>`;
    box.appendChild(el);
    const t = new bootstrap.Toast(el, { delay: 4500 });
    el.addEventListener('hidden.bs.toast', () => el.remove());
    t.show();
  }

  function errorToast(err, fallback = 'Ocurrió un error') {
    toast((err && err.message) || fallback, 'danger');
  }

  /** Diálogo de confirmación basado en un modal de Bootstrap. Devuelve una promesa booleana. */
  function confirmDialog({ title = '¿Confirmar acción?', message = '', confirmText = 'Confirmar', variant = 'primary', icon = 'question-circle' } = {}) {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.innerHTML = `<div class="modal fade" tabindex="-1" data-testid="confirm-modal"><div class="modal-dialog modal-dialog-centered"><div class="modal-content">
        <div class="modal-body text-center p-4">
          <div class="mx-auto mb-3 kpi-icon bg-${variant}-subtle text-${variant}"><i class="bi bi-${icon}"></i></div>
          <h5 class="font-heading mb-2">${esc(title)}</h5><p class="text-muted mb-0">${message}</p></div>
        <div class="modal-footer justify-content-center border-0 pt-0 pb-4">
          <button type="button" class="btn btn-soft px-4" data-act="no" data-testid="confirm-cancel-btn">Cancelar</button>
          <button type="button" class="btn btn-${variant} px-4" data-act="yes" data-testid="confirm-accept-btn">${esc(confirmText)}</button>
        </div></div></div></div>`;
      const modalEl = wrap.firstElementChild;
      document.body.appendChild(modalEl);
      const modal = new bootstrap.Modal(modalEl);
      let result = false;
      modalEl.addEventListener('click', (e) => {
        const act = e.target.closest('[data-act]');
        if (!act) return;
        result = act.dataset.act === 'yes';
        modal.hide();
      });
      modalEl.addEventListener('hidden.bs.modal', () => {
        modalEl.remove();
        resolve(result);
      });
      modal.show();
    });
  }

  function setLoading(btn, loading, text) {
    if (!btn) return;
    if (loading) {
      btn.dataset.original = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${esc(text || 'Guardando...')}`;
    } else {
      btn.disabled = false;
      if (btn.dataset.original) btn.innerHTML = btn.dataset.original;
    }
  }

  function clearFormErrors(form) {
    form.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
    form.querySelectorAll('.invalid-feedback[data-auto]').forEach((el) => el.remove());
    const alert = form.querySelector('.form-alert');
    if (alert) alert.classList.add('d-none');
  }

  function fieldError(form, name, msg) {
    const el = form.querySelector(`[name="${name}"]`);
    if (!el) return false;
    el.classList.add('is-invalid');
    const fb = document.createElement('div');
    fb.className = 'invalid-feedback';
    fb.dataset.auto = '1';
    fb.textContent = msg;
    (el.closest('.input-group') || el).insertAdjacentElement('afterend', fb);
    return true;
  }

  /** Muestra errores del backend (detalles por campo) o un mensaje general en el formulario. */
  function showFormErrors(form, err) {
    clearFormErrors(form);
    let shown = false;
    if (err && err.detalles) {
      Object.entries(err.detalles).forEach(([k, v]) => {
        if (fieldError(form, k, v)) shown = true;
      });
    }
    const alert = form.querySelector('.form-alert');
    if (alert) {
      alert.textContent = (err && err.message) || 'Revise los datos del formulario';
      alert.classList.remove('d-none');
    } else if (!shown) {
      errorToast(err);
    }
  }

  /** Validación visual en el navegador (HTML5) antes de enviar. */
  function validateForm(form) {
    clearFormErrors(form);
    let ok = true;
    form.querySelectorAll('input, select, textarea').forEach((el) => {
      if (el.name && !el.checkValidity()) {
        ok = false;
        fieldError(form, el.name, el.validationMessage);
      }
    });
    return ok;
  }

  function formData(form) {
    const out = {};
    new FormData(form).forEach((v, k) => {
      out[k] = typeof v === 'string' ? v.trim() : v;
    });
    return out;
  }

  function fillForm(form, obj) {
    Object.entries(obj || {}).forEach(([k, v]) => {
      const el = form.querySelector(`[name="${k}"]`);
      if (el) el.value = v === null || v === undefined ? '' : String(v).slice(0, el.type === 'date' ? 10 : undefined);
    });
  }

  const tableLoading = (tbody, cols) => {
    tbody.innerHTML = `<tr><td colspan="${cols}"><div class="loading-overlay" data-testid="table-loading"><span class="spinner-border spinner-border-sm"></span> Cargando información...</div></td></tr>`;
  };
  const tableEmpty = (tbody, cols, msg = 'No se encontraron registros', icon = 'inbox') => {
    tbody.innerHTML = `<tr><td colspan="${cols}"><div class="empty-state" data-testid="table-empty"><i class="bi bi-${icon}"></i>${esc(msg)}</div></td></tr>`;
  };
  const tableError = (tbody, cols, err) => {
    tbody.innerHTML = `<tr><td colspan="${cols}"><div class="empty-state text-danger" data-testid="table-error"><i class="bi bi-wifi-off"></i>${esc((err && err.message) || 'No se pudo cargar la información')}</div></td></tr>`;
  };

  function debounce(fn, ms = 300) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  const param = (name) => new URLSearchParams(window.location.search).get(name);
  const SEXO = { M: 'Masculino', F: 'Femenino', O: 'Otro' };

  window.UI = {
    esc, fmtDate, fmtDateTime, longDate, badgeEstado, badgeActivo, initials, toast, errorToast, confirm: confirmDialog,
    setLoading, clearFormErrors, showFormErrors, validateForm, formData, fillForm, tableLoading, tableEmpty, tableError,
    debounce, param, DIAS, SEXO,
  };
})();
