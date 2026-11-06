'use strict';

const invoke = window.__TAURI__?.core.invoke;
const chooseButton = document.querySelector('#choose');
const openButton = document.querySelector('#open');
const saveButton = document.querySelector('#save-result');
const plotterButton = document.querySelector('#send-plotter');
const browserFile = document.querySelector('#browser-file');
const filename = document.querySelector('#filename');
const placeholder = document.querySelector('#placeholder');
const preview = document.querySelector('#preview-image');
const foldedPreview = new FoldedPreview(
  document.querySelector('#model-preview'),
  document.querySelector('#model-placeholder'),
  document.querySelector('#model-hint'),
);
const message = document.querySelector('#file-message');
const cards = [...document.querySelectorAll('[data-dialog]')];
const operations = cards.filter(card => card.dataset.dialog !== 'models');
const catalog = document.querySelector('#models');
const soundToggle = document.querySelector('#sound-toggle');
let previewUrl;
let generatedPath;
let soundEnabled = true;
let audio;

function clickSound() {
  if (!soundEnabled || !window.AudioContext) return;
  audio ??= new AudioContext();
  void audio.resume().catch(() => {});
  const now = audio.currentTime;
  const tone = audio.createOscillator();
  const gain = audio.createGain();
  tone.type = 'sine';
  tone.frequency.setValueAtTime(620, now);
  tone.frequency.exponentialRampToValueAtTime(360, now + .07);
  gain.gain.setValueAtTime(.065, now);
  gain.gain.exponentialRampToValueAtTime(.001, now + .09);
  tone.connect(gain).connect(audio.destination);
  tone.start(now);
  tone.stop(now + .1);
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (button && button !== soundToggle && !button.disabled) clickSound();
}, { capture: true });

soundToggle.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  soundToggle.setAttribute('aria-pressed', String(soundEnabled));
  soundToggle.querySelector('use').setAttribute('href', soundEnabled ? '#sound' : '#mute');
  clickSound();
});

function showMessage(text = '', isError = true) {
  message.textContent = text;
  message.hidden = !text;
  message.classList.toggle('is-error', isError);
}

function clearSelection() {
  if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
  previewUrl = undefined;
  preview.removeAttribute('src');
  preview.hidden = true;
  placeholder.hidden = false;
  foldedPreview.show();
  filename.textContent = 'Ningún archivo seleccionado';
  openButton.disabled = true;
  generatedPath = undefined;
  saveButton.disabled = true;
  plotterButton.disabled = true;
  operations.forEach(card => { card.disabled = true; });
}

async function displaySvg(data, name, code) {
  const blob = new Blob([data], { type: 'image/svg+xml' });
  let modelCode = code ?? FoldedPreview.identify(name);
  if (!Object.hasOwn(FoldedPreview.models, modelCode)) {
    const header = await blob.slice(0, 65536).text();
    const title = header.match(/<title(?:\s[^>]*)?>([^<]+)<\/title>/i)?.[1];
    if (title) modelCode = FoldedPreview.identify(title);
  }
  return displayPreview(URL.createObjectURL(blob), name, modelCode);
}

async function displayPreview(url, name, modelCode) {
  clearSelection();
  preview.src = url;
  try {
    await preview.decode();
  } catch {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    preview.removeAttribute('src');
    throw new Error('No se pudo previsualizar el SVG. Comprueba que el archivo sea válido.');
  }
  previewUrl = url;
  preview.hidden = false;
  placeholder.hidden = true;
  foldedPreview.show(modelCode, true);
  filename.textContent = name;
  operations.forEach(card => { card.disabled = false; });
  document.querySelectorAll('dialog form').forEach(form => form.reset());
}

async function loadSelection(load) {
  chooseButton.disabled = true;
  openButton.disabled = true;
  saveButton.disabled = true;
  plotterButton.disabled = true;
  showMessage();
  try {
    await load();
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error));
  } finally {
    openButton.disabled = !previewUrl || !invoke;
    saveButton.disabled = !generatedPath || !invoke;
    plotterButton.disabled = !previewUrl;
    chooseButton.disabled = false;
    chooseButton.querySelector('span').textContent = previewUrl ? 'Cambiar SVG' : 'Cargar SVG';
  }
}

chooseButton.addEventListener('click', () => {
  if (!invoke) {
    browserFile.click();
    return;
  }
  void loadSelection(async () => {
    const name = await invoke('choose_svg');
    if (name === null) return;
    clearSelection();
    const bytes = await invoke('read_svg');
    await displaySvg(bytes, name);
  });
});

browserFile.addEventListener('change', () => {
  const [file] = browserFile.files;
  browserFile.value = '';
  if (!file) return;
  void loadSelection(async () => {
    if (!/\.svg$/i.test(file.name)) throw new Error('Selecciona un archivo .svg.');
    await displaySvg(file, file.name);
  });
});

if (!invoke) openButton.title = 'Disponible en la aplicación de escritorio';

plotterButton.addEventListener('click', () => {
  showMessage('Envío al plotter pendiente de configurar.', false);
});

openButton.addEventListener('click', async () => {
  showMessage();
  try {
    await invoke('open_svg');
  } catch (error) {
    showMessage(String(error));
  }
});

// The generation workflows dispatch this event only after creating the output file.
document.addEventListener('resultado-generado', event => {
  const path = event.detail?.path;
  if (!invoke || !previewUrl || typeof path !== 'string' || !/\.(svg|blend)$/i.test(path)) return;
  generatedPath = path;
  saveButton.disabled = chooseButton.disabled;
});

saveButton.addEventListener('click', async () => {
  saveButton.disabled = true;
  chooseButton.disabled = true;
  showMessage();
  try {
    const savedName = await invoke('save_result', { path: generatedPath });
    if (savedName !== null) showMessage(`Guardado: ${savedName}`, false);
  } catch (error) {
    showMessage(String(error));
  } finally {
    chooseButton.disabled = false;
    saveButton.disabled = !generatedPath;
  }
});

cards.forEach(card => {
  card.addEventListener('click', () => {
    if (chooseButton.disabled) return;
    document.getElementById(card.dataset.dialog).showModal();
  });
});

const catalogSearch = catalog.querySelector('#model-search');
const catalogGrid = catalog.querySelector('.catalog-grid');
const catalogEmpty = catalog.querySelector('.catalog-empty');
const catalogTabs = [...catalog.querySelectorAll('[data-filter]')];
const catalogModels = [...catalog.querySelectorAll('[data-model]')];
const modelOptions = document.querySelector('#model-options');
let catalogCategory = 'all';

function normalizeSearch(value) {
  return value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function filterModels() {
  const words = normalizeSearch(catalogSearch.value).split(' ').filter(Boolean);
  let matches = 0;
  for (const model of catalogModels) {
    const name = normalizeSearch(`${model.querySelector('.code').textContent} ${model.querySelector('strong').textContent}`);
    const categoryMatches = catalogCategory === 'all' || catalogCategory === model.dataset.category;
    model.hidden = !categoryMatches || !words.every(word => name.includes(word));
    if (!model.hidden) matches++;
  }
  catalogEmpty.hidden = matches > 0;
  catalogGrid.hidden = matches === 0;
  catalogGrid.scrollTop = 0;
}

catalogSearch.addEventListener('input', filterModels);
catalogSearch.addEventListener('keydown', event => {
  if (event.key === 'Enter') event.preventDefault();
});
catalogTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    catalogCategory = tab.dataset.filter;
    catalogTabs.forEach(item => item.setAttribute('aria-pressed', String(item === tab)));
    filterModels();
  });
});

catalogModels.forEach(model => {
  const reference = model.querySelector('.model-ref');
  const options = modelOptions.content.cloneNode(true);
  options.querySelectorAll('button').forEach(button => {
    button.setAttribute('aria-label', `${button.textContent} · ${reference.textContent.trim()}`);
  });
  reference.append(options);
  model.querySelector('.model-select').addEventListener('click', () => {
    catalog.close();
    void loadSelection(async () => {
      const code = model.dataset.model;
      if (!invoke) {
        const name = model.dataset.category === 'armarios' ? code : `FEFCO-${code}`;
        await displayPreview(model.querySelector('img').src, `${name}.svg`, code);
        return;
      }
      const name = await invoke('choose_model', { code });
      clearSelection();
      const bytes = await invoke('read_svg');
      await displaySvg(bytes, name, code);
    });
  });
});
