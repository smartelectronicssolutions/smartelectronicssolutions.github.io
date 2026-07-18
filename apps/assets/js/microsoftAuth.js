const clientId = "f5ef88e6-7af0-40af-ae6a-5a9d3342360e";
const tenantId = "f9cb31b8-4d87-4d78-89f4-636d4e6f6509";
const CONFIG_OD = {
    SHARED_DRIVE_ID: 'b!3mJ2DZSHdkmBrOccfkDkBt3Eklx5UvdMlDz0bmgGRktCiH2Pzkr5TbiD0DhegSHo'
};

const redirectUri = `${window.location.origin}${window.location.pathname}`;
let accessToken;

// Keep the MS Graph token in sessionStorage (per-tab, cleared on tab close)
// instead of localStorage, so an XSS can't scrape a persisted live OneDrive
// token off disk. It still survives in-tab navigation between the online apps.
// Purge any token left behind by the old localStorage-based flow.
try { localStorage.removeItem("accessToken"); } catch (e) { /* ignore */ }

const storage = {
    setAccessToken: (token) => sessionStorage.setItem("accessToken", token),
    getAccessToken: () => sessionStorage.getItem("accessToken"),
    clearAccessToken: () => sessionStorage.removeItem("accessToken")
};

function extractAccessTokenFromUrl() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const token = params.get("access_token");

    if (token) {
        accessToken = token;
        storage.setAccessToken(token);
        if (!sessionStorage.getItem("loginNotified")) {
            alert("Successfully logged in!");
            sessionStorage.setItem("loginNotified", "true");
        }
        history.replaceState(null, null, window.location.pathname);
    }
}

function initializeAccessToken() {
    if (window.location.hash) {
        extractAccessTokenFromUrl();
    }

    if (!accessToken) {
        const stored = storage.getAccessToken();
        if (stored && !isTokenExpired(stored)) {
            accessToken = stored;
        } else if (stored) {
            storage.clearAccessToken();
        }
    }

    setupAuthEventListeners();
    updateLoginStatusUI();
}

async function updateLoginStatusUI() {
    const statusEl = document.getElementById("loginStatus");
    const msControls = document.querySelector(".ms");
    const loginBtn = document.getElementById("loginButton");
    const logoutBtn = document.getElementById("logoutButton");

    if (!statusEl || !msControls) return;

    if (!accessToken) {
        statusEl.textContent = "Not logged in.";
        if (loginBtn) loginBtn.style.display = "inline-block";
        if (logoutBtn) logoutBtn.style.display = "none";
        return;
    }

    try {
        const user = await getUserInfo();
        if (user) {
            statusEl.textContent = `User: ${user.displayName || user.userPrincipalName}`;
            if (loginBtn) loginBtn.style.display = "none";
            if (logoutBtn) logoutBtn.style.display = "inline-block";
        } else {
            statusEl.textContent = "Logged Out.";
            if (loginBtn) loginBtn.style.display = "inline-block";
            if (logoutBtn) logoutBtn.style.display = "none";
        }
    } catch (e) {
        console.error("Error retrieving user info", e);
        statusEl.textContent = "Error loading user info.";
        if (loginBtn) loginBtn.style.display = "inline-block";
        if (logoutBtn) logoutBtn.style.display = "none";
    }
}

async function loginToMicrosoft() {
    const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(
        redirectUri
    )}&scope=${encodeURIComponent("Files.ReadWrite.All User.Read")}&response_mode=fragment`;
    window.location.href = authUrl;
}

async function getUserInfo() {
    if (!accessToken || isTokenExpired(accessToken)) {
        storage.clearAccessToken();
        accessToken = null;
        return null;
    }

    const res = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) {
        console.error("Failed to get user info", await res.text());
        return null;
    }

    return await res.json();
}

function logoutFromMicrosoft() {
    storage.clearAccessToken();
    accessToken = null;
    sessionStorage.removeItem("loginNotified");
    alert("Logged out successfully.");

    const statusEl = document.getElementById("loginStatus");
    const loginBtn = document.getElementById("loginButton");
    const logoutBtn = document.getElementById("logoutButton");

    if (statusEl) statusEl.textContent = "Not logged in.";
    if (loginBtn) loginBtn.style.display = "inline-block";
    if (logoutBtn) logoutBtn.style.display = "none";
}

function isLoggedIn() {
    return !!accessToken;
}

function setupAuthEventListeners() {
    document.getElementById("loginButton")?.addEventListener("click", loginToMicrosoft);
    document.getElementById("logoutButton")?.addEventListener("click", logoutFromMicrosoft);
}

function isTokenExpired(token) {
    if (!token) return true;
    try {
        const [, payload] = token.split('.');
        const { exp } = JSON.parse(atob(payload));
        return (Date.now() / 1000) > exp;
    } catch (err) {
        console.warn("Could not decode token", err);
        return true;
    }
}

initializeAccessToken();

export { accessToken, loginToMicrosoft, logoutFromMicrosoft, getUserInfo, isLoggedIn, isTokenExpired };