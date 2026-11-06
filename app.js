'use strict';

const invoke = window.__TAURI__?.core.invoke;
const chooseButton = document.querySelector('#choose');
const openButton = document.querySelector('#open');
const browserFile = document.querySelector('#browser-file');
const filename = document.querySelector('#filename');
const placeholder = document.querySelector('#placeholder');
const preview = document.querySelector('#preview-image');
const message = document.querySelector('#file-message');
const cards = [...document.querySelectorAll('[data-dialog]')];
const soundToggle = document.querySelector('#sound-toggle');
let previewUrl;
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

function showMessage(text = '') {
  message.textContent = text;
  message.hidden = !text;
}

function clearSelection() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = undefined;
  preview.removeAttribute('src');
  preview.hidden = true;
  placeholder.hidden = false;
  filename.textContent = 'Ningún archivo seleccionado';
  openButton.disabled = true;
  cards.forEach(card => { card.disabled = true; });
}

async function displaySvg(data, name) {
  clearSelection();
  const url = URL.createObjectURL(new Blob([data], { type: 'image/svg+xml' }));
  preview.src = url;
  try {
    await preview.decode();
  } catch {
    URL.revokeObjectURL(url);
    preview.removeAttribute('src');
    throw new Error('No se pudo previsualizar el SVG. Comprueba que el archivo sea válido.');
  }
  previewUrl = url;
  preview.hidden = false;
  placeholder.hidden = true;
  filename.textContent = name;
  cards.forEach(card => { card.disabled = false; });
  document.querySelectorAll('dialog form').forEach(form => form.reset());
}

async function loadSelection(load) {
  chooseButton.disabled = true;
  openButton.disabled = true;
  showMessage();
  try {
    await load();
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error));
  } finally {
    openButton.disabled = !previewUrl || !invoke;
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

openButton.addEventListener('click', async () => {
  showMessage();
  try {
    await invoke('open_svg');
  } catch (error) {
    showMessage(String(error));
  }
});

cards.forEach(card => {
  card.addEventListener('click', () => {
    document.getElementById(card.dataset.dialog).showModal();
  });
});
