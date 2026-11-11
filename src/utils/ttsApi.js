const TIMEOUT_MS = 20000;

// Caché en memoria por texto exacto + proveedor: si ya se pidió esa frase a
// Gemini/ElevenLabs en esta sesión (ej. "Hello" ya sonó una vez), se reusa el
// mismo audio en vez de volver a gastar cuota. Se pierde al recargar la
// página (no hay persistencia ni base de datos de por medio).
const ttsCache = new Map(); // "provider::text" -> { blob, provider }
const pendingRequests = new Map(); // "provider::text" -> Promise<{ blob, provider }>

// Al cambiar de voz hay que descartar el audio ya generado con esa voz para
// que la siguiente reproducción se sintetice de nuevo (si no, se oiría el
// audio viejo aunque el selector ya marque el otro proveedor).
export function clearSpeechCache(provider) {
  if (!provider) {
    ttsCache.clear();
    return;
  }
  const prefix = `${provider}::`;
  for (const key of [...ttsCache.keys()]) {
    if (key.startsWith(prefix)) ttsCache.delete(key);
  }
}

export async function synthesizeSpeech(text, provider = 'auto') {
  const key = `${provider}::${text}`;
  if (ttsCache.has(key)) return ttsCache.get(key);
  if (pendingRequests.has(key)) return pendingRequests.get(key);

  const request = fetchSpeech(text, provider)
    .then((result) => {
      ttsCache.set(key, result);
      return result;
    })
    .finally(() => {
      pendingRequests.delete(key);
    });

  pendingRequests.set(key, request);
  return request;
}

async function fetchSpeech(text, provider) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, provider }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `TTS ${response.status}`);
    }
    // El servidor puede haber usado el otro proveedor si el elegido falló;
    // devuelve cuál se usó realmente para poder avisarlo en la interfaz.
    return {
      blob: await response.blob(),
      provider: response.headers.get('X-TTS-Provider') || provider,
    };
  } finally {
    clearTimeout(timer);
  }
}
