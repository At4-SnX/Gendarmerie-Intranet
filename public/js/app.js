// ── Modals ─────────────────────────────────────────────────────
function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.hidden = false;
  m.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
  // Focus premier champ
  const first = m.querySelector('input,select,textarea');
  if (first) setTimeout(() => first.focus(), 50);
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.hidden = true;
  document.body.style.overflow = '';
}
// Clic sur overlay = fermer
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal')) {
    e.target.hidden = true;
    document.body.style.overflow = '';
  }
});
// Echap = fermer
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal:not([hidden])').forEach(m => {
      m.hidden = true;
      document.body.style.overflow = '';
    });
  }
});

// ── Lien actif dans la sidebar ─────────────────────────────────
document.querySelectorAll('.nav-link').forEach(link => {
  if (link.href && window.location.pathname.startsWith(new URL(link.href).pathname) && link.href !== window.location.origin + '/') {
    link.classList.add('active');
  }
});
