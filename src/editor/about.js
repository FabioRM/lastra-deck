'use strict';

{
  const api = window.lastraEditor;
  const { t } = window.LastraI18n;
  const page = document.getElementById('about-settings');
  const status = document.getElementById('about-status');
  let message = '';
  let display = '';

  function report(value) {
    message = value;
    status.textContent = t(message);
    status.classList.toggle('error', Boolean(message));
  }

  async function load() {
    try {
      const metadata = await api.getAbout();
      display = metadata.display;
      document.getElementById('about-version').textContent = metadata.version;
      document.getElementById('about-author').textContent = metadata.author;
      document.getElementById('about-license').textContent = metadata.license;
      document.getElementById('about-display').textContent = t(display);
      for (const link of page.querySelectorAll('[data-about-link]')) {
        const url = metadata.links[link.dataset.aboutLink];
        if (url) link.href = url;
      }
      report('');
    } catch {
      report('Could not load Lastra information.');
    }
  }

  async function openLink(event) {
    const link = event.target.closest('a[data-about-link][href]');
    if (!link || event.button > 1) return;
    event.preventDefault();
    report('');
    try {
      await api.openAboutLink(link.dataset.aboutLink);
    } catch {
      report('Could not open the link.');
    }
  }

  page.addEventListener('click', openLink);
  page.addEventListener('auxclick', openLink);
  page.addEventListener('about:open', () => void load());
  document.addEventListener('lastra-language', () => {
    document.getElementById('about-display').textContent = t(display);
    report(message);
  });
}
