import { useSyncExternalStore } from 'react';
import { getSpeechStatus, subscribeSpeechStatus } from '../utils/speak.js';

// Devuelve { loading, speaking } y re-renderiza solo cuando cambia el estado
// de la voz (carga del audio desde /api/tts o reproducción en curso).
export function useSpeechStatus() {
  return useSyncExternalStore(subscribeSpeechStatus, getSpeechStatus, getSpeechStatus);
}
