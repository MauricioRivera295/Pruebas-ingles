import { useEffect, useState } from 'react';
import { blobToFloat32Audio } from '../utils/audio.js';
import { transcribeAudio } from '../utils/transcribeApi.js';
import { fetchLessons, sendTutorMessage, translateText } from '../utils/tutorApi.js';
import { speak, stopSpeaking } from '../utils/speak.js';
import { useMicRecorder } from '../hooks/useMicRecorder.js';

const MAX_HISTORY = 16; // ~8 turnos usuario+IA (mismo límite que el server)

export default function ConversationPractice() {
  const [lessons, setLessons] = useState([]);
  const [lessonId, setLessonId] = useState(null);
  const [lessonsError, setLessonsError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  const { isRecording, error: recorderError, start, stop } = useMicRecorder();

  useEffect(() => {
    fetchLessons()
      .then((list) => {
        setLessons(list);
        if (list.length > 0) setLessonId(list[0].id);
      })
      .catch((err) => {
        console.error('[ConversationPractice] No se pudieron cargar las lecciones:', err);
        setLessonsError('No se pudieron cargar las lecciones. Verifica que el servidor esté corriendo.');
      });
  }, []);

  // Al entrar a una lección (o cambiarla), la IA "habla primero": muestra y
  // lee en voz alta una frase/pregunta en inglés para que el alumno tenga
  // algo concreto que responder en vez de un chat vacío.
  useEffect(() => {
    const lesson = lessons.find((l) => l.id === lessonId);
    if (!lesson) return;
    setMessages([{ role: 'assistant', content: lesson.starter }]);
    setError(null);
    speak(lesson.starter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, lessons]);

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

        const { text: replyText, provider } = await sendTutorMessage(lessonId, withUser);
        const withReply = [...withUser, { role: 'assistant', content: replyText, provider }].slice(-MAX_HISTORY);
        setMessages(withReply);
        speak(replyText);
      } catch (err) {
        console.error('[ConversationPractice] Error:', err);
        setError(err.message || 'No se pudo procesar tu respuesta.');
      } finally {
        setProcessing(false);
      }
    } else {
      stopSpeaking();
      await start();
    }
  };

  // Traduce un mensaje de la IA bajo demanda (por si el alumno se pierde) y
  // guarda la traducción en ese mismo mensaje del historial.
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
      console.error('[ConversationPractice] Error al traducir:', err);
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
              <h1 className="h4 mb-3">Conversación con IA</h1>

              {lessonsError && <div className="alert brand-alert-danger">{lessonsError}</div>}

              <div className="mb-3 p-2" style={{ maxHeight: '360px', overflowY: 'auto' }}>
                {messages.length === 0 && (
                  <p className="text-muted small mb-0">Graba tu voz para empezar a conversar en inglés.</p>
                )}
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
                      {m.translateError && (
                        <div className="small text-danger mt-1">{m.translateError}</div>
                      )}

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
                  disabled={processing || !lessonId}
                >
                  {processing ? 'Procesando...' : isRecording ? 'Detener grabación' : 'Grabar mi respuesta'}
                </button>
              </div>
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
