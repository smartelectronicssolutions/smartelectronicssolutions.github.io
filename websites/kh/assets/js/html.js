// Loads the shared header into <header class="kh-nav"></header> and
// marks the active link based on the current page. Exposes a promise
// (window.khHeaderReady) so inline modules can await DOM elements
// that live inside the header (e.g. #kh-account-link, #kh-auth-panel — handled by kh-auth.js).

window.khHeaderReady = (async function loadHeader() {
  const target = document.querySelector('header.kh-nav');
  if (!target) return;
  try {
    const res = await fetch('header.html', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`header.html ${res.status}`);
    target.innerHTML = await res.text();
    const current = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    target.querySelectorAll('a[data-page]').forEach(a => {
      if (a.dataset.page.toLowerCase() === current) a.classList.add('active');
    });
  } catch (err) {
    console.error('[kh] header load failed:', err);
  }
})();
