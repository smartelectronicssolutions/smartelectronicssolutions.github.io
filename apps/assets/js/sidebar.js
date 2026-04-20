document.addEventListener('DOMContentLoaded', () => {
    injectSidebarCSS();
    insertToggleButtonIntoHeader();
    createSidebarElement();
    wireUpSidebarToggle();
});

function injectSidebarCSS() {
    const css = `        
        #toggleSidebar {
            position: fixed;
            bottom: 20px; 
            right: 20px;            
            z-index: 200;         
        }

        .hidden {
            display: none !important;
        }

        #sidebar {
            position: fixed;
            top: 0;
            right: 0;
            max-width: 400px;
            height: 100vh;
            background-color: #f9f9f9;
            box-shadow: rgba(0, 0, 0, 0.35) 0px 5px 15px;
            z-index: 100;
            overflow-y: auto;
        }

        #sidebar:not(.hidden) {
            display: block;
        }

        #sidebar .sidebar-content {
            display: none;
            padding: 10px;
        }

        #sidebar:not(.hidden) .sidebar-content {
            display: block;
        }
    `;

    const styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
}

function insertToggleButtonIntoHeader() {
    const headerEl = document.querySelector('header');
    if (!headerEl) {
        console.warn('layout.js: No <header> found.');
        return;
    }

    if (document.getElementById('toggleSidebar')) {
        return;
    }

    const btn = document.createElement('button');
    btn.id = 'toggleSidebar';
    btn.innerText = 'Menu';

    headerEl.appendChild(btn);
}

function createSidebarElement() {
    if (document.getElementById('sidebar')) {
        return;
    }

    const sidebar = document.createElement('div');
    sidebar.id = 'sidebar';
    sidebar.classList.add('hidden');

    const content = document.createElement('div');
    content.classList.add('sidebar-content');

    const iframe = document.createElement('iframe');
    iframe.id = 'linkAppIframe';
    iframe.src = '../online/onlinelinks.html';
    iframe.style.width = '100%';
    iframe.style.height = 'calc(100vh - 60px)';
    iframe.style.border = 'none';

    content.appendChild(iframe);
    sidebar.appendChild(content);
    document.body.appendChild(sidebar);
}

function wireUpSidebarToggle() {
    const toggleBtn = document.getElementById('toggleSidebar');
    const sidebar = document.getElementById('sidebar');

    if (!toggleBtn || !sidebar) {
        console.warn('sidebar.js: Toggle button or sidebar not found.');
        return;
    }

    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('hidden');

        if (sidebar.classList.contains('hidden')) {
            toggleBtn.innerText = 'Menu';
        } else {
            toggleBtn.innerText = 'Close';
        }
    });

    document.addEventListener('click', (e) => {
        if (
            sidebar.classList.contains('hidden') ||
            sidebar.contains(e.target) ||
            toggleBtn.contains(e.target)
        ) {
            return;
        }
        sidebar.classList.add('hidden');
        toggleBtn.innerText = 'Menu';
    });
}