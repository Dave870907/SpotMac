const { ipcRenderer } = require('electron');

class AppRenderer {
    constructor() {
        this.mainInput = document.getElementById('mainInput');
        this.contentContainer = document.getElementById('contentContainer');
        this.welcomeMessage = document.getElementById('welcomeMessage');
        this.clearButton = document.getElementById('clearButton');

        // 翻譯節流/狀態
        this.translateTimeout = null;
        // 預設方向保留自動偵測
        this.currentDirection = { from: 'auto', to: 'auto' };
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.mainInput.focus();
    }

    bindEvents() {
        // 輸入事件
        this.mainInput.addEventListener('input', (e) => {
            this.handleInput(e.target.value);
            this.updateClearButton();
        });

        // 鍵盤事件
        this.mainInput.addEventListener('keydown', (e) => {
            this.handleKeydown(e);
        });

        // 清除按鈕
        this.clearButton.addEventListener('click', () => {
            this.clearInput();
        });

        // ESC 隱藏窗口
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                ipcRenderer.invoke('hide-window');
            }
        });

        // 窗口獲得焦點時聚焦輸入框
        window.addEventListener('focus', () => {
            this.mainInput.focus();
            this.mainInput.select();
        });
    }

    handleInput(value) {
        if (this.translateTimeout) clearTimeout(this.translateTimeout);

        if (!value.trim()) {
            this.showWelcome();
            return;
        }

        this.setLoading();

        // 語向：包含 CJK 視為 zh->en；否則 en->zh-TW
        this.currentDirection = this.detectDirection(value);

        this.translateTimeout = setTimeout(() => {
            this.translate(value, this.currentDirection);
        }, 300);
    }

    // 語言偵測：含中→英，否則→繁中
    detectDirection(text) {
        const hasCJK = /[\u3400-\u9FFF]/.test(text);
        return hasCJK ? { from: 'zh', to: 'en' } : { from: 'en', to: 'zh-TW' };
    }

    setLoading() {
        this.welcomeMessage.style.display = 'none';
        this.contentContainer.innerHTML = '<div class="loading">正在喚醒或翻譯中…</div>';
    }

    async translate(text, { from, to }) {
        try {
            const res = await ipcRenderer.invoke('translate', { text, from, to });
            const output = res?.text ?? '';
            const latency = typeof res?.latency === 'number' ? `${res.latency}ms` : '';
            const provider = res?.provider || 'local';
            this.showContent({ input: text, output, meta: `${from}→${to} · ${provider} · ${latency}` });
        } catch (err) {
            console.error('翻譯錯誤:', err);
            this.showContent({ input: text, output: '翻譯失敗，請稍後再試。', meta: 'error' });
        }
    }

    handleKeydown(e) {
        switch (e.key) {
            case 'Enter':
                e.preventDefault();
                const value = this.mainInput.value.trim();
                if (value) {
                    // 保持簡潔，主要依賴輸入即時翻譯
                }
                break;
        }
    }

    showWelcome() {
        this.welcomeMessage.style.display = 'flex';
        this.contentContainer.innerHTML = '';
        this.contentContainer.appendChild(this.welcomeMessage);
    }

    showContent(data) {
        const { input = '', output = '', meta = '' } = data || {};
        this.welcomeMessage.style.display = 'none';
        this.contentContainer.innerHTML = `
            <div class="custom-content">
                <div class="content-text">${this.escapeHtml(output)}</div>
                <div class="content-hint">${this.escapeHtml(meta)}</div>
            </div>
        `;
    }

    escapeHtml(s) {
        return String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
    }

    updateClearButton() {
        const hasText = this.mainInput.value.length > 0;
        this.clearButton.classList.toggle('visible', hasText);
    }

    clearInput() {
        this.mainInput.value = '';
        this.mainInput.focus();
        this.updateClearButton();
        this.showWelcome();
    }
}

// 當頁面加載完成時初始化
document.addEventListener('DOMContentLoaded', () => {
    new AppRenderer();
});
