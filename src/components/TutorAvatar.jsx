import { useSpeechStatus } from '../hooks/useSpeechStatus.js';

// Orbe estilo ChatGPT/Siri (círculo con degradado de marca) que pulsa
// mientras el tutor habla, con subtítulo del texto debajo. Mientras el audio
// viaja desde el servidor muestra un spinner para que el alumno sepa que la
// voz se está generando. Sin costo ni dependencias externas.
export default function TutorAvatar({ speaking, subtitle, image }) {
  const { loading } = useSpeechStatus();

  return (
    <div className="tutor">
      <div
        className={`tutor-orb ${loading ? 'is-loading' : ''} ${speaking && !loading ? 'speaking' : ''}`}
        aria-hidden="true"
      >
        {loading ? (
          <span className="spinner-border" role="status" />
        ) : image ? (
          <img src={image} alt="" className="tutor-orb-img" />
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 5 6 9H2v6h4l5 4V5Z" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M18.5 5.5a9 9 0 0 1 0 13" />
          </svg>
        )}
      </div>

      {loading && (
        <span className="audio-chip" role="status" aria-live="polite">
          <span className="spinner-border spinner-border-sm" aria-hidden="true" />
          Generando audio…
        </span>
      )}

      {subtitle && <p className="tutor-subtitle">&ldquo;{subtitle}&rdquo;</p>}
    </div>
  );
}
