// =========================
// ONLINE JOURNAL CORE
// =========================

// Escape HTML safely (incl. quotes — values are injected into attributes)
export function escapeHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Only allow http(s)/relative URLs — blocks javascript:, data:, etc.
// Returns "" for anything unsafe so callers can skip rendering.
function safeUrl(u) {
  const s = String(u ?? "").trim();
  return /^(https?:\/\/|\/|\.\/)/i.test(s) ? s : "";
}

// Single source of truth for an article's display image, used by the list
// thumbnail, the home-page cards, and the article header. Prefers the legacy
// top-level imageUrl, then falls back to the first image placed in section
// content (the "+ image" editor) — so setting an image there shows everywhere.
export function getArticleImage(article) {
  if (!article) return "";
  if (article.imageUrl && !article.imageUrl.includes("PLACEHOLDER")) {
    return safeUrl(article.imageUrl);
  }
  for (const section of article.sections || []) {
    for (const item of section.content || []) {
      if (item.type === "image" && item.src) {
        const s = safeUrl(item.src);
        if (s) return s;
      }
    }
  }
  return "";
}

// =========================
// FULL ARTICLE RENDER (used in onlinejournal.html)
// =========================

export function renderArticleContent(article) {
  let html = "";

  // Header image
  if (article.imageUrl && !article.imageUrl.includes("PLACEHOLDER")) {
    const headerSrc = safeUrl(article.imageUrl);
    if (headerSrc) {
      html += `
        <img src="${escapeHtml(headerSrc)}" class="article-header-image">
      `;
    }
  }

  (article.sections || []).forEach((section) => {
    if (section.title) {
      html += `<h3>${escapeHtml(section.title)}</h3>`;
    }

    if (section.summary) {
      html += `<p>${escapeHtml(section.summary)}</p>`;
    }

    (section.content || []).forEach((item) => {
      if (item.type === "text" && item.value) {
        html += `<p>${escapeHtml(item.value)}</p>`;
      }

      if (item.type === "image" && item.src) {
        const imgSrc = safeUrl(item.src);
        if (imgSrc) {
          html += `
            <a href="${escapeHtml(imgSrc)}" target="_blank" rel="noopener noreferrer">
              <img src="${escapeHtml(imgSrc)}" class="article-img">
            </a>
          `;
          if (item.caption) {
            html += `<p class="img-caption">${escapeHtml(item.caption)}</p>`;
          }
        }
      }

      if (item.type === "list" && Array.isArray(item.items) && item.items.length) {
        html += `<ul>${item.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
      }

      if (item.type === "code") {
        html += `
          <div class="code-block">
            <pre><code>${escapeHtml(item.value)}</code></pre>
          </div>
        `;
      }

      if (item.type === "link") {
        const linkHref = safeUrl(item.href);
        html += `
          <p>
            <a href="${escapeHtml(linkHref)}" target="_blank" rel="noopener noreferrer" class="article-link">
              ${escapeHtml(item.label || item.href)}
            </a>
          </p>
        `;
      }

      if (item.type === "link_button") {
        const btnHref = safeUrl(item.href);
        html += `
          <a href="${escapeHtml(btnHref)}" target="_blank" rel="noopener noreferrer" class="article-link-btn">
            ${escapeHtml(item.label || "Open Link")}
          </a>
        `;
      }
    });

    // fallback support (old data)
    if (section.steps) {
      html += `<ul>${section.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`;
    }
  });

  // Related links
  if (article.relatedLinks && article.relatedLinks.length > 0) {
    html += `<div class="related-links"><h4>Related Resources</h4><ul>`;

    article.relatedLinks.forEach((link) => {
      if (link.url && !link.url.includes("PLACEHOLDER")) {
        const relHref = safeUrl(link.url);
        html += `
          <li>
            <a href="${escapeHtml(relHref)}" target="_blank" rel="noopener noreferrer">
              ${escapeHtml(link.title)}
            </a>
          </li>
        `;
      }
    });

    html += `</ul></div>`;
  }

  return html;
}

// =========================
// CARD RENDER (used in index.html)
// =========================

export function renderArticleCards(data, container) {
  container.innerHTML = "";

  Object.entries(data)
    .sort((a, b) => b[0] - a[0])
    .slice(0, 4)
    .forEach(([id, article]) => {
      const div = document.createElement("div");
      div.className = "post";

      // Optional preview image — same source as the list + article views.
      const previewSrc = getArticleImage(article);
      const previewImg = previewSrc
        ? `<img src="${escapeHtml(previewSrc)}" class="article-img">`
        : "";

      div.innerHTML = `
        ${previewImg}
        <small>${new Date(article.createdAt || Date.now()).toLocaleDateString()}</small>
        <h3>${article.title || "Untitled"}</h3>
        <p>${article.description || ""}</p>
      `;

      div.onclick = () => {
        window.location.href = `online/onlinejournal.html?id=${id}`;
      };

      container.appendChild(div);
    });
}
