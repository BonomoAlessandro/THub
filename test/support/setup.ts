// Läuft vor jeder Testdatei.
// Geerbte THUB_*-Variablen entfernen, damit Tests nie eine laufende THub-Instanz ansprechen,
// auch wenn der Testlauf selbst in einem THub-Tab läuft.
for (const key of Object.keys(process.env)) {
  if (key.toUpperCase().startsWith('THUB_')) delete process.env[key];
}
