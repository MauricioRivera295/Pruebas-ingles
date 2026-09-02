import { useState } from 'react';
import PronunciationPractice from './components/PronunciationPractice.jsx';
import ConversationPractice from './components/ConversationPractice.jsx';

export default function App() {
  const [tab, setTab] = useState('pronunciation');

  return (
    <div>
      <nav className="navbar brand-banner py-3">
        <div className="container">
          <span className="navbar-brand mb-0 h1 text-white">Centro de Idiomas · Práctica de Pronunciación</span>
        </div>
      </nav>

      <div className="container pt-4">
        <ul className="nav nav-pills justify-content-center">
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link ${tab === 'pronunciation' ? 'active' : ''}`}
              onClick={() => setTab('pronunciation')}
            >
              Pronunciación
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link ${tab === 'conversation' ? 'active' : ''}`}
              onClick={() => setTab('conversation')}
            >
              Conversación con IA
            </button>
          </li>
        </ul>
      </div>

      {tab === 'pronunciation' ? <PronunciationPractice /> : <ConversationPractice />}
    </div>
  );
}
