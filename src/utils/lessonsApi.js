// Cliente del contenido de lecciones de Pronunciación (MySQL en el server,
// vía /api/lessons). Solo texto: el audio se sigue generando al vuelo con
// el mismo pipeline de voz de siempre (speak()).

const TIMEOUT_MS = 8000;

export async function fetchLessons() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetch('/api/lessons', { signal: controller.signal });
  } catch {
    throw new Error('No se pudo conectar con el servidor para cargar las lecciones.');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'No se pudo cargar el contenido de las lecciones.');
  }
  return response.json();
}
