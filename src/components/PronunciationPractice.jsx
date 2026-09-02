import { useEffect, useState } from 'react';
import { phrases } from '../data/phrases.js';
import { hasDetectedSpeech, similarityPercentage } from '../utils/levenshtein.js';
import { blobToFloat32Audio } from '../utils/audio.js';
import { checkModelHealth, transcribeAudio } from '../utils/transcribeApi.js';
import { speak } from '../utils/speak.js';
import { useMicRecorder } from '../hooks/useMicRecorder.js';

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

  const { isRecording, error: recorderError, start, stop } = useMicRecorder();

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
  };

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

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-lg-7">
          <div className="card shadow-sm">
            <div className="card-body">
              <h1 className="h4 mb-3">Práctica de Pronunciación</h1>

              {modelStatus === 'loading' && (
                <div className="mb-3 d-flex align-items-center gap-2">
                  <div className="spinner-border spinner-border-sm text-primary" role="status" aria-hidden="true" />
                  <p className="text-muted small mb-0">
                    Conectando con el servidor de reconocimiento de voz...
                  </p>
                </div>
              )}

              {modelStatus === 'error' && (
                <div className="alert alert-danger">
                  No se pudo conectar con el servidor de reconocimiento de voz. Verifica que esté
                  corriendo e intenta recargar la página.
                </div>
              )}

              {modelStatus === 'ready' && completed && (
                <div className="text-center py-4">
                  <p className="display-6 mb-2">🎉</p>
                  <p className="fs-5 fw-semibold mb-3">¡Completaste la práctica!</p>
                  <button type="button" className="btn brand-btn-primary" onClick={handleRestart}>
                    Reiniciar práctica
                  </button>
                </div>
              )}

              {modelStatus === 'ready' && !completed && (
                <>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="small text-muted">
                      Frase {phraseIndex + 1} de {phrases.length}
                    </span>
                  </div>
                  <div className="progress brand-progress-track mb-3" style={{ height: '4px' }}>
                    <div
                      className="progress-bar brand-progress-fill"
                      style={{ width: `${((phraseIndex + (isSuccess ? 1 : 0)) / phrases.length) * 100}%` }}
                    />
                  </div>

                  <div className="text-center p-4 brand-phrase-box rounded mb-3">
                    <p className="fs-3 fw-semibold mb-2">&ldquo;{targetPhrase.text}&rdquo;</p>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={handleListenPhrase}
                      disabled={isRecording}
                    >
                      🔊 Escuchar pronunciación
                    </button>
                  </div>

                  {(recorderError || processingError) && (
                    <div className="alert brand-alert-warning" role="alert">
                      {recorderError || processingError}
                    </div>
                  )}

                  <div className="d-grid mb-3">
                    <button
                      type="button"
                      className={`btn btn-lg ${isRecording ? 'btn-danger' : 'brand-btn-primary'}`}
                      onClick={handleRecordClick}
                      disabled={processing}
                    >
                      {processing
                        ? 'Procesando...'
                        : isRecording
                          ? 'Detener grabación'
                          : 'Grabar pronunciación'}
                    </button>
                  </div>

                  {transcript !== '' && !speechDetected && (
                    <div className="alert brand-alert-neutral" role="alert" aria-live="polite">
                      No se detectó voz en la grabación. Habla más cerca del micrófono e intenta
                      de nuevo.
                    </div>
                  )}

                  {hasResult && (
                    <div aria-live="polite">
                      <p className="small text-muted mb-1">Transcripción detectada:</p>
                      <p className="fst-italic">&ldquo;{transcript}&rdquo;</p>

                      <div className="d-flex justify-content-between small mb-1">
                        <span>Similitud de pronunciación</span>
                        <span>{similarity}%</span>
                      </div>
                      <div className="progress mb-2" style={{ height: '1.5rem' }}>
                        <div
                          className={`progress-bar ${
                            isSuccess
                              ? 'brand-progress-bar-success'
                              : isPartial
                                ? 'brand-progress-bar-warning'
                                : 'brand-progress-bar-danger'
                          }`}
                          style={{ width: `${similarity}%` }}
                        >
                          {similarity}%
                        </div>
                      </div>

                      {isSuccess && (
                        <div className="alert brand-alert-success d-flex justify-content-between align-items-center mb-0">
                          <span>✔ ¡Excelente pronunciación!</span>
                          <button type="button" className="btn brand-btn-success btn-sm" onClick={handleNextPhrase}>
                            {isLastPhrase ? 'Finalizar' : 'Siguiente frase ➜'}
                          </button>
                        </div>
                      )}
                      {isPartial && (
                        <div className="alert brand-alert-warning mb-0 d-flex justify-content-between align-items-center">
                          <span>Casi lo logras — sigue practicando e intenta de nuevo.</span>
                          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleListenPhrase}>
                            🔊 Escuchar ejemplo
                          </button>
                        </div>
                      )}
                      {isFail && (
                        <div className="alert brand-alert-danger mb-0 d-flex justify-content-between align-items-center">
                          <span>No coincide con la frase esperada. Intenta de nuevo.</span>
                          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleListenPhrase}>
                            🔊 Escuchar ejemplo
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <p className="text-center text-muted small mt-3">
            La transcripción se procesa en el servidor y se descarta al instante: el audio no se
            guarda en ninguna base de datos ni almacenamiento.
          </p>
        </div>
      </div>
    </div>
  );
}
