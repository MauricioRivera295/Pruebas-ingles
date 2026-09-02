import { useCallback, useEffect, useRef, useState } from 'react';
import { stopSpeaking } from '../utils/speak.js';

const STOP_TIMEOUT_MS = 5000;

// Mensajes específicos por tipo de error de getUserMedia, en vez de un
// genérico "no se pudo acceder" que no dice qué hacer.
function describeMicError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Permiso de micrófono denegado. Habilítalo para este sitio en la configuración del navegador (ícono de candado/cámara junto a la URL) y recarga la página.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No se encontró ningún micrófono conectado. Verifica que haya uno disponible.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'El micrófono está siendo usado por otra aplicación o pestaña. Ciérrala e intenta de nuevo.';
    case 'SecurityError':
      return 'El navegador bloqueó el acceso al micrófono: se requiere HTTPS (o localhost).';
    default:
      return 'No se pudo acceder al micrófono. Verifica los permisos del navegador.';
  }
}

// Encapsula getUserMedia + MediaRecorder. Nunca sube audio a un servidor:
// el Blob resultante se procesa localmente en el componente que consume el hook.
export function useMicRecorder() {
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);

  const start = useCallback(async () => {
    setError(null);
    // Si el usuario estaba escuchando la pronunciación de ejemplo (ElevenLabs
    // o voz del navegador), se corta para que el micrófono no la capte junto
    // con su voz.
    stopSpeaking();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      console.log('[useMicRecorder] MediaRecorder creado, mimeType:', mediaRecorder.mimeType);
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        console.log('[useMicRecorder] dataavailable, tamaño:', event.data.size, 'bytes');
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      mediaRecorder.onerror = (event) => {
        console.error('[useMicRecorder] Error del MediaRecorder:', event.error || event);
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      console.log('[useMicRecorder] Grabación iniciada.');
    } catch (err) {
      console.error('[useMicRecorder] No se pudo iniciar la grabación:', err.name, err.message);
      setError(describeMicError(err));
    }
  }, []);

  const stop = useCallback(() => {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        console.error(
          '[useMicRecorder] stop() llamado sin una grabación activa (state:',
          mediaRecorder?.state,
          ')'
        );
        setError('No había una grabación activa. Intenta grabar de nuevo.');
        resolve(null);
        return;
      }

      let settled = false;
      const finish = (blob, failureMessage) => {
        if (settled) return;
        settled = true;
        clearTimeout(safetyTimer);
        streamRef.current?.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        if (failureMessage) setError(failureMessage);
        resolve(blob);
      };

      // Salvaguarda: si por lo que sea el evento "stop" nunca llega (bug de
      // navegador, dispositivo desconectado), no dejar la UI colgada — y,
      // a diferencia de antes, siempre mostrar un mensaje en vez de volver
      // al estado inicial en silencio.
      const safetyTimer = setTimeout(() => {
        console.error(
          '[useMicRecorder] Tiempo de espera agotado esperando el evento stop del MediaRecorder. Chunks capturados:',
          chunksRef.current.length
        );
        if (chunksRef.current.length > 0) {
          finish(new Blob(chunksRef.current, { type: mediaRecorder.mimeType }));
        } else {
          finish(
            null,
            'No se pudo capturar audio de la grabación (el navegador no respondió). Intenta de nuevo.'
          );
        }
      }, STOP_TIMEOUT_MS);

      mediaRecorder.onstop = () => {
        console.log('[useMicRecorder] evento stop recibido, chunks:', chunksRef.current.length);
        if (chunksRef.current.length === 0) {
          finish(null, 'No se detectó audio en la grabación. Intenta de nuevo.');
          return;
        }
        finish(new Blob(chunksRef.current, { type: mediaRecorder.mimeType }));
      };
      mediaRecorder.stop();
    });
  }, []);

  // Si el componente se desmonta a medio grabar (ej. cambio de pestaña sin
  // detener), libera el micrófono en vez de dejarlo abierto — un stream
  // huérfano puede bloquear el acceso exclusivo del micrófono en otro
  // componente que también use getUserMedia.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return { isRecording, error, start, stop };
}
