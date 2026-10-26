(function () {
  const base = (window.LINGUIZATE_API_URL || '/api').replace(/\/$/, '');

  async function request(path, options) {
    const response = await fetch(base + path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options && options.headers) },
      ...options
    });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || 'No se pudo completar la solicitud');
      error.code = data.code;
      error.status = response.status;
      throw error;
    }
    return data;
  }

  window.LinguizateAPI = {
    request,
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body || {}) }),
    patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body || {}) }),
    delete: (path) => request(path, { method: 'DELETE' })
  };
})();
