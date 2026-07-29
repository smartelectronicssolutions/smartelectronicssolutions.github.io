export function initLinksModule({ els, createEl }) {

    function makeLink(link, className = "nav-chip") {
        return createEl("a", {
            className,
            text: link.title || link.url,
            attrs: {
                href: link.url,
                target: "_blank"
            }
        });
    }

    function layoutLinks(links) {
        els.linkBar.innerHTML = "";
        els.moreMenu.innerHTML = "";

        links.forEach(link => {
            els.linkBar.appendChild(makeLink(link));
        });

        requestAnimationFrame(() => {
            const overflow = [];

            while (els.linkBar.scrollWidth > els.linkBar.clientWidth) {
                const last = els.linkBar.lastElementChild;
                overflow.unshift({
                    title: last.textContent,
                    url: last.href
                });
                last.remove();
            }

            if (overflow.length) {
                els.moreWrap.classList.remove("hidden");

                overflow.forEach(link => {
                    els.moreMenu.appendChild(makeLink(link, "more-item"));
                });
            } else {
                els.moreWrap.classList.add("hidden");
            }
        });
    }

    function bindEvents() {
        els.moreBtn.addEventListener("click", () => {
            els.moreMenu.classList.toggle("open");
        });
    }

    return { layoutLinks, bindEvents };
}