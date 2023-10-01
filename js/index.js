// Hambeurger
hamburger = document.querySelector(".hamburger");

hamburger.onclick = function() {
    navBar = document.querySelector(".nav-buttons");
    navBar.classList.toggle("active");
}

// Photo Sliders
document.addEventListener('DOMContentLoaded', function() {
  initSlider('mySlides', 'slider-1');
  initSlider('mySlides2', 'slider-2');
  initSlider('mySlides3', 'slider-3');
});

function initSlider(slideClassName, sliderId) {
  var clickImgs = document.getElementsByClassName(slideClassName);

  for (var i = 0; i < clickImgs.length; i++) {
      clickImgs[i].addEventListener("click", function() {
          changeSlide(1, slideClassName);
      });
  }

  document.getElementById('leftArrow' + sliderId.slice(-1)).addEventListener('click', () => changeSlide(-1, slideClassName));
  document.getElementById('rightArrow' + sliderId.slice(-1)).addEventListener('click', () => changeSlide(1, slideClassName));

  changeSlide(0, slideClassName);
}

function changeSlide(n, slideClassName) {
  var slideIndex = parseInt(localStorage.getItem(slideClassName + 'Index')) || 1;
  var slides = document.getElementsByClassName(slideClassName);
  slideIndex += n;

  if (slideIndex > slides.length) {
      slideIndex = 1;
  } else if (slideIndex < 1) {
      slideIndex = slides.length;
  }

  for (var i = 0; i < slides.length; i++) {
      slides[i].style.display = "none";
  }

  slides[slideIndex - 1].style.display = "block";
  localStorage.setItem(slideClassName + 'Index', slideIndex);
}

// Descriptions
function showDescription(id) {
  // Get the clicked description
  var x = document.getElementById(id);

  // Toggle the display of the clicked description
  if (x.style.display === 'block') {
      x.style.display = 'none';
  } else {
      // Hide all descriptions
      var descriptions = document.querySelectorAll('.description');
      descriptions.forEach(function (desc) {
          desc.style.display = 'none';
      });

      // Show the clicked description
      x.style.display = 'block';
  }
}

// Hide the modal when the "X" button is clicked
// Select all descriptions and close buttons
const descriptions = document.querySelectorAll('.description');
const closeButtons = document.querySelectorAll('.closeBtn');

// Add click event listener to each close button
closeButtons.forEach(button => {
  button.addEventListener('click', (event) => {
    // Find the closest description and hide it
    const description = event.target.closest('.description');
    if (description) {
      description.style.display = 'none';
    }
  });
});

// Add click event listener to the window
window.addEventListener('click', (event) => {
  descriptions.forEach(description => {
    if (event.target === description) {
      description.style.display = 'none';
    }
  });
});
