import { useEffect, useState } from "react";
import { blobToFloat32Audio } from "../utils/audio.js";
import { transcribeAudio } from "../utils/transcribeApi.js";
import {
  fetchLessons,
  sendTutorMessage,
  translateText,
} from "../utils/tutorApi.js";
import { speak, stopSpeaking } from "../utils/speak.js";
import { useMicRecorder } from "../hooks/useMicRecorder.js";
import TutorAvatar from "./TutorAvatar.jsx";
import { MicIcon, StopIcon, GlobeIcon, SpeakerIcon } from "./icons.jsx";

const MAX_HISTORY = 16; // ~8 turnos usuario+IA (mismo límite que el server)

export default function ConversationPractice() {
  const [lessons, setLessons] = useState([]);
  const [lessonId, setLessonId] = useState(null);
  const [lessonsError, setLessonsError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [subtitle, setSubtitle] = useState("");

  const { isRecording, error: recorderError, start, stop } = useMicRecorder();

  useEffect(() => {
    fetchLessons()
      .then((list) => {
        setLessons(list);
        if (list.length > 0) setLessonId(list[0].id);
      })
      .catch((err) => {
        console.error(
          "[ConversationPractice] No se pudieron cargar las lecciones:",
          err,
        );
        setLessonsError(
          "No se pudieron cargar las lecciones. Verifica que el servidor esté corriendo.",
        );
      });
  }, []);

  // Al entrar a una lección (o cambiarla), la IA "habla primero": muestra y
  // lee en voz alta una frase/pregunta en inglés para que el alumno tenga
  // algo concreto que responder en vez de un chat vacío.
  useEffect(() => {
    const lesson = lessons.find((l) => l.id === lessonId);
    if (!lesson) return;
    setMessages([{ role: "assistant", content: lesson.starter }]);
    setError(null);
    setSubtitle(lesson.starter);
    speak(lesson.starter, {
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
    });
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
          setError("No se detectó voz en la grabación. Intenta de nuevo.");
          setProcessing(false);
          return;
        }

        const withUser = [
          ...messages,
          { role: "user", content: userText },
        ].slice(-MAX_HISTORY);
        setMessages(withUser);

        const { text: replyText, provider } = await sendTutorMessage(
          lessonId,
          withUser,
        );
        const withReply = [
          ...withUser,
          { role: "assistant", content: replyText, provider },
        ].slice(-MAX_HISTORY);
        setMessages(withReply);
        setSubtitle(replyText);
        speak(replyText, {
          onStart: () => setIsSpeaking(true),
          onEnd: () => setIsSpeaking(false),
        });
      } catch (err) {
        console.error("[ConversationPractice] Error:", err);
        setError(err.message || "No se pudo procesar tu respuesta.");
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
      console.error("[ConversationPractice] Error al traducir:", err);
      setMessages((prev) => {
        const next = [...prev];
        next[index] = {
          ...next[index],
          translating: false,
          translateError: "No se pudo traducir.",
        };
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
              <p className="eyebrow">Módulo · Conversación</p>
              <h2 className="page-title">Habla con tu tutor de IA</h2>
            </div>
            <span className="step-chip">
              {messages.length}
              <span> mensajes</span>
            </span>
          </div>

          {lessonsError && (
            <div className="alert brand-alert-danger" role="alert">
              {lessonsError}
            </div>
          )}

          <TutorAvatar
            speaking={isSpeaking}
            subtitle={subtitle}
            // image="/img/avatar.jfif"
          />

          <div className="chat-scroll" aria-live="polite">
            {messages.length === 0 && (
              <p className="text-muted small mb-0">
                Graba tu voz para empezar a conversar en inglés.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`bubble-row ${m.role === "user" ? "is-user" : "is-ai"}`}
              >
                <div className={`bubble ${m.role === "user" ? "is-user" : "is-ai"}`}>
                  <div>{m.content}</div>

                  {m.role === "assistant" && (
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
                          {m.translating ? "Traduciendo..." : "Traducir"}
                        </button>
                      )}
                    </div>
                  )}
                  {m.translation && (
                    <div className="bubble-translation">{m.translation}</div>
                  )}
                  {m.translateError && (
                    <div className="bubble-translation text-danger">
                      {m.translateError}
                    </div>
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
              className={`btn-record ${isRecording ? "is-recording" : ""}`}
              onClick={handleRecordClick}
              disabled={processing || !lessonId}
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
              La IA te responde en voz alta. Habla con naturalidad y vuelve a tocar al terminar.
            </p>
          </div>
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
