# SpotMac - Spotlight-like 工具（macOS）

一個使用 Electron 開發、外觀類似 macOS Spotlight 的小工具，提供快速呼出介面與中英互譯能力（在地端優先，支援 Ollama）。

<div align="center">
   <kbd><img src="https://github.com/Dave870907/SpotMac/blob/main/images/Interface.png" alt="Interface" width="＝600"></kbd>
</div>

## 功能特點

- ⌨️ **全域快捷鍵** - 使用 `Shift + Cmd + T` 快速呼出介面
- 🎨 **現代化 UI** - 採用毛玻璃效果與 macOS 設計語彙
- 🪄 **中英翻譯** - 以本機 Ollama 模型為主，離線可用；無法連線時回退為簡單 mock
- 🧊 **冷啟動優化** - 啟動即預熱模型、延長初次超時並自動重試
- 🧩 **可擴充架構** - 模組化 Provider 設計，後續可接入更多能力

> 早期的檔案/應用搜尋已暫時移除，保留簡潔介面以便專注翻譯與未來功能。

## 安裝與使用

### 開發模式

1. 安裝依賴：
   ```bash
   npm install
   ```
2. 開發啟動：
   ```bash
   npm run dev
   ```

### 打包

打包 macOS 應用：
```bash
npm run build-mac
```

成品將輸出於 `dist` 目錄。

## 快捷鍵

- `Shift + Cmd + T` - 顯示/隱藏視窗
- `Esc` - 隱藏視窗

## 系統需求

- macOS 10.14 以上
- Node.js 16 以上（僅開發時需要）

## 專案結構

```
spotmac/
├── main.js              # 主進程
├── src/
│   ├── index.html       # 渲染進程 HTML
│   ├── styles.css       # 樣式
│   ├── renderer.js      # 前端邏輯
│   └── providers/
│       └── ollamaProvider.js  # Ollama 翻譯 Provider
├── notebooks/
│   └── ollama_chat_test.ipynb # 測試 Ollama /api/chat 的 Notebook
├── package.json         # 專案設定
└── README.md            # 說明文件
```

## 翻譯行為（zh-TW）

- 介面與翻譯結果皆以繁體中文（zh-TW）為準。
- App 啟動時會預熱模型（keep_alive=10m），首次翻譯若冷啟動較慢，會自動延長超時並嘗試一次重試。
- Notebook `notebooks/ollama_chat_test.ipynb` 可直接驗證 `/api/chat` 是否 200 並返回 `message.content`。

## 開發筆記

- 主進程：`main.js` 建立無邊框置頂視窗、註冊快捷鍵、IPC（hide-window / translate）。
- Provider：`ollamaProvider.js` 實作 configure/healthCheck/prewarm/translate，強制輸出 zh-TW，並提供超時重試。
- 前端：`renderer.js` 輸入偵測與 debounce、顯示結果與 meta（如 provider 與耗時）。

