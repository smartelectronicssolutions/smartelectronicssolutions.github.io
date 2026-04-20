export function initToolsModule({ els, state, createEl, ensureTag, toolSearchEngine }) {

    function normalizeTools(data) {
        const items = [];

        for (const category of Object.keys(data || {})) {
            const categoryObj = data[category] || {};

            for (const component of Object.keys(categoryObj)) {
                const componentObj = categoryObj[component] || {};

                for (const key of Object.keys(componentObj)) {
                    const entry = componentObj[key] || {};
                    const partName = entry.part || key;

                    items.push({
                        name: partName,
                        category,
                        component,
                        affiliateUrl: entry.affiliateUrl || "",
                        imageUrl: entry.imageUrl || `assets/img/database/${encodeURIComponent(partName)}.png`
                    });
                }
            }
        }

        return items;
    }

    function rebuildCategoryDropdown() {
        const categories = [...new Set(state.allTools.map(t => t.category).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b));

        els.categoryFilter.innerHTML =
            `<option value="">All Categories</option>` +
            categories.map(c => `<option value="${c}">${c}</option>`).join("");
    }

    function rebuildSubCategoryDropdown() {
        const selectedCategory = els.categoryFilter.value || "";

        const components = [...new Set(
            state.allTools
                .filter(t => !selectedCategory || t.category === selectedCategory)
                .map(t => t.component)
        )];

        els.subCategoryFilter.innerHTML =
            `<option value="">All Sub-Categories</option>` +
            components.map(c => `<option value="${c}">${c}</option>`).join("");

        els.subCategoryFilter.disabled = components.length === 0;
    }

    function applyFilters(records) {
        const category = els.categoryFilter.value || "";
        const component = els.subCategoryFilter.value || "";
        const query = (els.toolSearch.value || "").toLowerCase();

        return records.filter(t => {
            return (!category || t.category === category) &&
                (!component || t.component === component) &&
                (!query ||
                    t.name.toLowerCase().includes(query) ||
                    t.category.toLowerCase().includes(query) ||
                    t.component.toLowerCase().includes(query)
                );
        });
    }

    function renderTools() {
        els.toolGrid.innerHTML = "";
        const shown = applyFilters(state.allTools);

        shown.forEach(tool => {
            const card = createEl("div", { className: "product" });

            const img = createEl("img", {
                className: "tool-image",
                attrs: { src: tool.imageUrl }
            });

            const link = ensureTag(tool.affiliateUrl);

            const title = createEl("h3", { text: tool.name });

            const meta = createEl("div", {
                text: `${tool.category} • ${tool.component}`
            });

            if (link) {
                card.style.cursor = "pointer";

                card.addEventListener("click", () => {
                    window.open(link, "_blank");
                });
            }

            card.appendChild(img);
            card.appendChild(title);
            card.appendChild(meta);

            els.toolGrid.appendChild(card);
        });
    }

    function bindEvents() {
        els.categoryFilter.addEventListener("change", () => {
            rebuildSubCategoryDropdown();
            renderTools();
        });

        els.subCategoryFilter.addEventListener("change", renderTools);
        els.toolSearch.addEventListener("input", renderTools);
    }

    function loadTools(data) {
        state.allTools = normalizeTools(data);
        rebuildCategoryDropdown();
        rebuildSubCategoryDropdown();
        renderTools();
    }

    return { loadTools, bindEvents, applyFilters };
}