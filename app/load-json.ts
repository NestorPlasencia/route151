export class DataLoadError extends Error {
  constructor(
    public readonly url: string,
    cause: unknown,
  ) {
    super(`Could not load ${url}`, { cause });
  }
}

// HTTP, JSON invalido y conexiones que no responden terminan en un error
// visible. El signal del componente cancela peticiones al cambiar de juego.
export async function loadJson<T>(
  url: string,
  {
    signal,
    timeoutMs = 15000,
  }: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(
    () => controller.abort(new Error('Request timed out')),
    timeoutMs,
  );
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'reload',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new DataLoadError(url, error);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
