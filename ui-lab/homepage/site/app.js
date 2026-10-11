const themeButton = document.getElementById('theme-toggle');
const motionButton = document.getElementById('motion-toggle');
const preference = matchMedia('(prefers-reduced-motion: reduce)');
let theme = 'dark';
try { theme = localStorage.getItem('rdms-home-studio-theme') === 'light' ? 'light' : 'dark'; } catch { /* Storage may be disabled. */ }
let paused = preference.matches;
const scene = window.createSpaceScene(document.getElementById('space'), available => {
  if (!available) document.body.classList.add('scene-unavailable');
});
function updateTheme() {
  document.documentElement.dataset.theme = theme;
  themeButton.setAttribute('aria-label', theme === 'dark' ? '切换浅色主题' : '切换深色主题');
  scene?.setTheme(theme);
}
function updateMotion() {
  scene?.setPaused(paused);
  motionButton.setAttribute('aria-pressed', String(paused));
  motionButton.setAttribute('aria-label', paused ? '播放动画' : '暂停动画');
  motionButton.querySelector('span').textContent = paused ? '播放动画' : '暂停动画';
}
themeButton.addEventListener('click', () => {
  theme = theme === 'dark' ? 'light' : 'dark'; updateTheme();
  try { localStorage.setItem('rdms-home-studio-theme', theme); } catch { /* Optional preference. */ }
});
motionButton.addEventListener('click', () => { paused = !paused; updateMotion(); });
preference.addEventListener('change', () => { paused = preference.matches; updateMotion(); });
updateTheme(); updateMotion();
