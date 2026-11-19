// Läuft vor jeder Testdatei.
// Geerbte TERMHUB_*-Variablen entfernen, damit Tests nie eine laufende TermHub-Instanz ansprechen,
// auch wenn der Testlauf selbst in einem TermHub-Tab läuft.
for (const key of Object.keys(process.env)) {
  if (key.toUpperCase().startsWith('TERMHUB_')) delete process.env[key];
}
