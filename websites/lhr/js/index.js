import { ref, database, onValue } from "../../../assets/js/firebase-init.js";

const phonesInDB = ref(database, "devices");

const modelSelect = document.getElementById('modelSelect');
const repairOptions = document.getElementById('repairOptions');
const phoneImage = document.getElementById('phoneImage');
const totalPriceElement = document.getElementById('totalPrice');
const discountAmountInput = document.getElementById('discountAmount');

const defaultImageSrc = 'img/default.png';

function loadData() {
  const brand = document.querySelector('input[name="brand"]:checked').value;
  // Data lives at share/devices/{Apple|Samsung|Other}/{model}: {img, repairs[]}
  // (was share/devices/Phones/{brand}/{model}: {repair: price} — old flat schema)
  const brandRef = ref(database, `share/devices/${brand}`);

  onValue(brandRef, (snapshot) => {
    const brandData = snapshot.val();

    modelSelect.innerHTML = '';
    phoneImage.src = '';
    phoneImage.alt = '';
    repairOptions.innerHTML = '';
    totalPriceElement.textContent = '0';

    if (brandData) {
      const models = Object.keys(brandData).sort();

      models.forEach((model) => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        modelSelect.appendChild(option);
      });

      // Check if there is a stored selected phone
      const storedPhone = localStorage.getItem("selectedPhone");
      if (storedPhone && models.includes(storedPhone)) {
        modelSelect.value = storedPhone;
      }

      modelSelect.dispatchEvent(new Event('change'));
    }
  });
}

modelSelect.addEventListener('change', () => {
  const brand = document.querySelector('input[name="brand"]:checked').value;
  const selectedModel = modelSelect.value;
  const modelRef = ref(database, `share/devices/${brand}/${selectedModel}`);

  onValue(modelRef, (snapshot) => {
    const modelData = snapshot.val();

    if (modelData) {
      // New schema: { img: "filename.png", repairs: [{name, price}, ...] }
      // Use the stored image filename when present; fall back to model name.
      const imgFile = modelData.img || `${selectedModel}.png`;
      phoneImage.src = `img/${imgFile}`;
      phoneImage.alt = selectedModel;
      phoneImage.onerror = () => {
        phoneImage.src = defaultImageSrc;
      }

      repairOptions.innerHTML = '';

      // Sort repairs alphabetically by name. Be defensive — schema may have no
      // repairs array (legacy data) or repairs that miss fields.
      const repairs = Array.isArray(modelData.repairs)
        ? [...modelData.repairs].sort((a, b) => (a?.name || '').localeCompare(b?.name || ''))
        : [];

      repairs.forEach((repair) => {
        if (!repair || repair.name == null || repair.price == null) return;
        const repairLabel = document.createElement('label');
        repairLabel.style.display = 'block';

        const repairCheckbox = document.createElement('input');
        repairCheckbox.type = 'checkbox';
        repairCheckbox.dataset.price = repair.price;

        repairCheckbox.addEventListener('change', updateTotalPriceWithDiscount);

        let repairText = `${repair.name}: $${repair.price}`;

        // Color screen / battery callouts the same way as before.
        repairText = repairText.replace(/screen/gi, '<span style="color: lightblue;">Screen</span>');
        repairText = repairText.replace(/battery/gi, '<span style="color: lightgreen;">Battery</span>');

        repairLabel.innerHTML = repairText;

        repairLabel.insertBefore(repairCheckbox, repairLabel.firstChild);
        repairOptions.appendChild(repairLabel);
      });
    }
  });
});

// Add event listener to the discount input field to automatically apply the discount when the discount amount is changed
discountAmountInput.addEventListener('input', updateTotalPriceWithDiscount);

function updateTotalPriceWithDiscount() {
  const selectedRepairs = repairOptions.querySelectorAll('input[type="checkbox"]:checked');
  let total = 0;

  selectedRepairs.forEach((selectedRepair) => {
    total += parseFloat(selectedRepair.dataset.price);
  });

  const discountAmount = parseFloat(discountAmountInput.value) || 0;
  total = total - discountAmount;

  if (total < 0) {
    total = 0;
  }

  totalPriceElement.textContent = total.toFixed(2);
}

const appleRadio = document.getElementById('Apple');
const samsungRadio = document.getElementById('Samsung');
const otherRadio = document.getElementById('Other');

appleRadio.addEventListener('change', function () {
  loadData();
  localStorage.setItem("selectedPhoneBrand", "Apple");
});

samsungRadio.addEventListener('change', function () {
  loadData();
  localStorage.setItem("selectedPhoneBrand", "Samsung");
});

otherRadio.addEventListener('change', function () {
  loadData();
  localStorage.setItem("selectedPhoneBrand", "Other");
});

// Check if there is a stored selected brand
const storedBrand = localStorage.getItem("selectedPhoneBrand");
if (storedBrand) {
  if (storedBrand === "Apple") {
    appleRadio.checked = true; // Set Apple as the selected brand
  } else if (storedBrand === "Samsung") {
    samsungRadio.checked = true; // Set Samsung as the selected brand
  } else if (storedBrand === "Other") {
    otherRadio.checked = true; // Set Other as the selected brand
  }
}

// Initial load
loadData();
