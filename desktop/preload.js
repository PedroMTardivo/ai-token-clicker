// Ponte mínima entre o app e a página: expõe só a leitura do resumo de uso (números por dia).
// Na versão web este objeto não existe, e o jogo esconde tudo que depende dele.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aicDesktop', {
  getUsage: () => ipcRenderer.invoke('usage:get'),
  onUsage: (callback) => {
    ipcRenderer.on('usage:update', (_event, summary) => callback(summary));
  },
});
