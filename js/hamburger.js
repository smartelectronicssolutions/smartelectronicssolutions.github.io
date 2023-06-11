hamburger = document.querySelector(".hamburger");

hamburger.onclick = function() {
    navBar = document.querySelector(".nav-buttons");
    navBar.classList.toggle("active");
}