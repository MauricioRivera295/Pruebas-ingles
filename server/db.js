import mysql from 'mysql2/promise';

const {
  DB_HOST = 'localhost',
  DB_PORT = '3306',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'pronunciation_practice',
} = process.env;

// Semilla inicial: las frases que ya existían como archivo estático
// (src/data/phrases.js), para que la Lección 1 tenga contenido desde el
// primer arranque aunque los diseñadores aún no suban su Excel.
const SEED_LESSON_TITLE = 'Saludos y frases básicas';
const SEED_PHRASES = [
  'Hello',
  'Good morning',
  'Good night',
  'Thank you',
  'Please',
  'Excuse me',
  'How are you',
  'Nice to meet you',
  'See you later',
  'Goodbye',
];

export let pool = null;

export async function initDb() {
  // Primero sin `database` seleccionada: la crea si no existe.
  const bootstrap = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
  });
  await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4`);
  await bootstrap.end();

  pool = mysql.createPool({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS lessons (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS phrases (
      id INT AUTO_INCREMENT PRIMARY KEY,
      lesson_id INT NOT NULL,
      text VARCHAR(500) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  await seedIfEmpty();
}

async function seedIfEmpty() {
  const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM lessons');
  if (count > 0) return;

  const [result] = await pool.query('INSERT INTO lessons (title, sort_order) VALUES (?, ?)', [
    SEED_LESSON_TITLE,
    1,
  ]);
  const lessonId = result.insertId;

  const values = SEED_PHRASES.map((text, index) => [lessonId, text, index + 1]);
  await pool.query('INSERT INTO phrases (lesson_id, text, sort_order) VALUES ?', [values]);
}

// Lecciones con sus frases, ordenadas, listas para mandar tal cual al cliente.
export async function getLessons() {
  const [lessons] = await pool.query('SELECT id, title FROM lessons ORDER BY sort_order, id');
  const [phrases] = await pool.query(
    'SELECT id, lesson_id, text FROM phrases ORDER BY sort_order, id'
  );

  return lessons.map((lesson) => ({
    id: lesson.id,
    title: lesson.title,
    phrases: phrases
      .filter((p) => p.lesson_id === lesson.id)
      .map((p) => ({ id: p.id, text: p.text })),
  }));
}
