const THEME_KEY = "app-theme";

// map theme → css file (bma/css/index.css removed 2026-06-10 — workspace.html is the successor)
const themes = {
    default: "/luissolutions.github.io/assets/css/master.css",
    other: "/luissolutions.github.io/assets/css/excel-styles.css",
    app: "/luissolutions.github.io/assets/css/app-styles.css",
    dark: "/luissolutions.github.io/assets/css/dark-styles.css",
    one: "/luissolutions.github.io/assets/css/dark-styles.css",
    two: "/luissolutions.github.io/assets/css/app-styles.css",
    three: "/luissolutions.github.io/assets/css/excel-styles.css",
};

// apply theme by swapping stylesheet
function applyTheme(theme) {
    const link = document.getElementById("stylesheet");
    if (!link) return;

    const path = themes[theme] || themes.default;
    link.setAttribute("href", path);
}

// load on page start
function loadTheme() {
    const saved = localStorage.getItem(THEME_KEY) || "default";
    applyTheme(saved);

    const selector = document.getElementById("themeSelector");
    if (selector) {
        selector.value = saved;
    }
}

// change theme
function setTheme(theme) {
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
}

// init dropdown
function initThemeSelector() {
    const selector = document.getElementById("themeSelector");
    if (!selector) return;

    selector.addEventListener("change", (e) => {
        setTheme(e.target.value);
    });
}

document.addEventListener("DOMContentLoaded", () => {
    loadTheme();
    initThemeSelector();
});

// expose globally
window.setTheme = setTheme;