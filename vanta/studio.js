/* VANTA AI 0.3 — Image Studio and performance controls */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const api = window.VantaBridge;
  if (!api) return;
  const editor = $('studio');
  const models = {
    quick: 'google/gemini-3.1-flash-lite-image',
    balanced: 'google/gemini-3.1-flash-image',
    ultra: 'openai/gpt-image-2.6-sunburst'
  };
  const power = {
    fast: 'openai/gpt-5.6-luna',
    smart: 'openrouter/auto',
    deep: 'openai/gpt-5.6-sol',
    max: 'anthropic/claude-opus-5.5'
  };
  let currentResult = null;
  let wasFreeMode = false;
  let generating = false;
  const openStudio = () => {
    if (!editor.open) editor.showModal();
    $('imgError').textContent = '';
    const config = api.configuration();
    if (config.freeCloud !== wasFreeMode) {
      wasFreeMode = config.freeCloud;
      const captions = config.freeCloud ?
        ['FLUX · 4 шага (экономно)', 'FLUX · 6 шагов', 'FLUX · 8 шагов (больше детализация)'] :
        ['⚡ FAST · экономно', '✧ PRO · универсально', '♛ ULTRA · детализация'];
      Array.from($('imgPreset').options).forEach((option,i) => {option.textContent = captions[i];});
    }
    Array.from($('imgRatio').options).forEach(option => {
      option.disabled = config.freeCloud && option.value !== '1:1';
    });
    if (config.freeCloud) $('imgRatio').value = '1:1';
    $('imgAuthNote').textContent = config.freeCloud
      ? 'Workers AI: изображения FLUX 1:1 расходуют бесплатную общую квоту 10 000 Neurons/сутки. Кнопки меняют число шагов, а не модель.'
      : config.cloudReady
        ? 'Облачный сервер подключён. Генерация может расходовать платный API.'
        : 'Для генерации нужно настроить облачный сервер и личный токен в ⚙ Настройках.';
  };
  function closeStudio() { if (editor.open && !generating) editor.close(); }
  for (const id of ['openStudioSide', 'openStudioHero', 'openStudioMobile', 'openStudioTop']) {
    const btn = $(id);
    if (btn) btn.addEventListener('click', openStudio);
  }
  $('studioClose').addEventListener('click', closeStudio);
  // Close on Escape only after the in-flight request completes.
  editor.addEventListener('cancel', (e) => {
    if (generating) e.preventDefault();
  });
  $('studioOpenSettings').addEventListener('click', () => { closeStudio(); api.openSettings(); });
  function updatePower() {
    const selected = api.configuration();
    const active = Object.keys(power).find(k => selected.mode === 'cloud' && selected.model === power[k]);
    document.querySelectorAll('[data-power]').forEach(btn => {
      const pressed = btn.dataset.power === active;
      btn.classList.toggle('active', pressed);
      btn.setAttribute('aria-pressed', String(pressed));
    });
    const localNote = $('powerHint');
    if (localNote) localNote.textContent = selected.mode === 'local'
      ? 'Локальный режим — производительность зависит от твоего ПК'
      : 'Мощнее ≠ всегда лучше · стоимость модели зависит от её тарифа';
  }
  document.querySelectorAll('[data-power]').forEach(btn => btn.addEventListener('click', () => {
    api.selectCloudModel(power[btn.dataset.power]);
    updatePower();
  }));
  ['model','cloudMode','localMode'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('change', updatePower);
    if (el) el.addEventListener('click', () => queueMicrotask(updatePower));
  });
  if ($('dockChat')) $('dockChat').addEventListener('click', () => {
    $('input').focus();
    document.getElementById('stage').scrollTo({ top: document.getElementById('stage').scrollHeight, behavior: 'smooth' });
  });
  if ($('dockPower')) $('dockPower').addEventListener('click', () => {
    $('powerBar').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  if ($('dockSettings')) $('dockSettings').addEventListener('click', api.openSettings);
  document.querySelectorAll('[data-image-style]').forEach(btn => btn.addEventListener('click', () => {
    const textarea = $('imgPrompt');
    const suffix = btn.dataset.imageStyle;
    const base = textarea.value.trim();
    textarea.value = base ? base.replace(/[,. ]*$/, '') + ', ' + suffix : suffix;
    textarea.focus();
  }));
  function clearPicture() {
    if (!currentResult) return;
    URL.revokeObjectURL(currentResult.url);
    currentResult = null;
  }
  window.addEventListener('pagehide', clearPicture);
  $('imgDownload').addEventListener('click', () => {
    if (!currentResult) return;
    const anchor = document.createElement('a');
    anchor.href = currentResult.url;
    anchor.download = 'vanta-image-' + Date.now() + '.' + currentResult.ext;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  });
  const setBusy = (b) => {
    generating = b;
    $('imgGo').disabled = b;
    $('studioClose').disabled = b;
    $('imgProgress').hidden = !b;
    $('imgGo').textContent = b ? 'Создаём изображение…' : '✦ Создать изображение';
  };
  function pictureToObjectURL(base64, mediaType) {
    const safeTypes = {'image/png':'png','image/webp':'webp','image/jpeg':'jpg'};
    const ext = safeTypes[mediaType];
    if (!ext) throw Error('Неподдерживаемый формат изображения');
    if (base64.length > 15_000_000) throw Error('Изображение слишком большое');
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return {url: URL.createObjectURL(new Blob([bytes], {type: mediaType})), ext};
  }
  $('imgGo').addEventListener('click', async () => {
    if (generating) return;
    const prompt = $('imgPrompt').value.trim();
    if (prompt.length < 3) {
      $('imgError').textContent = 'Опиши изображение хотя бы в трёх символах.';
      $('imgPrompt').focus();
      return;
    }
    const preset = $('imgPreset').value;
    const model = models[preset];
    const ratio = $('imgRatio').value;
    $('imgError').textContent = '';
    setBusy(true);
    try {
      const response = await api.generateImage({model, prompt, aspect_ratio:ratio});
      if (!response?.images?.length) throw Error('Сервис не прислал картинку.');
      const raw = response.images[0];
      const created = pictureToObjectURL(raw.b64_json, raw.media_type);
      clearPicture();
      currentResult = created;
      const preview = $('imgPreview');
      preview.replaceChildren();
      const image = document.createElement('img');
      image.alt = 'Изображение, созданное VANTA AI по вашему описанию';
      image.src = created.url;
      preview.appendChild(image);
      $('imgDownload').disabled = false;
      const cost = typeof response.cost_usd === 'number' ? '$' + response.cost_usd.toFixed(4) : (api.configuration().freeCloud ? 'в пределах бесплатной квоты' : 'стоимость неизвестна');
      $('imgMeta').textContent = 'Готово · ' + ratio + ' · ' + cost + ' · модель ' + preset;
    } catch (error) {
      $('imgError').textContent = error?.message || 'Не удалось создать изображение.';
      $('imgMeta').textContent = 'Генерация не выполнена';
    } finally { setBusy(false); }
  });
  updatePower();
})();