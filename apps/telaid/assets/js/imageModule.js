import { resizeImg, stampImg } from "../../../assets/js/imgupload.js?v=20261003a";

export function initImageModule({ els, state, createEl, openModal }) {

    // PHOTO RULES live in apps/assets/js/imgupload.js - ONE copy for the jobs app, Details, Gallery, the checklist and
    // the radar map (L 2026-10-03). Same numbers (2048 wide, strip max(40, width/22)); the old names stay.
    const resizeImage = resizeImg, addTextToImage = stampImg;

    // =========================
    // Render Preview
    // =========================
    function renderPreview(blob, label) {
        const url = URL.createObjectURL(blob);

        const wrapper = createEl("div", { className: "preview-item" });
        wrapper.appendChild(createEl("strong", { text: label }));
        wrapper.appendChild(document.createElement("br"));

        const img = new Image();
        img.src = url;
        img.alt = label;
        img.style.maxWidth = "200px";
        img.style.cursor = "pointer";

        img.addEventListener("click", () => openModal(url));

        const downloadLink = createEl("a", {
            text: "Download Image",
            attrs: {
                href: url,
                download: `${label}.jpg`
            }
        });

        // Cleanup URL after load (prevents memory leaks)
        img.onload = () => {
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        };

        wrapper.appendChild(img);
        wrapper.appendChild(document.createElement("br"));
        wrapper.appendChild(downloadLink);

        els.previewSection.appendChild(wrapper);
    }

    // =========================
    // Generate Image
    // =========================
    async function generate() {
        const first = els.siteNumber.value.trim();
        const second = els.secondPart.value.trim();
        const file = els.imageInput.files?.[0];

        if (!first || !second || !file) {
            alert("Enter site number, second part, and choose a file.");
            return;
        }

        try {
            let blob = file;

            if (els.resizeCheckbox.checked) {
                blob = await resizeImage(blob, 2048);
            }

            const label = `${first}-${second}`;

            if (els.markupCheckbox.checked) {
                blob = await addTextToImage(blob, label);
            }

            // 🔥 Prevent duplicate images
            const exists = state.allImages.some(img => img.label === label);
            if (exists) {
                alert("Image with this label already exists.");
                return;
            }

            state.allImages.push({ blob, label });
            state.hasUnsavedImages = true;

            renderPreview(blob, label);

        } catch (err) {
            console.error(err);
            alert("Error generating image: " + err);
        }
    }

    // =========================
    // Download All
    // =========================
    function downloadAll() {
        if (!state.allImages.length) {
            alert("No images to download.");
            return;
        }

        state.allImages.forEach(({ blob, label }) => {
            const url = URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = url;
            a.download = `${label}.jpg`;

            document.body.appendChild(a);
            a.click();
            a.remove();

            setTimeout(() => URL.revokeObjectURL(url), 0);
        });

        // 🔥 mark as saved
        state.hasUnsavedImages = false;
    }

    // =========================
    // Bind Events
    // =========================
    function bindEvents() {
        els.generateBtn.addEventListener("click", generate);
        els.downloadAllBtn.addEventListener("click", downloadAll);
    }

    return { bindEvents };
}