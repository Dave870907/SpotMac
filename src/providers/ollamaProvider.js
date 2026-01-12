// Ollama Provider for local translation via /api/chat
// Node/Electron main process module (CommonJS)

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';

let config = {
  baseUrl: DEFAULT_BASE_URL,
  model: 'qwen2.5:7b-instruct-q4_0',
  keepAlive: '10m',
  timeoutMs: 12000, // increased from 7000 to 12000
  // granular timeouts
  prewarmTimeoutMs: 45000,
  translateTimeoutMs: 20000,
  retryTimeoutMs: 30000,
  retryOnTimeout: true,
  // generation params
  temperature: 0.2,
  numPredict: 512,
  // force output locale (only when target is Chinese)
  forceTraditional: true, // 針對中文目標時，強制輸出繁體（zh-TW）
};

function configure(opts = {}) {
  config = { ...config, ...opts };
  // 詳細日誌：顯示套用後的設定
  try {
    console.log('[ollama] configure:', JSON.stringify({
      baseUrl: config.baseUrl,
      model: config.model,
      keepAlive: config.keepAlive,
      prewarmTimeoutMs: config.prewarmTimeoutMs,
      translateTimeoutMs: config.translateTimeoutMs,
      retryTimeoutMs: config.retryTimeoutMs,
      forceTraditional: config.forceTraditional,
    }));
  } catch {}
}

async function healthCheck(signal) {
  const url = `${config.baseUrl}/api/tags`;
  console.log('[ollama] healthCheck GET', url);
  const res = await fetch(url, { method: 'GET', signal });
  console.log('[ollama] healthCheck status', res.status);
  if (!res.ok) throw new Error(`Ollama not reachable (${res.status})`);
  return true;
}

function buildController(timeoutMs) {
  const controller = new AbortController();
  if (timeoutMs && timeoutMs > 0) {
    try {
      setTimeout(() => controller.abort(new Error('Request timeout')), timeoutMs).unref?.();
      console.log('[ollama] timeout set (ms):', timeoutMs);
    } catch {}
  }
  return controller;
}

function normalizeTarget(to) {
  const t = String(to || '').toLowerCase();
  if (t === 'zh' || t === 'zh-tw' || t === 'zh_tw' || t === 'zh-hant' || t === 'zh-hant-tw') {
    return { label: 'Traditional Chinese (zh-TW)', code: 'zh-TW', isZh: true };
  }
  if (t === 'en' || t === 'en-us' || t === 'en-uk' || t === 'english') {
    return { label: 'English', code: 'en', isZh: false };
  }
  // 預設若不明，採繁中以符合 UI 預期
  return { label: 'Traditional Chinese (zh-TW)', code: 'zh-TW', isZh: true };
}

async function prewarm() {
  console.log('[ollama] prewarm start:', { baseUrl: config.baseUrl, model: config.model, keepAlive: config.keepAlive });
  const controller = buildController(config.prewarmTimeoutMs);
  try {
    await healthCheck(controller.signal);
  } catch (e) {
    console.warn('[ollama] prewarm skipped: healthCheck failed:', e?.message || e);
    return false;
  }
  try {
    const url = `${config.baseUrl}/api/chat`;
    const body = {
      model: config.model,
      keep_alive: config.keepAlive,
      messages: [
        { role: 'system', content: 'You are a translation assistant. Only return translated text.' },
        { role: 'user', content: 'Translate: hi' }
      ],
      stream: false,
      options: { temperature: config.temperature, num_predict: 16 },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    console.log('[ollama] prewarm response status:', res.status);
    if (!res.ok) throw new Error(`Prewarm failed (${res.status})`);
    await res.json();
    console.log('[ollama] prewarm success');
    return true;
  } catch (e) {
    console.warn('[ollama] prewarm error:', e?.message || e);
    return false;
  }
}

function buildPrompt(text, from, to) {
  const tgt = normalizeTarget(to).label;
  const src = from || 'auto';
  return `Translate the following text from ${src} to ${tgt}.\n\nOnly return the translation without explanations.\n\nText:\n${text}`;
}

async function translateRequest(text, { from = 'auto', to = 'auto' } = {}, timeoutMs) {
  const { isZh, code } = normalizeTarget(to);
  const controller = buildController(timeoutMs);
  const url = `${config.baseUrl}/api/chat`;
  const system = isZh && config.forceTraditional
    ? 'You are a professional bilingual translator. When the target language is Chinese, always respond in Traditional Chinese (zh-TW). Only return the translated text.'
    : 'You are a professional bilingual translator. Only return the translated text.';
  const body = {
    model: config.model,
    keep_alive: config.keepAlive,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: buildPrompt(text, from, code) },
    ],
    stream: false,
    options: {
      temperature: config.temperature,
      num_predict: config.numPredict,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  return res;
}

async function translate(text, { from = 'auto', to = 'auto' } = {}) {
  if (!text || !text.trim()) return '';

  const t0 = Date.now();
  const nt = normalizeTarget(to);
  console.log('[ollama] translate request', { url: `${config.baseUrl}/api/chat`, model: config.model, from, to: nt.code, len: text.length });

  let res;
  try {
    res = await translateRequest(text, { from, to: nt.code }, config.translateTimeoutMs);
  } catch (e) {
    console.error('[ollama] translate network error:', e?.message || e);
    if (config.retryOnTimeout) {
      console.warn('[ollama] retry after network error…');
      try { await healthCheck(buildController(5000).signal); } catch {}
      res = await translateRequest(text, { from, to: nt.code }, config.retryTimeoutMs);
    } else {
      throw e;
    }
  }

  if (!res.ok) {
    const msg = await safeText(res);
    console.error('[ollama] translate HTTP error', res.status, msg);
    if (config.retryOnTimeout && (res.status === 408 || res.status === 504)) {
      console.warn('[ollama] retry after HTTP timeout…');
      try { await healthCheck(buildController(5000).signal); } catch {}
      const retryRes = await translateRequest(text, { from, to: nt.code }, config.retryTimeoutMs);
      if (!retryRes.ok) {
        const retryMsg = await safeText(retryRes);
        throw new Error(`Ollama error ${retryRes.status}: ${retryMsg}`);
      }
      const retryData = await retryRes.json();
      const retryOut = retryData?.message?.content ?? '';
      const latency = Date.now() - t0;
      console.log('[ollama] translate ok (retry)', { from, to: nt.code, len: text.length, outLen: String(retryOut).length, latency: `${latency}ms` });
      return String(retryOut).trim();
    }
    throw new Error(`Ollama error ${res.status}: ${msg}`);
  }

  const data = await res.json();
  const out = data?.message?.content ?? '';
  const latency = Date.now() - t0;
  console.log('[ollama] translate ok', { from, to: nt.code, len: text.length, outLen: String(out).length, latency: `${latency}ms` });
  return String(out).trim();
}

async function safeText(res) {
  try { return await res.text(); } catch { return ''; }
}

module.exports = {
  configure,
  healthCheck,
  prewarm,
  translate,
};