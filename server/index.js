import 'dotenv/config';
import express from 'express';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline, env } from '@xenova/transformers';
import { getTutorReply } from './tutor.js';
import { synthesizeSpeech } from './tts.js';
import { lessons } from '../shared/lessons.js';

const MAX_CHAT_MESSAGES = 16; // ~8 turnos usuario+IA

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// El modelo se descarga UNA sola vez en el servidor (no en cada navegador
// de cada estudiante) y se cachea en disco para que un reinicio no vuelva a
// descargarlo. Ningún audio ni transcripción se guarda en disco ni en una
// base de datos: cada request se procesa en memoria y se descarta al
// terminar la respuesta.
//
// El caché se guarda FUERA de la carpeta del proyecto (a propósito): si
// vive dentro de `server/`, `node --watch` detecta los archivos que el
// modelo va escribiendo al cachear como "cambios de código" y reinicia el
// servidor a medio arrancar, entrando en un ciclo de caídas justo después
// de "Modelo listo".
env.allowLocalModels = false;
env.cacheDir = path.join(os.homedir(), '.cache', 'pronunciation-practice', 'transformers');

// whisper-tiny.en es el modelo más pequeño y le cuesta reconocer frases muy
// cortas de 1-2 palabras (justo el caso de esta práctica); whisper-base.en
// es notablemente más preciso y sigue siendo liviano para CPU.
const MODEL = 'Xenova/whisper-base.en';

let transcriber = null;
let modelError = null;

const modelLoadPromise = pipeline('automatic-speech-recognition', MODEL)
  .then((instance) => {
    transcriber = instance;
    console.log(`[server] Modelo ${MODEL} listo.`);
  })
  .catch((err) => {
    modelError = err;
    console.error('[server] Error cargando el modelo:', err);
  });

const app = express();
// El cliente envía el audio ya remuestreado a mono/16kHz como Float32Array
// crudo (application/octet-stream), no como archivo multimedia.
app.use(express.raw({ type: 'application/octet-stream', limit: '15mb' }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ready: transcriber !== null,
    error: modelError ? String(modelError.message ?? modelError) : null,
  });
});

app.post('/api/transcribe', async (req, res) => {
  try {
    await modelLoadPromise;
    if (!transcriber) {
      return res.status(503).json({ error: 'El modelo de reconocimiento de voz no está disponible.' });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: 'No se recibió audio.' });
    }

    const audio = new Float32Array(
      req.body.buffer,
      req.body.byteOffset,
      req.body.length / Float32Array.BYTES_PER_ELEMENT
    );
    console.log(
      `[server] Transcribiendo ${audio.length} muestras (${(audio.length / 16000).toFixed(2)}s)...`
    );

    // whisper-tiny.en / whisper-base.en son checkpoints SOLO-inglés: no
    // tienen los tokens especiales de idioma de los modelos multilingües,
    // así que no se debe forzar `language`/`task` aquí (puede confundir al
    // decodificador en frases muy cortas).
    const output = await transcriber(audio);
    console.log('[server] Resultado:', JSON.stringify(output));
    res.json({ text: output.text ?? '' });
  } catch (err) {
    console.error('[server] Error de transcripción:', err);
    res.status(500).json({ error: 'No se pudo transcribir el audio.' });
  }
});

// Metadata pública de las lecciones (nunca el systemPrompt: el cliente solo
// elige un lessonId, el server decide qué instrucciones le da a la IA).
app.get('/api/tutor/lessons', (_req, res) => {
  res.json(lessons.map(({ id, title, description, starter }) => ({ id, title, description, starter })));
});

app.post('/api/tutor/chat', async (req, res) => {
  try {
    const { lessonId, messages } = req.body ?? {};
    const lesson = lessons.find((l) => l.id === lessonId);
    if (!lesson) {
      return res.status(400).json({ error: 'Lección no encontrada.' });
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Falta el historial de la conversación.' });
    }

    const trimmed = messages.slice(-MAX_CHAT_MESSAGES).map((m) => ({
      role: m?.role === 'assistant' ? 'assistant' : 'user',
      content: String(m?.content ?? '').slice(0, 2000),
    }));

    const { text, provider } = await getTutorReply(lesson.systemPrompt, trimmed);
    res.json({ text, provider });
  } catch (err) {
    console.error('[server] Error del tutor conversacional (Groq y Gemini fallaron):', err);
    res.status(502).json({ error: 'No se pudo obtener respuesta de la IA. Intenta de nuevo en un momento.' });
  }
});

const TRANSLATE_SYSTEM_PROMPT =
  'You are a translator. Translate the given English text into natural, simple Spanish. Respond with ONLY the Spanish translation, nothing else — no quotes, no notes, no explanations.';

app.post('/api/translate', async (req, res) => {
  try {
    const text = String(req.body?.text ?? '').slice(0, 2000).trim();
    if (!text) {
      return res.status(400).json({ error: 'Falta el texto a traducir.' });
    }

    const { text: translation, provider } = await getTutorReply(TRANSLATE_SYSTEM_PROMPT, [
      { role: 'user', content: text },
    ]);
    res.json({ translation, provider });
  } catch (err) {
    console.error('[server] Error al traducir (Groq y Gemini fallaron):', err);
    res.status(502).json({ error: 'No se pudo traducir el texto. Intenta de nuevo en un momento.' });
  }
});

app.post('/api/tts', async (req, res) => {
  try {
    const text = String(req.body?.text ?? '').slice(0, 500).trim();
    if (!text) {
      return res.status(400).json({ error: 'Falta el texto a sintetizar.' });
    }

    const audioBuffer = await synthesizeSpeech(text);
    res.set('Content-Type', 'audio/mpeg');
    res.send(audioBuffer);
  } catch (err) {
    console.error('[server] Error generando voz (ElevenLabs):', err);
    // El cliente cae a la voz del navegador (SpeechSynthesis) si esto falla.
    res.status(502).json({ error: 'No se pudo generar el audio.' });
  }
});

// En producción, el mismo servidor Express sirve el build estático de Vite.
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[server] Escuchando en http://localhost:${PORT}`);
});
