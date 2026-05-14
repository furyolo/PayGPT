// ==UserScript==
// @name         PayGPT 长链接生成器
// @namespace    https://chatgpt.com/
// @version      0.2.0
// @description  在 ChatGPT 页面中按 coupon 和国家生成 Team 支付长链接。
// @author       PayGPT
// @match        https://chatgpt.com/*
// @grant        GM_setClipboard
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      chatgpt.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const COUNTRY_OPTIONS = [
    { label: '美国 US / USD', country: 'US', currency: 'USD' },
    { label: '英国 GB / GBP', country: 'GB', currency: 'GBP' },
    { label: '泰国 TH / THB', country: 'TH', currency: 'THB' },
    { label: '日本 JP / JPY', country: 'JP', currency: 'JPY' },
    { label: '新加坡 SG / SGD', country: 'SG', currency: 'SGD' },
    { label: '德国 DE / EUR', country: 'DE', currency: 'EUR' },
    { label: '法国 FR / EUR', country: 'FR', currency: 'EUR' },
    { label: '澳大利亚 AU / AUD', country: 'AU', currency: 'AUD' },
    { label: '加拿大 CA / CAD', country: 'CA', currency: 'CAD' }
  ];

  const DEFAULT_FORM = {
    coupon: 'datroaiuk',
    country: 'GB',
    priceInterval: 'month',
    seatQuantity: 2,
    workspaceName: 'workspace',
    cancelUrl: ''
  };

  const CHECKOUT_ENDPOINT = 'https://chatgpt.com/backend-api/payments/checkout';
  const SESSION_ENDPOINT = '/api/auth/session';
  const ROOT_ID = 'paygpt-link-generator-root';
  const STORAGE_KEYS = {
    coupon: 'paygpt_coupon',
    country: 'paygpt_country',
    priceInterval: 'paygpt_price_interval',
    seatQuantity: 'paygpt_seat_quantity',
    workspaceName: 'paygpt_workspace_name',
    cancelUrl: 'paygpt_cancel_url'
  };

  let latestHostedUrl = '';
  let latestSessionId = '';

  function findCountryOption(country) {
    return COUNTRY_OPTIONS.find((item) => item.country === country);
  }

  function requireCountryOption(country) {
    const option = findCountryOption(country);
    if (!option) {
      throw new Error('请选择有效国家。');
    }

    return option;
  }

  function readStoredValue(key, fallback) {
    if (typeof GM_getValue !== 'function') return fallback;
    return GM_getValue(key, fallback);
  }

  function writeStoredValue(key, value) {
    if (typeof GM_setValue === 'function') {
      GM_setValue(key, value);
    }
  }

  function loadSavedForm() {
    const savedSeatQuantity = Number.parseInt(readStoredValue(STORAGE_KEYS.seatQuantity, DEFAULT_FORM.seatQuantity), 10);

    return {
      coupon: readStoredValue(STORAGE_KEYS.coupon, DEFAULT_FORM.coupon),
      country: readStoredValue(STORAGE_KEYS.country, DEFAULT_FORM.country),
      priceInterval: readStoredValue(STORAGE_KEYS.priceInterval, DEFAULT_FORM.priceInterval),
      seatQuantity: Number.isInteger(savedSeatQuantity) && savedSeatQuantity > 0 ? savedSeatQuantity : DEFAULT_FORM.seatQuantity,
      workspaceName: readStoredValue(STORAGE_KEYS.workspaceName, DEFAULT_FORM.workspaceName),
      cancelUrl: readStoredValue(STORAGE_KEYS.cancelUrl, DEFAULT_FORM.cancelUrl)
    };
  }

  function saveFormState(formState) {
    writeStoredValue(STORAGE_KEYS.coupon, formState.coupon);
    writeStoredValue(STORAGE_KEYS.country, formState.country);
    writeStoredValue(STORAGE_KEYS.priceInterval, formState.priceInterval);
    writeStoredValue(STORAGE_KEYS.seatQuantity, String(formState.seatQuantity));
    writeStoredValue(STORAGE_KEYS.workspaceName, formState.workspaceName);
    writeStoredValue(STORAGE_KEYS.cancelUrl, formState.cancelUrl);
  }

  function createElement(tagName, options = {}) {
    const element = document.createElement(tagName);

    if (options.className) element.className = options.className;
    if (options.textContent !== undefined) element.textContent = options.textContent;
    if (options.attributes) {
      Object.entries(options.attributes).forEach(([key, value]) => {
        element.setAttribute(key, String(value));
      });
    }

    return element;
  }

  function getInputValue(root, name) {
    const input = root.querySelector(`[data-paygpt-field="${name}"]`);
    return input ? input.value.trim() : '';
  }

  function readFormState(root) {
    const seatQuantity = Number.parseInt(getInputValue(root, 'seatQuantity'), 10);

    return {
      coupon: getInputValue(root, 'coupon'),
      country: getInputValue(root, 'country'),
      priceInterval: getInputValue(root, 'priceInterval'),
      seatQuantity,
      workspaceName: getInputValue(root, 'workspaceName'),
      cancelUrl: getInputValue(root, 'cancelUrl')
    };
  }

  function validateFormState(formState) {
    if (!findCountryOption(formState.country)) {
      throw new Error('请选择有效国家。');
    }

    if (!['month', 'year'].includes(formState.priceInterval)) {
      throw new Error('请选择有效账期。');
    }

    if (!Number.isInteger(formState.seatQuantity) || formState.seatQuantity < 1) {
      throw new Error('席位数量必须是大于等于 1 的整数。');
    }

    if (!formState.workspaceName) {
      throw new Error('工作区名称不能为空。');
    }

    if (formState.cancelUrl) {
      try {
        new URL(formState.cancelUrl);
      } catch (error) {
        throw new Error('取消跳转地址必须是有效 URL。');
      }
    }
  }

  function buildCancelUrl(coupon, customCancelUrl) {
    if (customCancelUrl) return customCancelUrl;

    const url = new URL('https://chatgpt.com/');
    if (coupon) url.searchParams.set('promoCode', coupon);
    return url.toString();
  }

  // 只根据表单状态组装 payload，不在这里读取页面或发起网络请求。
  function buildPayload(formState) {
    const selectedCountry = requireCountryOption(formState.country);
    const payload = {
      plan_name: 'chatgptteamplan',
      team_plan_data: {
        workspace_name: formState.workspaceName,
        price_interval: formState.priceInterval,
        seat_quantity: formState.seatQuantity
      },
      billing_details: {
        country: selectedCountry.country,
        currency: selectedCountry.currency
      },
      cancel_url: buildCancelUrl(formState.coupon, formState.cancelUrl),
      checkout_ui_mode: 'hosted'
    };

    if (formState.coupon) {
      payload.promo_code = formState.coupon;
    }

    return payload;
  }

  async function getAccessToken() {
    let session;

    try {
      const response = await fetch(SESSION_ENDPOINT, { credentials: 'include' });
      if (!response.ok) {
        throw new Error(`Session HTTP ${response.status}`);
      }
      session = await response.json();
    } catch (error) {
      console.error('[PayGPT] 获取 session 失败：', error);
      throw new Error(`获取登录凭证失败：${error.message}`);
    }

    const accessToken = session && session.accessToken;
    if (!accessToken) {
      throw new Error('accessToken 为空，请确认当前浏览器已登录 ChatGPT。');
    }

    return accessToken;
  }

  async function createCheckout(payload, accessToken) {
    const response = await fetch(CHECKOUT_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    let data;
    try {
      data = await response.json();
    } catch (error) {
      throw new Error(`Checkout 响应不是有效 JSON：${error.message}`);
    }

    if (!response.ok) {
      console.error('[PayGPT] Checkout 请求失败：', data);
      throw new Error(`Checkout HTTP ${response.status}：${summarizeResponse(data)}`);
    }

    return data;
  }

  function extractHostedUrl(data) {
    return data && (data.url || data.stripe_hosted_url || data.checkout_url || '');
  }

  function summarizeResponse(data) {
    if (!data) return '无响应详情';
    if (typeof data === 'string') return data.slice(0, 160);
    if (data.error && typeof data.error === 'string') return data.error;
    if (data.detail && typeof data.detail === 'string') return data.detail;
    if (data.message && typeof data.message === 'string') return data.message;

    try {
      return JSON.stringify(data).slice(0, 240);
    } catch (error) {
      return '响应详情无法序列化';
    }
  }

  function setStatus(root, message, tone = 'muted') {
    const status = root.querySelector('[data-paygpt-status]');
    if (!status) return;

    status.textContent = message;
    status.dataset.tone = tone;
  }

  function setResult(root, hostedUrl, sessionId) {
    const result = root.querySelector('[data-paygpt-result]');
    const session = root.querySelector('[data-paygpt-session]');
    const copyButton = root.querySelector('[data-paygpt-copy]');

    latestHostedUrl = hostedUrl || '';
    latestSessionId = sessionId || '';

    if (result) result.value = latestHostedUrl;
    if (session) session.textContent = latestSessionId ? `Checkout Session：${latestSessionId}` : 'Checkout Session：-';
    if (copyButton) copyButton.disabled = !latestHostedUrl;
  }

  async function copyText(text) {
    if (!text) throw new Error('没有可复制的链接。');

    if (typeof GM_setClipboard === 'function') {
      GM_setClipboard(text, 'text');
      return;
    }

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return;
    }

    throw new Error('当前环境不支持自动复制，请手动复制结果框内容。');
  }

  async function handleGenerate(root) {
    const generateButton = root.querySelector('[data-paygpt-generate]');
    const copyButton = root.querySelector('[data-paygpt-copy]');

    try {
      if (generateButton) generateButton.disabled = true;
      if (copyButton) copyButton.disabled = true;
      setResult(root, '', '');
      setStatus(root, '正在读取表单...', 'muted');

      const formState = readFormState(root);
      validateFormState(formState);
      saveFormState(formState);

      const payload = buildPayload(formState);
      const selectedCountry = findCountryOption(formState.country);

      console.info('[PayGPT] 准备生成长链接：', {
        country: selectedCountry.country,
        currency: selectedCountry.currency,
        price_interval: payload.team_plan_data.price_interval,
        seat_quantity: payload.team_plan_data.seat_quantity,
        has_coupon: Boolean(formState.coupon)
      });

      setStatus(root, '正在获取登录凭证...', 'muted');
      const accessToken = await getAccessToken();

      setStatus(root, '正在请求支付长链接...', 'muted');
      const data = await createCheckout(payload, accessToken);
      const hostedUrl = extractHostedUrl(data);

      if (!hostedUrl) {
        console.warn('[PayGPT] 响应中未找到长链接：', data);
        throw new Error('响应中未找到长链接，请查看控制台响应详情。');
      }

      setResult(root, hostedUrl, data.checkout_session_id || '');
      setStatus(root, `生成成功：${selectedCountry.country}/${selectedCountry.currency}`, 'success');
      console.info('[PayGPT] 长链接生成成功：', {
        checkout_session_id: data.checkout_session_id || '',
        country: selectedCountry.country,
        currency: selectedCountry.currency
      });
    } catch (error) {
      setStatus(root, error.message, 'error');
      console.error('[PayGPT] 生成失败：', error);
    } finally {
      if (generateButton) generateButton.disabled = false;
      if (copyButton) copyButton.disabled = !latestHostedUrl;
    }
  }

  async function handleCopy(root) {
    try {
      await copyText(latestHostedUrl);
      setStatus(root, '链接已复制。', 'success');
    } catch (error) {
      setStatus(root, error.message, 'error');
      console.error('[PayGPT] 复制失败：', error);
    }
  }

  function createField(labelText, control) {
    const label = createElement('label', { className: 'paygpt-field' });
    const labelSpan = createElement('span', { textContent: labelText });
    label.append(labelSpan, control);
    return label;
  }

  function createInput(name, value, attributes = {}) {
    return createElement('input', {
      attributes: {
        'data-paygpt-field': name,
        value,
        ...attributes
      }
    });
  }

  function createSelect(name, options, value) {
    const select = createElement('select', {
      attributes: { 'data-paygpt-field': name }
    });

    options.forEach((item) => {
      const option = createElement('option', {
        textContent: item.label,
        attributes: { value: item.value }
      });
      if (item.value === value) option.selected = true;
      select.append(option);
    });

    return select;
  }

  function injectStyles() {
    if (document.getElementById('paygpt-link-generator-style')) return;

    const style = createElement('style', { attributes: { id: 'paygpt-link-generator-style' } });
    style.textContent = `
      #${ROOT_ID} {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483647;
        width: min(380px, calc(100vw - 28px));
        color: #202124;
        font-family: Arial, "Microsoft YaHei", sans-serif;
        font-size: 13px;
      }

      #${ROOT_ID} * {
        box-sizing: border-box;
      }

      #${ROOT_ID} .paygpt-panel {
        border: 1px solid #d8dde6;
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 12px 34px rgba(15, 23, 42, 0.18);
        overflow: hidden;
      }

      #${ROOT_ID} .paygpt-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px;
        border-bottom: 1px solid #e8edf3;
        background: #f6f8fb;
      }

      #${ROOT_ID} .paygpt-title {
        font-weight: 700;
      }

      #${ROOT_ID} .paygpt-header-actions {
        display: flex;
        gap: 6px;
      }

      #${ROOT_ID} button {
        min-height: 30px;
        border: 1px solid #c7ced9;
        border-radius: 6px;
        background: #ffffff;
        color: #202124;
        cursor: pointer;
      }

      #${ROOT_ID} button:hover:not(:disabled) {
        background: #eef3f8;
      }

      #${ROOT_ID} button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      #${ROOT_ID} .paygpt-icon-button {
        width: 30px;
        padding: 0;
      }

      #${ROOT_ID} .paygpt-body {
        display: grid;
        gap: 10px;
        padding: 12px;
      }

      #${ROOT_ID} .paygpt-body[data-collapsed="true"] {
        display: none;
      }

      #${ROOT_ID} .paygpt-field {
        display: grid;
        grid-template-columns: 76px minmax(0, 1fr);
        align-items: center;
        gap: 8px;
      }

      #${ROOT_ID} input,
      #${ROOT_ID} select,
      #${ROOT_ID} textarea {
        width: 100%;
        min-height: 32px;
        border: 1px solid #cbd3df;
        border-radius: 6px;
        padding: 6px 8px;
        background: #ffffff;
        color: #202124;
        font: inherit;
      }

      #${ROOT_ID} textarea {
        min-height: 72px;
        resize: vertical;
        word-break: break-all;
      }

      #${ROOT_ID} .paygpt-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      #${ROOT_ID} .paygpt-primary {
        border-color: #1769aa;
        background: #1769aa;
        color: #ffffff;
      }

      #${ROOT_ID} .paygpt-primary:hover:not(:disabled) {
        background: #115789;
      }

      #${ROOT_ID} .paygpt-status {
        min-height: 32px;
        border-radius: 6px;
        padding: 8px;
        background: #f6f8fb;
        color: #425466;
        line-height: 1.4;
      }

      #${ROOT_ID} .paygpt-status[data-tone="success"] {
        background: #edf8f0;
        color: #177245;
      }

      #${ROOT_ID} .paygpt-status[data-tone="error"] {
        background: #fff0f0;
        color: #b42318;
      }

      #${ROOT_ID} .paygpt-session {
        color: #5b6778;
        font-size: 12px;
        overflow-wrap: anywhere;
      }
    `;
    document.head.append(style);
  }

  function renderPanel() {
    if (document.getElementById(ROOT_ID)) return;

    injectStyles();
    const savedForm = loadSavedForm();

    const root = createElement('section', { attributes: { id: ROOT_ID } });
    const panel = createElement('div', { className: 'paygpt-panel' });
    const header = createElement('div', { className: 'paygpt-header' });
    const title = createElement('div', { className: 'paygpt-title', textContent: 'PayGPT 长链接生成器' });
    const headerActions = createElement('div', { className: 'paygpt-header-actions' });
    const collapseButton = createElement('button', {
      className: 'paygpt-icon-button',
      textContent: '−',
      attributes: { type: 'button', title: '折叠/展开' }
    });
    const closeButton = createElement('button', {
      className: 'paygpt-icon-button',
      textContent: '×',
      attributes: { type: 'button', title: '关闭' }
    });
    const body = createElement('div', { className: 'paygpt-body' });

    const couponInput = createInput('coupon', savedForm.coupon, {
      type: 'text',
      placeholder: '例如 datroaiuk',
      autocomplete: 'off'
    });
    const countrySelect = createSelect(
      'country',
      COUNTRY_OPTIONS.map((item) => ({ label: item.label, value: item.country })),
      savedForm.country
    );
    const intervalSelect = createSelect(
      'priceInterval',
      [
        { label: '月付 month', value: 'month' },
        { label: '年付 year', value: 'year' }
      ],
      savedForm.priceInterval
    );
    const seatInput = createInput('seatQuantity', String(savedForm.seatQuantity), {
      type: 'number',
      min: '1',
      step: '1'
    });
    const workspaceInput = createInput('workspaceName', savedForm.workspaceName, {
      type: 'text',
      autocomplete: 'off'
    });
    const cancelInput = createInput('cancelUrl', savedForm.cancelUrl, {
      type: 'text',
      placeholder: '留空则按 coupon 自动生成',
      autocomplete: 'off'
    });

    const actions = createElement('div', { className: 'paygpt-actions' });
    const generateButton = createElement('button', {
      className: 'paygpt-primary',
      textContent: '生成长链接',
      attributes: { type: 'button', 'data-paygpt-generate': 'true' }
    });
    const copyButton = createElement('button', {
      textContent: '复制链接',
      attributes: { type: 'button', 'data-paygpt-copy': 'true', disabled: 'disabled' }
    });

    const status = createElement('div', {
      className: 'paygpt-status',
      textContent: '等待生成。',
      attributes: { 'data-paygpt-status': 'true', 'data-tone': 'muted' }
    });
    const result = createElement('textarea', {
      attributes: {
        'data-paygpt-result': 'true',
        readonly: 'readonly',
        placeholder: '生成成功后，这里会显示 Stripe 长链接。'
      }
    });
    const session = createElement('div', {
      className: 'paygpt-session',
      textContent: 'Checkout Session：-',
      attributes: { 'data-paygpt-session': 'true' }
    });

    headerActions.append(collapseButton, closeButton);
    header.append(title, headerActions);
    actions.append(generateButton, copyButton);
    body.append(
      createField('Coupon', couponInput),
      createField('国家', countrySelect),
      createField('账期', intervalSelect),
      createField('席位', seatInput),
      createField('工作区名', workspaceInput),
      createField('取消地址', cancelInput),
      actions,
      status,
      result,
      session
    );
    panel.append(header, body);
    root.append(panel);
    document.body.append(root);

    generateButton.addEventListener('click', () => handleGenerate(root));
    copyButton.addEventListener('click', () => handleCopy(root));
    collapseButton.addEventListener('click', () => {
      const collapsed = body.dataset.collapsed === 'true';
      body.dataset.collapsed = collapsed ? 'false' : 'true';
      collapseButton.textContent = collapsed ? '−' : '+';
    });
    closeButton.addEventListener('click', () => root.remove());
  }

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('打开 PayGPT 面板', renderPanel);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderPanel, { once: true });
  } else {
    renderPanel();
  }
})();
