// Replace these with your own Microsoft Azure app registration values
const clientId = "YOUR_MICROSOFT_CLIENT_ID";
const tenantId = "YOUR_MICROSOFT_TENANT_ID";
const CONFIG_OD = {
    SHARED_DRIVE_ID: 'YOUR_ONEDRIVE_SHARED_DRIVE_ID'
};

const redirectUri = `${window.location.origin}${window.location.pathname}`;
let accessToken;

const storage = {
    setAccessToken: (token) => localStorage.setItem("accessToken", token),
    getAccessToken: () => localStorage.getItem("accessToken"),
    clearAccessToken: () => localStorage.removeItem("accessToken")
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
        accessToken = storage.getAccessToken();
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

    msControls.style.display = "block";

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
    if (!accessToken) return null;

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
