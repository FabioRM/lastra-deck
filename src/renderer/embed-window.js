'use strict';

window.lastraEmbed.onState(({ title, status }) => {
  document.getElementById('embed-title').textContent = title;
  document.getElementById('embed-status').textContent = status;
});
document.getElementById('embed-external').addEventListener('click', () => window.lastraEmbed.openExternal());
document.getElementById('embed-close').addEventListener('click', () => window.lastraEmbed.close());
