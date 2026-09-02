const MIN_DURATION_SECONDS = 1;

// Decodifica un Blob de audio grabado por MediaRecorder y lo remuestrea a
// mono / 16 kHz Float32Array, el formato que espera Whisper en Transformers.js.
// Las frases cortas ("Hello", "Please"...) suelen grabarse en clips muy
// breves y a veces bajo de volumen; se rellena con silencio hasta un mínimo
// de 1s (Whisper reconoce peor clips ultra-cortos) y se normaliza el
// volumen para mejorar la tasa de reconocimiento.
export async function blobToFloat32Audio(blob, targetSampleRate = 16000) {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioContextClass();

  let decoded;
  try {
    decoded = await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    audioCtx.close();
  }

  // Algunos navegadores reportan `duration` no finita para blobs grabados
  // con MediaRecorder (metadata de contenedor incompleta); en ese caso se
  // recalcula a partir de las muestras decodificadas, que sí son exactas.
  const rawDuration = Number.isFinite(decoded.duration)
    ? decoded.duration
    : decoded.length / decoded.sampleRate;
  const renderSeconds = Math.min(Math.max(rawDuration, MIN_DURATION_SECONDS), 30);
  const offlineCtx = new OfflineAudioContext(
    1,
    Math.ceil(renderSeconds * targetSampleRate),
    targetSampleRate
  );
  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineCtx.destination);
  source.start(0);

  const rendered = await offlineCtx.startRendering();
  const result = normalizeGain(rendered.getChannelData(0));

  let peak = 0;
  for (let i = 0; i < result.length; i++) {
    const abs = Math.abs(result[i]);
    if (abs > peak) peak = abs;
  }
  console.log(
    '[audio] duración:',
    renderSeconds.toFixed(2),
    's, pico de amplitud tras normalizar:',
    peak.toFixed(4),
    peak < 0.02 ? '(MUY BAJO: probablemente silencio o micrófono equivocado)' : ''
  );

  return result;
}

// Amplifica hacia un pico objetivo cuando la grabación llegó muy baja de
// volumen (mic lejos, ganancia baja del sistema), sin sobre-amplificar
// silencio/ruido de fondo.
function normalizeGain(samples, targetPeak = 0.9, maxGain = 8) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }
  if (peak === 0) return samples;

  const gain = Math.min(targetPeak / peak, maxGain);
  if (gain <= 1) return samples;

  const boosted = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    boosted[i] = samples[i] * gain;
  }
  return boosted;
}
