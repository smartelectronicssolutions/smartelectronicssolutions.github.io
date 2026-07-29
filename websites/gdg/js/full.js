document.addEventListener('DOMContentLoaded', () => {
    const headerContainer = document.getElementById('headerContainer');
    const bodyContainer = document.getElementById('bodyContainer');
    const footerContainer = document.getElementById('footerContainer');
    const folderSelect = document.getElementById('folderSelect');

    let currentImageIndex = 0;
    let startX = 0;
    let startY = 0;
    let loadedPages = [];
    let photoUrls = [];
    let loadedIndex = 0;
    const ITEMS_TO_LOAD = 10;

    function loadPage(container, path) {
        const pagesToAppend = ['home', 'gallery', 'about', 'fullgallery', 'categories'];
        const pageName = path.split('/')[1].replace('.html', '');
        const shouldAppend = initialLoad && pagesToAppend.includes(pageName);
        loadContent(container, path, shouldAppend);
    }

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
        attachEventListeners(path);

        const pageName = path.split('/')[1]?.replace('.html', '');
        if (pageName && !loadedPages.includes(pageName)) {
            loadedPages.push(pageName);
        }

        if (path === 'header.html') {
            let tokenData = JSON.parse(localStorage.getItem('sToken'));
            const padlock = document.getElementById('padlock');
            if (padlock && tokenData && tokenData.sToken === "7777777") {
                padlock.style.filter = 'invert(1)';
            }
        }

        if (path === 'pages/fullgallery.html') {
            initializeGallery();
        } else {
            resetGallery();
        }

        if (path === 'pages/categories.html') {
            initializeCategoriesPage();
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
                firebaseModule.initializeFirebase(); // Ensure Firebase is initialized
                await firebaseModule.registerNewUser(name, email, phone);
                console.log('Registration submitted successfully');
            } catch (error) {
                console.error('Failed to submit registration:', error);
            }
        } else {
            console.log('Please fill out all the fields before submitting');
        }
    }

    function showImageModal(imageSrc) {
        const modal = document.getElementById('imageModal');
        const modalImage = document.getElementById('modalImage');
        modalImage.src = imageSrc;
        modal.style.display = "flex";

        // Set current image index
        currentImageIndex = photoUrls.indexOf(imageSrc);

        // Add event listeners for swipe gestures
        modal.addEventListener('touchstart', handleTouchStart, false);
        modal.addEventListener('touchmove', handleTouchMove, false);
        modal.addEventListener('touchend', handleTouchEnd, false);
    }

    function showNextImage() {
        if (currentImageIndex < photoUrls.length - 1) {
            currentImageIndex++;
            showImageModal(photoUrls[currentImageIndex]);
        }
    }

    function showPreviousImage() {
        if (currentImageIndex > 0) {
            currentImageIndex--;
            showImageModal(photoUrls[currentImageIndex]);
        }
    }

    document.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowRight') {
            showNextImage();
        } else if (event.key === 'ArrowLeft') {
            showPreviousImage();
        }
    });

    function handleTouchStart(event) {
        const firstTouch = event.touches[0];
        startX = firstTouch.clientX;
        startY = firstTouch.clientY;
    }

    function handleTouchMove(event) {
        if (!startX || !startY) {
            return;
        }

        let xUp = event.touches[0].clientX;
        let yUp = event.touches[0].clientY;

        let xDiff = startX - xUp;
        let yDiff = startY - yUp;

        if (Math.abs(xDiff) > Math.abs(yDiff)) {
            if (xDiff > 0) {
                // swipe left
                showNextImage();
            } else {
                // swipe right
                showPreviousImage();
            }
        }
        // reset values
        startX = 0;
        startY = 0;
    }

    function handleTouchEnd() {
        startX = 0;
        startY = 0;
    }

    function attachEventListeners(path) {
        if (!loadedPages.includes('navigation')) {
            document.addEventListener('click', function (event) {
                const target = event.target;

                if (target.matches('[data-scroll-to]')) {
                    event.preventDefault();
                    const scrollToElementId = target.getAttribute('data-scroll-to');
                    const scrollToElement = document.getElementById(scrollToElementId);
                    if (scrollToElement) {
                        scrollToElement.scrollIntoView({ behavior: 'smooth' });
                    } else if (target.matches('[data-page]')) {
                        const pageName = target.getAttribute('data-page');
                        loadPage(bodyContainer, `pages/${pageName}.html`);
                    }
                } else if (target.matches('[data-page]')) {
                    event.preventDefault();
                    const pageName = target.getAttribute('data-page');
                    loadPage(bodyContainer, `pages/${pageName}.html`);
                }
            });
        }

        if (path === 'pages/fullgallery.html') {
            const galleryImages = document.querySelectorAll('.photos img');
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

            const modal = document.getElementById('imageModal');
            if (modal) {
                modal.addEventListener('click', function () {
                    modal.style.display = 'none';
                });
            }

            const loadMoreButton = document.getElementById('loadMoreButton');
            if (loadMoreButton) {
                loadMoreButton.onclick = function () {
                    displayPhotos();
                };
            }
            galleryImages.forEach((img, index) => {
                img.addEventListener('click', function () {
                    currentImageIndex = index;
                    showImageModal(img.src);
                });
            });
        }

        if (path === 'pages/gallery.html') {
            const galleryImages = document.querySelectorAll('#gallery .art-item img');
            galleryImages.forEach(img => {
                img.addEventListener('click', function () {
                    showImageModal(img.src);
                });
            });

            const modal = document.getElementById('imageModal');
            if (modal) {
                modal.addEventListener('click', function () {
                    modal.style.display = 'none';
                });
            }
        }

        const registrationForm = document.getElementById('registration-form');
        if (registrationForm) {
            registrationForm.addEventListener('submit', handleRegistrationSubmit);
        }

        const toggleLogin = document.getElementById('toggle-login');
        const toggleRegister = document.getElementById('toggle-register');

        if (toggleLogin && toggleRegister) {
            toggleLogin.removeEventListener('click', toggleToLogin); // Clear existing listeners to prevent duplication
            toggleRegister.removeEventListener('click', toggleToRegister); // Clear existing listeners to prevent duplication

            toggleLogin.addEventListener('click', toggleToLogin);
            toggleRegister.addEventListener('click', toggleToRegister);
        }
    }

    function fetchPhotoUrls() {
        fetch('js/photos.json')
            .then(response => response.json())
            .then(urls => {
                photoUrls = urls;
                displayPhotos();
            })
            .catch(error => {
                console.error('Error loading photo URLs:', error);
            });
    }

    function displayPhotos() {
        const fullgalleryElem = document.getElementById('fullgallery');
        if (!fullgalleryElem) {
            console.error('fullgallery element not found!');
            return;
        }

        const end = loadedIndex + ITEMS_TO_LOAD;
        for (; loadedIndex < end && loadedIndex < photoUrls.length; loadedIndex++) {
            const img = document.createElement('img');
            img.src = photoUrls[loadedIndex];
            img.className = 'photo';
            img.addEventListener('click', function () {
                showImageModal(img.src);
            });
            fullgalleryElem.appendChild(img);
        }
    }

    function initializeGallery() {
        fetchPhotoUrls();
        loadedIndex = 0;
    }

    function resetGallery() {
        photoUrls = [];
        loadedIndex = 0;
        window.onscroll = null;
    }

    function initializeCategoriesPage() {
        const photoContainer = document.getElementById('photoContainer');
        const prevButton = document.getElementById('prevButton');
        const nextButton = document.getElementById('nextButton');
        const rememberCheckbox = document.getElementById('rememberCheckbox');
        const folderSelect = document.getElementById('folderSelect');
        const downloadImageButton = document.getElementById('downloadImage');
        const downloadAllCheckedImagesButton = document.getElementById('downloadAllCheckedImages');

        let currentPhotoIndex = 0;
        let photoUrls = [];


        if (downloadImageButton) {
            downloadImageButton.addEventListener('click', downloadCurrentImage);
        }

        if (downloadAllCheckedImagesButton) {
            downloadAllCheckedImagesButton.addEventListener('click', downloadAllCheckedImages);
        }

        function downloadCurrentImage() {
            const selectedSubFolder = folderSelect.value;
            const filteredUrls = photoUrls.filter(url => url.includes(`/${selectedSubFolder}/`));
            if (filteredUrls.length > 0 && currentPhotoIndex >= 0 && currentPhotoIndex < filteredUrls.length) {
                const imageUrl = filteredUrls[currentPhotoIndex];
                const a = document.createElement('a');
                a.href = imageUrl;
                a.download = imageUrl.split('/').pop();
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        }

        function downloadAllCheckedImages() {
            const selectedSubFolder = folderSelect.value;
            const filteredUrls = photoUrls.filter(url => url.includes(`/${selectedSubFolder}/`));
            filteredUrls.forEach(url => {
                if (localStorage.getItem(url) === 'true') {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = url.split('/').pop();
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                }
            });
        }

        function fetchPhotoUrls() {
            fetch('js/photos.json')
                .then(response => response.json())
                .then(urls => {
                    photoUrls = urls;
                    populateSubfolders();
                    displayCurrentPhoto();
                })
                .catch(error => {
                    console.error('Error loading photo URLs:', error);
                });
        }

        function populateSubfolders() {
            const subfolders = extractSubfolders(photoUrls);
            subfolders.forEach(folder => {
                const option = document.createElement('option');
                option.value = folder;
                option.textContent = folder;
                folderSelect.appendChild(option);
            });
        }

        function extractSubfolders(urls) {
            const folderSet = new Set();
            urls.forEach(url => {
                const splitPath = url.split('/');
                if (splitPath.length > 2) {
                    folderSet.add(splitPath[2]);
                }
            });
            return [...folderSet];
        }

        function displayCurrentPhoto() {
            const selectedSubFolder = folderSelect.value;
            const filteredUrls = photoUrls.filter(url => url.includes(`/${selectedSubFolder}/`));

            photoContainer.innerHTML = '';

            if (currentPhotoIndex >= 0 && currentPhotoIndex < filteredUrls.length) {
                const img = createPhotoElement(filteredUrls[currentPhotoIndex]);
                photoContainer.appendChild(img);

                rememberCheckbox.checked = localStorage.getItem(filteredUrls[currentPhotoIndex]) === 'true';
            }
        }

        function createPhotoElement(src) {
            const img = document.createElement('img');
            img.src = src;
            img.className = 'photo';

            img.addEventListener('click', function (event) {
                const clickX = event.clientX - img.getBoundingClientRect().left;
                const imgWidth = img.offsetWidth;

                if (clickX < imgWidth / 2) {
                    loadPreviousImage();
                } else {
                    loadNextImage();
                }
            });

            return img;
        }

        function loadNextImage() {
            const selectedSubFolder = folderSelect.value;
            const filteredUrls = photoUrls.filter(url => url.includes(`/${selectedSubFolder}/`));

            currentPhotoIndex = (currentPhotoIndex + 1) % filteredUrls.length;
            displayCurrentPhoto();
        }

        function loadPreviousImage() {
            const selectedSubFolder = folderSelect.value;
            const filteredUrls = photoUrls.filter(url => url.includes(`/${selectedSubFolder}/`));

            currentPhotoIndex = (currentPhotoIndex - 1 + filteredUrls.length) % filteredUrls.length;
            displayCurrentPhoto();
        }



        // Event listeners
        folderSelect.addEventListener('change', () => {
            currentPhotoIndex = 0;
            displayCurrentPhoto();
        });

        nextButton.addEventListener('click', loadNextImage);
        prevButton.addEventListener('click', loadPreviousImage);

        rememberCheckbox.addEventListener('change', () => {
            const selectedSubFolder = folderSelect.value;
            const filteredUrls = photoUrls.filter(url => url.includes(`/${selectedSubFolder}/`));
            localStorage.setItem(filteredUrls[currentPhotoIndex], rememberCheckbox.checked);
        });

        // Fetch data and set up the page
        fetchPhotoUrls();
    }

    loadContent(headerContainer, 'header.html');
    loadContent(bodyContainer, 'pages/fullgallery.html', true);
    loadContent(footerContainer, 'footer.html');

    let initialLoad = true;
    initialLoad = false;

    const logoutLink = document.getElementById('logout');
    if (logoutLink) {
        logoutLink.addEventListener('click', function (event) {
            event.preventDefault(); // Prevent the default action (navigation)
            localStorage.removeItem('sToken'); // Remove sToken from localStorage
            window.location.href = 'index.html'; // Navigate to index.html
        });
    }
});

// document.oncontextmenu = document.body.oncontextmenu = function () { return false; } // No Right Click

function toggleToRegister(e) {
    e.preventDefault();
    document.querySelector('.login-container').style.display = 'none';
    document.querySelector('.register-container').style.display = 'block';
}

function toggleToLogin(e) {
    e.preventDefault();
    document.querySelector('.register-container').style.display = 'none';
    document.querySelector('.login-container').style.display = 'block';
}

// Attach these in the attachEventListeners function
document.getElementById('toggle-login').addEventListener('click', toggleToLogin);
document.getElementById('toggle-register').addEventListener('click', toggleToRegister);