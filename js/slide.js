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
