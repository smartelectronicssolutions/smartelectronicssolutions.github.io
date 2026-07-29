async function loadComponent(selector, file) {
    try {
        const response = await fetch(file);
        if (!response.ok) throw new Error('Network response was not ok');
        const content = await response.text();
        document.querySelector(selector).innerHTML = content;

        // Dispatch an event indicating the component has been loaded
        document.dispatchEvent(new CustomEvent(`componentLoaded:${selector}`));
    } catch (error) {
        console.error('Error loading component:', error);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    loadComponent("header", "header.html");
    loadComponent("nav", "nav.html");
    loadComponent("aside", "sidebar.html");
    loadComponent("footer", "footer.html");
});
