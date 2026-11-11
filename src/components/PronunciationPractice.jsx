import { useEffect, useRef, useState } from 'react';
import { phrases } from '../data/phrases.js';
import { hasDetectedSpeech, similarityPercentage } from '../utils/levenshtein.js';
import { blobToFloat32Audio } from '../utils/audio.js';
import { checkModelHealth, transcribeAudio } from '../utils/transcribeApi.js';
import { speak } from '../utils/speak.js';
import { useMicRecorder } from '../hooks/useMicRecorder.js';
import { useSpeechStatus } from '../hooks/useSpeechStatus.js';
import { MicIcon, StopIcon, SpeakerIcon } from './icons.jsx';

const SUCCESS_THRESHOLD = 85;
const WARNING_THRESHOLD = 60;
const HEALTH_POLL_MS = 1500;

export default function PronunciationPractice() {
  const [modelStatus, setModelStatus] = useState('loading'); // loading | ready | error
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [similarity, setSimilarity] = useState(null);
  const [speechDetected, setSpeechDetected] = useState(true);
  const [processingError, setProcessingError] = useState(null);
  const [recordingUrl, setRecordingUrl] = useState(null);
  const recordingUrlRef = useRef(null);

  const { isRecording, error: recorderError, start, stop } = useMicRecorder();
  const { loading: audioLoading } = useSpeechStatus();

  const targetPhrase = phrases[phraseIndex];
  const isLastPhrase = phraseIndex === phrases.length - 1;
  const hasResult = similarity !== null && speechDetected;
  const isSuccess = hasResult && similarity >= SUCCESS_THRESHOLD;
  const isPartial = hasResult && similarity >= WARNING_THRESHOLD && similarity < SUCCESS_THRESHOLD;
  const isFail = hasResult && similarity < WARNING_THRESHOLD;

  // El modelo vive y se carga en el servidor (una sola vez para todos los
  // estudiantes); aquí solo hacemos polling de /api/health hasta que esté listo.
  useEffect(() => {
    let cancelled = false;
    let timer;

    const poll = async () => {
      try {
        const { ready, error } = await checkModelHealth();
        if (cancelled) return;
        if (error) {
          setModelStatus('error');
          return;
        }
        if (ready) {
          setModelStatus('ready');
          return;
        }
      } catch {
        // El servidor puede tardar en levantar; seguimos reintentando.
      }
      timer = setTimeout(poll, HEALTH_POLL_MS);
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const resetResult = () => {
    setTranscript('');
    setSimilarity(null);
    setSpeechDetected(true);
    setProcessingError(null);
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    recordingUrlRef.current = null;
    setRecordingUrl(null);
  };

  // Libera el último audio grabado si el componente se desmonta a media práctica.
  useEffect(() => {
    return () => {
      if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    };
  }, []);

  const handleRecordClick = async () => {
    if (isRecording) {
      setProcessing(true);
      resetResult();
      console.log('[PronunciationPractice] Deteniendo grabación...');
      const blob = await stop();
      if (!blob) {
        console.error('[PronunciationPractice] stop() no devolvió audio (blob nulo).');
        setProcessing(false);
        return;
      }
      console.log('[PronunciationPractice] Blob obtenido:', blob.size, 'bytes,', blob.type);
      const url = URL.createObjectURL(blob);
      recordingUrlRef.current = url;
      setRecordingUrl(url);
      try {
        const audio = await blobToFloat32Audio(blob);
        console.log('[PronunciationPractice] Audio decodificado, muestras:', audio.length);
        const text = await transcribeAudio(audio);
        console.log('[PronunciationPractice] Transcripción recibida:', JSON.stringify(text));
        const cleanText = text.trim();
        const detected = hasDetectedSpeech(cleanText);
        setTranscript(cleanText);
        setSpeechDetected(detected);
        setSimilarity(detected ? similarityPercentage(cleanText, targetPhrase.text) : 0);
      } catch (err) {
        console.error('[PronunciationPractice] Error al procesar la grabación:', err);
        setProcessingError(err.message || 'No se pudo procesar el audio grabado.');
      } finally {
        setProcessing(false);
      }
    } else {
      resetResult();
      await start();
    }
  };

  const handleNextPhrase = () => {
    if (isLastPhrase) {
      setCompleted(true);
    } else {
      setPhraseIndex((index) => index + 1);
    }
    resetResult();
  };

  const handleRestart = () => {
    setPhraseIndex(0);
    setCompleted(false);
    resetResult();
  };

  const handleListenPhrase = () => {
    speak(targetPhrase.text);
  };

  const handleListenMine = () => {
    if (recordingUrl) new Audio(recordingUrl).play();
  };

  return (
    <div className="app-page">
      <div className="surface">
        <div className="surface-body">
          <div className="page-head">
            <div>
              <p className="eyebrow">Módulo · Pronunciación</p>
              <h2 className="page-title">Repite la frase en voz alta</h2>
            </div>
            {modelStatus === 'ready' && !completed && (
              <span className="step-chip">
                {phraseIndex + 1}
                <span>/{phrases.length}</span>
              </span>
            )}
          </div>

          {modelStatus === 'loading' && (
            <div className="status-line">
              <div className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
              <span>Conectando con el servidor de reconocimiento de voz...</span>
            </div>
          )}

          {modelStatus === 'error' && (
            <div className="alert brand-alert-danger" role="alert">
              No se pudo conectar con el servidor de reconocimiento de voz. Verifica que esté
              corriendo e intenta recargar la página.
            </div>
          )}

          {modelStatus === 'ready' && completed && (
            <div className="text-center py-4">
              <p className="display-6 mb-2">🎉</p>
              <p className="fs-5 fw-semibold mb-3">¡Completaste la práctica!</p>
              <button type="button" className="btn btn-brand px-4" onClick={handleRestart}>
                Reiniciar práctica
              </button>
            </div>
          )}

          {modelStatus === 'ready' && !completed && (
            <>
              <div className="progress brand-progress-track mb-4" style={{ height: '6px' }}>
                <div
                  className="progress-bar brand-progress-fill"
                  style={{ width: `${((phraseIndex + (isSuccess ? 1 : 0)) / phrases.length) * 100}%` }}
                />
              </div>

              <div className="phrase-card mb-3">
                <span className="phrase-label">Frase objetivo</span>
                <p className="phrase-text">&ldquo;{targetPhrase.text}&rdquo;</p>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={handleListenPhrase}
                  disabled={isRecording || audioLoading}
                  aria-busy={audioLoading}
                >
                  {audioLoading ? (
                    <>
                      <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                      Generando audio…
                    </>
                  ) : (
                    <>
                      <SpeakerIcon /> Escuchar pronunciación
                    </>
                  )}
                </button>
              </div>

              {(recorderError || processingError) && (
                <div className="alert brand-alert-warning mb-3" role="alert">
                  {recorderError || processingError}
                </div>
              )}

              <div className="action-dock">
                <button
                  type="button"
                  className={`btn-record ${isRecording ? 'is-recording' : ''}`}
                  onClick={handleRecordClick}
                  disabled={processing}
                >
                  {processing ? (
                    <>
                      <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                      Procesando...
                    </>
                  ) : isRecording ? (
                    <>
                      <StopIcon /> Detener grabación
                    </>
                  ) : (
                    <>
                      <MicIcon /> Grabar pronunciación
                    </>
                  )}
                </button>
                <p className="record-note">
                  Toca, di la frase y vuelve a tocar para evaluar tu pronunciación.
                </p>
              </div>

              {transcript !== '' && !speechDetected && (
                <div className="alert brand-alert-neutral mt-3" role="alert" aria-live="polite">
                  No se detectó voz en la grabación. Habla más cerca del micrófono e intenta de
                  nuevo.
                </div>
              )}

              {hasResult && (
                <div className="result-panel" aria-live="polite">
                  <p className="result-label">Transcripción detectada</p>
                  <p className="result-quote">&ldquo;{transcript}&rdquo;</p>

                  <div className="score-row">
                    <span>Similitud de pronunciación</span>
                    <strong>{similarity}%</strong>
                  </div>
                  <div
                    className={`score-bar ${isSuccess ? 'is-success' : isPartial ? 'is-warn' : 'is-danger'}`}
                  >
                    <span className="score-fill" style={{ width: `${similarity}%` }} />
                  </div>

                  {isSuccess && (
                    <div className="alert brand-alert-success d-flex flex-wrap justify-content-between align-items-center gap-2 mb-0">
                      <span>✔ ¡Excelente pronunciación!</span>
                      <button type="button" className="btn brand-btn-success btn-sm" onClick={handleNextPhrase}>
                        {isLastPhrase ? 'Finalizar' : 'Siguiente frase ➜'}
                      </button>
                    </div>
                  )}

                  {isPartial && (
                    <div className="alert brand-alert-warning mb-0">
                      <p className="mb-0">Casi lo logras — escucha el modelo y vuelve a intentarlo.</p>
                      <div className="result-actions">
                        <button type="button" className="btn-ghost btn-sm" onClick={handleListenMine}>
                          <SpeakerIcon /> Mi pronunciación
                        </button>
                        <button type="button" className="btn-ghost btn-sm" onClick={handleListenPhrase}>
                          <SpeakerIcon /> Pronunciación correcta
                        </button>
                      </div>
                    </div>
                  )}

                  {isFail && (
                    <div className="alert brand-alert-danger mb-0">
                      <p className="mb-0">No coincide con la frase esperada. Intenta de nuevo.</p>
                      <div className="result-actions">
                        <button type="button" className="btn-ghost btn-sm" onClick={handleListenMine}>
                          <SpeakerIcon /> Mi pronunciación
                        </button>
                        <button type="button" className="btn-ghost btn-sm" onClick={handleListenPhrase}>
                          <SpeakerIcon /> Pronunciación correcta
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <p className="privacy-note">
        La transcripción se procesa en el servidor y se descarta al instante: el audio no se guarda
        en ninguna base de datos ni almacenamiento.
      </p>
    </div>
  );
}
