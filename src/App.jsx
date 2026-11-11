import { useEffect, useState } from 'react';
import PronunciationPractice from './components/PronunciationPractice.jsx';
import DialoguePractice from './components/DialoguePractice.jsx';
import ConversationPractice from './components/ConversationPractice.jsx';
import ReadingPractice from './components/ReadingPractice.jsx';
import TypingPractice from './components/TypingPractice.jsx';
import InterviewPractice from './components/InterviewPractice.jsx';
import { setSpeechProvider, unlockAudio } from './utils/speak.js';
import { useSpeechStatus } from './hooks/useSpeechStatus.js';

const PROVIDER_LABELS = {
  gemini: 'Gemini',
  elevenlabs: 'ElevenLabs',
  browser: 'voz del navegador',
};

const TABS = [
  { id: 'pronunciation', label: 'Pronunciación', icon: 'mic' },
  { id: 'dialogue', label: 'Diálogo', icon: 'chat' },
  { id: 'conversation', label: 'Conversación IA', icon: 'sparkles' },
  { id: 'reading', label: 'Lectura', icon: 'book' },
  { id: 'typing', label: 'Escritura', icon: 'keyboard' },
  { id: 'interview', label: 'Entrevista', icon: 'briefcase' },
];

const ICON_PATHS = {
  mic: (
    <>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
    </>
  ),
  chat: (
    <>
      <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    </>
  ),
  book: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
    </>
  ),
  briefcase: (
    <>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </>
  ),
  cap: (
    <>
      <path d="M22 10 12 5 2 10l10 5 10-5Z" />
      <path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
    </>
  ),
};

function Icon({ name, className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

export default function App() {
  const [tab, setTab] = useState('pronunciation');
  const { provider, lastProvider } = useSpeechStatus();
  const fallbackLabel =
    lastProvider && lastProvider !== provider ? PROVIDER_LABELS[lastProvider] : null;

  // Desbloquea la reproducción de audio en el primer gesto del usuario.
  // Safari/iOS exige que el primer play() ocurra dentro de un gesto; como el
  // TTS llega después de un fetch, sin esto la respuesta del tutor podría no
  // sonar. En Chrome/Edge es inofensivo.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    window.addEventListener('keydown', unlock, { once: true, capture: true });
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
  }, []);

  // En móvil, al cambiar de módulo se centra la pestaña activa dentro del
  // carrusel horizontal para que el usuario no pierda el contexto.
  useEffect(() => {
    document
      .querySelector('.tab.active')
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [tab]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="container app-header-inner">
          <div className="brand">
            <div className="brand-mark">
              <Icon name="cap" />
            </div>
            <div style={{ minWidth: 0 }}>
              <p className="brand-eyebrow">Centro de Idiomas</p>
              <h1 className="brand-title">English Lab</h1>
            </div>
          </div>
          <div className="header-actions">
            <span className="level-pill">
              <span className="dot" aria-hidden="true" />
              Inglés · A1–B1
            </span>

            <div className="voice-box">
              <div className="voice-switch" role="group" aria-label="Voz de los ejercicios">
                <span className="voice-switch-label" aria-hidden="true">
                  Voz
                </span>
                <div className="voice-switch-track">
                  <button
                    type="button"
                    className={`voice-option ${provider === 'gemini' ? 'is-active' : ''}`}
                    aria-pressed={provider === 'gemini'}
                    onClick={() => setSpeechProvider('gemini')}
                  >
                    Gemini
                  </button>
                  <button
                    type="button"
                    className={`voice-option ${provider === 'elevenlabs' ? 'is-active' : ''}`}
                    aria-pressed={provider === 'elevenlabs'}
                    onClick={() => setSpeechProvider('elevenlabs')}
                  >
                    ElevenLabs
                  </button>
                </div>
              </div>
              {fallbackLabel && (
                <p className="voice-note" role="status">
                  Respaldo activo: {fallbackLabel}
                </p>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="tabbar-wrap">
        <nav className="container" aria-label="Módulos de práctica">
          <div className="tabbar" role="tablist">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={`tab ${tab === item.id ? 'active' : ''}`}
                onClick={() => setTab(item.id)}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>

      <main className="container app-main">
        <div key={tab}>
          {tab === 'pronunciation' && <PronunciationPractice />}
          {tab === 'dialogue' && <DialoguePractice />}
          {tab === 'conversation' && <ConversationPractice />}
          {tab === 'reading' && <ReadingPractice />}
          {tab === 'typing' && <TypingPractice />}
          {tab === 'interview' && <InterviewPractice />}
        </div>
      </main>

      <footer className="app-footer">
        <div className="container">
          <strong>English Lab</strong> · Práctica de inglés del Centro de Idiomas
        </div>
      </footer>
    </div>
  );
}
