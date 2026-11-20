'use strict';

window.createImageLibrary = function createImageLibrary(dialog, api) {
  const get = (suffix) => dialog.querySelector('#image-library-' + suffix);
  const icons = get('icons');
  const apps = get('apps');
  const search = get('search');
  const results = get('results');
  const pagination = get('pages');
  const position = get('position');
  const previous = get('previous');
  const next = get('next');
  const selection = get('selection');
  const label = get('label');
  const status = get('status');
  const iconPreview = get('icon-preview');
  const crop = get('crop');
  const original = get('original');
  const frame = get('frame');
  const canvas = get('canvas');
  const context = canvas.getContext('2d');
  const zoom = get('zoom');
  const horizontal = get('horizontal');
  const vertical = get('vertical');
  const use = get('use');
  const { CROP_SIZE, cropRect } = window.LastraAssetCrop;
  let mode = 'icons';
  let page = 0;
  let selected;
  let choose;
  let returnFocus;
  let queryEpoch = 0;
  let assetEpoch = 0;

  function drawCrop() {
    if (selected?.kind !== 'image') return;
    const { image } = selected;
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const rect = cropRect(width, height, zoom.valueAsNumber, horizontal.valueAsNumber, vertical.valueAsNumber);
    const { x, y, size } = rect;
    frame.style.left = (x / width * 100) + '%';
    frame.style.top = (y / height * 100) + '%';
    frame.style.width = (size / width * 100) + '%';
    frame.style.height = (size / height * 100) + '%';
    horizontal.disabled = width === size;
    vertical.disabled = height === size;
    context.clearRect(0, 0, CROP_SIZE, CROP_SIZE);
    context.drawImage(image, x, y, size, size, 0, 0, CROP_SIZE, CROP_SIZE);
  }

  function selectIcon(asset) {
    if (!asset.preview) return;
    assetEpoch++;
    selected = { kind: 'icon', value: asset.id };
    label.textContent = asset.label;
    status.textContent = '';
    iconPreview.style.setProperty('--asset-icon', `url("${asset.preview}")`);
    iconPreview.hidden = false;
    crop.hidden = true;
    selection.hidden = false;
    use.textContent = window.LastraI18n.t('Use icon');
  }

  async function readImage(read) {
    const epoch = ++assetEpoch;
    status.textContent = '';
    try {
      const asset = await read();
      if (!asset || !dialog.open || epoch !== assetEpoch) return;
      const image = new Image();
      image.src = asset.source;
      await image.decode();
      if (!dialog.open || epoch !== assetEpoch) return;
      selected = { kind: 'image', image };
      label.textContent = asset.label;
      original.src = asset.source;
      const previewWidth = Math.min(360, 240 * image.naturalWidth / image.naturalHeight);
      original.parentElement.style.width = previewWidth + 'px';
      original.parentElement.style.aspectRatio = image.naturalWidth + ' / ' + image.naturalHeight;
      zoom.value = '100';
      horizontal.value = vertical.value = '50';
      iconPreview.hidden = true;
      selection.hidden = crop.hidden = false;
      use.textContent = window.LastraI18n.t('Use crop');
      drawCrop();
    } catch (error) {
      if (epoch === assetEpoch && dialog.open) status.textContent = error.message || window.LastraI18n.t('The image could not be opened.');
    }
  }

  async function showResults() {
    const epoch = ++queryEpoch;
    try {
      const match = await api.searchAssets(mode, search.value, page);
      if (!dialog.open || epoch !== queryEpoch) return;
      page = match.page;
      previous.disabled = page === 0;
      next.disabled = page >= match.pages - 1;
      pagination.hidden = match.pages <= 1;
      position.textContent = `${page + 1} / ${match.pages}`;
      results.replaceChildren(...match.items.map((asset) => {
        const entry = document.createElement('button');
        entry.type = 'button';
        entry.className = 'image-library-entry';
        if (asset.preview) {
          const glyph = document.createElement('span');
          glyph.className = 'image-library-glyph';
          glyph.style.setProperty('--asset-icon', `url("${asset.preview}")`);
          glyph.setAttribute('aria-hidden', 'true');
          entry.append(glyph);
        }
        const name = document.createElement('span');
        name.textContent = asset.label;
        entry.append(name);
        if (asset.scope) {
          const scope = document.createElement('small');
          scope.textContent = asset.scope;
          entry.append(scope);
        }
        entry.addEventListener('click', () => {
          if (mode === 'icons') selectIcon(asset);
          else void readImage(() => api.appIcon(asset.id));
        });
        return entry;
      }));
      if (!match.total) results.textContent = mode === 'apps' ? 'No matching Start menu apps.' : 'No matching icons.';
    } catch (error) {
      if (dialog.open && epoch === queryEpoch) status.textContent = error.message;
    }
  }

  function changeMode(value) {
    mode = value;
    page = 0;
    search.value = '';
    status.textContent = '';
    results.replaceChildren();
    pagination.hidden = true;
    icons.setAttribute('aria-pressed', String(mode === 'icons'));
    apps.setAttribute('aria-pressed', String(mode === 'apps'));
    search.placeholder = mode === 'icons' ? window.LastraI18n.t('Icon name') : 'App name';
    void showResults();
  }

  icons.addEventListener('click', () => changeMode('icons'));
  apps.addEventListener('click', () => changeMode('apps'));
  get('file').addEventListener('click', () => void readImage(() => api.browseAsset('image')));
  get('exe').addEventListener('click', () => void readImage(() => api.browseAsset('app')));
  get('close').addEventListener('click', () => dialog.close());
  search.addEventListener('input', () => { page = 0; void showResults(); });
  previous.addEventListener('click', () => { page--; void showResults(); });
  next.addEventListener('click', () => { page++; void showResults(); });
  for (const slider of [zoom, horizontal, vertical]) slider.addEventListener('input', drawCrop);
  use.addEventListener('click', () => {
    if (!selected) return;
    try {
      const value = selected.kind === 'icon' ? selected.value : canvas.toDataURL('image/png');
      if (selected.kind === 'image' && !value.startsWith('data:image/png;base64,')) throw new Error(window.LastraI18n.t('Invalid crop'));
      const saved = choose({ kind: selected.kind, value });
      if (saved !== false) dialog.close();
      else status.textContent = window.LastraI18n.t('Select the original key and reopen the library.');
    } catch {
      status.textContent = 'The crop could not be embedded. Choose a different image.';
    }
  });
  dialog.addEventListener('close', () => {
    assetEpoch++;
    queryEpoch++;
    selected = undefined;
    selection.hidden = true;
    original.removeAttribute('src');
    results.replaceChildren();
    context.clearRect(0, 0, CROP_SIZE, CROP_SIZE);
    const current = document.getElementById('choose-key-image');
    (current ?? returnFocus)?.focus();
  });
  return (key, apply) => {
    if (dialog.open) return;
    choose = apply;
    returnFocus = document.activeElement;
    dialog.showModal();
    changeMode('icons');
    search.focus();
    if (key.image) void readImage(async () => {
      const source = await api.previewAsset('image', key.image);
      return source ? { label: 'Current key image', source } : null;
    });
  };
};
