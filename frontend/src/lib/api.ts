const TOKEN_KEY = 'studydocs.accessToken';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// Thin wrapper around fetch that attaches the Bearer token and clears it on
// a 401 (expired/invalid token) so the next protected-route check sends the
// user back to /login instead of silently failing every request.
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(path, { ...init, headers });
  if (response.status === 401) {
    clearToken();
  }
  return response;
}

// Plain <a href> navigation can't carry an Authorization header, and this
// route requires one — so fetch the PDF as a blob with the token attached
// and open that instead of linking to the URL directly.
export async function openDocumentFile(id: string): Promise<void> {
  const response = await apiFetch(`/documents/${id}/file`);
  if (!response.ok) return;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
