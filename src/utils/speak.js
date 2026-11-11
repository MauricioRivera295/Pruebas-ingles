import { synthesizeSpeech, clearSpeechCache } from './ttsApi.js';

// Voz compartida entre las pantallas: el servidor intenta el proveedor
// elegido por el usuario (Gemini o ElevenLabs) y, si falla, cae al otro; si
// ambos fallan aquí en el cliente — red caída, servidor caído — se cae a la
// voz nativa del navegador para que nunca se quede sin audio.
//
// Se reutiliza UN solo elemento <audio> en vez de crear uno por frase: en
// iOS/Safari el primer play() tiene que ocurrir dentro de un gesto del
// usuario, y como el audio del TTS llega después de un fetch asíncrono, el
// elemento se "desbloquea" con un clip mudo en el primer toque de la página
// (ver unlockAudio). Reutilizarlo permite reproducir después sin gesto.
let audioEl = null;
let currentUrl = null;
let audioUnlocked = false;
let silentUrl = null;

// Token incremental: si llegan dos speak() casi simultáneos (p. ej. por
// React.StrictMode invocando un efecto dos veces en dev), solo la llamada
// más reciente puede reproducir cuando su fetch al TTS resuelve — evita
// que ambos audios terminen sonando a la vez.
let requestToken = 0;
// onEnd de la llamada activa: si stopSpeaking() interrumpe a mitad de
// reproducción (ej. el usuario empieza a grabar mientras la IA habla), el
// avatar debe volver a estado "quieto" igual que si hubiera terminado sola.
let activeOnEnd = null;
// Última frase reproducida: al cambiar de voz se vuelve a pedir y se
// reproduce con el proveedor nuevo, sin que el usuario tenga que pulsar
// "Escuchar" otra vez ni recargar la página.
let lastSpoken = null; // { text, onStart, onEnd }

const STORAGE_KEY = 'englishlab.ttsProvider';
const PROVIDERS = ['gemini', 'elevenlabs'];

function loadProvider() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (PROVIDERS.includes(saved)) return saved;
  } catch {
    // localStorage puede estar bloqueado (modo privado); se usa el default.
  }
  return 'gemini';
}

// Estado observable de la voz para que la UI pueda mostrar un loader
// mientras el audio viaja desde /api/tts (puede tardar varios segundos) y
// saber qué proveedor se usó realmente.
const listeners = new Set();
let status = {
  loading: false,
  speaking: false,
  provider: loadProvider(),
  lastProvider: null,
};

function updateStatus(patch) {
  const next = { ...status, ...patch };
  if (
    next.loading === status.loading &&
    next.speaking === status.speaking &&
    next.provider === status.provider &&
    next.lastProvider === status.lastProvider
  ) {
    return;
  }
  status = next;
  listeners.forEach((listener) => listener());
}

export function subscribeSpeechStatus(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSpeechStatus() {
  return status;
}

function getAudioEl() {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = 'auto';
  }
  return audioEl;
}

// WAV mudo de ~50 ms para desbloquear la reproducción en iOS/Safari.
function getSilentUrl() {
  if (silentUrl) return silentUrl;
  const sampleRate = 8000;
  const samples = 400;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const str = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  str(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, samples * 2, true);
  silentUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
  return silentUrl;
}

let unlockToken = 0;

// Llamar desde el primer gesto del usuario (pointerdown/keydown). Si el
// navegador no lo necesita (Chrome/Edge de escritorio) no pasa nada; si es
// Safari/iOS, a partir de aquí los play() asíncronos del TTS sí suenan.
export function unlockAudio() {
  if (audioUnlocked) return;
  if (status.speaking) {
    audioUnlocked = true; // ya está sonando: la reproducción está permitida
    return;
  }
  const el = getAudioEl();
  const token = (unlockToken += 1);
  try {
    el.src = getSilentUrl();
    const played = el.play();
    if (played && typeof played.then === 'function') {
      played
        .then(() => {
          audioUnlocked = true;
          // Si mientras tanto empezó un audio real, no lo pausamos.
          if (token === unlockToken) {
            el.pause();
            el.currentTime = 0;
          }
        })
        .catch(() => {
          // Se reintentará en el siguiente gesto.
        });
    } else {
      audioUnlocked = true;
    }
  } catch {
    // Se reintentará en el siguiente gesto.
  }
}

// Cambia la voz de los ejercicios y la recuerda para la próxima visita.
// Además recarga el audio: descarta lo cacheado con la voz nueva, corta lo
// que esté sonando y, si ya se había reproducido una frase, la vuelve a
// sintetizar y a reproducir con la voz recién elegida.
export function setSpeechProvider(next) {
  if (!PROVIDERS.includes(next) || next === status.provider) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Sin persistencia: el cambio sigue aplicando en esta sesión.
  }
  stopSpeaking();
  clearSpeechCache(next);
  updateStatus({ provider: next, lastProvider: null });

  if (lastSpoken) {
    speak(lastSpoken.text, {
      onStart: lastSpoken.onStart,
      onEnd: lastSpoken.onEnd,
    });
  }
}

export function stopSpeaking() {
  requestToken += 1;
  if (audioEl) {
    audioEl.onplay = null;
    audioEl.onended = null;
    audioEl.onerror = null;
    audioEl.pause();
    try {
      audioEl.currentTime = 0;
    } catch {
      // El elemento puede no tener un audio cargado todavía.
    }
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  updateStatus({ loading: false, speaking: false });
  activeOnEnd?.();
  activeOnEnd = null;
}

function speakWithBrowser(text, { onStart, onEnd } = {}) {
  if (!('speechSynthesis' in window)) {
    updateStatus({ loading: false, speaking: false });
    onEnd?.();
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.9;
  utterance.onstart = () => {
    updateStatus({ loading: false, speaking: true, lastProvider: 'browser' });
    onStart?.();
  };
  utterance.onend = () => {
    updateStatus({ loading: false, speaking: false });
    onEnd?.();
  };
  utterance.onerror = () => {
    updateStatus({ loading: false, speaking: false });
    onEnd?.();
  };
  activeOnEnd = onEnd;
  window.speechSynthesis.speak(utterance);
}

export async function speak(text, { onStart, onEnd } = {}) {
  stopSpeaking();
  const myToken = requestToken;
  const provider = status.provider;
  lastSpoken = { text, onStart, onEnd };
  updateStatus({ loading: true, speaking: false });
  try {
    const { blob, provider: used } = await synthesizeSpeech(text, provider);
    if (myToken !== requestToken) return; // otra llamada a speak()/stopSpeaking() la reemplazó
    if (used !== provider) {
      console.warn(`[speak] ${provider} no disponible; el servidor usó ${used}.`);
    }

    const audio = getAudioEl();
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    const url = URL.createObjectURL(blob);
    currentUrl = url;
    unlockToken += 1; // invalida un desbloqueo pendiente para que no pause esto
    activeOnEnd = onEnd;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
      if (currentUrl === url) {
        URL.revokeObjectURL(url);
        currentUrl = null;
      }
      updateStatus({ loading: false, speaking: false });
      onEnd?.();
    };

    audio.onplay = () => {
      updateStatus({ loading: false, speaking: true, lastProvider: used });
      onStart?.();
    };
    audio.onended = finish;
    audio.onerror = finish;
    audio.src = url;
    audio.currentTime = 0;
    await audio.play();
  } catch (err) {
    if (myToken !== requestToken) return;
    updateStatus({ loading: false, speaking: false });
    console.error(
      '[speak] Servidor de voz (Gemini/ElevenLabs) falló, usando voz del navegador como respaldo:',
      err.message
    );
    speakWithBrowser(text, { onStart, onEnd });
  }
}
