// Diálogos cortos de práctica: cada turno tiene una "pregunta" (la voz de la
// otra persona, se reproduce sola) y una "answer" (lo que el alumno debe
// responder en voz alta). Simula una conversación real de ida y vuelta.
export const dialogues = [
  {
    id: 1,
    title: 'Conociendo a alguien',
    turns: [
      { question: "Hi! What's your name?", answer: 'My name is Ana.' },
      { question: 'Nice to meet you, Ana. Where are you from?', answer: 'I am from Mexico.' },
      { question: "That's great. What do you do?", answer: 'I am a student.' },
      { question: 'Do you like learning English?', answer: 'Yes, I really like it.' },
    ],
  },
  {
    id: 2,
    title: 'En una cafetería',
    turns: [
      { question: 'Hi, welcome! What would you like to order?', answer: 'I would like a coffee, please.' },
      { question: 'Anything else?', answer: 'No, that is all, thank you.' },
      { question: 'That will be three dollars.', answer: 'Here you go.' },
      { question: 'Thank you, have a nice day!', answer: 'You too, goodbye.' },
    ],
  },
  {
    id: 3,
    title: 'Pidiendo direcciones',
    turns: [
      { question: 'Excuse me, can you help me?', answer: 'Sure, what do you need?' },
      { question: 'How do I get to the train station?', answer: 'Go straight and turn left.' },
      { question: 'Is it far from here?', answer: 'No, it is very close.' },
      { question: 'Thank you so much!', answer: "You're welcome." },
    ],
  },
];
