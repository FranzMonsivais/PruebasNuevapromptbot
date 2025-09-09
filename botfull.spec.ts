import { test, expect } from '@playwright/test';
import fs from 'fs';
import csv from 'csv-parser';
import path from 'path';

// 🔹 Función para leer mensajes desde CSV
async function leerTodosLosMensajes(): Promise<string[]> {
  return new Promise((resolve) => {
    const mensajes: string[] = [];
    fs.createReadStream(path.resolve(__dirname, '../data/mensajes.csv'))
      .pipe(csv())
      .on('data', (row) => mensajes.push(row.mensaje))
      .on('end', () => resolve(mensajes));
  });
}

test("Validar respuestas del bot enviando múltiples mensajes", async ({ page }, testInfo) => {
  test.setTimeout(1_000_000_000);

  const mensajes: string[] = await leerTodosLosMensajes();
  const resultados: { pregunta: string; respuesta: string; estado: string }[] = [];
  const NUMERO_MENSAJES_SIN_ESPERA = 4; // Definir cuántos primeros mensajes no esperan

  await test.step("Ir al chat usando sesión guardada", async () => {
    await page.goto('https://xcaret--fullcopy--c.sandbox.vf.force.com/apex/ESWFCWEB1747333592836');
    await page.getByRole('button', { name: 'Hola, ¿tiene alguna pregunta' }).click();
  });

  const frame = page.frameLocator('iframe[title="Sesión de chat con un agente"]');

  await test.step("Configurar chat en Español", async () => {
    await frame.getByRole('option', { name: 'Español' }).click({ force: true, timeout: 30000 });
  });

  await test.step("Enviar mensajes y capturar respuestas", async () => {
    for (const [index, msg] of mensajes.entries()) {
      console.log(`[${index + 1}/${mensajes.length}] Enviando mensaje: "${msg}"`);

      try {
        // Escribir mensaje
        await frame.getByRole('textbox', { name: 'Mensaje de chat' }).fill(msg, { delay: 100 });

        // Enviar mensaje
        await frame.getByRole('button', { name: 'Enviar mensaje' }).click({ force: true });

        // Esperar respuesta del bot (último <p> en el chat)
        const respuestas = frame.locator('lightning-formatted-rich-text p');
        await expect(respuestas.last()).toBeVisible({ timeout: 80_000 });

        const ultimaRespuesta = await respuestas.last().innerText();
        console.log(`🤖 Respuesta del bot: "${ultimaRespuesta}"`);

        // Guardar en resultados con estado "OK"
        resultados.push({ pregunta: msg, respuesta: ultimaRespuesta, estado: "OK" });

      } catch (error) {
        console.log(`⚠️ Error al procesar el mensaje "${msg}": ${error}`);

        // Guardar el error en resultados con estado "ERROR"
        resultados.push({ pregunta: msg, respuesta: `ERROR: ${error}`, estado: "ERROR" });
      }

      // Espera antes del siguiente mensaje SOLO para mensajes después de los primeros N
      if (index >= NUMERO_MENSAJES_SIN_ESPERA && index < mensajes.length - 1) {
        console.log("⏳ Esperando 15 segundos antes del siguiente mensaje...");
        await page.waitForTimeout(15_000);
      } else if (index < mensajes.length - 1) {
        console.log("🚀 Mensaje inicial - sin espera");
      }
    }
  });

  // 🔹 Guardar resultados en JSON, ignorando los 3 primeros
  const resultadosFiltrados = resultados.slice(3);
  const filePath = path.resolve(__dirname, '../data/resultados.json');
  fs.writeFileSync(filePath, JSON.stringify(resultadosFiltrados, null, 2), 'utf-8');
  console.log("📂 Resultados guardados en data/resultados.json");

  // 🔹 Crear tabla en HTML con los resultados
  const htmlTabla = `
<html>
  <head>
    <meta charset="UTF-8">
    <style>
      body { font-family: Arial, sans-serif; margin: 20px; }
      h3 { color: #333; }
      table { border-collapse: collapse; width: 100%; margin-top: 20px; }
      th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
      th { background-color: #f2f2f2; font-weight: bold; }
      tr:nth-child(even) { background-color: #f9f9f9; }
      tr:hover { background-color: #f1f1f1; }
      .error { color: red; }
    </style>
  </head>
  <body>
    <h3>Resultados del Chat</h3>
    <table>
      <thead>
        <tr>
          <th>Pregunta</th>
          <th>Respuesta</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        ${resultados.map(r => `
          <tr class="${r.estado === 'ERROR' ? 'error' : ''}">
            <td>${r.pregunta}</td>
            <td>${r.respuesta}</td>
            <td>${r.estado}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  </body>
</html>
`;

  // 🔹 Adjuntar la tabla HTML al reporte
  await testInfo.attach('Resultados del Chat (tabla)', {
    body: htmlTabla,
    contentType: 'text/html',
  });
});
