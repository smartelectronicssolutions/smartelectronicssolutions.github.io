// =========================
// ONLINE JOURNAL CORE
// =========================

// Escape HTML safely
export function escapeHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// =========================
// FULL ARTICLE RENDER (used in onlinejournal.html)
// =========================

export function renderArticleContent(article) {
  let html = "";

  // Header image
  if (article.imageUrl && !article.imageUrl.includes("PLACEHOLDER")) {
    html += `
      <img src="${article.imageUrl}" class="article-header-image">
    `;
  }

  (article.sections || []).forEach((section) => {
    if (section.title) {
      html += `<h3>${escapeHtml(section.title)}</h3>`;
    }

    if (section.summary) {
      html += `<p>${escapeHtml(section.summary)}</p>`;
    }

    (section.content || []).forEach((item) => {
      if (item.type === "text") {
        html += `<p>${item.value}</p>`;
      }

      if (item.type === "image") {
        html += `
          <a href="${item.src}" target="_blank">
            <img src="${item.src}" class="article-img">
          </a>
        `;
      }

      if (item.type === "list") {
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
        html += `
          <p>
            <a href="${item.href}" target="_blank" class="article-link">
              ${escapeHtml(item.label || item.href)}
            </a>
          </p>
        `;
      }

      if (item.type === "link_button") {
        html += `
          <a href="${item.href}" target="_blank" class="article-link-btn">
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
      if (!link.url.includes("PLACEHOLDER")) {
        html += `
          <li>
            <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">
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

      // Optional preview image
      let previewImg = "";
      const firstImage = article.sections?.[0]?.content?.find(
        (c) => c.type === "image",
      );

      if (firstImage) {
        previewImg = `<img src="${firstImage.src}" class="article-img">`;
      }

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
