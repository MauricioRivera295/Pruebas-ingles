import { useEffect, useMemo, useRef, useState } from 'react';
import { readingTexts } from '../data/readingTexts.js';
import { normalize } from '../utils/levenshtein.js';
import { speak, stopSpeaking } from '../utils/speak.js';

// Práctica de escritura: sin input visible — el usuario escribe directo
// sobre el teclado y cada letra correcta del texto objetivo se pone negra al
// presionarla (gris → negro, letra por letra, en orden). Al completar la
// frase se reproduce el audio completo una sola vez.
const TO_BE_WORDS = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'being', 'been']);

// Posiciones [start, end) de cada palabra dentro del texto, para saber si
// una letra pertenece a un verbo "to be" ya completado (se pinta verde).
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

  const containerRef = useRef(null);

  const currentText = readingTexts[textIndex];
  const targetText = currentText.text;
  const wordSpans = useMemo(() => buildWordSpans(targetText), [targetText]);
  const isComplete = charIndex >= targetText.length;

  useEffect(() => {
    containerRef.current?.focus();
  }, [textIndex]);

  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  useEffect(() => {
    if (isComplete) speak(targetText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComplete]);

  const handleKeyDown = (e) => {
    if (isComplete) return;
    if (e.key.length !== 1) return; // ignora Shift, Ctrl, flechas, etc.
    e.preventDefault();
    if (e.key.toLowerCase() === targetText[charIndex].toLowerCase()) {
      setCharIndex((i) => i + 1);
    }
  };

  const handleReset = () => {
    stopSpeaking();
    setCharIndex(0);
    containerRef.current?.focus();
  };

  const handleNextText = () => {
    stopSpeaking();
    setTextIndex((i) => (i + 1) % readingTexts.length);
    setCharIndex(0);
  };

  const wordIndexAt = (pos) => wordSpans.findIndex((w) => pos >= w.start && pos < w.end);

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-lg-8">
          <div className="card shadow-sm">
            <div className="card-body">
              <h1 className="h4 mb-3">Práctica de Escritura</h1>
              <p className="text-muted small">
                Haz clic en el recuadro y empieza a escribir: cada letra correcta se pone negra.
                Al terminar la frase se escucha completa.
              </p>

              <div
                ref={containerRef}
                tabIndex={0}
                onKeyDown={handleKeyDown}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                className={`p-4 brand-phrase-box rounded mb-3 fs-5 ${focused ? '' : 'border-warning'}`}
                style={{ lineHeight: 1.8, whiteSpace: 'pre-wrap', outline: 'none', cursor: 'text' }}
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
                  <span className="small text-muted d-block mt-2">👆 Haz clic aquí para empezar a escribir</span>
                )}
              </div>

              {isComplete && (
                <div className="alert brand-alert-success d-flex justify-content-between align-items-center">
                  <span>✔ ¡Completaste el texto!</span>
                  <button type="button" className="btn brand-btn-success btn-sm" onClick={handleNextText}>
                    Siguiente texto ➜
                  </button>
                </div>
              )}

              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleReset}>
                Reiniciar
              </button>
            </div>
          </div>
          <p className="text-center text-muted small mt-3">
            Todo ocurre en tu navegador: no se envía nada al servidor ni se guarda en ninguna base
            de datos.
          </p>
        </div>
      </div>
    </div>
  );
}
