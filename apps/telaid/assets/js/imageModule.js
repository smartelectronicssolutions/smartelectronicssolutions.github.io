export function initImageModule({ els, state, createEl, openModal }) {

    // =========================
    // Resize Image
    // =========================
    function resizeImage(file, maxWidth) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onerror = () => reject("Failed to read image.");

            reader.onload = () => {
                const img = new Image();

                img.onerror = () => reject("Invalid image.");

                img.onload = () => {
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }

                    const canvas = document.createElement("canvas");
                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext("2d");
                    if (!ctx) return reject("Canvas context unavailable.");

                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob(   // browser default quality - same as onlinejob's resizeImg (2026-10-03)
                        (blob) => blob ? resolve(blob) : reject("Resize failed"),
                        "image/jpeg"
                    );
                };

                img.src = reader.result;
            };

            reader.readAsDataURL(file);
        });
    }

    // =========================
    // Add Bottom Markup Bar
    // =========================
    function addTextToImage(blob, text) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onerror = () => reject("Failed to read image blob.");

            reader.onload = () => {
                const img = new Image();

                img.onerror = () => reject("Invalid image.");

                img.onload = () => {
                    // SAME STRIP AS onlinejob's stampImg (L 2026-10-03: "the banner label is still different"):
                    // strip = max(40, width/22), white Arial at 70% of the strip, shrunk to fit 92% of the width,
                    // baseline a quarter-strip up. The 8%/black-bar look is gone so every app's photo matches.
                    const strip = Math.max(40, Math.round(img.width / 22));
                    let font = Math.round(strip * 0.7);

                    const canvas = document.createElement("canvas");
                    canvas.width = img.width;
                    canvas.height = img.height + strip;

                    const ctx = canvas.getContext("2d");
                    if (!ctx) return reject("Canvas context unavailable.");

                    ctx.drawImage(img, 0, 0);
                    ctx.fillStyle = "white";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "alphabetic";
                    ctx.font = `${font}px Arial`;
                    while (font > 12 && ctx.measureText(text).width > canvas.width * 0.92) {
                        font -= 2;
                        ctx.font = `${font}px Arial`;
                    }
                    ctx.fillText(text, canvas.width / 2, canvas.height - Math.round(strip * 0.25));

                    canvas.toBlob(
                        (outputBlob) => outputBlob ? resolve(outputBlob) : reject("Markup failed"),
                        "image/jpeg"
                    );
                };

                img.src = reader.result;
            };

            reader.readAsDataURL(blob);
        });
    }

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