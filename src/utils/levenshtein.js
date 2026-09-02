// Distancia de Levenshtein con complejidad O(n) en espacio (solo se
// mantienen dos filas de la matriz DP en lugar de la matriz completa).
export function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prevRow = Array.from({ length: n + 1 }, (_, j) => j);
  let currRow = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    currRow[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1, // eliminación
        currRow[j - 1] + 1, // inserción
        prevRow[j - 1] + cost // sustitución
      );
    }
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[n];
}

const DIACRITICS_REGEX = new RegExp('[\\u0300-\\u036f]', 'g');

// Normaliza texto para comparar pronunciación sin penalizar mayúsculas,
// acentos o puntuación (irrelevantes para el reconocimiento fonético).
function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// true si el transcript trae algo de texto (el ASR detectó voz), false si
// vino vacío (silencio / no se capturó nada reconocible). Distinguir esto
// evita confundir "no se grabó nada" con "pronunciación incorrecta".
export function hasDetectedSpeech(hypothesis) {
  return normalize(hypothesis).length > 0;
}

// Similitud 0-1 entre dos palabras individuales, basada en Levenshtein.
function wordSimilarity(a, b) {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return Math.max(0, 1 - levenshteinDistance(a, b) / maxLen);
}

// Similitud porcentual (0-100) entre el transcript detectado y la frase
// esperada. Compara palabra por palabra (alineación tipo Levenshtein), con
// dos formas de tolerancia:
//  1. Sustitución "difusa": si el reconocimiento confunde una sola letra
//     dentro de una palabra ("hallo" en vez de "hello") resta
//     proporcionalmente en vez de contar como error total.
//  2. Palabras de más NO penalizan: Whisper suele "alucinar" texto extra al
//     final de audios muy cortos (ej. agregar "for watching"). Solo importa
//     si las palabras de la frase objetivo están presentes y bien dichas,
//     no si sobra algo alrededor.
export function similarityPercentage(hypothesis, reference) {
  const hypWords = normalize(hypothesis).split(' ').filter(Boolean);
  const refWords = normalize(reference).split(' ').filter(Boolean);

  if (refWords.length === 0) return 100;
  if (hypWords.length === 0) return 0;

  const m = hypWords.length;
  const n = refWords.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = 0; // palabras de más al inicio: gratis
  for (let j = 0; j <= n; j++) dp[0][j] = j; // palabras de la frase aún no dichas: cuentan

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const subCost = 1 - wordSimilarity(hypWords[i - 1], refWords[j - 1]);
      dp[i][j] = Math.min(
        dp[i - 1][j], // palabra de más (gratis)
        dp[i][j - 1] + 1, // palabra faltante
        dp[i - 1][j - 1] + subCost // palabra distinta (costo proporcional, no binario)
      );
    }
  }

  const similarity = (1 - dp[m][n] / n) * 100;
  return Math.max(0, Math.round(similarity));
}
