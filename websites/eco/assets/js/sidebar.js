document.addEventListener("DOMContentLoaded", () => {
    // Wait for the sidebar to be loaded dynamically
    const sidebarContainer = document.querySelector("aside");

    // Use MutationObserver to detect when content is loaded into <aside>
    const observer = new MutationObserver(() => {
        const toggleButton = document.getElementById('toggleSidebar');
        const sidebar = document.getElementById('sidebar');

        // Check if the toggleButton and sidebar are now available
        if (toggleButton && sidebar) {
            function toggleSidebar() {
                sidebar.classList.toggle('hidden');
            }

            toggleButton.addEventListener('click', toggleSidebar);

            // Once loaded and the event is set up, disconnect the observer
            observer.disconnect();
        }
    });

    // Start observing <aside> for changes
    observer.observe(sidebarContainer, { childList: true, subtree: true });
});