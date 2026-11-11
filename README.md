# Práctica de Pronunciación (Transformers.js + servidor)

Componente de práctica de pronunciación para un centro de idiomas. El
reconocimiento de voz (Whisper vía
[Transformers.js](https://github.com/xenova/transformers.js)) corre en un
servidor Node/Express: el modelo se descarga y carga **una sola vez para
todos los estudiantes**, no en cada navegador. El audio se procesa en
memoria por cada práctica y **nunca se guarda en disco ni en una base de
datos**.

> Nota: esto cambia el requisito original de "todo se procesa localmente en
> el navegador". Se optó por este diseño porque el modelo (~40 MB) tardaba
> en descargarse la primera vez en cada dispositivo; moverlo al servidor
> hace que ningún estudiante pague ese costo, a cambio de que el audio (no
> el transcript, no metadatos) viaje por red hacia el propio servidor —
> nunca a terceros, y sin persistencia. Si se prefiere volver al
> procesamiento 100% en cliente, ver la sección "Alternativa 100% cliente"
> más abajo.

## Requisitos

- Node.js 18+
- Un navegador moderno (Chrome, Edge, Firefox) con acceso a micrófono

## Instalación y ejecución (desarrollo)

```bash
npm install
npm run dev
```

Esto levanta **dos procesos** con `concurrently`:

- `dev:server` → API Express en `http://localhost:3001` (carga el modelo al
  arrancar)
- `dev:client` → Vite en `http://localhost:5173` (proxéa `/api` al server)

Abre la URL que imprime Vite. La primera vez que arranca el **servidor**,
descarga `Xenova/whisper-tiny.en` (~40 MB) y lo cachea en
`server/.cache/`; los siguientes arranques ya no vuelven a descargarlo. Los
navegadores de los estudiantes nunca descargan el modelo.

## Producción

```bash
npm run build   # genera dist/
npm start        # server/index.js sirve dist/ y expone /api
```

Un único proceso Node sirve tanto el frontend estático como la API.

## Arquitectura

```
server/index.js                         Express: carga el modelo 1 vez, expone /api/transcribe y /api/health
src/
  components/PronunciationPractice.jsx  UI principal (estado, grabación, feedback)
  hooks/useMicRecorder.js               getUserMedia + MediaRecorder
  utils/audio.js                        Blob -> Float32Array mono 16 kHz (formato de Whisper)
  utils/transcribeApi.js                Cliente fetch de /api/transcribe y /api/health
  utils/ttsApi.js                       Cliente fetch de /api/tts (caché por texto + proveedor)
  utils/speak.js                        Reproducción TTS, preferencia de voz y estado observable
  hooks/useSpeechStatus.js              Hook que expone el estado de la voz (loading/speaking)
  utils/levenshtein.js                  Distancia de Levenshtein y % de similitud
  data/phrases.js                       Banco de frases de práctica (inglés)
```

### Flujo de una práctica

1. El usuario graba su voz (`MediaRecorder` vía `useMicRecorder`).
2. El `Blob` resultante se decodifica y remuestrea a mono/16 kHz en el
   propio navegador (`utils/audio.js`) — esto es barato (Web Audio API) y
   no requiere el modelo.
3. El `Float32Array` se envía como bytes crudos (`application/octet-stream`)
   a `POST /api/transcribe`.
4. El servidor ejecuta el pipeline ASR (ya cargado en memoria) sobre esos
   bytes y responde `{ text }`. El buffer de audio y la respuesta se
   descartan al terminar el request; no se escriben a disco ni a una base
   de datos.
5. `utils/levenshtein.js` normaliza (minúsculas, sin acentos/puntuación) y
   compara el transcript con la frase esperada, devolviendo un % de
   similitud.
6. Si la similitud es **≥ 85%** se muestra feedback de éxito; entre 60% y
   85% se marca en amarillo como "sigue practicando"; por debajo, en rojo.

### Por qué esto resuelve la descarga lenta

Antes, `@xenova/transformers` corría en un Web Worker del navegador y cada
estudiante descargaba el modelo (~40 MB) la primera vez que abría la
página. Ahora el modelo se descarga y carga **una sola vez, en el
servidor**, al arrancar. Cada práctica solo envía un clip de audio corto
(unos cientos de KB) y recibe texto — mucho más rápido que bajar decenas
de MB por dispositivo, y el bundle del cliente se redujo (ya no incluye
`@xenova/transformers` ni el worker de ~800 KB).

### Privacidad: sin base de datos

`server/index.js` no usa ningún almacenamiento persistente. El audio llega
como buffer en memoria dentro del handler de `/api/transcribe`, se
transcribe y la variable se descarta al responder (recolección de basura
normal de Node) — no hay `fs.writeFile`, ni tabla, ni caché de audio en
ningún punto del código.

### Paleta de marca (`src/brand.css`)

Tema oscuro sobre Bootstrap 5 (`data-bs-theme="dark"`), con todos los
colores centralizados como tokens CSS:

| Uso                          | Color                                        |
| ---------------------------- | -------------------------------------------- |
| Fondo de la app              | `#121212`                                    |
| Superficies / tarjetas       | `#00152A`                                    |
| Primario (CTAs, activo)      | `#FFCC00`                                    |
| Acento (gradientes, avisos)  | `#FF9900`                                    |
| Error / detener grabación    | `#FF4D4D` (solo estados de stop y error)     |

El degradado de marca (`--grad-brand`) va de `#FFCC00` a `#FF9900` y se usa
en el botón de grabar, la pestaña activa y la opción de voz seleccionada.
Los textos sobre fondo oscuro usan `--c-text` / `--c-text-dim`, elegidos
para cumplir contraste AA (verificado con axe en las 6 pestañas).

### Voces de los ejercicios (Gemini / ElevenLabs)

`POST /api/tts` acepta `{ text, provider }`, donde `provider` es
`"gemini"`, `"elevenlabs"` o `"auto"` (por defecto). El servidor intenta
primero el proveedor elegido y, si falla (cuota, rate-limit, key ausente),
usa el otro como respaldo; la respuesta incluye el header
`X-TTS-Provider` con el proveedor realmente usado.

En la interfaz, el selector **Voz** del encabezado (`src/App.jsx`) cambia
la preferencia en caliente y la guarda en `localStorage`
(`englishlab.ttsProvider`), así que se mantiene entre visitas. Al cambiar
de voz se corta el audio en curso, se descarta el audio cacheado de ese
proveedor y se vuelve a sintetizar y reproducir la última frase con la voz
nueva, sin recargar la página. Si hubo respaldo, aparece un aviso bajo el
selector ("Respaldo activo: …"). Si ambos proveedores fallan,
`src/utils/speak.js` cae a la voz nativa del navegador
(`SpeechSynthesis`). Mientras el audio se genera se muestra un loader
(spinner en el botón y chip "Generando audio…").

Si un proveedor responde 429 (cuota/rate-limit) o 401/403 (credenciales),
el servidor lo pone en pausa 10 minutos (1 hora para credenciales) y usa
el otro directamente, en vez de esperar el fallo en cada frase. Cada
respuesta del tutor en **Conversación** y **Entrevista** tiene un botón
**Escuchar** para repetirla cuando el alumno quiera (usa el audio cacheado,
sin gastar cuota).

## Alternativa 100% cliente

Si el requisito de "el audio nunca sale del navegador" es innegociable
(por ejemplo por política de privacidad del centro), la versión anterior
—modelo cargado en un Web Worker con `@xenova/transformers` en el
cliente— es la opción correcta pese a la descarga inicial más lenta (que
solo ocurre una vez por navegador, gracias al cache HTTP). Puede
reconstruirse revirtiendo `PronunciationPractice.jsx` a comunicarse con un
`Worker` en vez de `fetch('/api/transcribe')`, eliminando la dependencia
del servidor Express.

## Notas / mejoras sobre el prompt original

- El `.md` original no incluía el "código base del componente" (la
  sección 2 está vacía), así que el componente se construyó desde cero
  siguiendo los requerimientos listados.
- Se usa `whisper-tiny.en` (en vez de un modelo multilingüe) porque es
  notablemente más rápido/liviano y el caso de uso es práctica de
  pronunciación en inglés; puede cambiarse en `server/index.js` si se
  necesita otro idioma.
- Se agregó manejo de errores (permiso de micrófono denegado, servidor
  caído, fallo de transcripción) con mensajes claros para el usuario.
- La distancia de Levenshtein se implementó con complejidad O(n) en
  espacio (dos filas en vez de la matriz completa) y normaliza el texto
  (minúsculas, sin acentos ni puntuación) antes de comparar, para no
  penalizar diferencias irrelevantes para la pronunciación.
