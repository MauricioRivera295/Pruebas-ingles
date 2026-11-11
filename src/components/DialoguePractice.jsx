import { useEffect, useRef, useState } from 'react';
import { dialogues } from '../data/dialogues.js';
import { hasDetectedSpeech, similarityPercentage } from '../utils/levenshtein.js';
import { blobToFloat32Audio } from '../utils/audio.js';
import { checkModelHealth, transcribeAudio } from '../utils/transcribeApi.js';
import { speak } from '../utils/speak.js';
import { useMicRecorder } from '../hooks/useMicRecorder.js';
import { useSpeechStatus } from '../hooks/useSpeechStatus.js';
import TutorAvatar from './TutorAvatar.jsx';
import { MicIcon, StopIcon, SpeakerIcon, ResetIcon } from './icons.jsx';

const SUCCESS_THRESHOLD = 85;
const WARNING_THRESHOLD = 60;
const HEALTH_POLL_MS = 1500;

export default function DialoguePractice() {
  const [modelStatus, setModelStatus] = useState('loading'); // loading | ready | error
  const [dialogueIndex, setDialogueIndex] = useState(0);
  const [turnIndex, setTurnIndex] = useState(0);
  const [dialogueComplete, setDialogueComplete] = useState(false);
  const [questionSpeaking, setQuestionSpeaking] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [similarity, setSimilarity] = useState(null);
  const [speechDetected, setSpeechDetected] = useState(true);
  const [processingError, setProcessingError] = useState(null);
  const [recordingUrl, setRecordingUrl] = useState(null);
  const recordingUrlRef = useRef(null);

  const { isRecording, error: recorderError, start, stop } = useMicRecorder();
  const { loading: audioLoading } = useSpeechStatus();

  const currentDialogue = dialogues[dialogueIndex];
  const currentTurn = currentDialogue.turns[turnIndex];
  const isLastTurn = turnIndex === currentDialogue.turns.length - 1;
  const isLastDialogue = dialogueIndex === dialogues.length - 1;
  const hasResult = similarity !== null && speechDetected;
  const isSuccess = hasResult && similarity >= SUCCESS_THRESHOLD;
  const isPartial = hasResult && similarity >= WARNING_THRESHOLD && similarity < SUCCESS_THRESHOLD;
  const isFail = hasResult && similarity < WARNING_THRESHOLD;

  // El modelo de reconocimiento vive en el servidor; solo hacemos polling
  // hasta que esté listo (igual que en Pronunciación).
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

  // Al entrar a un turno nuevo, se reproduce sola la "pregunta" de la otra
  // persona, como si fuera ella la que habla primero en la conversación.
  useEffect(() => {
    if (modelStatus !== 'ready' || dialogueComplete) return;
    resetResult();
    speak(currentTurn.question, {
      onStart: () => setQuestionSpeaking(true),
      onEnd: () => setQuestionSpeaking(false),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelStatus, dialogueIndex, turnIndex, dialogueComplete]);

  useEffect(() => {
    return () => {
      if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    };
  }, []);

  const handleRecordClick = async () => {
    if (isRecording) {
      setProcessing(true);
      resetResult();
      const blob = await stop();
      if (!blob) {
        setProcessing(false);
        return;
      }
      const url = URL.createObjectURL(blob);
      recordingUrlRef.current = url;
      setRecordingUrl(url);
      try {
        const audio = await blobToFloat32Audio(blob);
        const text = await transcribeAudio(audio);
        const cleanText = text.trim();
        const detected = hasDetectedSpeech(cleanText);
        setTranscript(cleanText);
        setSpeechDetected(detected);
        setSimilarity(detected ? similarityPercentage(cleanText, currentTurn.answer) : 0);
      } catch (err) {
        console.error('[DialoguePractice] Error al procesar la grabación:', err);
        setProcessingError(err.message || 'No se pudo procesar el audio grabado.');
      } finally {
        setProcessing(false);
      }
    } else {
      resetResult();
      await start();
    }
  };

  const handleNextTurn = () => {
    if (isLastTurn) {
      setDialogueComplete(true);
    } else {
      setTurnIndex((index) => index + 1);
    }
  };

  const handleNextDialogue = () => {
    setDialogueIndex((index) => (isLastDialogue ? 0 : index + 1));
    setTurnIndex(0);
    setDialogueComplete(false);
  };

  const handleRestartDialogue = () => {
    setTurnIndex(0);
    setDialogueComplete(false);
  };

  const handleListenQuestion = () => {
    speak(currentTurn.question, {
      onStart: () => setQuestionSpeaking(true),
      onEnd: () => setQuestionSpeaking(false),
    });
  };

  const handleListenAnswer = () => {
    speak(currentTurn.answer);
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
              <p className="eyebrow">Módulo · Diálogo</p>
              <h2 className="page-title">{currentDialogue.title}</h2>
            </div>
            {modelStatus === 'ready' && !dialogueComplete && (
              <span className="step-chip">
                {turnIndex + 1}
                <span>/{currentDialogue.turns.length}</span>
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

          {modelStatus === 'ready' && (
            <>
              {dialogueComplete ? (
                <div className="text-center py-4">
                  <p className="display-6 mb-2">🎉</p>
                  <p className="fs-5 fw-semibold mb-3">¡Completaste el diálogo!</p>
                  <div className="d-flex flex-wrap gap-2 justify-content-center">
                    <button type="button" className="btn btn-ghost" onClick={handleRestartDialogue}>
                      <ResetIcon /> Reiniciar
                    </button>
                    <button type="button" className="btn btn-brand" onClick={handleNextDialogue}>
                      {isLastDialogue ? 'Volver al primer diálogo' : 'Siguiente diálogo ➜'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <TutorAvatar speaking={questionSpeaking} subtitle={currentTurn.question} />

                  <div className="text-center mb-3">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={handleListenQuestion}
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
                          <SpeakerIcon /> Escuchar pregunta de nuevo
                        </>
                      )}
                    </button>
                  </div>

                  <div className="phrase-card mb-3">
                    <span className="phrase-label">Tú respondes</span>
                    <p className="phrase-text">&ldquo;{currentTurn.answer}&rdquo;</p>
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
                          <MicIcon /> Grabar respuesta
                        </>
                      )}
                    </button>
                    <p className="record-note">
                      Responde en inglés y vuelve a tocar para recibir tu evaluación.
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
                          <span>✔ ¡Excelente!</span>
                          <button type="button" className="btn brand-btn-success btn-sm" onClick={handleNextTurn}>
                            {isLastTurn ? 'Finalizar diálogo' : 'Siguiente ➜'}
                          </button>
                        </div>
                      )}

                      {isPartial && (
                        <div className="alert brand-alert-warning mb-0">
                          <p className="mb-0">Casi lo logras — escucha cómo se dice y reintenta.</p>
                          <div className="result-actions">
                            <button type="button" className="btn-ghost btn-sm" onClick={handleListenMine}>
                              <SpeakerIcon /> Lo que dije
                            </button>
                            <button type="button" className="btn-ghost btn-sm" onClick={handleListenAnswer}>
                              <SpeakerIcon /> Cómo se dice
                            </button>
                          </div>
                        </div>
                      )}

                      {isFail && (
                        <div className="alert brand-alert-danger mb-0">
                          <p className="mb-0">No coincide con la respuesta esperada. Intenta de nuevo.</p>
                          <div className="result-actions">
                            <button type="button" className="btn-ghost btn-sm" onClick={handleListenMine}>
                              <SpeakerIcon /> Lo que dije
                            </button>
                            <button type="button" className="btn-ghost btn-sm" onClick={handleListenAnswer}>
                              <SpeakerIcon /> Cómo se dice
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
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
