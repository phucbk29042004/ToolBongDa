// theme.js — Handles Light/Dark Theme Switching
(function () {
  // Apply saved theme immediately before body renders to prevent flashing
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
  }
})();

document.addEventListener('DOMContentLoaded', () => {
  const headerRight = document.querySelector('.header-right');
  if (headerRight) {
    const btn = document.createElement('button');
    btn.className = 'theme-toggle-btn';
    btn.setAttribute('aria-label', 'Chuyển chế độ sáng/tối');
    btn.innerHTML = document.body.classList.contains('dark-theme') ? '☀️' : '🌙';
    
    // Insert before websocket indicator if present
    const wsStatus = document.getElementById('wsStatus');
    if (wsStatus) {
      headerRight.insertBefore(btn, wsStatus);
    } else {
      headerRight.appendChild(btn);
    }

    btn.addEventListener('click', () => {
      document.body.classList.toggle('dark-theme');
      const isDark = document.body.classList.contains('dark-theme');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      btn.innerHTML = isDark ? '☀️' : '🌙';
    });
  }
});
