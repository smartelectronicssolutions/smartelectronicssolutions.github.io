(function () {
  // Overlay — clicking it closes the aside
  const overlay = document.createElement("div");
  overlay.id = "links-overlay";
  document.body.appendChild(overlay);

  // Aside + iframe
  const aside = document.createElement("aside");
  aside.id = "links-aside";

  const frame = document.createElement("iframe");
  frame.id = "links-frame";
  frame.src = "./onlinelinks.html";
  frame.setAttribute("frameborder", "0");
  aside.appendChild(frame);
  document.body.appendChild(aside);

  // Toggle button — inserted into the header before #theme-toggle
  const btn = document.createElement("button");
  btn.id = "links-toggle";
  btn.title = "Quick Links";
  btn.textContent = "🔗";

  const header = document.querySelector("header");
  if (header) {
    const themeToggle = document.getElementById("theme-toggle");
    if (themeToggle) {
      header.insertBefore(btn, themeToggle);
    } else {
      header.appendChild(btn);
    }
  }

  function setOpen(open) {
    document.body.classList.toggle("links-aside-open", open);
    localStorage.setItem("links-aside", open ? "1" : "0");
  }

  btn.addEventListener("click", () => {
    setOpen(!document.body.classList.contains("links-aside-open"));
  });

  overlay.addEventListener("click", () => setOpen(false));

  // Restore last state
  if (localStorage.getItem("links-aside") === "1") {
    document.body.classList.add("links-aside-open");
  }
})();
