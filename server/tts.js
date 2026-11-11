// Rachel: voz de mujer, inglés americano (catálogo público de ElevenLabs).
// Configurable vía env por si se quiere cambiar sin tocar código.
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
const MODEL_ID = 'eleven_turbo_v2';

// TTS nativo de Gemini (preview): reusa el mismo GEMINI_API_KEY que ya usa
// el tutor, así que no hace falta configurar nada nuevo si esa key ya está
// puesta. Devuelve PCM crudo (24kHz, mono, 16-bit) que hay que envolver en
// un header WAV antes de mandarlo al navegador.
const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const GEMINI_TTS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const GEMINI_VOICE = 'Kore';

function pcmToWav(pcmBuffer, { sampleRate = 24000, channels = 1, bitsPerSample = 16 } = {}) {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
}

async function synthesizeWithGemini(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada');

  const res = await fetch(GEMINI_TTS_URL, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GEMINI_TTS_MODEL,
      input: text,
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice: GEMINI_VOICE }] },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Gemini TTS ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  // El audio viene dentro de steps[0].content[0] como PCM base64, junto con
  // su sample_rate/channels reales (confirmado inspeccionando una respuesta
  // real; no está documentado explícitamente en la guía pública).
  const audioContent = data.steps?.[0]?.content?.find((c) => c.type === 'audio');

  if (!audioContent?.data) {
    console.error('[tts:gemini] Respuesta sin audio reconocible:', JSON.stringify(data).slice(0, 500));
    throw new Error('Gemini TTS: no se encontró audio en la respuesta.');
  }

  const wav = pcmToWav(Buffer.from(audioContent.data, 'base64'), {
    sampleRate: audioContent.sample_rate,
    channels: audioContent.channels,
  });
  return { buffer: wav, contentType: 'audio/wav' };
}

async function synthesizeWithElevenLabs(text) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY no configurada');

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`ElevenLabs ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }

  return { buffer: Buffer.from(await res.arrayBuffer()), contentType: 'audio/mpeg' };
}

// Si un proveedor falla por cuota/rate-limit (429) o por credenciales
// (401/403), reintentarlo en cada frase añade varios segundos de espera
// antes del respaldo (Gemini free tier: 10 audios/día). Se recuerda el fallo
// y se salta ese proveedor durante un rato; el respaldo suena casi al
// instante. Pasado el tiempo se vuelve a probar solo.
const COOLDOWN_MS = 10 * 60 * 1000;
const providerCooldown = new Map(); // name -> until (timestamp)

function isCoolingDown(name) {
  const until = providerCooldown.get(name);
  if (!until) return false;
  if (Date.now() >= until) {
    providerCooldown.delete(name);
    return false;
  }
  return true;
}

function noteFailure(name, err) {
  const status = Number(err?.status);
  if (status !== 401 && status !== 403 && status !== 429) return;
  const ms = status === 429 ? COOLDOWN_MS : 60 * 60 * 1000;
  providerCooldown.set(name, Date.now() + ms);
  console.warn(
    `[tts] ${name} en pausa ${Math.round(ms / 60000)} min por HTTP ${status}.`
  );
}

// Gemini primero por defecto: su cuota es la que normalmente alcanza para
// todo el uso diario. El cliente puede forzar un proveedor con `provider`
// ('gemini' | 'elevenlabs' | 'auto'); si el elegido falla (cuota, rate-limit,
// key ausente...) se intenta el otro para no dejar al alumno sin audio.
export async function synthesizeSpeech(text, provider = 'auto') {
  const requested =
    provider === 'gemini' || provider === 'elevenlabs' ? provider : 'auto';
  const order =
    requested === 'auto'
      ? ['gemini', 'elevenlabs']
      : [requested, requested === 'gemini' ? 'elevenlabs' : 'gemini'];

  // Si todos están en pausa se ignoran las pausas y se intenta igual, para
  // que la voz se recupere sola en cuanto el proveedor vuelva a responder.
  const available = order.filter((name) => !isCoolingDown(name));
  const queue = available.length > 0 ? available : order;

  const errors = [];
  for (let i = 0; i < queue.length; i += 1) {
    const name = queue[i];
    const hasNext = i < queue.length - 1;
    try {
      const result =
        name === 'gemini'
          ? await synthesizeWithGemini(text)
          : await synthesizeWithElevenLabs(text);
      if (requested !== 'auto' && name !== requested) {
        console.warn(`[tts] ${requested} no disponible; se usó ${name} como respaldo.`);
      }
      return { ...result, provider: name };
    } catch (err) {
      noteFailure(name, err);
      errors.push(`${name}: ${err.message}`);
      console.error(
        `[tts] ${name} falló${hasNext ? ', probando respaldo' : ''}:`,
        err.message
      );
    }
  }

  throw new Error(errors.join(' | '));
}
