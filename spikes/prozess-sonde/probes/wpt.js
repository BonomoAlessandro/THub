// Wegwerf-Spike: Prozessliste über @vscode/windows-process-tree (natives N-API-Modul, Toolhelp32 in einem Worker-Thread).
'use strict';

function create() {
  const wpt = require('@vscode/windows-process-tree');
  return {
    name: '@vscode/windows-process-tree',
    kind: 'in-process',
    snapshot: () => new Promise((resolve) => wpt.getAllProcesses((list) => resolve(list), 0)),
    dispose() {},
  };
}

module.exports = { create };
