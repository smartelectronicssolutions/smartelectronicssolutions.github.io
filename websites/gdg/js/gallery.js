import { initializeFirebase, fetchGalleryImages } from './firebaseHandler.js';

document.addEventListener('DOMContentLoaded', async () => {
    initializeFirebase(); // Ensure Firebase is initialized

    const galleryContainer = document.getElementById('galleryContainer');
    let photoUrls = [];
    let currentImageIndex = 0;

    try {
        photoUrls = await fetchGalleryImages(); // Fetch images from Firebase Storage
        displayGallery(photoUrls); // Display fetched images
    } catch (error) {
        console.error('Error fetching images:', error);
    }

    function displayGallery(urls) {
        if (!galleryContainer) return;

        galleryContainer.innerHTML = ''; // Clear the container

        urls.forEach((url, index) => {
            const img = document.createElement('img');
            img.src = url;
            img.classList.add('gallery-image');
            img.addEventListener('click', () => showImageModal(index));

            galleryContainer.appendChild(img);
        });
    }

    function showImageModal(index) {
        currentImageIndex = index;
        const modal = document.getElementById('imageModal');
        const modalImage = document.getElementById('modalImage');

        modalImage.src = photoUrls[currentImageIndex];
        modal.style.display = 'flex';

        // Add event listeners for swipe gestures or keyboard navigation
        document.addEventListener('keydown', handleKeyboardNavigation);
    }

    function handleKeyboardNavigation(event) {
        if (event.key === 'ArrowRight') {
            showNextImage();
        } else if (event.key === 'ArrowLeft') {
            showPreviousImage();
        }
    }

    function showNextImage() {
        if (currentImageIndex < photoUrls.length - 1) {
            currentImageIndex++;
            showImageModal(currentImageIndex);
        }
    }

    function showPreviousImage() {
        if (currentImageIndex > 0) {
            currentImageIndex--;
            showImageModal(currentImageIndex);
        }
    }

    // Modal close functionality
    const modal = document.getElementById('imageModal');
    modal.addEventListener('click', () => {
        modal.style.display = 'none';
        document.removeEventListener('keydown', handleKeyboardNavigation);
    });
});
