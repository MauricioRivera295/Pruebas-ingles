# Prompt para Claude: Proyecto de Reconocimiento de Voz con Transformers.js

Actúa como un desarrollador experto en React y node.js. Necesito que crees un proyecto de prueba utilizando node.js y boostrap que implemente reconocimiento de voz del lado del cliente utilizando `Transformers.js`. 

El objetivo es crear un componente de práctica de pronunciación para un centro de idiomas. El audio no debe enviarse a ningún servidor, todo se debe procesar localmente en el navegador.

A continuación te proporciono la lógica base del componente. Por favor, genera la estructura del proyecto, los archivos necesarios, y optimiza este código separando la lógica del pipeline de Transformers.js en un Web Worker para no bloquear el hilo principal de la interfaz.

## 1. Dependencias requeridas
```bash
npm install @xenova/transformers
```



## 3. Requerimientos adicionales
- Integra boostrap para los estilos.
- Implementa un cálculo de distancia de Levenshtein para comparar el `transcript` con una frase esperada.
- Muestra un feedback visual de éxito si la similitud de la pronunciación supera el 85%.
