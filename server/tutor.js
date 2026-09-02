const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// openai/gpt-oss-20b (probado antes) a veces filtra su formato interno de
// "canales" y Groq lo malinterpreta como un intento de tool-call, tirando
// un 400 aleatorio. qwen/qwen3.8-27b responde directo, respeta el prompt
// (tono breve, mantiene el sujeto del alumno) y no tuvo ese problema.
const GROQ_MODEL = 'qwen/qwen3.8-27b';

// Alias que Google mantiene apuntando siempre a su modelo "flash-lite"
// vigente (hoy resuelve a gemini-3.5-flash-lite) — evita tener que
// actualizar el nombre a mano cada vez que deprecan una versión. Se usa la
// variante "lite" (no "-preview") porque las preview son modelos de
// razonamiento que también gastan tokens ocultos en "thoughts".
const GEMINI_MODEL = 'gemini-flash-lite-latest';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

async function callGroq(systemPrompt, messages) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY no configurada');

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: 0.4,
      max_tokens: 250,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Groq ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

async function callGemini(systemPrompt, messages) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada');

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.4, maxOutputTokens: 200 },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
}

// Intenta Groq primero (más rápido y con free tier generoso). Si falla por
// cuota agotada, rate-limit, o cualquier otro error, cae automáticamente a
// Gemini. Si no hay GROQ_API_KEY configurada, va directo a Gemini.
export async function getTutorReply(systemPrompt, messages) {
  if (process.env.GROQ_API_KEY) {
    try {
      const text = await callGroq(systemPrompt, messages);
      return { text, provider: 'groq' };
    } catch (err) {
      console.error('[tutor] Groq falló, probando Gemini como respaldo:', err.message);
    }
  } else {
    console.warn('[tutor] GROQ_API_KEY no configurada, usando Gemini directamente.');
  }

  const text = await callGemini(systemPrompt, messages);
  return { text, provider: 'gemini' };
}
