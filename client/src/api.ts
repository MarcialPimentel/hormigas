export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(json.error?.code ?? 'error', json.error?.message ?? `Request failed (${res.status}).`, res.status);
  return json as T;
}

export const api = {
  get: <T = any>(url: string) => call<T>('GET', url),
  post: <T = any>(url: string, body: unknown = {}) => call<T>('POST', url, body),
  patch: <T = any>(url: string, body: unknown = {}) => call<T>('PATCH', url, body),
};
