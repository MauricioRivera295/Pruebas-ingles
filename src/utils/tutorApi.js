const TIMEOUT_MS = 20000;

async function fetchWithTimeout(url, options, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('La IA tardó demasiado en responder. Intenta de nuevo.');
    }
    throw new Error('No se pudo conectar con el servidor.');
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchLessons() {
  const response = await fetchWithTimeout('/api/tutor/lessons', undefined, 8000);
  if (!response.ok) throw new Error('No se pudieron cargar las lecciones.');
  return response.json();
}

export async function sendTutorMessage(lessonId, messages) {
  const response = await fetchWithTimeout('/api/tutor/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lessonId,
      messages: messages.map(({ role, content }) => ({ role, content })),
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'No se pudo obtener respuesta de la IA.');
  }

  return response.json();
}

export async function translateText(text) {
  const response = await fetchWithTimeout('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'No se pudo traducir el texto.');
  }

  return response.json();
}
