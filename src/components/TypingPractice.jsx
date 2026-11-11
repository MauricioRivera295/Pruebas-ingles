import { useEffect, useMemo, useRef, useState } from 'react';
import { readingTexts } from '../data/readingTexts.js';
import { normalize } from '../utils/levenshtein.js';
import { speak, stopSpeaking } from '../utils/speak.js';
import { useSpeechStatus } from '../hooks/useSpeechStatus.js';
import { ResetIcon } from './icons.jsx';

// Práctica de escritura: sin input visible — el usuario escribe directo
// sobre el teclado y cada letra correcta del texto objetivo se enciende al
// presionarla (apagado → amarillo, letra por letra, en orden). Al completar
// la frase se reproduce el audio completo una sola vez.
//
// En móvil no hay teclado físico: el recuadro enfoca un <input> invisible
// que abre el teclado virtual y entrega el texto por el evento `input`.
const TO_BE_WORDS = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'being', 'been']);

// Posiciones [start, end) de cada palabra dentro del texto, para saber si
// una letra pertenece a un verbo "to be" ya completado (se pinta naranja).
function buildWordSpans(text) {
  const spans = [];
  const regex = /\S+/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    spans.push({ start: match.index, end: match.index + match[0].length, isToBe: TO_BE_WORDS.has(normalize(match[0])) });
  }
  return spans;
}

export default function TypingPractice() {
  const [textIndex, setTextIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  const { loading: audioLoading } = useSpeechStatus();

  const inputRef = useRef(null);

  const currentText = readingTexts[textIndex];
  const targetText = currentText.text;
  const wordSpans = useMemo(() => buildWordSpans(targetText), [targetText]);
  const isComplete = charIndex >= targetText.length;

  useEffect(() => {
    inputRef.current?.focus();
  }, [textIndex]);

  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  useEffect(() => {
    if (isComplete) speak(targetText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComplete]);

  const advance = (typed) => {
    if (!typed) return;
    setCharIndex((current) => {
      let next = current;
      for (const ch of typed) {
        if (next >= targetText.length) break;
        if (ch.toLowerCase() === targetText[next].toLowerCase()) next++;
      }
      return next;
    });
  };

  // Teclado físico: se ignoran teclas especiales (Shift, flechas, etc.).
  const handleKeyDown = (e) => {
    if (isComplete) return;
    if (e.key.length !== 1) return;
    e.preventDefault();
    advance(e.key);
  };

  // Teclado virtual (y autocompletado/pegado): se procesa el valor y se limpia.
  const handleInput = (e) => {
    const typed = e.target.value;
    e.target.value = '';
    if (!isComplete) advance(typed);
  };

  const handleReset = () => {
    stopSpeaking();
    setCharIndex(0);
    inputRef.current?.focus();
  };

  const handleNextText = () => {
    stopSpeaking();
    setTextIndex((i) => (i + 1) % readingTexts.length);
    setCharIndex(0);
  };

  const wordIndexAt = (pos) => wordSpans.findIndex((w) => pos >= w.start && pos < w.end);

  const progress = Math.round((charIndex / targetText.length) * 100);

  return (
    <div className="app-page">
      <div className="surface">
        <div className="surface-body">
          <div className="page-head">
            <div>
              <p className="eyebrow">Módulo · Escritura</p>
              <h2 className="page-title">Escribe la frase completa</h2>
            </div>
            <span className="step-chip">
              {progress}
              <span>%</span>
            </span>
          </div>

          <p className="page-sub mb-3">
            Toca el recuadro y escribe: cada letra correcta se ilumina. Al terminar la frase se
            escucha completa.
          </p>

          <div className="progress brand-progress-track mb-3" style={{ height: '6px' }}>
            <div className="progress-bar brand-progress-fill" style={{ width: `${progress}%` }} />
          </div>

          <input
            ref={inputRef}
            type="text"
            className="ghost-input"
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            aria-label="Escribe la frase que se muestra en pantalla"
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />

          <div
            onClick={() => inputRef.current?.focus()}
            className={`text-card mb-3 ${focused ? 'is-focused' : 'is-idle'}`}
            style={{ whiteSpace: 'pre-wrap', minHeight: '120px' }}
          >
            {targetText.split('').map((char, i) => {
              const typed = i < charIndex;
              const wi = wordIndexAt(i);
              const isToBeChar = typed && wi !== -1 && wordSpans[wi].isToBe && charIndex >= wordSpans[wi].end;
              return (
                <span key={i} className={`reading-word ${typed ? 'spoken' : ''} ${isToBeChar ? 'tobe' : ''}`}>
                  {char}
                </span>
              );
            })}
            {!focused && !isComplete && (
              <span className="idle-hint">👆 Toca aquí para empezar a escribir</span>
            )}
          </div>

          {audioLoading && (
            <div className="audio-chip mb-3" role="status" aria-live="polite">
              <span className="spinner-border spinner-border-sm" aria-hidden="true" />
              Generando audio de la frase…
            </div>
          )}

          {isComplete && (
            <div className="alert brand-alert-success d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
              <span>✔ ¡Completaste el texto!</span>
              <button type="button" className="btn brand-btn-success btn-sm" onClick={handleNextText}>
                Siguiente texto ➜
              </button>
            </div>
          )}

          <div className="d-flex">
            <button type="button" className="btn btn-ghost" onClick={handleReset}>
              <ResetIcon /> Reiniciar
            </button>
          </div>
        </div>
      </div>
      <p className="privacy-note">
        Todo ocurre en tu navegador: no se envía nada al servidor ni se guarda en ninguna base de
        datos.
      </p>
    </div>
  );
}
