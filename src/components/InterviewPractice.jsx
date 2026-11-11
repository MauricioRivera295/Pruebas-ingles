import { useEffect, useState } from 'react';
import { blobToFloat32Audio } from '../utils/audio.js';
import { transcribeAudio } from '../utils/transcribeApi.js';
import { fetchInterviewAreas, sendTutorMessage, translateText } from '../utils/tutorApi.js';
import { speak, stopSpeaking } from '../utils/speak.js';
import { useMicRecorder } from '../hooks/useMicRecorder.js';
import TutorAvatar from './TutorAvatar.jsx';
import { MicIcon, StopIcon, GlobeIcon, BriefcaseIcon, SpeakerIcon } from './icons.jsx';

const MAX_HISTORY = 16; // ~8 turnos usuario+IA (mismo límite que el server)
const LESSON_ID = 'job-interview';

export default function InterviewPractice() {
  const [areas, setAreas] = useState([]);
  const [areasError, setAreasError] = useState(null);
  const [selectedArea, setSelectedArea] = useState(null); // { id, label, starter }
  const [messages, setMessages] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [subtitle, setSubtitle] = useState('');

  const { isRecording, error: recorderError, start, stop } = useMicRecorder();

  useEffect(() => {
    fetchInterviewAreas()
      .then(setAreas)
      .catch((err) => {
        console.error('[InterviewPractice] No se pudieron cargar las áreas:', err);
        setAreasError('No se pudieron cargar las áreas. Verifica que el servidor esté corriendo.');
      });
  }, []);

  const handlePickArea = (area) => {
    setSelectedArea(area);
    setMessages([{ role: 'assistant', content: area.starter }]);
    setError(null);
    setSubtitle(area.starter);
    speak(area.starter, { onStart: () => setIsSpeaking(true), onEnd: () => setIsSpeaking(false) });
  };

  const handleChangeArea = () => {
    stopSpeaking();
    setSelectedArea(null);
    setMessages([]);
    setSubtitle('');
    setError(null);
  };

  const handleRecordClick = async () => {
    if (isRecording) {
      setProcessing(true);
      setError(null);
      const blob = await stop();
      if (!blob) {
        setProcessing(false);
        return;
      }
      try {
        const audio = await blobToFloat32Audio(blob);
        const userText = (await transcribeAudio(audio)).trim();
        if (!userText) {
          setError('No se detectó voz en la grabación. Intenta de nuevo.');
          setProcessing(false);
          return;
        }

        const withUser = [...messages, { role: 'user', content: userText }].slice(-MAX_HISTORY);
        setMessages(withUser);

        const { text: replyText, provider } = await sendTutorMessage(LESSON_ID, withUser, selectedArea.id);
        const withReply = [...withUser, { role: 'assistant', content: replyText, provider }].slice(-MAX_HISTORY);
        setMessages(withReply);
        setSubtitle(replyText);
        speak(replyText, { onStart: () => setIsSpeaking(true), onEnd: () => setIsSpeaking(false) });
      } catch (err) {
        console.error('[InterviewPractice] Error:', err);
        setError(err.message || 'No se pudo procesar tu respuesta.');
      } finally {
        setProcessing(false);
      }
    } else {
      stopSpeaking();
      await start();
    }
  };

  const handleTranslate = async (index) => {
    setMessages((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], translating: true, translateError: null };
      return next;
    });
    try {
      const { translation } = await translateText(messages[index].content);
      setMessages((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], translation, translating: false };
        return next;
      });
    } catch (err) {
      console.error('[InterviewPractice] Error al traducir:', err);
      setMessages((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], translating: false, translateError: 'No se pudo traducir.' };
        return next;
      });
    }
  };

  return (
    <div className="app-page">
      <div className="surface">
        <div className="surface-body">
          <div className="page-head">
            <div>
              <p className="eyebrow">Módulo · Entrevista</p>
              <h2 className="page-title">Simula tu entrevista de trabajo</h2>
            </div>
            {selectedArea && <span className="step-chip">{messages.length}<span> mensajes</span></span>}
          </div>

          {areasError && (
            <div className="alert brand-alert-danger" role="alert">
              {areasError}
            </div>
          )}

          {!selectedArea && !areasError && (
            <>
              <p className="page-sub mb-3">¿Para qué área quieres practicar tu entrevista?</p>
              <div className="area-grid">
                {areas.map((area) => (
                  <button
                    key={area.id}
                    type="button"
                    className="area-btn"
                    onClick={() => handlePickArea(area)}
                  >
                    <span>{area.label}</span>
                    <BriefcaseIcon />
                  </button>
                ))}
              </div>
            </>
          )}

          {selectedArea && (
            <>
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                <span className="small text-muted">
                  Área: <strong className="text-white">{selectedArea.label}</strong>
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleChangeArea}>
                  Cambiar área
                </button>
              </div>

              <TutorAvatar speaking={isSpeaking} subtitle={subtitle} />

              <div className="chat-scroll" aria-live="polite">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`bubble-row ${m.role === 'user' ? 'is-user' : 'is-ai'}`}
                  >
                    <div className={`bubble ${m.role === 'user' ? 'is-user' : 'is-ai'}`}>
                      <div>{m.content}</div>

                      {m.role === 'assistant' && (
                        <div className="bubble-actions">
                          <button
                            type="button"
                            className="btn-ghost"
                            title="Escuchar esta respuesta"
                            onClick={() =>
                              speak(m.content, {
                                onStart: () => setIsSpeaking(true),
                                onEnd: () => setIsSpeaking(false),
                              })
                            }
                          >
                            <SpeakerIcon /> Escuchar
                          </button>
                          {!m.translation && (
                            <button
                              type="button"
                              className="btn-ghost"
                              onClick={() => handleTranslate(i)}
                              disabled={m.translating}
                            >
                              <GlobeIcon />
                              {m.translating ? 'Traduciendo...' : 'Traducir'}
                            </button>
                          )}
                        </div>
                      )}
                      {m.translation && <div className="bubble-translation">{m.translation}</div>}
                      {m.translateError && (
                        <div className="bubble-translation text-danger">{m.translateError}</div>
                      )}

                      {m.provider && <div className="bubble-meta">vía {m.provider}</div>}
                    </div>
                  </div>
                ))}
              </div>

              {(recorderError || error) && (
                <div className="alert brand-alert-warning mb-3" role="alert">
                  {recorderError || error}
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
                      <MicIcon /> Grabar mi respuesta
                    </>
                  )}
                </button>
                <p className="record-note">
                  Responde como en una entrevista real. El tutor adaptará sus preguntas.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
      <p className="privacy-note">
        Tu voz se transcribe en el servidor y el texto se envía a un proveedor de IA externo (Groq,
        con Gemini como respaldo automático) para generar la respuesta. No se guarda en ninguna base
        de datos.
      </p>
    </div>
  );
}
