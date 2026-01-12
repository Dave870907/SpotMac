const { app, BrowserWindow, globalShortcut, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

// 新增：Ollama provider（主進程使用）
let ollama;
try {
  ollama = require('./src/providers/ollamaProvider');
} catch (e) {
  // 若檔案不存在仍可啟動，稍後 translate 會 fallback mock
}

let mainWindow;

function createWindow() {
  // 創建瀏覽器窗口
  mainWindow = new BrowserWindow({
    width: 680,
    height: 500,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    frame: false, // 無邊框窗口
    alwaysOnTop: true, // 始終置頂
    center: true,
    resizable: false,
    transparent: true, // 透明背景
    skipTaskbar: true, // 不在任務欄顯示
    show: false, // 初始隱藏
    vibrancy: 'under-window', // macOS 毛玻璃效果
    minimizable: false, // 禁用最小化
    maximizable: false, // 禁用最大化
    closable: true // 允許關閉但不顯示按鈕
  });

  // 加載 index.html
  mainWindow.loadFile('src/index.html');

  // 當窗口失去焦點時隱藏
  mainWindow.on('blur', () => {
    mainWindow.hide();
  });
}

// 這段程序將會在 Electron 結束初始化和創建瀏覽器窗口的時候調用
app.whenReady().then(async () => {
  createWindow();

  // 立即註冊全域快捷鍵（避免被預熱阻塞）
  const ret = globalShortcut.register('CommandOrControl+Shift|T'.replace('|','+'), () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  if (!ret) console.log('registration failed');

  // 預熱改為背景執行（不阻塞 UI 與快捷鍵）
  if (ollama?.prewarm) {
    Promise.resolve()
      .then(() => ollama.prewarm())
      .catch(e => console.warn('[ollama] prewarm (background) error:', e?.message || e));
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 當全部窗口關閉時退出
app.on('window-all-closed', () => {
  // 在 macOS 上，除非用戶用 Cmd + Q 確定地退出，
  // 否則絕大部分應用及其菜單欄會保持激活。
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  // 註銷所有快捷鍵
  globalShortcut.unregisterAll();
});

// IPC 處理器
ipcMain.handle('hide-window', async () => {
  mainWindow.hide();
});

// 更新 translate：優先用 Ollama，失敗回退 mock
ipcMain.handle('translate', async (_event, payload) => {
  const start = Date.now();
  const { text, from = 'auto', to = 'auto' } = payload || {};
  if (!text || !text.trim()) {
    return { text: '', provider: 'mock', latency: 0, from, to };
  }

  // 若 provider 存在，嘗試使用
  if (ollama?.translate) {
    try {
      const result = await ollama.translate(text, { from, to });
      return {
        text: result,
        provider: 'ollama',
        latency: Date.now() - start,
        from,
        to,
      };
    } catch (e) {
      console.error('[translate] ollama failed:', e?.message || e);
    }
  }

  // fallback mock
  return {
    text: `[${from}→${to}] ${text}`,
    provider: 'mock',
    latency: Date.now() - start,
    from,
    to,
  };
});
