document.addEventListener("DOMContentLoaded", () => {
  // Load shared header and footer
  fetchWithFallback(
    "header-placeholder",
    "components/header.html",
    "../components/header.html",
  ).then(() => {
    // Hamburger menu toggle — runs after header is injected into the DOM
    const hamburger = document.querySelector(".hamburger");
    const navLinks = document.querySelector(".nav-links");
    if (hamburger && navLinks) {
      hamburger.addEventListener("click", () => {
        navLinks.classList.toggle("active");
        hamburger.classList.toggle("active");
      });
    }
  });

  fetchWithFallback(
    "footer-placeholder",
    "components/footer.html",
    "../components/footer.html",
  );

  if (document.getElementById("projects-container")) {
    populateThumbnails(projects, "projects-container");
  }

  if (document.getElementById("apps-container")) {
    populateThumbnails(apps, "apps-container");
  }
});

function populateThumbnails(items, containerId, userLoggedIn) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  const categories = { Cloud: [], Game: [], Other: [] };

  items.forEach((item) => {
    if (!item.requiresLogin || (item.requiresLogin && userLoggedIn)) {
      const itemCategories = item.category
        ? item.category.split(",").map((cat) => cat.trim())
        : ["Other"];

      itemCategories.forEach((category) => {
        if (categories[category]) {
          categories[category].push(item);
        } else {
          categories["Other"].push(item);
        }
      });
    }
  });

  Object.keys(categories).forEach((category) => {
    if (categories[category].length > 0) {
      const categorySection = document.createElement("div");
      categorySection.classList.add("category-section");

      const categoryTitle = document.createElement("h2");
      categoryTitle.textContent = category;
      categorySection.appendChild(categoryTitle);

      const categoryContainer = document.createElement("div");
      categoryContainer.classList.add("thumbnail-container");

      categories[category].forEach((item) => {
        const thumbnailDiv = document.createElement("div");
        thumbnailDiv.classList.add("thumbnail");

        const link = document.createElement("a");
        link.href = item.link;
        link.target = "_blank";

        const img = document.createElement("img");
        img.src =
          item.image && item.image.trim() !== ""
            ? item.image
            : "assets/img/default.png";
        img.alt = item.title;
        img.onerror = function () {
          this.onerror = null;
          this.src = "assets/img/default.png";
        };

        const p = document.createElement("p");
        p.textContent = item.title;

        link.appendChild(img);
        link.appendChild(p);
        thumbnailDiv.appendChild(link);
        categoryContainer.appendChild(thumbnailDiv);
      });

      categorySection.appendChild(categoryContainer);
      container.appendChild(categorySection);
    }
  });
}

function fetchWithFallback(targetId, primaryPath, fallbackPath) {
  return fetch(primaryPath)
    .then((res) => {
      if (!res.ok) throw new Error("Primary failed");
      return res.text();
    })
    .then((data) => {
      document.getElementById(targetId).innerHTML = data;
    })
    .catch(() => {
      return fetch(fallbackPath)
        .then((res) => {
          if (!res.ok) throw new Error("Fallback failed");
          return res.text();
        })
        .then((data) => {
          document.getElementById(targetId).innerHTML = data;
        })
        .catch((err) => {
          console.error(`Failed to load ${targetId}:`, err);
        });
    });
}
