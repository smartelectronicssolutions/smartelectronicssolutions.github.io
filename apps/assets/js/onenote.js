let isProcessing = false;
let sectionCache = {};

function convertToOneNoteHTML(data) {
    return Object.keys(data)
        .map((id) => {
            const task = data[id];
            return `
                <div>
                    <h1>${task.customerName || "Unnamed Task"}</h1>
                    <p><b>Project:</b> ${task.project || "N/A"}</p>
                    <p><b>Address:</b> ${task.customerAddress || "N/A"}</p>
                    <p><b>Notes:</b> ${task.notes || "No notes provided"}</p>
                    <p><b>Start Time:</b> ${task.startTime || "N/A"}</p>
                    <p><b>End Time:</b> ${task.endTime || "N/A"}</p>
                    <p><b>Location:</b> Latitude: ${task.location?.latitude || "N/A"}, Longitude: ${task.location?.longitude || "N/A"}</p>
                </div>
                <hr>`;
        })
        .join("");
}

async function fetchApi(url, options = {}) {
    try {
        const response = await fetch(url, options);
        if (response.ok) return response.json();
        console.error("API Error:", await response.text());
    } catch (error) {
        console.error("Fetch Error:", error);
    }
    return null;
}

async function getOrCreateSection(sectionName) {
    if (sectionCache[sectionName]) return sectionCache[sectionName];

    const notebooksUrl = "https://graph.microsoft.com/v1.0/me/onenote/notebooks";
    const notebooks = await fetchApiWithRetry(notebooksUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    const defaultNotebook = notebooks?.value.find((notebook) => notebook.isDefault);
    if (!defaultNotebook) {
        console.error("No default notebook found.");
        return null;
    }

    const sectionsUrl = `https://graph.microsoft.com/v1.0/me/onenote/notebooks/${defaultNotebook.id}/sections`;
    const sections = await fetchApiWithRetry(sectionsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    let section = sections?.value.find((sec) => sec.displayName === sectionName);

    if (!section) {
        section = await fetchApiWithRetry(sectionsUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ displayName: sectionName })
        });
    }

    if (section) sectionCache[sectionName] = section;
    return section;
}

async function sendTaskToOneNote(taskTitle, taskHtml, startTime, sectionId) {
    if (!accessToken) return;

    const apiUrl = `https://graph.microsoft.com/v1.0/me/onenote/sections/${sectionId}/pages`;

    const date = new Date(startTime || Date.now());
    const timeZoneOffset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() - timeZoneOffset);
    const creationDate = localDate.toISOString();

    try {
        const response = await fetchApi(apiUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/xhtml+xml"
            },
            body: `
                <html xmlns="http://www.w3.org/1999/xhtml">
                    <head>
                        <title>${taskTitle}</title>
                        <meta name="created" content="${creationDate}" />
                    </head>
                    ${taskHtml}
                </html>`
        });

        if (response) console.log(`Task "${taskTitle}" successfully added to OneNote.`);
    } catch (error) {
        console.error(`Error creating task "${taskTitle}":`, error);
    }
}

async function processTasks(jsonData) {
    const section = await getOrCreateSection("Jobs1");
    if (!section) {
        alert("Failed to create or access the 'Jobs' section.");
        return;
    }

    for (const id in jsonData) {
        if (!isProcessing) break;

        const task = jsonData[id];
        const taskTitle = `${task.customerName || "Unnamed"} - ${task.project || `Task ${id}`}`;
        const taskHtml = convertToOneNoteHTML({ [id]: task });

        await sendTaskToOneNote(taskTitle, taskHtml, task.startTime, section.id);
    }

    alert(isProcessing ? "All tasks have been processed." : "Process was stopped.");
    isProcessing = false;
    document.getElementById("sendButton").textContent = "Populate OneNote";
}

function setupEventListeners() {
    document.getElementById("sendButton")?.addEventListener("click", async () => {
        if (isProcessing) {
            isProcessing = false;
            document.getElementById("sendButton").textContent = "Populate OneNote";
            return;
        }

        isProcessing = true;
        document.getElementById("sendButton").textContent = "Stop";

        try {
            const jsonInput = document.getElementById("jsonInput").value;
            const jsonData = JSON.parse(jsonInput);
            await processTasks(jsonData);
        } catch (error) {
            alert("Invalid JSON input. Please check your data.");
            console.error("Error parsing JSON:", error);
            isProcessing = false;
            document.getElementById("sendButton").textContent = "Populate OneNote";
        }
    });

    document.getElementById("convertButton")?.addEventListener("click", () => {
        try {
            const jsonInput = document.getElementById("jsonInput").value;
            const jsonData = JSON.parse(jsonInput);
            document.getElementById("output").innerHTML = convertToOneNoteHTML(jsonData);
        } catch (error) {
            alert("Invalid JSON input. Please check your data.");
            console.error("Error parsing JSON:", error);
        }
    });
}

async function fetchApiWithRetry(url, options = {}, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) return await response.json();

            if (response.status === 429) {
                const retryAfter = response.headers.get("Retry-After") || 5;
                console.warn(`Throttled. Retrying in ${retryAfter} seconds...`);
                await delay(retryAfter * 1000);
            } else {
                console.error("API Error:", await response.text());
                break;
            }
        } catch (error) {
            console.error("Fetch Error:", error);
        }
    }

    console.error("Max retries reached.");
    return null;
}

async function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

initializeAccessToken();
setupEventListeners();