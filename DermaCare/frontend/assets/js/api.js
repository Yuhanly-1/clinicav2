/* DermaCare — Cliente HTTP (Fetch API + JSON) */
(function () {
  const BASE = '/api';

  class ApiError extends Error {
    constructor(status, body) {
      super((body && body.error) || `Error ${status}`);
      this.status = status;
      this.body = body;
      this.detalles = body && body.detalles;
    }
  }

  async function request(method, path, body) {
    const opts = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(BASE + path, opts);
    } catch {
      throw new ApiError(0, { error: 'No se pudo conectar con el servidor. Verifique su conexión.' });
    }
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    const data = isJson ? await res.json().catch(() => null) : null;
    if (res.status === 401 && !path.startsWith('/auth/')) {
      window.location.href = '/login.html?expirada=1';
      throw new ApiError(401, data);
    }
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
  }

  /** Descarga un archivo (Excel/PDF) generado por el backend. */
  async function download(path, fallbackName) {
    const res = await fetch(BASE + path, { credentials: 'same-origin' });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new ApiError(res.status, data);
    }
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') || '';
    const match = cd.match(/filename="?([^"]+)"?/);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = match ? match[1] : fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const qs = (params) => {
    const sp = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') sp.append(k, v);
    });
    const s = sp.toString();
    return s ? `?${s}` : '';
  };

  window.API = {
    ApiError,
    qs,
    get: (p) => request('GET', p),
    post: (p, b) => request('POST', p, b || {}),
    put: (p, b) => request('PUT', p, b || {}),
    patch: (p, b) => request('PATCH', p, b || {}),
    download,
  };
})();
