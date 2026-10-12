const themeButton = document.getElementById('theme-toggle');
const preference = matchMedia('(prefers-reduced-motion: reduce)');
let theme = 'dark';
try { theme = localStorage.getItem('rdms-home-studio-theme') === 'light' ? 'light' : 'dark'; } catch { /* Storage may be disabled. */ }
const paletteButton = document.getElementById('palette-toggle');
const palettePanel = document.getElementById('palette-panel');
const paletteOptions = [...document.querySelectorAll('input[name="palette"]')];
let palette = 'teal';
try { const saved = localStorage.getItem('rdms-home-studio-palette'); if (paletteOptions.some(option => option.value === saved)) palette = saved; } catch { /* Optional preference. */ }
document.documentElement.dataset.palette = palette;
document.documentElement.dataset.theme = theme;
const scene = window.createSpaceScene(document.getElementById('space'), available => {
  if (!available) document.body.classList.add('scene-unavailable');
});
function updateTheme() {
  document.documentElement.dataset.theme = theme;
  themeButton.setAttribute('aria-label', theme === 'dark' ? '切换浅色主题' : '切换深色主题');
  scene?.setAppearance();
}
function updateMotion() {
  scene?.setPaused(preference.matches);
}
themeButton.addEventListener('click', () => {
  theme = theme === 'dark' ? 'light' : 'dark'; updateTheme();
  try { localStorage.setItem('rdms-home-studio-theme', theme); } catch { /* Optional preference. */ }
});
preference.addEventListener('change', updateMotion);
updateTheme(); updateMotion();

function closePalette(restoreFocus = false) {
  palettePanel.hidden = true;
  paletteButton.setAttribute('aria-expanded', 'false');
  if (restoreFocus) paletteButton.focus();
}
paletteButton.addEventListener('click', () => {
  if (!palettePanel.hidden) { closePalette(); return; }
  palettePanel.hidden = false;
  paletteButton.setAttribute('aria-expanded', 'true');
  paletteOptions.find(option => option.checked)?.focus();
});
for (const option of paletteOptions) {
  option.checked = option.value === palette;
  option.addEventListener('change', () => {
    if (!option.checked) return;
    palette = option.value;
    document.documentElement.dataset.palette = palette;
    scene?.setAppearance();
    try { localStorage.setItem('rdms-home-studio-palette', palette); } catch { /* Optional preference. */ }
  });
}
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !palettePanel.hidden) closePalette(true); });
document.addEventListener('pointerdown', event => { if (!event.target.closest('.palette-picker')) closePalette(); });
document.addEventListener('focusin', event => { if (!event.target.closest('.palette-picker')) closePalette(); });
