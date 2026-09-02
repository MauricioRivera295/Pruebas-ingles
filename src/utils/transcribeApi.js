// Cliente del endpoint de transcripción. El audio (Float32Array mono/16kHz)
// se envía como bytes crudos; el servidor lo procesa en memoria y no lo
// persiste en ningún almacenamiento.

const TRANSCRIBE_TIMEOUT_MS = 30000;
const HEALTH_TIMEOUT_MS = 5000;

// Evita que la UI se quede "pegada" en Procesando... para siempre si el
// servidor no responde (caído, red lenta, request perdido).
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('El servidor tardó demasiado en responder. Intenta de nuevo.');
    }
    throw new Error('No se pudo conectar con el servidor. Verifica tu conexión.');
  } finally {
    clearTimeout(timer);
  }
}

export async function checkModelHealth() {
  const response = await fetchWithTimeout('/api/health', undefined, HEALTH_TIMEOUT_MS);
  if (!response.ok) throw new Error('No se pudo consultar el estado del servidor.');
  return response.json();
}

export async function transcribeAudio(float32Audio) {
  const response = await fetchWithTimeout(
    '/api/transcribe',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: float32Audio.buffer,
    },
    TRANSCRIBE_TIMEOUT_MS
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'No se pudo transcribir el audio.');
  }

  const data = await response.json();
  return data.text ?? '';
}
