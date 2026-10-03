// Processo principal do app desktop: abre o mesmo jogo da versão web e entrega a ele,
// pela ponte do preload, o uso de tokens lido dos logs locais do Claude Code.
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { ClaudeCodeReader } = require('./usage/claude-code');

const POLL_MS = 30_000;
const reader = new ClaudeCodeReader();
let win = null;

function usageSnapshot() {
  try {
    reader.scan();
  } catch (err) {
    console.error('falha ao ler o uso do Claude Code:', err);
  }
  return reader.summary();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    minHeight: 500,
    title: 'AI Token Clicker',
    backgroundColor: '#070a08',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // a página não acessa Node nem o sistema de arquivos
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'index.html'));
  // Links externos abrem no navegador do sistema, nunca dentro do app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) e.preventDefault();
  });
}

ipcMain.handle('usage:get', () => usageSnapshot());

setInterval(() => {
  if (win && !win.isDestroyed()) win.webContents.send('usage:update', usageSnapshot());
}, POLL_MS);

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
