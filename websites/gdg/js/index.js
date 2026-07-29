document.addEventListener('DOMContentLoaded', () => {
    const headerContainer = document.getElementById('headerContainer');
    const bodyContainer = document.getElementById('bodyContainer');
    const footerContainer = document.getElementById('footerContainer');

    let loadedPages = [];  // Keep track of pages that have been loaded.

    async function loadContent(container, path, append = false) {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Error fetching ${path}: ${response.statusText}`);
        }
        const html = await response.text();
        if (append) {
            container.insertAdjacentHTML('beforeend', html);
        } else {
            container.innerHTML = html;
        }
        attachEventListeners(path); // Pass the path to the function
        if (path === 'header.html') {
            let tokenData = JSON.parse(localStorage.getItem('sToken'));

            const padlock = document.getElementById('padlock');
            if (padlock && tokenData && tokenData.sToken === "7777777") {
                padlock.style.filter = 'invert(1)';
            }
        }
    }

    async function handleRegistrationSubmit(event) {
        event.preventDefault();
    
        const name = document.getElementById('name').value.trim();
        const email = document.getElementById('email').value.trim();
        const phone = document.getElementById('phone').value.trim();
    
        if (name && email && phone) {
            try {
                const firebaseModule = await import('./firebaseHandler.js');
                firebaseModule.initializeFirebase();
                await firebaseModule.registerNewUser(name, email, phone);
                console.log('Registration submitted successfully');
            } catch (error) {
                console.error('Failed to submit registration:', error);
            }
        } else {
            console.log('Please fill out all the fields before submitting');
        }
    }        

    function attachEventListeners(path) {
        if (path === 'pages/login.html') {
            import('./firebaseHandler.js')
                .then(module => {
                    module.initializeFirebase();
                    module.attachFirebaseEventListeners();
                })
                .catch(err => {
                    console.error('Failed to load Firebase handler:', err);
                });
        }

        // Toggle login and register containers
        const registerContainer = document.querySelector('.register-container');
        const loginContainer = document.querySelector('.login-container');
        if (registerContainer && loginContainer) {
            const toggleRegister = document.getElementById('toggle-register');
            const toggleLogin = document.getElementById('toggle-login');

            // Remove existing event listeners to prevent duplicates
            toggleRegister.removeEventListener('click', toggleToRegister);
            toggleLogin.removeEventListener('click', toggleToLogin);

            // Attach the event listeners
            toggleRegister.addEventListener('click', toggleToRegister);
            toggleLogin.addEventListener('click', toggleToLogin);
        }

        // Image Modal Functionality
        const galleryImages = document.querySelectorAll('#gallery .art-item img');
        galleryImages.forEach(img => {
            img.addEventListener('click', function () {
                showImageModal(img.src);
            });
        });

        const itemImages = document.querySelectorAll('.image-container img, #itemOptions img');
        itemImages.forEach(img => {
            img.addEventListener('click', function () {
                showImageModal(img.src);
            });
        });

        // Close Modal when clicked anywhere inside the modal
        const modal = document.getElementById('imageModal');
        if (modal) {
            modal.addEventListener('click', function () {
                modal.style.display = 'none';
            });
        }

        function showImageModal(imageSrc) {
            const modal = document.getElementById('imageModal');
            const modalImage = document.getElementById('modalImage');

            modalImage.src = imageSrc;
            modal.style.display = "flex";
        }

        if (!loadedPages.includes('navigation')) {
            document.addEventListener('click', function (event) {
                const target = event.target;

                if (target.matches('[data-scroll-to]')) {
                    event.preventDefault();
                    const scrollToElementId = target.getAttribute('data-scroll-to');
                    const scrollToElement = document.getElementById(scrollToElementId);

                    if (scrollToElement) {
                        scrollToElement.scrollIntoView({ behavior: 'smooth' });
                        setTimeout(() => {
                            window.scrollBy(0, -30);
                        }, 700);  // Adjust delay
                    } else if (target.matches('[data-page]')) {
                        // Handle page navigation using data-page attribute if scroll target doesn't exist
                        const pageName = target.getAttribute('data-page');
                        loadPage(bodyContainer, `pages/${pageName}.html`);
                    }
                } else if (target.matches('[data-page]')) {
                    // Handle page navigation using data-page attribute (without a data-scroll-to attribute)
                    event.preventDefault();
                    const pageName = target.getAttribute('data-page');
                    loadPage(bodyContainer, `pages/${pageName}.html`);
                }
            });
            loadedPages.push('navigation');
        }
        const registrationForm = document.getElementById('registration-form');
        if (registrationForm) {
            registrationForm.addEventListener('submit', handleRegistrationSubmit);
        }
    }

    function toggleToRegister(e) {
        e.preventDefault();
        const loginContainer = document.querySelector('.login-container');
        const registerContainer = document.querySelector('.register-container');
        loginContainer.style.display = 'none';
        registerContainer.style.display = 'block';
    }

    function toggleToLogin(e) {
        e.preventDefault();
        const loginContainer = document.querySelector('.login-container');
        const registerContainer = document.querySelector('.register-container');
        registerContainer.style.display = 'none';
        loginContainer.style.display = 'block';
    }

    function loadPage(container, path) {
        const pagesToAppend = ['home', 'gallery', 'about'];
        const pageName = path.split('/')[1].replace('.html', '');
        const shouldAppend = initialLoad && pagesToAppend.includes(pageName);
        loadContent(container, path, shouldAppend);
    }

    // Initial content loading
    loadContent(headerContainer, 'header.html');
    loadContent(bodyContainer, 'pages/home.html', true);
    loadContent(bodyContainer, 'pages/gallery.html', true);
    loadContent(bodyContainer, 'pages/about.html', true);
    loadContent(footerContainer, 'footer.html');

    let initialLoad = true;  // Ensure initialLoad is defined
    initialLoad = false;  // Set flag to false after initial content loading
});