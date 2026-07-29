// js/index.js

document.addEventListener('DOMContentLoaded', () => {
  const headerContainer = document.getElementById('headerContainer');
  const bodyContainer = document.getElementById('bodyContainer');
  const footerContainer = document.getElementById('footerContainer');

  // Track one-time listeners / inits
  const loaded = new Set();

  const PAGE_BASE = 'pages/';

  // If a fetched file is a full HTML document, inject ONLY its <body> content
  function normalizeFetchedHTML(htmlText) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');

      const bodyHTML = doc.body?.innerHTML?.trim();
      if (!bodyHTML) return htmlText; // probably a fragment already

      return bodyHTML;
    } catch (e) {
      console.warn('normalizeFetchedHTML failed, using raw HTML', e);
      return htmlText;
    }
  }

  // Only allow "simple" page keys like "connect", "login", "terms"
  function normalizePageKey(raw) {
    return (raw || '')
      .trim()
      .replace(/^.*[\\/]/, '')     // strip any path
      .replace(/\.html$/i, '')     // strip extension
      .replace(/[^a-z0-9_-]/gi, ''); // keep safe chars only
  }

  function runScripts(container) {
    const scripts = Array.from(container.querySelectorAll('script'));
    for (const oldScript of scripts) {
      const newScript = document.createElement('script');

      for (const { name, value } of oldScript.attributes) {
        newScript.setAttribute(name, value);
      }

      newScript.textContent = oldScript.textContent;
      oldScript.replaceWith(newScript);
    }
  }

  async function loadContent(container, path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Error fetching ${path}: ${res.status} ${res.statusText}`);

    const raw = await res.text();
    const html = normalizeFetchedHTML(raw);

    container.innerHTML = html;
    runScripts(container);
    afterPageLoad(path);
  }

  async function loadPage(pageName, pushState = true) {
    const key = normalizePageKey(pageName) || 'home';
    const path = `${PAGE_BASE}${key}.html`;

    // Update hash first so page scripts read the new route immediately.
    if (pushState) {
      history.pushState({ page: key }, '', `#${key}`);
    }

    await loadContent(bodyContainer, path);
  }

  function scrollToId(id) {
    const el = document.getElementById(id);
    if (!el) return false;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }

  function afterPageLoad(path) {
    // Contact page init (only once)
    if (path.endsWith('/contact.html') && !loaded.has('contact')) {
      attachContactFormListeners();
      attachEmailCopyListener();
      loaded.add('contact');
    }

    // Login page init (only once)
    if (path.endsWith('/login.html') && !loaded.has('login')) {
      import('./firebaseHandler.js')
        .then(m => {
          m.initializeFirebase?.();
          m.attachFirebaseEventListeners?.();
          loaded.add('login');
        })
        .catch(err => console.error('Failed to load Firebase module:', err));
    }

    // Connect page init example (optional hook)
    // If you later move connect-specific JS into js/connect.js:
    // if (path.endsWith('/connect.html') && !loaded.has('connect')) {
    //   import('./connect.js').then(m => m.initConnect?.());
    //   loaded.add('connect');
    // }
  }

  // ONE delegated click handler for nav + buttons/links
  if (!loaded.has('nav')) {
    document.addEventListener('click', async (event) => {
      const target = event.target.closest('[data-scroll-to], [data-page], [data-guide]');
      if (!target) return;

      event.preventDefault();

      const scrollId = target.getAttribute('data-scroll-to');
      const page = target.getAttribute('data-page');

      // Scroll links
      if (scrollId) {
        // If we’re not currently on home (sections might not exist), load home then scroll
        if (!document.getElementById(scrollId)) {
          await loadPage('home', true);
        }
        scrollToId(scrollId);
        return;
      }

      // Page links
      if (page) {
        await loadPage(page, true);
        return;
      }

      // Guide article links
      const guideSlug = target.getAttribute('data-guide');
      if (guideSlug) {
        const slug = guideSlug.replace(/[^a-z0-9_-]/gi, '');
        history.pushState({ page: 'blog', slug }, '', `#blog/${slug}`);
        await loadPage('blog', false);
        return;
      }
    });

    loaded.add('nav');
  }

  // Login/Register toggle (delegated; only once)
  if (!loaded.has('login-toggle')) {
    document.addEventListener('click', (event) => {
      if (event.target.matches('#toggle-register')) {
        event.preventDefault();
        const login = document.querySelector('.login-container');
        const reg = document.querySelector('.register-container');
        if (login) login.style.display = 'none';
        if (reg) reg.style.display = 'block';
      }

      if (event.target.matches('#toggle-login')) {
        event.preventDefault();
        const login = document.querySelector('.login-container');
        const reg = document.querySelector('.register-container');
        if (reg) reg.style.display = 'none';
        if (login) login.style.display = 'block';
      }
    });

    loaded.add('login-toggle');
  }

  function attachContactFormListeners() {
    const submitButton = document.getElementById('submitBtn');
    if (!submitButton) return;

    submitButton.addEventListener('click', (e) => {
      e.preventDefault();

      const name = document.getElementById('name')?.value || '';
      const email = document.getElementById('email')?.value || '';
      const phone = document.getElementById('phone')?.value || '';
      const message = document.getElementById('message')?.value || '';

      localStorage.setItem('formData', JSON.stringify({ name, email, phone, message }));

      const subject = `Contact Request from ${name}`;
      const body = `${message}\n\n${name}\n${phone}\n${email}`;

      window.location.href =
        `mailto:luis@smartelectronicssolutions.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    });
  }

  function attachEmailCopyListener() {
    const emailText = document.getElementById('email-text');
    if (!emailText) return;

    emailText.addEventListener('click', async () => {
      const text = emailText.textContent || '';

      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      const original = text;
      emailText.textContent = 'Email Copied to Clipboard.';
      emailText.style.color = 'green';

      setTimeout(() => {
        emailText.textContent = original;
        emailText.style.color = '';
      }, 2000);
    });
  }

  // Resolve the page key from a hash string (handles #blog/slug)
  function pageFromHash(hash) {
    const raw = (hash || '#home').replace('#', '');
    if (raw.startsWith('blog/')) return 'blog';
    return raw;
  }

  // Initial load: header/footer + page based on hash
  loadContent(headerContainer, 'header.html');
  loadContent(footerContainer, 'footer.html');

  const initial = pageFromHash(location.hash);
  loadPage(initial, false).catch(() => loadPage('home', false));

  // Back/forward support (no reload flashing)
  window.addEventListener('popstate', () => {
    const page = pageFromHash(location.hash);
    loadPage(page, false).catch(() => loadPage('home', false));
  });
});
