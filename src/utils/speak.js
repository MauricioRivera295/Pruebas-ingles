import { synthesizeSpeech } from './ttsApi.js';

// Voz compartida entre las dos pantallas (Pronunciación y Conversación):
// intenta ElevenLabs (voz de mujer natural) primero; si falla — sin key, sin
// crédito, red caída — cae automáticamente a la voz nativa del navegador
// para que nunca se quede sin audio.
let currentAudio = null;
// Token incremental: si llegan dos speak() casi simultáneos (p. ej. por
// React.StrictMode invocando un efecto dos veces en dev), solo la llamada
// más reciente puede reproducir cuando su fetch a ElevenLabs resuelve — evita
// que ambos Audio terminen sonando a la vez.
let requestToken = 0;
// onEnd de la llamada activa: si stopSpeaking() interrumpe a mitad de
// reproducción (ej. el usuario empieza a grabar mientras la IA habla), el
// avatar debe volver a estado "quieto" igual que si hubiera terminado sola.
let activeOnEnd = null;

export function stopSpeaking() {
  requestToken += 1;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  activeOnEnd?.();
  activeOnEnd = null;
}

function speakWithBrowser(text, { onStart, onEnd } = {}) {
  if (!('speechSynthesis' in window)) {
    onEnd?.();
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.9;
  utterance.onstart = () => onStart?.();
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  activeOnEnd = onEnd;
  window.speechSynthesis.speak(utterance);
}

export async function speak(text, { onStart, onEnd } = {}) {
  stopSpeaking();
  const myToken = requestToken;
  try {
    const blob = await synthesizeSpeech(text);
    if (myToken !== requestToken) return; // otra llamada a speak()/stopSpeaking() la reemplazó
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    activeOnEnd = onEnd;
    audio.addEventListener('play', () => onStart?.());
    audio.addEventListener('ended', () => {
      URL.revokeObjectURL(url);
      onEnd?.();
    });
    audio.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      onEnd?.();
    });
    await audio.play();
  } catch (err) {
    if (myToken !== requestToken) return;
    console.error('[speak] ElevenLabs falló, usando voz del navegador como respaldo:', err.message);
    speakWithBrowser(text, { onStart, onEnd });
  }
}
