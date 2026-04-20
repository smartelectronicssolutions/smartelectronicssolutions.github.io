// -------- Firebase imports --------
import {
  auth,
  onAuthStateChanged,
  database,
  storage,
  ref,
  set,
  update,
  get,
  onValue,
  off,
  storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "../../../assets/js/firebase-init.js";

// -------- Constants / keys --------
const ADMIN_PASSWORD = "telaidadmin";
const LAST_PROJECT_STORAGE_KEY = "walmartProjectTracker:lastProject";
const SECTION_ORDER_STORAGE_KEY = "walmartProjectTracker:sectionOrder";
const CAMERA_COL_VIS_KEY = "walmartProjectTracker:cameraColumns";

// ---- Search state ----
let globalSearchQuery = "";

// Cameras search engine
const cameraSearchEngine = (window.SearchEngine
  ? window.SearchEngine.create({
    fields: {
      id: { type: "string", resolver: (r) => r.id },
      name: { type: "string", resolver: (r) => r.name },
      ip: { type: "string", resolver: (r) => r.ip },
      mac: { type: "string", resolver: (r) => r.mac },
      note: { type: "string", resolver: (r) => r.note },
      switch: { type: "string", resolver: (r) => r.switchName },
      port: { type: "string", resolver: (r) => r.switchPort },
      done: {
        type: "string",
        resolver: (r) => (r.done ? "done" : "notdone")
      }
    },
    defaultFields: ["id", "name", "ip", "mac", "note", "switch", "port"],
    caseSensitive: false
  })
  : {
    filter(records) {
      return records || [];
    }
  }
);

// Alarm points search engine
const alarmSearchEngine = (window.SearchEngine
  ? window.SearchEngine.create({
    fields: {
      id: { type: "string", resolver: (r) => r.id },
      name: { type: "string", resolver: (r) => r.name },
      note: { type: "string", resolver: (r) => r.note },
      done: {
        type: "string",
        resolver: (r) => (r.done ? "done" : "notdone")
      }
    },
    defaultFields: ["id", "name", "note"],
    caseSensitive: false
  })
  : {
    filter(records) {
      return records || [];
    }
  }
);

// Speakers search engine
const speakerSearchEngine = (window.SearchEngine
  ? window.SearchEngine.create({
    fields: {
      id: { type: "string", resolver: (r) => r.id },
      name: { type: "string", resolver: (r) => r.name },
      note: { type: "string", resolver: (r) => r.note }
    },
    defaultFields: ["id", "name", "note"],
    caseSensitive: false
  })
  : {
    filter(records) {
      return records || [];
    }
  }
);

// -------- Dynamic base path --------
let DATABASE_BASE_PATH = "public";

function getProjectBasePath() {
  return `${DATABASE_BASE_PATH}/walmartProjectTracker/projects`;
}

// -------- Scope-driven sections --------
let SECTIONS = [];

async function loadSections(isLoggedIn) {
  try {
    const urls = ["./assets/js/sections-walmart.json"];
    if (isLoggedIn) {
      urls.push("./assets/js/sections-walmart-private.json");
    }

    const responses = await Promise.all(urls.map((u) => fetch(u)));

    for (const res of responses) {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${res.url}`);
      }
    }

    const jsonArrays = await Promise.all(responses.map((r) => r.json()));
    SECTIONS = jsonArrays.flat();

    sectionOrder = loadSectionOrderFromLocalStorage();

    if (!activeSectionId || !getSectionById(activeSectionId)) {
      if (sectionOrder.length) {
        activeSectionId = sectionOrder[0];
      } else if (SECTIONS.length) {
        activeSectionId = SECTIONS[0].id;
      } else {
        activeSectionId = null;
      }
    }

    rerenderAll();
  } catch (err) {
    console.error("Failed to load sections JSON:", err);
    alert(
      "Could not load sections configuration. Check the JSON paths / syntax."
    );
  }
}

// -------- STATE --------
let state = {
  currentProjectName: "",
  currentProjectKey: "",
  projects: {} // { [projectKey]: { name, tasks, notes, alarmPoints, cameras, speakers, links } }
};

// live Firebase listener for current project
let projectListenerRef = null;
let projectListenerCallback = null;

// section order (list of section IDs)
let sectionOrder = [];

// DOM refs
const sectionListEl = document.getElementById("sectionList");
const overallPercentEl = document.getElementById("overallPercent");
const overallBarEl = document.getElementById("overallBar");
const currentProjectLabelEl = document.getElementById("currentProjectLabel");
const currentBasePathLabelEl = document.getElementById(
  "currentBasePathLabel"
);
const sectionTitleEl = document.getElementById("sectionTitle");
const sectionMetaEl = document.getElementById("sectionMeta");
const sectionCountLabelEl = document.getElementById("sectionCountLabel");
const sectionBarEl = document.getElementById("sectionBar");
const sectionProgressWrapperEl = document.getElementById(
  "sectionProgressWrapper"
);
const taskListEl = document.getElementById("taskList");
const notesBlockEl = document.getElementById("notesBlock");
const sectionNotesEl = document.getElementById("sectionNotes");
const sectionScopeCodeEl = document.getElementById("sectionScopeCode");

const alarmPanelEl = document.getElementById("alarmPanel");
const cameraPanelEl = document.getElementById("cameraPanel");
const speakersPanelEl = document.getElementById("speakersPanel");

const alarmTableBodyEl = document.querySelector("#alarmTable tbody");
const cameraTableBodyEl = document.querySelector("#cameraTable tbody");
const speakerTableBodyEl = document.querySelector("#speakerTable tbody");

// 🔎 camera search input (now global search)
const cameraSearchInputEl = document.getElementById("cameraSearchInput");

const alarmFormEl = document.getElementById("alarmForm");
const alarmPointNumberEl = document.getElementById("alarmPointNumber");
const alarmPointNameEl = document.getElementById("alarmPointName");

const cameraFormEl = document.getElementById("cameraForm");
const cameraIdEl = document.getElementById("cameraId");
const cameraNameEl = document.getElementById("cameraName");

const speakerFormEl = document.getElementById("speakerForm");
const speakerNumberEl = document.getElementById("speakerNumber");
const speakerNameEl = document.getElementById("speakerName");

const imageUploadInputEl = document.getElementById("imageUploadInput");
const detailTabButtons = document.querySelectorAll(".detail-tab");

const setProjectBtn = document.getElementById("setProjectBtn");
const clearProjectBtn = document.getElementById("clearProjectBtn");
const projectNameInput = document.getElementById("projectNameInput");

// Project links DOM
const projectLinksList = document.getElementById("projectLinksList");
const projectLinksForm = document.getElementById("projectLinksForm");
const linkTitleInput = document.getElementById("projectLinkTitle");
const linkUrlInput = document.getElementById("projectLinkUrl");

const exportCameraCsvBtn = document.getElementById("exportCameraCsvBtn");
const importCameraCsvBtn = document.getElementById("importCameraCsvBtn");
const cameraCsvInputEl = document.getElementById("cameraCsvInput");
const toggleCameraIpEl = document.getElementById("toggleCameraIp");
const toggleCameraMacEl = document.getElementById("toggleCameraMac");
const toggleCameraSwitchEl = document.getElementById("toggleCameraSwitch");

const hideDoneCamerasCheckbox = document.getElementById("hideDoneCameras");
const hideDoneAlarmsCheckbox = document.getElementById("hideDoneAlarms");

// -------- Local UI state --------
let cameraColumnVisibility = loadCameraColumnVisibility();
let hideDoneCameras = false;
let hideDoneAlarms = false;
let activeSectionId = null;
let saveTimeout = null;
let pendingUploadTarget = null; // { kind: 'alarm' | 'camera' | 'task' | 'speaker', key: string }
let draggedSectionId = null;

// -------- Helpers --------
function sanitizeProjectKey(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[.#$/\[\]]/g, "_")
    .replace(/\s+/g, "_");
}

// Normalize project object from Firebase
function normalizeProjectFromData(data, displayName) {
  data = data || {};
  return {
    name: data.name || displayName || "",
    tasks: data.tasks || {},
    notes: data.notes || {},
    alarmPoints: data.alarmPoints || {},
    cameras: data.cameras || {},
    speakers: data.speakers || {},
    links: Array.isArray(data.links) ? data.links : []
  };
}

// Safe task key for Firebase (handles "1.05" etc.)
function makeTaskKey(sectionId, taskId) {
  return `${sectionId}:${String(taskId)}`.replace(/[.#$/\[\]]/g, "_");
}

function getSectionById(id) {
  return SECTIONS.find((s) => s.id === id) || null;
}

function loadSectionOrderFromLocalStorage() {
  try {
    const raw = localStorage.getItem(SECTION_ORDER_STORAGE_KEY);
    const defaultOrder = SECTIONS.map((s) => s.id);
    if (!raw) return defaultOrder;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultOrder;

    const valid = parsed.filter((id) => getSectionById(id));
    const missing = SECTIONS.map((s) => s.id).filter(
      (id) => !valid.includes(id)
    );
    return [...valid, ...missing];
  } catch (e) {
    console.warn("Could not load section order from localStorage:", e);
    return SECTIONS.map((s) => s.id);
  }
}

function saveSectionOrderToLocalStorage() {
  try {
    localStorage.setItem(SECTION_ORDER_STORAGE_KEY, JSON.stringify(sectionOrder));
  } catch (e) {
    console.warn("Could not save section order to localStorage:", e);
  }
}

function ensureActiveSection() {
  if (!activeSectionId || !getSectionById(activeSectionId)) {
    if (sectionOrder.length) {
      activeSectionId = sectionOrder[0];
    } else if (SECTIONS.length) {
      activeSectionId = SECTIONS[0].id;
    } else {
      activeSectionId = null;
    }
  }
}

function rerenderAll() {
  renderSidebar();
  renderSection(activeSectionId);
  renderAlarmPanel();
  renderCameraPanel();
  renderSpeakersPanel();
  renderProjectLinks();
}

function rerenderForCurrentProject() {
  ensureActiveSection();
  rerenderAll();
}

function loadCameraColumnVisibility() {
  try {
    const raw = localStorage.getItem(CAMERA_COL_VIS_KEY);
    if (!raw) {
      return { ip: false, mac: false, sw: false };
    }
    const parsed = JSON.parse(raw);
    return {
      ip: !!parsed.ip,
      mac: !!parsed.mac,
      sw: !!parsed.sw
    };
  } catch (e) {
    console.warn("Could not load camera column visibility:", e);
    return { ip: false, mac: false, sw: false };
  }
}

function saveCameraColumnVisibility() {
  try {
    localStorage.setItem(
      CAMERA_COL_VIS_KEY,
      JSON.stringify(cameraColumnVisibility)
    );
  } catch (e) {
    console.warn("Could not save camera column visibility:", e);
  }
}

function applyCameraColumnVisibility() {
  const vis = cameraColumnVisibility;

  const setDisplay = (selector, show) => {
    document.querySelectorAll(selector).forEach((el) => {
      el.style.display = show ? "" : "none";
    });
  };

  setDisplay(".col-camera-ip", !!vis.ip);
  setDisplay(".col-camera-mac", !!vis.mac);
  setDisplay(".col-camera-switch", !!vis.sw);
}

function initCameraColumnToggles() {
  if (!toggleCameraIpEl || !toggleCameraMacEl || !toggleCameraSwitchEl) return;

  toggleCameraIpEl.checked = !!cameraColumnVisibility.ip;
  toggleCameraMacEl.checked = !!cameraColumnVisibility.mac;
  toggleCameraSwitchEl.checked = !!cameraColumnVisibility.sw;

  const updateFromCheckboxes = () => {
    cameraColumnVisibility = {
      ip: !!toggleCameraIpEl.checked,
      mac: !!toggleCameraMacEl.checked,
      sw: !!toggleCameraSwitchEl.checked
    };
    saveCameraColumnVisibility();
    applyCameraColumnVisibility();
  };

  toggleCameraIpEl.addEventListener("change", updateFromCheckboxes);
  toggleCameraMacEl.addEventListener("change", updateFromCheckboxes);
  toggleCameraSwitchEl.addEventListener("change", updateFromCheckboxes);
}

// Normalize legacy single-image fields into an array
function normalizeImagesArray(target) {
  if (!target) return [];
  if (Array.isArray(target.images)) return target.images;

  const images = [];
  if (target.imageUrl) {
    images.push({
      url: target.imageUrl,
      path: target.imagePath || null,
      note: target.imageNote || ""
    });
  }
  target.images = images;
  target.imageUrl = null;
  target.imagePath = null;
  target.imageNote = null;
  return images;
}

function collectImagePaths(entry) {
  const paths = [];
  if (!entry) return paths;
  if (Array.isArray(entry.images)) {
    entry.images.forEach((img) => {
      if (img && img.path) paths.push(img.path);
    });
  }
  if (entry.imagePath) {
    paths.push(entry.imagePath);
  }
  return paths;
}

function getCurrentProjectObj() {
  if (!state.currentProjectKey) return null;
  if (!state.projects[state.currentProjectKey]) {
    state.projects[state.currentProjectKey] = {
      name: state.currentProjectName,
      tasks: {},
      notes: {},
      alarmPoints: {},
      cameras: {},
      speakers: {},
      links: []
    };
  } else {
    const proj = state.projects[state.currentProjectKey];
    proj.tasks = proj.tasks || {};
    proj.notes = proj.notes || {};
    proj.alarmPoints = proj.alarmPoints || {};
    proj.cameras = proj.cameras || {};
    proj.speakers = proj.speakers || {};
    proj.links = proj.links || [];
  }
  return state.projects[state.currentProjectKey];
}

// ---- CSV export / import ----
if (exportCameraCsvBtn) {
  exportCameraCsvBtn.addEventListener("click", exportCameraCableSheet);
}

if (importCameraCsvBtn && cameraCsvInputEl) {
  importCameraCsvBtn.addEventListener("click", () => {
    if (!state.currentProjectKey) {
      alert("Set a project first before importing cameras.");
      return;
    }
    cameraCsvInputEl.value = "";
    cameraCsvInputEl.click();
  });

  cameraCsvInputEl.addEventListener("change", () => {
    const file = cameraCsvInputEl.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        importCamerasFromCsv(reader.result);
      } catch (err) {
        console.error("Camera CSV import failed:", err);
        alert("Could not import camera list. Check console for details.");
      } finally {
        cameraCsvInputEl.value = "";
      }
    };
    reader.onerror = () => {
      alert("Failed to read CSV file.");
    };
    reader.readAsText(file);
  });
}

function exportCameraCableSheet() {
  const proj = getCurrentProjectObj();
  if (!proj) {
    alert("Set a project first.");
    return;
  }

  const header = [
    "Cable #",
    "Location Name",
    "IP Address",
    "Subnet",
    "MAC address",
    "Switch",
    "Switch Port",
    "Camera Model",
    "Camera to be displayed ",
    "Camera Recording Profile",
    "Camera Group",
    "ID",
    "IP",
    "Switch-Port",
    "Named Ranges",
    "",
    "Notes"
  ];

  const rows = [];

  const entries = Object.entries(proj.cameras || {}).sort(([a], [b]) =>
    a.localeCompare(b, undefined, { numeric: true })
  );

  entries.forEach(([camId, info]) => {
    const row = new Array(header.length).fill("");

    row[0] = camId || "";
    row[1] = info.name || "";

    const flatNote = (info.note || "").replace(/\r?\n|\r/g, " | ");
    const notesColIndex = header.length - 1;
    row[notesColIndex] = flatNote;

    rows.push(row);
  });

  function esc(val) {
    const s = String(val ?? "");
    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  const lines = [];
  lines.push(header.map(esc).join(","));
  rows.forEach((r) => lines.push(r.map(esc).join(",")));

  const csvContent = lines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  const baseName = (state.currentProjectName || state.currentProjectKey || "project")
    .replace(/[^a-z0-9_\-]+/gi, "_");

  a.href = url;
  a.download = `${baseName}_Camera_Cable_Assignment.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importCamerasFromCsv(csvText) {
  const proj = getCurrentProjectObj();
  if (!proj) {
    alert("Set a project first.");
    return;
  }

  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lines.length) {
    alert("CSV appears to be empty.");
    return;
  }

  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const firstCell = (lines[i].split(",")[0] || "")
      .trim()
      .toLowerCase();
    if (firstCell === "cable #" || firstCell === "cable#") {
      startIdx = i + 1;
      break;
    }
  }

  if (startIdx === -1) {
    alert("Could not find 'Cable #' header in CSV.");
    return;
  }

  let importedCount = 0;
  let updatedCount = 0;

  for (let i = startIdx; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;

    const cells = raw.split(",");

    const cableId = (cells[0] || "").trim();
    const locationName = (cells[1] || "").trim();

    if (!cableId || !/^\d+$/.test(cableId)) {
      break;
    }

    const ip = (cells[2] || "").trim();
    const subnet = (cells[3] || "").trim();
    const mac = (cells[4] || "").trim();
    const switchName = (cells[5] || "").trim();
    const switchPort = (cells[6] || "").trim();
    const cameraModel = (cells[7] || "").trim();
    const displayName = (cells[8] || "").trim();
    const recordingProfile = (cells[9] || "").trim();
    const cameraGroup = (cells[10] || "").trim();

    const existing = proj.cameras[cableId] || {};
    const alreadyExists = !!proj.cameras[cableId];

    proj.cameras[cableId] = {
      ...existing,
      name: locationName || existing.name || "",
      ip: ip || existing.ip || "",
      subnet: subnet || existing.subnet || "",
      mac: mac || existing.mac || "",
      switchName: switchName || existing.switchName || "",
      switchPort: switchPort || existing.switchPort || "",
      model: cameraModel || existing.model || "",
      displayName: displayName || existing.displayName || "",
      recordingProfile: recordingProfile || existing.recordingProfile || "",
      group: cameraGroup || existing.group || ""
    };

    if (alreadyExists) {
      updatedCount++;
    } else {
      importedCount++;
    }
  }

  scheduleSave();
  renderCameraPanel();

  alert(
    `Camera CSV import finished.\n` +
    `New cameras: ${importedCount}\n` +
    `Updated cameras: ${updatedCount}`
  );
}

// ---- Firebase load/save ----
async function loadProjectFromFirebase(projectKey, displayName) {
  const projectRef = ref(database, `${getProjectBasePath()}/${projectKey}`);

  // Initial load / ensure existence
  const snap = await get(projectRef);
  if (!snap.exists()) {
    const newData = {
      name: displayName,
      tasks: {},
      notes: {},
      alarmPoints: {},
      cameras: {},
      speakers: {},
      links: []
    };
    await set(projectRef, newData);
    state.projects[projectKey] = newData;
  } else {
    state.projects[projectKey] = normalizeProjectFromData(
      snap.val(),
      displayName
    );
  }

  // Tear down previous listener (if any)
  if (projectListenerRef && projectListenerCallback) {
    try {
      off(projectListenerRef, "value", projectListenerCallback);
    } catch (e) {
      console.warn("Error removing previous project listener:", e);
    }
  }

  // Set up live listener for this project
  projectListenerRef = projectRef;
  projectListenerCallback = (snapshot) => {
    if (!snapshot.exists()) return;
    const data = snapshot.val();
    state.projects[projectKey] = normalizeProjectFromData(data, displayName);

    if (state.currentProjectKey === projectKey) {
      rerenderForCurrentProject();
    }
  };

  onValue(projectRef, projectListenerCallback);
}

async function saveProjectToFirebase() {
  if (!state.currentProjectKey) return;
  const proj = getCurrentProjectObj();
  if (!proj) return;
  const projectRef = ref(
    database,
    `${getProjectBasePath()}/${state.currentProjectKey}`
  );
  await update(projectRef, {
    name: state.currentProjectName,
    tasks: proj.tasks || {},
    notes: proj.notes || {},
    alarmPoints: proj.alarmPoints || {},
    cameras: proj.cameras || {},
    speakers: proj.speakers || {},
    links: proj.links || []
  });
}

function scheduleSave() {
  if (!state.currentProjectKey) return;
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    saveProjectToFirebase().catch(console.error);
  }, 400);
}

// ---- Progress helpers ----
function computeOverallProgress() {
  const proj = getCurrentProjectObj();
  if (!proj) return { done: 0, total: 0, percent: 0 };
  let total = 0;
  let done = 0;
  SECTIONS.forEach((sec) => {
    sec.tasks.forEach((t) => {
      total++;
      const key = makeTaskKey(sec.id, t.id);
      const entry = proj.tasks[key];
      const isDone = !!(entry && (typeof entry === "object" ? entry.done : entry));
      if (isDone) done++;
    });
  });
  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100)
  };
}

function computeSectionProgress(sectionId) {
  const proj = getCurrentProjectObj();
  if (!proj) return { done: 0, total: 0, percent: 0 };
  const section = getSectionById(sectionId);
  if (!section) return { done: 0, total: 0, percent: 0 };

  const total = section.tasks.length;
  const done = section.tasks.filter((t) => {
    const key = makeTaskKey(section.id, t.id);
    const entry = proj.tasks[key];
    const isDone = !!(entry && (typeof entry === "object" ? entry.done : entry));
    return isDone;
  }).length;

  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100)
  };
}

// ---- Sidebar / sections ----
function renderSidebar() {
  sectionListEl.innerHTML = "";
  const overall = computeOverallProgress();
  overallPercentEl.textContent = overall.percent + "%";
  overallBarEl.style.width = overall.percent + "%";
  currentProjectLabelEl.textContent =
    state.currentProjectName || "(none)";
  if (currentBasePathLabelEl) {
    currentBasePathLabelEl.textContent = DATABASE_BASE_PATH;
  }

  if (!activeSectionId || !getSectionById(activeSectionId)) {
    activeSectionId =
      sectionOrder[0] || (SECTIONS[0] && SECTIONS[0].id);
  }

  sectionOrder.forEach((secId) => {
    const sec = getSectionById(secId);
    if (!sec) return;

    const secProgress = computeSectionProgress(sec.id);
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className =
      "section-pill" + (sec.id === activeSectionId ? " active" : "");
    pill.dataset.sectionId = sec.id;
    pill.draggable = true;

    const labelSpan = document.createElement("span");
    labelSpan.className = "label";
    labelSpan.textContent = sec.title;

    const rightSpan = document.createElement("span");
    rightSpan.className = "pill-progress";

    const dot = document.createElement("span");
    dot.className =
      "pill-dot" +
      (secProgress.done === secProgress.total &&
        secProgress.total > 0
        ? " done"
        : "");

    const count = document.createElement("span");
    count.textContent = secProgress.total
      ? `${secProgress.done}/${secProgress.total}`
      : "-";

    rightSpan.appendChild(dot);
    rightSpan.appendChild(count);

    pill.appendChild(labelSpan);
    pill.appendChild(rightSpan);

    pill.addEventListener("click", () => {
      activeSectionId = sec.id;
      renderSidebar();
      renderSection(sec.id);
    });

    pill.addEventListener("dragstart", (e) => {
      draggedSectionId = sec.id;
      e.dataTransfer.effectAllowed = "move";
    });

    pill.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });

    pill.addEventListener("drop", (e) => {
      e.preventDefault();
      if (!draggedSectionId || draggedSectionId === sec.id) return;

      const fromIndex = sectionOrder.indexOf(draggedSectionId);
      const toIndex = sectionOrder.indexOf(sec.id);
      if (fromIndex === -1 || toIndex === -1) return;

      sectionOrder.splice(fromIndex, 1);
      sectionOrder.splice(toIndex, 0, draggedSectionId);

      saveSectionOrderToLocalStorage();
      draggedSectionId = null;

      renderSidebar();
      renderSection(activeSectionId);
    });

    sectionListEl.appendChild(pill);
  });
}

function renderSection(sectionId) {
  const section = getSectionById(sectionId);
  if (!section) {
    sectionTitleEl.textContent = "Select a section";
    sectionMetaEl.textContent = "";
    taskListEl.innerHTML = "";
    sectionProgressWrapperEl.style.display = "none";
    notesBlockEl.style.display = "none";
    return;
  }

  sectionTitleEl.textContent = section.title;
  sectionMetaEl.textContent = "Scope reference: " + section.scopeRef;

  const secProgress = computeSectionProgress(sectionId);
  sectionProgressWrapperEl.style.display = "flex";
  sectionCountLabelEl.textContent = `${secProgress.done} / ${secProgress.total} done`;
  sectionBarEl.style.width = secProgress.percent + "%";

  taskListEl.innerHTML = "";
  const project = getCurrentProjectObj();

  section.tasks.forEach((task) => {
    const li = document.createElement("li");
    const key = makeTaskKey(section.id, task.id);
    const taskState = project && project.tasks[key];
    const done = !!(
      taskState && (typeof taskState === "object" ? taskState.done : taskState)
    );

    li.className = "task-item" + (done ? " done" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-checkbox";
    checkbox.checked = done;

    checkbox.addEventListener("change", () => {
      if (!state.currentProjectKey) {
        alert(
          "Set a project name first so checks can be saved to Firebase."
        );
        checkbox.checked = false;
        return;
      }
      const proj = getCurrentProjectObj();

      const existing = proj.tasks[key];
      const currentDone = !!(
        existing && (typeof existing === "object" ? existing.done : existing)
      );
      const newDone = checkbox.checked;

      if (!existing || typeof existing !== "object") {
        proj.tasks[key] = { done: newDone };
      } else {
        proj.tasks[key].done = newDone;
      }

      scheduleSave();
      renderSidebar();
      renderSection(sectionId);
    });

    const labelDiv = document.createElement("div");
    labelDiv.className = "task-label";

    const idSpan = document.createElement("span");
    idSpan.className = "id";
    idSpan.textContent = task.id;

    const textSpan = document.createElement("span");
    textSpan.className = "text";
    textSpan.textContent = task.text;

    labelDiv.appendChild(idSpan);
    labelDiv.appendChild(textSpan);

    li.appendChild(checkbox);
    li.appendChild(labelDiv);

    const taskImagesContainer = document.createElement("div");
    taskImagesContainer.className = "task-images";

    const addTaskImgBtn = document.createElement("button");
    addTaskImgBtn.type = "button";
    addTaskImgBtn.textContent = "Add Image";
    addTaskImgBtn.addEventListener("click", () => {
      if (!state.currentProjectKey) {
        alert("Set a project first.");
        return;
      }
      pendingUploadTarget = { kind: "task", key };
      imageUploadInputEl.value = "";
      imageUploadInputEl.click();
    });
    taskImagesContainer.appendChild(addTaskImgBtn);

    if (project && project.tasks[key] && typeof project.tasks[key] === "object") {
      const imagesArr = normalizeImagesArray(project.tasks[key]);
      if (imagesArr.length) {
        const strip = document.createElement("div");
        strip.className = "thumb-strip";

        imagesArr.forEach((img, index) => {
          const wrapper = document.createElement("div");
          wrapper.className = "thumb-wrapper";

          const thumb = document.createElement("img");
          thumb.className = "thumb-img";
          thumb.src = img.url;
          thumb.alt = `Task ${task.id} image ${index + 1}`;
          thumb.title = "Click to open full image";
          thumb.addEventListener("click", () => {
            window.open(img.url, "_blank");
          });

          const delBtn = document.createElement("button");
          delBtn.className = "thumb-delete";
          delBtn.textContent = "×";
          delBtn.title = "Delete this image";
          delBtn.addEventListener("click", async () => {
            if (
              !confirm("Delete this image for this task?")
            )
              return;

            const projNow = getCurrentProjectObj();
            if (
              !projNow.tasks[key] ||
              typeof projNow.tasks[key] !== "object"
            )
              return;

            const target = projNow.tasks[key];
            const imagesArrNow = normalizeImagesArray(target);
            const [removed] = imagesArrNow.splice(index, 1);

            scheduleSave();
            renderSection(sectionId);

            if (removed && removed.path) {
              try {
                await deleteObject(storageRef(storage, removed.path));
              } catch (e) {
                console.warn(
                  "Storage delete failed (maybe already removed):",
                  e
                );
              }
            }
          });

          const note = document.createElement("textarea");
          note.className = "thumb-note";
          note.rows = 2;
          note.placeholder = "Notes for this image…";
          note.value = img.note || "";
          note.addEventListener("blur", () => {
            const projNow = getCurrentProjectObj();
            if (
              !projNow.tasks[key] ||
              typeof projNow.tasks[key] !== "object"
            )
              return;
            const target = projNow.tasks[key];
            const imagesArrNow = normalizeImagesArray(target);
            if (!imagesArrNow[index]) {
              imagesArrNow[index] = {
                url: img.url,
                path: img.path || null,
                note: ""
              };
            }
            imagesArrNow[index].note = note.value;
            scheduleSave();
          });

          wrapper.appendChild(thumb);
          wrapper.appendChild(delBtn);
          wrapper.appendChild(note);
          strip.appendChild(wrapper);
        });

        taskImagesContainer.appendChild(strip);
      }
    }

    li.appendChild(taskImagesContainer);
    taskListEl.appendChild(li);
  });

  const proj = getCurrentProjectObj();
  notesBlockEl.style.display = proj ? "block" : "none";
  sectionScopeCodeEl.textContent = section.scopeRef;
  sectionNotesEl.value = proj ? proj.notes[section.id] || "" : "";
}

// ---- Alarm / camera / speaker panels ----
function renderAlarmPanel() {
  const proj = getCurrentProjectObj();
  alarmTableBodyEl.innerHTML = "";
  if (!proj) return;

  // Build records for search
  let records = Object.entries(proj.alarmPoints || {}).map(
    ([pointNum, info]) => ({
      id: pointNum,
      name: info.name || "",
      note: info.note || "",
      done: !!info.done,
      _raw: info
    })
  );

  // Apply search filter
  if (globalSearchQuery && globalSearchQuery.trim()) {
    records = alarmSearchEngine.filter(records, globalSearchQuery);
  }

  // Apply hide-done filter
  if (hideDoneAlarms) {
    records = records.filter((r) => !r.done);
  }

  // Sort numerically
  records.sort((a, b) => Number(a.id) - Number(b.id));

  records.forEach((rec) => {
    const pointNum = rec.id;
    const info = rec._raw;
    const tr = document.createElement("tr");

    const tdNum = document.createElement("td");
    tdNum.textContent = pointNum;

    const tdName = document.createElement("td");
    tdName.textContent = info.name || "";

    const tdDone = document.createElement("td");
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = !!info.done;
    chk.addEventListener("change", () => {
      const projNow = getCurrentProjectObj();
      if (!projNow.alarmPoints[pointNum])
        projNow.alarmPoints[pointNum] = {};
      projNow.alarmPoints[pointNum].name = info.name;
      projNow.alarmPoints[pointNum].done = chk.checked;
      scheduleSave();
      renderAlarmPanel();
    });
    tdDone.appendChild(chk);

    const tdImg = document.createElement("td");
    const addBtn = document.createElement("button");
    addBtn.textContent = "Add Image";
    addBtn.addEventListener("click", () => {
      if (!state.currentProjectKey) {
        alert("Set a project first.");
        return;
      }
      pendingUploadTarget = { kind: "alarm", key: pointNum };
      imageUploadInputEl.value = "";
      imageUploadInputEl.click();
    });
    tdImg.appendChild(addBtn);

    const images = normalizeImagesArray(info);

    if (images.length) {
      const strip = document.createElement("div");
      strip.className = "thumb-strip";

      images.forEach((img, index) => {
        const wrapper = document.createElement("div");
        wrapper.className = "thumb-wrapper";

        const thumb = document.createElement("img");
        thumb.className = "thumb-img";
        thumb.src = img.url;
        thumb.alt = `Alarm ${pointNum} image ${index + 1}`;
        thumb.title = "Click to open full image";
        thumb.addEventListener("click", () => {
          window.open(img.url, "_blank");
        });

        const delBtn = document.createElement("button");
        delBtn.className = "thumb-delete";
        delBtn.textContent = "×";
        delBtn.title =
          "Delete this image";
        delBtn.addEventListener("click", async () => {
          if (
            !confirm("Delete this image for this alarm point?")
          )
            return;

          const projNow = getCurrentProjectObj();
          if (!projNow.alarmPoints[pointNum])
            projNow.alarmPoints[pointNum] = {};
          const target = projNow.alarmPoints[pointNum];

          normalizeImagesArray(target);

          const [removed] = target.images.splice(index, 1);

          scheduleSave();
          renderAlarmPanel();

          if (removed && removed.path) {
            try {
              await deleteObject(storageRef(storage, removed.path));
            } catch (e) {
              console.warn(
                "Storage delete failed (maybe already removed):",
                e
              );
            }
          }
        });

        const note = document.createElement("textarea");
        note.className = "thumb-note";
        note.rows = 2;
        note.placeholder = "Notes for this image…";
        note.value = img.note || "";
        note.addEventListener("blur", () => {
          const projNow = getCurrentProjectObj();
          if (!projNow.alarmPoints[pointNum])
            projNow.alarmPoints[pointNum] = {};
          const target = projNow.alarmPoints[pointNum];

          const imagesArr = normalizeImagesArray(target);

          if (!imagesArr[index]) {
            imagesArr[index] = {
              url: img.url,
              path: img.path || null,
              note: ""
            };
          }

          imagesArr[index].note = note.value;
          scheduleSave();
        });

        wrapper.appendChild(thumb);
        wrapper.appendChild(delBtn);
        wrapper.appendChild(note);
        strip.appendChild(wrapper);
      });

      tdImg.appendChild(strip);
    }

    const tdNote = document.createElement("td");
    const alarmNoteArea = document.createElement("textarea");
    alarmNoteArea.className = "camera-note";
    alarmNoteArea.placeholder = "Alarm point notes…";
    alarmNoteArea.value = info.note || "";
    alarmNoteArea.addEventListener("blur", () => {
      const projNow = getCurrentProjectObj();
      if (!projNow.alarmPoints[pointNum])
        projNow.alarmPoints[pointNum] = {};
      projNow.alarmPoints[pointNum].name = info.name;
      projNow.alarmPoints[pointNum].done = !!info.done;
      projNow.alarmPoints[pointNum].note = alarmNoteArea.value;
      scheduleSave();
    });
    tdNote.appendChild(alarmNoteArea);

    const tdActions = document.createElement("td");
    const deletePointBtn = document.createElement("button");
    deletePointBtn.textContent = "Delete";
    deletePointBtn.title =
      "Delete this alarm point and all its images";

    deletePointBtn.addEventListener("click", async () => {
      if (
        !confirm(
          `Delete alarm point ${pointNum} and all associated images?`
        )
      )
        return;

      const projNow = getCurrentProjectObj();
      if (
        !projNow ||
        !projNow.alarmPoints ||
        !projNow.alarmPoints[pointNum]
      ) {
        return;
      }

      const entry = projNow.alarmPoints[pointNum];
      const pathsToDelete = collectImagePaths(entry);

      delete projNow.alarmPoints[pointNum];
      scheduleSave();
      renderAlarmPanel();

      for (const p of pathsToDelete) {
        try {
          await deleteObject(storageRef(storage, p));
        } catch (e) {
          console.warn("Failed to delete alarm image from storage:", p, e);
        }
      }
    });

    tdActions.appendChild(deletePointBtn);

    tr.appendChild(tdNum);
    tr.appendChild(tdName);
    tr.appendChild(tdDone);
    tr.appendChild(tdImg);
    tr.appendChild(tdNote);
    tr.appendChild(tdActions);

    alarmTableBodyEl.appendChild(tr);
  });
}

function renderSpeakersPanel() {
  const proj = getCurrentProjectObj();
  speakerTableBodyEl.innerHTML = "";
  if (!proj) return;

  // Build records for search
  let records = Object.entries(proj.speakers || {}).map(
    ([num, info]) => ({
      id: num,
      name: info.name || "",
      note: info.note || "",
      _raw: info
    })
  );

  // Apply search filter
  if (globalSearchQuery && globalSearchQuery.trim()) {
    records = speakerSearchEngine.filter(records, globalSearchQuery);
  }

  // Sort numerically
  records.sort((a, b) => Number(a.id) - Number(b.id));

  records.forEach((rec) => {
    const num = rec.id;
    const info = rec._raw;

    const tr = document.createElement("tr");

    const tdNum = document.createElement("td");
    tdNum.textContent = num;

    const tdName = document.createElement("td");
    tdName.textContent = info.name || "";

    const tdImg = document.createElement("td");

    const addBtn = document.createElement("button");
    addBtn.textContent = "Add Image";
    addBtn.addEventListener("click", () => {
      if (!state.currentProjectKey) {
        alert("Set a project first.");
        return;
      }
      pendingUploadTarget = { kind: "speaker", key: num };
      imageUploadInputEl.value = "";
      imageUploadInputEl.click();
    });
    tdImg.appendChild(addBtn);

    const images = normalizeImagesArray(info);

    if (images.length) {
      const strip = document.createElement("div");
      strip.className = "thumb-strip";

      images.forEach((img, index) => {
        const wrapper = document.createElement("div");
        wrapper.className = "thumb-wrapper";

        const thumb = document.createElement("img");
        thumb.className = "thumb-img";
        thumb.src = img.url;
        thumb.alt = `Speaker ${num} image ${index + 1}`;
        thumb.title = "Click to open full image";
        thumb.addEventListener("click", () => {
          window.open(img.url, "_blank");
        });

        const delBtn = document.createElement("button");
        delBtn.className = "thumb-delete";
        delBtn.textContent = "×";
        delBtn.title =
          "Delete this image";
        delBtn.addEventListener("click", async () => {
          if (
            !confirm("Delete this image for this speaker?")
          )
            return;

          const projNow = getCurrentProjectObj();
          if (!projNow.speakers[num])
            projNow.speakers[num] = {};
          const target = projNow.speakers[num];

          const imagesArr = normalizeImagesArray(target);
          const [removed] = imagesArr.splice(index, 1);

          scheduleSave();
          renderSpeakersPanel();

          if (removed && removed.path) {
            try {
              await deleteObject(storageRef(storage, removed.path));
            } catch (e) {
              console.warn(
                "Storage delete failed (maybe already removed):",
                e
              );
            }
          }
        });

        const note = document.createElement("textarea");
        note.className = "thumb-note";
        note.rows = 2;
        note.placeholder = "Notes for this image…";
        note.value = img.note || "";
        note.addEventListener("blur", () => {
          const projNow = getCurrentProjectObj();
          if (!projNow.speakers[num])
            projNow.speakers[num] = {};
          const target = projNow.speakers[num];

          const imagesArr = normalizeImagesArray(target);

          if (!imagesArr[index]) {
            imagesArr[index] = {
              url: img.url,
              path: img.path || null,
              note: ""
            };
          }

          imagesArr[index].note = note.value;
          scheduleSave();
        });

        wrapper.appendChild(thumb);
        wrapper.appendChild(delBtn);
        wrapper.appendChild(note);
        strip.appendChild(wrapper);
      });

      tdImg.appendChild(strip);
    }

    const tdNote = document.createElement("td");
    const noteArea = document.createElement("textarea");
    noteArea.className = "camera-note";
    noteArea.placeholder = "Speaker notes…";
    noteArea.value = info.note || "";
    noteArea.addEventListener("blur", () => {
      const projNow = getCurrentProjectObj();
      if (!projNow.speakers[num])
        projNow.speakers[num] = {};
      projNow.speakers[num].name = info.name;
      projNow.speakers[num].note = noteArea.value;
      scheduleSave();
    });
    tdNote.appendChild(noteArea);

    const tdActions = document.createElement("td");
    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.title = "Delete this speaker";

    delBtn.addEventListener("click", async () => {
      if (
        !confirm(
          `Delete speaker ${num} and all associated images?`
        )
      )
        return;

      const projNow = getCurrentProjectObj();
      if (!projNow || !projNow.speakers || !projNow.speakers[num])
        return;

      const entry = projNow.speakers[num];

      const pathsToDelete = collectImagePaths(entry);

      delete projNow.speakers[num];
      scheduleSave();
      renderSpeakersPanel();

      for (const p of pathsToDelete) {
        try {
          await deleteObject(storageRef(storage, p));
        } catch (e) {
          console.warn(
            "Failed to delete speaker image from storage:",
            p,
            e
          );
        }
      }
    });

    tdActions.appendChild(delBtn);

    tr.appendChild(tdNum);
    tr.appendChild(tdName);
    tr.appendChild(tdImg);
    tr.appendChild(tdNote);
    tr.appendChild(tdActions);

    speakerTableBodyEl.appendChild(tr);
  });
}

function renderCameraPanel() {
  const proj = getCurrentProjectObj();
  cameraTableBodyEl.innerHTML = "";
  if (!proj) {
    applyCameraColumnVisibility();
    updateCameraStats();
    return;
  }

  // Build records for search engine
  let records = Object.entries(proj.cameras || {}).map(
    ([camId, info]) => ({
      id: camId,
      name: info.name || "",
      ip: info.ip || "",
      mac: info.mac || "",
      note: info.note || "",
      switchName: info.switchName || "",
      switchPort: info.switchPort || "",
      done: !!info.done,
      _raw: info
    })
  );

  // Apply search filter
  if (globalSearchQuery && globalSearchQuery.trim()) {
    records = cameraSearchEngine.filter(records, globalSearchQuery);
  }

  // Apply hide-done filter
  if (hideDoneCameras) {
    records = records.filter((r) => !r.done);
  }

  // Sort by ID
  records.sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { numeric: true })
  );

  records.forEach((rec) => {
    const camId = rec.id;
    const info = rec._raw;

    const tr = document.createElement("tr");

    const tdId = document.createElement("td");
    tdId.textContent = camId;

    const tdName = document.createElement("td");
    tdName.textContent = info.name || "";

    const tdIp = document.createElement("td");
    tdIp.classList.add("col-camera-ip");
    const ipInput = document.createElement("input");
    ipInput.type = "text";
    ipInput.value = info.ip || "";
    ipInput.placeholder = "IP";
    ipInput.className = "camera-ip-input";
    ipInput.addEventListener("blur", () => {
      const projNow = getCurrentProjectObj();
      if (!projNow.cameras[camId]) projNow.cameras[camId] = {};
      projNow.cameras[camId].ip = ipInput.value.trim();
      scheduleSave();
    });
    tdIp.appendChild(ipInput);

    const tdMac = document.createElement("td");
    tdMac.classList.add("col-camera-mac");
    const macInput = document.createElement("input");
    macInput.type = "text";
    macInput.value = info.mac || "";
    macInput.placeholder = "MAC";
    macInput.className = "camera-mac-input";
    macInput.addEventListener("blur", () => {
      const projNow = getCurrentProjectObj();
      if (!projNow.cameras[camId]) projNow.cameras[camId] = {};
      projNow.cameras[camId].mac = macInput.value.trim();
      scheduleSave();
    });
    tdMac.appendChild(macInput);

    const tdSwitch = document.createElement("td");
    tdSwitch.classList.add("col-camera-switch", "camera-switch-cell");

    const switchNameInput = document.createElement("input");
    switchNameInput.type = "text";
    switchNameInput.value = info.switchName || "";
    switchNameInput.placeholder = "Switch";
    switchNameInput.className = "camera-switch-input";

    const switchPortInput = document.createElement("input");
    switchPortInput.type = "text";
    switchPortInput.value = info.switchPort || "";
    switchPortInput.placeholder = "Port";
    switchPortInput.className = "camera-port-input";

    function saveSwitchFields() {
      const projNow = getCurrentProjectObj();
      if (!projNow.cameras[camId]) projNow.cameras[camId] = {};
      projNow.cameras[camId].switchName = switchNameInput.value.trim();
      projNow.cameras[camId].switchPort = switchPortInput.value.trim();
      scheduleSave();
    }

    switchNameInput.addEventListener("blur", saveSwitchFields);
    switchPortInput.addEventListener("blur", saveSwitchFields);

    tdSwitch.appendChild(switchNameInput);
    tdSwitch.appendChild(switchPortInput);

    const tdDone = document.createElement("td");
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = !!info.done;
    chk.addEventListener("change", () => {
      const projNow = getCurrentProjectObj();
      if (!projNow.cameras[camId]) projNow.cameras[camId] = {};
      projNow.cameras[camId].name = info.name;
      projNow.cameras[camId].done = chk.checked;
      scheduleSave();
      renderCameraPanel();
    });
    tdDone.appendChild(chk);

    const tdImg = document.createElement("td");

    const addBtn = document.createElement("button");
    addBtn.textContent = "Add Image";
    addBtn.addEventListener("click", () => {
      if (!state.currentProjectKey) {
        alert("Set a project first.");
        return;
      }
      pendingUploadTarget = { kind: "camera", key: camId };
      imageUploadInputEl.value = "";
      imageUploadInputEl.click();
    });
    tdImg.appendChild(addBtn);

    const images = normalizeImagesArray(info);

    if (images.length) {
      const strip = document.createElement("div");
      strip.className = "thumb-strip";

      images.forEach((img, index) => {
        const wrapper = document.createElement("div");
        wrapper.className = "thumb-wrapper";

        const thumb = document.createElement("img");
        thumb.className = "thumb-img";
        thumb.src = img.url;
        thumb.alt = `Camera ${camId} image ${index + 1}`;
        thumb.title = "Click to open full image";
        thumb.addEventListener("click", () => {
          window.open(img.url, "_blank");
        });

        const delBtn = document.createElement("button");
        delBtn.className = "thumb-delete";
        delBtn.textContent = "×";
        delBtn.title =
          "Delete this image";
        delBtn.addEventListener("click", async () => {
          if (
            !confirm("Delete this image for this camera?")
          )
            return;

          const projNow = getCurrentProjectObj();
          if (!projNow.cameras[camId]) projNow.cameras[camId] = {};
          const target = projNow.cameras[camId];

          const imagesArr = normalizeImagesArray(target);

          const [removed] = imagesArr.splice(index, 1);

          scheduleSave();
          renderCameraPanel();

          if (removed && removed.path) {
            try {
              await deleteObject(storageRef(storage, removed.path));
            } catch (e) {
              console.warn(
                "Storage delete failed (maybe already removed):",
                e
              );
            }
          }
        });

        const note = document.createElement("textarea");
        note.className = "thumb-note";
        note.rows = 2;
        note.placeholder = "Notes for this image…";
        note.value = img.note || "";
        note.addEventListener("blur", () => {
          const projNow = getCurrentProjectObj();
          if (!projNow.cameras[camId]) projNow.cameras[camId] = {};
          const target = projNow.cameras[camId];

          const imagesArr = normalizeImagesArray(target);

          if (!imagesArr[index]) {
            imagesArr[index] = {
              url: img.url,
              path: img.path || null,
              note: ""
            };
          }

          imagesArr[index].note = note.value;
          scheduleSave();
        });

        wrapper.appendChild(thumb);
        wrapper.appendChild(delBtn);
        wrapper.appendChild(note);
        strip.appendChild(wrapper);
      });

      tdImg.appendChild(strip);
    }

    const tdNote = document.createElement("td");
    const cameraNoteArea = document.createElement("textarea");
    cameraNoteArea.className = "camera-note";
    cameraNoteArea.placeholder = "Camera-level notes…";
    cameraNoteArea.value = info.note || "";
    cameraNoteArea.addEventListener("blur", () => {
      const projNow = getCurrentProjectObj();
      if (!projNow.cameras[camId]) projNow.cameras[camId] = {};
      projNow.cameras[camId].name = info.name;
      projNow.cameras[camId].done = !!info.done;
      projNow.cameras[camId].note = cameraNoteArea.value;
      scheduleSave();
    });
    tdNote.appendChild(cameraNoteArea);

    const tdActions = document.createElement("td");
    const deleteCamBtn = document.createElement("button");
    deleteCamBtn.textContent = "Delete";
    deleteCamBtn.title =
      "Delete this camera and all its images";

    deleteCamBtn.addEventListener("click", async () => {
      if (
        !confirm(
          `Delete camera ${camId} and all associated images?`
        )
      )
        return;

      const projNow = getCurrentProjectObj();
      if (!projNow || !projNow.cameras || !projNow.cameras[camId]) {
        return;
      }

      const entry = projNow.cameras[camId];

      const pathsToDelete = collectImagePaths(entry);

      delete projNow.cameras[camId];
      scheduleSave();
      renderCameraPanel();

      for (const p of pathsToDelete) {
        try {
          await deleteObject(storageRef(storage, p));
        } catch (e) {
          console.warn(
            "Failed to delete camera image from storage:",
            p,
            e
          );
        }
      }
    });

    tdActions.appendChild(deleteCamBtn);

    tr.appendChild(tdId);
    tr.appendChild(tdName);
    tr.appendChild(tdIp);
    tr.appendChild(tdMac);
    tr.appendChild(tdSwitch);
    tr.appendChild(tdDone);
    tr.appendChild(tdImg);
    tr.appendChild(tdNote);
    tr.appendChild(tdActions);

    cameraTableBodyEl.appendChild(tr);
  });

  applyCameraColumnVisibility();
  updateCameraStats();
}

// ---- Project links ----
function renderProjectLinks() {
  projectLinksList.innerHTML = "";
  const proj = getCurrentProjectObj();
  if (!proj) {
    const li = document.createElement("li");
    li.style.color = "var(--text-muted)";
    li.textContent = "(No project selected)";
    projectLinksList.appendChild(li);
    return;
  }

  const links = Array.isArray(proj.links) ? proj.links : [];
  if (!links.length) {
    const li = document.createElement("li");
    li.style.color = "var(--text-muted)";
    li.textContent = "(No links added yet)";
    projectLinksList.appendChild(li);
    return;
  }

  const sortedLinks = links.slice().sort((a, b) => {
    const at = (a.title || "").toLowerCase();
    const bt = (b.title || "").toLowerCase();
    if (at < bt) return -1;
    if (at > bt) return 1;
    return 0;
  });

  sortedLinks.forEach((link) => {
    const li = document.createElement("li");
    li.style.display = "flex";
    li.style.alignItems = "center";
    li.style.justifyContent = "space-between";
    li.style.gap = "6px";
    li.style.marginBottom = "2px";

    const a = document.createElement("a");
    a.href = link.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = link.title || link.url;
    a.style.color = "var(--accent)";
    a.style.textDecoration = "none";

    const btnWrap = document.createElement("span");

    const delBtn = document.createElement("button");
    delBtn.textContent = "×";
    delBtn.title = "Remove this link";
    delBtn.style.borderRadius = "999px";
    delBtn.style.border = "1px solid var(--border-subtle)";
    delBtn.style.background = "#050814";
    delBtn.style.color = "var(--text)";
    delBtn.style.cursor = "pointer";
    delBtn.style.padding = "0 6px";
    delBtn.style.lineHeight = "16px";

    delBtn.addEventListener("click", () => {
      const projNow = getCurrentProjectObj();
      if (!projNow) return;

      const originalIndex = (projNow.links || []).findIndex(
        (l) => l.title === link.title && l.url === link.url
      );
      if (originalIndex >= 0) {
        projNow.links = projNow.links.slice();
        projNow.links.splice(originalIndex, 1);
        scheduleSave();
        renderProjectLinks();
      }
    });

    btnWrap.appendChild(delBtn);

    li.appendChild(a);
    li.appendChild(btnWrap);
    projectLinksList.appendChild(li);
  });
}

// ---- Last project helpers ----
function saveLastProjectToLocalStorage() {
  if (!state.currentProjectKey || !state.currentProjectName) return;
  const payload = {
    key: state.currentProjectKey,
    name: state.currentProjectName,
    basePath: DATABASE_BASE_PATH
  };
  try {
    localStorage.setItem(
      LAST_PROJECT_STORAGE_KEY,
      JSON.stringify(payload)
    );
  } catch (e) {
    console.warn("Could not save last project to localStorage:", e);
  }
}

async function restoreLastProjectForCurrentBasePath() {
  let raw;
  try {
    raw = localStorage.getItem(LAST_PROJECT_STORAGE_KEY);
  } catch (e) {
    console.warn("Could not read last project from localStorage:", e);
    return;
  }
  if (!raw) return;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }

  if (!parsed.key || !parsed.name) return;
  if (parsed.basePath && parsed.basePath !== DATABASE_BASE_PATH) return;

  state.currentProjectKey = parsed.key;
  state.currentProjectName = parsed.name;
  projectNameInput.value = parsed.name;

  try {
    await loadProjectFromFirebase(parsed.key, parsed.name);
    rerenderForCurrentProject();
  } catch (err) {
    console.error(
      "Error restoring last project from Firebase:",
      err
    );
  }
}

// ---- Image resize helper ----
function resizeImageToJpeg(file, maxWidth = 2048, quality = 0.9) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();

      img.onload = () => {
        let w = img.width;
        let h = img.height;

        if (w > maxWidth) {
          const scale = maxWidth / w;
          w = maxWidth;
          h = Math.round(h * scale);
        }

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Canvas toBlob() returned null"));
              return;
            }
            resolve(blob);
          },
          "image/jpeg",
          quality
        );
      };

      img.onerror = () => {
        reject(
          new Error(
            "Browser couldn't decode this file (HEIC may not be supported in this browser)."
          )
        );
      };

      img.src = reader.result;
    };

    reader.onerror = () => {
      reject(
        reader.error ||
        new Error("FileReader failed while reading image.")
      );
    };

    reader.readAsDataURL(file);
  });
}

// ---- Base path discovery / switching ----
async function fetchAvailableBasePaths() {
  try {
    const rootRef = ref(database);
    const snap = await get(rootRef);
    if (!snap.exists()) return [];

    const data = snap.val();
    const paths = [];

    Object.keys(data).forEach((key) => {
      const node = data[key];
      if (node && typeof node === "object" && node.walmartProjectTracker) {
        paths.push(key);
      }
    });

    paths.sort();
    return paths;
  } catch (err) {
    console.error("Error fetching available base paths:", err);
    return [];
  }
}

async function switchDatabaseBasePath(newBase) {
  if (!newBase) return;

  DATABASE_BASE_PATH = newBase;
  console.log("[admin] switched DATABASE_BASE_PATH to", DATABASE_BASE_PATH);

  state.projects = {};

  if (state.currentProjectKey && state.currentProjectName) {
    try {
      await loadProjectFromFirebase(
        state.currentProjectKey,
        state.currentProjectName
      );
    } catch (err) {
      console.error("Error loading project for new base path:", err);
    }
  } else {
    await restoreLastProjectForCurrentBasePath();
  }

  rerenderForCurrentProject();
}

function updateCameraStats() {
  const proj = getCurrentProjectObj();

  const camDoneSpan = document.getElementById("camDoneCount");
  const camNotDoneSpan = document.getElementById("camNotDoneCount");
  const sidebarSummarySpan = document.getElementById(
    "sidebarCameraSummary"
  );

  if (!proj) {
    if (camDoneSpan) camDoneSpan.textContent = "0";
    if (camNotDoneSpan) camNotDoneSpan.textContent = "0";
    if (sidebarSummarySpan)
      sidebarSummarySpan.textContent = "0 done / 0 total";
    return;
  }

  const cameras = proj.cameras || {};
  let done = 0;
  let notDone = 0;

  Object.values(cameras).forEach((cam) => {
    if (cam && cam.done) done++;
    else notDone++;
  });

  const total = done + notDone;

  if (camDoneSpan) camDoneSpan.textContent = done;
  if (camNotDoneSpan) camNotDoneSpan.textContent = notDone;

  if (sidebarSummarySpan) {
    sidebarSummarySpan.textContent = `${done} done / ${total} total`;
  }
}

// ----- Event bindings -----

// Allow pressing Enter to trigger "Set"
projectNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    setProjectBtn.click();
  }
});

// 🔎 global search listener (cameras + alarms + speakers)
if (cameraSearchInputEl) {
  cameraSearchInputEl.addEventListener("input", () => {
    globalSearchQuery = cameraSearchInputEl.value || "";
    renderCameraPanel();
    renderAlarmPanel();
    renderSpeakersPanel();
  });
}

detailTabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    detailTabButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const panel = btn.dataset.panel;
    alarmPanelEl.classList.add("hidden");
    cameraPanelEl.classList.add("hidden");
    speakersPanelEl.classList.add("hidden");
    if (panel === "alarm") alarmPanelEl.classList.remove("hidden");
    if (panel === "cameras") cameraPanelEl.classList.remove("hidden");
    if (panel === "speakers") speakersPanelEl.classList.remove("hidden");
  });
});

if (hideDoneCamerasCheckbox) {
  hideDoneCamerasCheckbox.addEventListener("change", () => {
    hideDoneCameras = hideDoneCamerasCheckbox.checked;
    renderCameraPanel();
  });
}

if (hideDoneAlarmsCheckbox) {
  hideDoneAlarmsCheckbox.addEventListener("change", () => {
    hideDoneAlarms = hideDoneAlarmsCheckbox.checked;
    renderAlarmPanel();
  });
}

// Set project
setProjectBtn.addEventListener("click", async () => {
  const name = projectNameInput.value.trim();
  if (!name) {
    alert("Enter a project name or store ID (e.g. WM1234 – City).");
    return;
  }
  const key = sanitizeProjectKey(name);
  state.currentProjectName = name;
  state.currentProjectKey = key;

  try {
    await loadProjectFromFirebase(key, name);
  } catch (err) {
    console.error("Error loading project from Firebase", err);
    alert("Could not load project from Firebase. Check console/logs.");
    return;
  }

  saveLastProjectToLocalStorage();

  rerenderForCurrentProject();
});

// Clear checklist (keep notes + images)
clearProjectBtn.addEventListener("click", () => {
  if (!state.currentProjectKey) {
    alert("No project selected.");
    return;
  }
  if (
    !confirm(
      "Clear all scope checklist checkmarks for the current project? Notes, alarm points, and cameras will be kept."
    )
  )
    return;
  const proj = getCurrentProjectObj();
  proj.tasks = {};
  scheduleSave();
  rerenderForCurrentProject();
});

// Section notes – save on blur (click-out)
sectionNotesEl.addEventListener("blur", () => {
  const proj = getCurrentProjectObj();
  if (!proj || !activeSectionId) return;
  proj.notes[activeSectionId] = sectionNotesEl.value;
  scheduleSave();
});

// Alarm form
alarmFormEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const proj = getCurrentProjectObj();
  if (!proj) {
    alert("Set a project first.");
    return;
  }
  const num = alarmPointNumberEl.value.trim();
  const name = alarmPointNameEl.value.trim();
  if (!num || !name) {
    alert("Point # and name are required.");
    return;
  }
  if (!proj.alarmPoints[num]) proj.alarmPoints[num] = {};
  proj.alarmPoints[num].name = name;
  proj.alarmPoints[num].done = proj.alarmPoints[num].done || false;
  scheduleSave();
  alarmPointNumberEl.value = "";
  alarmPointNameEl.value = "";
  renderAlarmPanel();
});

// Camera form
cameraFormEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const proj = getCurrentProjectObj();
  if (!proj) {
    alert("Set a project first.");
    return;
  }
  const id = cameraIdEl.value.trim();
  const name = cameraNameEl.value.trim();
  if (!id || !name) {
    alert("Camera ID and name are required.");
    return;
  }
  if (!proj.cameras[id]) proj.cameras[id] = {};
  proj.cameras[id].name = name;
  proj.cameras[id].done = proj.cameras[id].done || false;
  scheduleSave();
  cameraIdEl.value = "";
  cameraNameEl.value = "";
  renderCameraPanel();
});

// Speaker form
speakerFormEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const proj = getCurrentProjectObj();
  if (!proj) {
    alert("Set a project first.");
    return;
  }

  const num = speakerNumberEl.value.trim();
  const name = speakerNameEl.value.trim();

  if (!num || !name) {
    alert("Speaker # and name are required.");
    return;
  }

  if (!proj.speakers[num]) proj.speakers[num] = {};
  proj.speakers[num].name = name;
  proj.speakers[num].note = proj.speakers[num].note || "";

  scheduleSave();

  speakerNumberEl.value = "";
  speakerNameEl.value = "";
  renderSpeakersPanel();
});

// Project links form – add link
if (projectLinksForm) {
  projectLinksForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const proj = getCurrentProjectObj();
    if (!proj) {
      alert("Set a project first.");
      return;
    }
    const title = linkTitleInput.value.trim();
    const url = linkUrlInput.value.trim();
    if (!title || !url) {
      alert("Title and URL are required.");
      return;
    }

    try {
      new URL(url);
    } catch {
      alert("Please enter a valid URL (include https://).");
      return;
    }

    proj.links = proj.links || [];
    proj.links.push({ title, url });
    linkTitleInput.value = "";
    linkUrlInput.value = "";
    scheduleSave();
    renderProjectLinks();
  });
}

// Upload alarm/camera/task/speaker image
imageUploadInputEl.addEventListener("change", async () => {
  const file = imageUploadInputEl.files[0];
  if (!file || !pendingUploadTarget || !state.currentProjectKey) return;

  const projKey = state.currentProjectKey;
  const { kind, key } = pendingUploadTarget;
  pendingUploadTarget = null;

  try {
    console.log("[upload] start", {
      projKey,
      kind,
      key,
      fileName: file.name,
      basePath: DATABASE_BASE_PATH
    });

    const resizedBlob = await resizeImageToJpeg(file, 2048, 0.9);

    const proj = getCurrentProjectObj();

    let target;

    if (kind === "alarm") {
      if (!proj.alarmPoints[key]) proj.alarmPoints[key] = {};
      target = proj.alarmPoints[key];
    } else if (kind === "camera") {
      if (!proj.cameras[key]) proj.cameras[key] = {};
      target = proj.cameras[key];
    } else if (kind === "task") {
      if (!proj.tasks[key] || typeof proj.tasks[key] !== "object") {
        const existingVal = proj.tasks[key];
        proj.tasks[key] = {
          done: !!(
            existingVal &&
            (typeof existingVal === "object"
              ? existingVal.done
              : existingVal)
          )
        };
      }
      target = proj.tasks[key];
    } else if (kind === "speaker") {
      if (!proj.speakers[key]) proj.speakers[key] = {};
      target = proj.speakers[key];
    } else {
      alert("Unknown upload target type.");
      return;
    }

    const existingImages = normalizeImagesArray(target);
    const existingCount = existingImages.length;

    const originalBase = file.name.replace(/\.[^/.]+$/, "");

    const indexSuffix =
      existingCount > 0 ? `_${existingCount + 1}` : "";
    const fileName = `${key}_${originalBase}${indexSuffix}.jpg`;

    const path = `${DATABASE_BASE_PATH}/images/walmartProjectTracker/${projKey}/${kind}/${fileName}`;

    console.log("[upload] storage path:", path);

    if (!storage || !storageRef) {
      console.error("[upload] storage or storageRef missing", {
        storage,
        storageRef
      });
      alert(
        "Storage is not initialized correctly. Check firebase-init.js exports."
      );
      return;
    }

    const sRef = storageRef(storage, path);
    await uploadBytes(sRef, resizedBlob, { contentType: "image/jpeg" });
    const url = await getDownloadURL(sRef);

    console.log("[upload] upload complete, url =", url);

    const imagesArr = normalizeImagesArray(target);
    imagesArr.push({ url, path, note: "" });

    if (kind === "alarm") {
      renderAlarmPanel();
    } else if (kind === "camera") {
      renderCameraPanel();
    } else if (kind === "task") {
      renderSection(activeSectionId);
    } else if (kind === "speaker") {
      renderSpeakersPanel();
    }

    scheduleSave();
  } catch (err) {
    console.error("Image upload failed", err);

    let msg = "Image upload failed.";
    if (err.code === "storage/unauthorized") {
      msg +=
        " Your Firebase Storage rules may not allow writing to this path.";
    } else if (err.message && err.message.includes("HEIC")) {
      msg +=
        " If this was a HEIC file, your browser might not support decoding that format.";
    }

    alert(msg);
  }
});

// ----- Init camera column toggles -----
initCameraColumnToggles();

// ----- Auth / init -----
onAuthStateChanged(auth, async (user) => {
  // Switch base path based on auth status
  DATABASE_BASE_PATH = user ? `${user.uid}` : "public";
  console.log("[auth] DATABASE_BASE_PATH:", DATABASE_BASE_PATH);

  // Editing is always allowed now (no lock)

  if (state.currentProjectKey && state.currentProjectName) {
    try {
      await loadProjectFromFirebase(
        state.currentProjectKey,
        state.currentProjectName
      );
    } catch (err) {
      console.error("Error reloading project after auth change:", err);
    }
  } else {
    await restoreLastProjectForCurrentBasePath();
  }

  sectionOrder = loadSectionOrderFromLocalStorage();
  await loadSections(!!user);
});

console.log("[auth:init] DATABASE_BASE_PATH:", DATABASE_BASE_PATH);
