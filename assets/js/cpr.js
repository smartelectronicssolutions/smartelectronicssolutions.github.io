// CPR Calculator — root-level adapter
// Wraps websites/cpr/js/index.js with corrected image paths for root deployment

import { ref, database, onValue } from "./firebase-init-noauth.js";

const phonesInDB = ref(database, "devices");

const modelSelect = document.getElementById("modelSelect");
const repairOptions = document.getElementById("repairOptions");
const phoneImage = document.getElementById("phoneImage");
const totalPriceElement = document.getElementById("totalPrice");
const discountAmountInput = document.getElementById("discountAmount");

// Updated path — images now live in shared assets
const IMG_BASE = "assets/img/cpr/devices/";
const defaultImageSrc = IMG_BASE + "default.png";

function loadData() {
  const brand = document.querySelector('input[name="brand"]:checked').value;
  const brandRef = ref(database, `share/repairPricing/${brand}`);
  onValue(brandRef, (snapshot) => {
    const brandData = snapshot.val();
    modelSelect.innerHTML = "";
    phoneImage.src = "";
    repairOptions.innerHTML = "";
    totalPriceElement.textContent = "0";

    if (brandData) {
      const models = Object.keys(brandData).sort();
      models.forEach((model) => {
        const option = document.createElement("option");
        option.value = model;
        option.textContent = model;
        modelSelect.appendChild(option);
      });

      const storedPhone = localStorage.getItem("selectedPhone");
      if (storedPhone && models.includes(storedPhone)) {
        modelSelect.value = storedPhone;
      }
      modelSelect.dispatchEvent(new Event("change"));
    }
  });
}

modelSelect.addEventListener("change", () => {
  const brand = document.querySelector('input[name="brand"]:checked').value;
  const selectedModel = modelSelect.value;
  const modelRef = ref(
    database,
    `share/repairPricing/${brand}/${selectedModel}`,
  );
  onValue(modelRef, (snapshot) => {
    const modelData = snapshot.val();
    if (modelData) {
      phoneImage.src = `${IMG_BASE}${modelData.img || "default.png"}`;
      phoneImage.alt = selectedModel;
      phoneImage.onerror = () => {
        phoneImage.src = defaultImageSrc;
      };

      repairOptions.innerHTML = "";

      const repairs = modelData.repairs || [];

      repairs.forEach((repair) => {
        const label = document.createElement("label");
        label.style.display = "block";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.dataset.price = repair.price;
        cb.addEventListener("change", updateTotal);

        let text = `${repair.name}: $${repair.price}`;

        text = text.replace(
          /screen/gi,
          '<span style="color: lightsteelblue;">Screen</span>',
        );
        text = text.replace(
          /battery/gi,
          '<span style="color: #5aaa6a;">Battery</span>',
        );

        label.innerHTML = text;
        label.insertBefore(cb, label.firstChild);

        repairOptions.appendChild(label);
      });
    }
  });
});

discountAmountInput.addEventListener("input", updateTotal);

function updateTotal() {
  let total = 0;
  repairOptions
    .querySelectorAll('input[type="checkbox"]:checked')
    .forEach((cb) => {
      total += parseFloat(cb.dataset.price);
    });
  const discount = parseFloat(discountAmountInput.value) || 0;
  totalPriceElement.textContent = Math.max(0, total - discount).toFixed(2);
}

document.getElementById("Apple").addEventListener("change", () => {
  loadData();
  localStorage.setItem("selectedPhoneBrand", "Apple");
});
document.getElementById("Samsung").addEventListener("change", () => {
  loadData();
  localStorage.setItem("selectedPhoneBrand", "Samsung");
});
document.getElementById("Other").addEventListener("change", () => {
  loadData();
  localStorage.setItem("selectedPhoneBrand", "Other");
});

const storedBrand = localStorage.getItem("selectedPhoneBrand");
if (storedBrand === "Apple") document.getElementById("Apple").checked = true;
else if (storedBrand === "Samsung")
  document.getElementById("Samsung").checked = true;
else if (storedBrand === "Other")
  document.getElementById("Other").checked = true;

loadData();
