import { useEffect, useState } from 'react';
import { blobToFloat32Audio } from '../utils/audio.js';
import { transcribeAudio } from '../utils/transcribeApi.js';
import { fetchInterviewAreas, sendTutorMessage, translateText } from '../utils/tutorApi.js';
import { speak, stopSpeaking } from '../utils/speak.js';
import { useMicRecorder } from '../hooks/useMicRecorder.js';
import TutorAvatar from './TutorAvatar.jsx';

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
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-lg-8">
          <div className="card shadow-sm">
            <div className="card-body">
              <h1 className="h4 mb-3">Entrevista de Trabajo</h1>

              {areasError && <div className="alert brand-alert-danger">{areasError}</div>}

              {!selectedArea && !areasError && (
                <>
                  <p className="text-muted small">¿Para qué área quieres practicar tu entrevista?</p>
                  <div className="d-flex flex-wrap gap-2 mb-2">
                    {areas.map((area) => (
                      <button
                        key={area.id}
                        type="button"
                        className="btn brand-btn-primary btn-sm"
                        onClick={() => handlePickArea(area)}
                      >
                        {area.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {selectedArea && (
                <>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="small text-muted">Área: {selectedArea.label}</span>
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleChangeArea}>
                      Cambiar área
                    </button>
                  </div>

                  <TutorAvatar speaking={isSpeaking} subtitle={subtitle} />

                  <div className="mb-3 p-2" style={{ maxHeight: '360px', overflowY: 'auto' }}>
                    {messages.map((m, i) => (
                      <div
                        key={i}
                        className={`mb-2 d-flex ${m.role === 'user' ? 'justify-content-end' : 'justify-content-start'}`}
                      >
                        <div
                          className={`p-2 rounded ${m.role === 'user' ? 'brand-btn-primary' : 'brand-phrase-box'}`}
                          style={{ maxWidth: '80%' }}
                        >
                          <div className="small">{m.content}</div>

                          {m.role === 'assistant' && !m.translation && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary mt-1 py-0 px-1"
                              style={{ fontSize: '0.7rem' }}
                              onClick={() => handleTranslate(i)}
                              disabled={m.translating}
                            >
                              {m.translating ? 'Traduciendo...' : '🌐 Traducir'}
                            </button>
                          )}
                          {m.translation && (
                            <div className="small text-muted mt-1 fst-italic">{m.translation}</div>
                          )}
                          {m.translateError && <div className="small text-danger mt-1">{m.translateError}</div>}

                          {m.provider && <div className="small text-muted mt-1">vía {m.provider}</div>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {(recorderError || error) && (
                    <div className="alert brand-alert-warning" role="alert">
                      {recorderError || error}
                    </div>
                  )}

                  <div className="d-grid">
                    <button
                      type="button"
                      className={`btn btn-lg ${isRecording ? 'btn-danger' : 'brand-btn-primary'}`}
                      onClick={handleRecordClick}
                      disabled={processing}
                    >
                      {processing ? 'Procesando...' : isRecording ? 'Detener grabación' : 'Grabar mi respuesta'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          <p className="text-center text-muted small mt-3">
            Tu voz se transcribe en el servidor y el texto se envía a un proveedor de IA externo
            (Groq, con Gemini como respaldo automático) para generar la respuesta. No se guarda
            en ninguna base de datos.
          </p>
        </div>
      </div>
    </div>
  );
}
