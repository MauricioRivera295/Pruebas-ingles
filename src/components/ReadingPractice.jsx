import { useEffect, useMemo, useRef, useState } from 'react';
import { readingTexts } from '../data/readingTexts.js';
import { normalize, wordSimilarity } from '../utils/levenshtein.js';
import { blobToFloat32Audio } from '../utils/audio.js';
import { transcribeAudio } from '../utils/transcribeApi.js';
import { MicIcon, StopIcon, ResetIcon } from './icons.jsx';

// Graba en trozos cortos mientras el usuario lee y transcribe cada trozo con
// el mismo Whisper del servidor que usan Pronunciación/Conversación (no con
// el SpeechRecognition nativo del navegador: ese depende de un servicio no
// oficial de Google, sin key, que falla con error "network" si hay
// VPN/antivirus/firewall de por medio o si el VPS bloquea la salida).
const MATCH_THRESHOLD = 0.6;
// Trozos más cortos = menos espera entre decir una palabra y verla marcada
// (el costo es enviar más requests al servidor, no un problema: se procesan
// en memoria y son rápidos). 1.5s es el punto donde Whisper todavía
// transcribe bien 2-4 palabras cortas sin perder demasiada precisión.
const CHUNK_MS = 1500;

const TO_BE_WORDS = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'being', 'been']);

function describeMicError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Permiso de micrófono denegado. Habilítalo para este sitio y recarga la página.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No se encontró ningún micrófono conectado.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'El micrófono está siendo usado por otra aplicación o pestaña.';
    default:
      return 'No se pudo acceder al micrófono. Verifica los permisos del navegador.';
  }
}

function recordChunk(stream, ms) {
  return new Promise((resolve) => {
    let mediaRecorder;
    try {
      mediaRecorder = new MediaRecorder(stream);
    } catch (err) {
      resolve(null);
      return;
    }
    const chunks = [];
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    mediaRecorder.onstop = () => resolve(new Blob(chunks, { type: mediaRecorder.mimeType }));
    mediaRecorder.start();
    setTimeout(() => {
      if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    }, ms);
  });
}

export default function ReadingPractice() {
  const [textIndex, setTextIndex] = useState(0);
  const [matchedCount, setMatchedCount] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);

  const streamRef = useRef(null);
  const loopActiveRef = useRef(false);

  const currentText = readingTexts[textIndex];
  const targetWords = useMemo(() => currentText.text.split(/\s+/), [currentText]);
  const targetClean = useMemo(() => targetWords.map((w) => normalize(w)), [targetWords]);
  const isComplete = matchedCount >= targetWords.length;

  const applySpokenText = (text) => {
    const spokenWords = normalize(text).split(' ').filter(Boolean);
    if (spokenWords.length === 0) return;
    setMatchedCount((prev) => {
      let matched = prev;
      for (const raw of spokenWords) {
        if (matched >= targetClean.length) break;
        if (wordSimilarity(raw, targetClean[matched]) >= MATCH_THRESHOLD) matched++;
      }
      return matched;
    });
  };

  const runLoop = async () => {
    while (loopActiveRef.current) {
      const blob = await recordChunk(streamRef.current, CHUNK_MS);
      if (!loopActiveRef.current) break;
      if (blob && blob.size > 0) {
        // No se espera aquí (fire-and-forget): así el siguiente trozo empieza
        // a grabarse de inmediato en vez de dejar un hueco de silencio
        // mientras el trozo anterior viaja al servidor.
        blobToFloat32Audio(blob)
          .then((audio) => transcribeAudio(audio))
          .then((text) => applySpokenText(text))
          .catch((err) => console.error('[ReadingPractice] Error transcribiendo trozo:', err));
      }
    }
  };

  const stopListening = () => {
    loopActiveRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsListening(false);
  };

  const startListening = async () => {
    setError(null);
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setError(describeMicError(err));
      return;
    }
    loopActiveRef.current = true;
    setIsListening(true);
    runLoop();
  };

  // Deja de grabar automáticamente al completar el texto (ahorra requests).
  useEffect(() => {
    if (isComplete && loopActiveRef.current) stopListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComplete]);

  useEffect(() => {
    return () => {
      loopActiveRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const handleReset = () => {
    stopListening();
    setMatchedCount(0);
    setError(null);
  };

  const handleNextText = () => {
    stopListening();
    setTextIndex((i) => (i + 1) % readingTexts.length);
    setMatchedCount(0);
    setError(null);
  };

  const progress = Math.round((matchedCount / targetWords.length) * 100);

  return (
    <div className="app-page">
      <div className="surface">
        <div className="surface-body">
          <div className="page-head">
            <div>
              <p className="eyebrow">Módulo · Lectura</p>
              <h2 className="page-title">Lee el texto en voz alta</h2>
            </div>
            <span className="step-chip">
              {progress}
              <span>%</span>
            </span>
          </div>

          <p className="page-sub mb-3">
            Presiona <strong>Empezar a leer</strong> y lee en voz alta: las palabras se irán
            encendiendo conforme las pronuncies. El audio se procesa en trozos de unos segundos.
          </p>

          {error && (
            <div className="alert brand-alert-warning mb-3" role="alert">
              {error}
            </div>
          )}

          <div className="progress brand-progress-track mb-3" style={{ height: '6px' }}>
            <div className="progress-bar brand-progress-fill" style={{ width: `${progress}%` }} />
          </div>

          <div className="text-card mb-3">
            {targetWords.map((word, i) => {
              const spoken = i < matchedCount;
              const isToBe = spoken && TO_BE_WORDS.has(targetClean[i]);
              return (
                <span key={i} className={`reading-word ${spoken ? 'spoken' : ''} ${isToBe ? 'tobe' : ''}`}>
                  {word}{' '}
                </span>
              );
            })}
          </div>

          {isComplete && (
            <div className="alert brand-alert-success d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
              <span>✔ ¡Leíste todo el texto!</span>
              <button type="button" className="btn brand-btn-success btn-sm" onClick={handleNextText}>
                Siguiente texto ➜
              </button>
            </div>
          )}

          <div className="action-dock">
            <div className="d-flex gap-2">
              <button
                type="button"
                className={`btn-record flex-grow-1 ${isListening ? 'is-recording' : ''}`}
                onClick={isListening ? stopListening : startListening}
              >
                {isListening ? (
                  <>
                    <StopIcon /> Detener
                  </>
                ) : (
                  <>
                    <MicIcon /> Empezar a leer
                  </>
                )}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleReset}
                aria-label="Reiniciar lectura"
                title="Reiniciar"
                style={{ flex: '0 0 auto', paddingInline: '16px' }}
              >
                <ResetIcon />
                <span className="d-none d-sm-inline">Reiniciar</span>
              </button>
            </div>
            <p className="record-note">
              {isListening
                ? 'Escuchando... lee con calma y articula cada palabra.'
                : 'Necesitarás permitir el micrófono para empezar.'}
            </p>
          </div>
        </div>
      </div>
      <p className="privacy-note">
        El audio se transcribe en el servidor y se descarta al instante: no se guarda en ninguna base
        de datos.
      </p>
    </div>
  );
}
