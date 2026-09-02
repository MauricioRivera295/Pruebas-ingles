const TIMEOUT_MS = 20000;

export async function synthesizeSpeech(text) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `TTS ${response.status}`);
    }
    return await response.blob();
  } finally {
    clearTimeout(timer);
  }
}
