/* contact.js — fallback mailto handler + email copy
   contact.html uses FormSubmit as primary; this fires only if
   the fetch fails or as the form's action fallback. */

(function () {
  // Email copy on click
  const emailEl = document.getElementById("email-text");
  if (emailEl) {
    emailEl.style.cursor = "pointer";
    emailEl.addEventListener("click", () => {
      navigator.clipboard
        .writeText(emailEl.textContent.trim())
        .then(() => {
          const orig = emailEl.textContent;
          emailEl.textContent = "Copied ✓";
          emailEl.style.color = "var(--success)";
          setTimeout(() => {
            emailEl.textContent = orig;
            emailEl.style.color = "";
          }, 2000);
        })
        .catch(() => {});
    });
  }
})();
