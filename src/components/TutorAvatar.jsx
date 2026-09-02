// Avatar con foto (public/img/avatar.jfif) que gesticula (leve zoom/tilt +
// anillo de pulso) mientras el tutor habla, con subtítulo del texto debajo.
// No es lip-sync real sobre una foto estática (necesitaría un servicio de
// video con costo, ej. D-ID) — solo simula "está hablando" con movimiento.
export default function TutorAvatar({ speaking, subtitle }) {
  return (
    <div className="text-center mb-3">
      <img
        src="/img/avatar.jfif"
        alt="Tutora de inglés"
        className={`tutor-avatar-img mx-auto ${speaking ? 'speaking' : ''}`}
      />
      {subtitle && <p className="small text-muted mt-2 mb-0 fst-italic">&ldquo;{subtitle}&rdquo;</p>}
    </div>
  );
}
