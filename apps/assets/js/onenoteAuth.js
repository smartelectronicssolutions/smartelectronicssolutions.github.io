// Replace these with your own Microsoft Azure app registration values
const clientId = "YOUR_MICROSOFT_CLIENT_ID";
const tenantId = "YOUR_MICROSOFT_TENANT_ID";
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
        console.log("Access Token:", accessToken);
        alert("Successfully logged in!");
        history.replaceState(null, null, window.location.pathname);
    } else {
        alert("Unable to retrieve access token. Check your Azure configuration.");
    }
}

function initializeAccessToken() {
    if (window.location.hash) {
        extractAccessTokenFromUrl();
    }

    if (!accessToken) {
        accessToken = storage.getAccessToken();
        if (accessToken) {
            console.log("Using stored access token.");
        } else {
            console.log("No access token found. Please log in.");
        }
    }
}

function loginToMicrosoft() {
    const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(
        redirectUri
    )}&scope=${encodeURIComponent("Notes.Create Notes.ReadWrite User.Read")}&response_mode=fragment`;
    window.location.href = authUrl;
}

function logoutFromMicrosoft() {
    storage.clearAccessToken();
    accessToken = null;
    alert("Logged out successfully.");
}

function setupAuthEventListeners() {
    document.getElementById("loginButton")?.addEventListener("click", loginToMicrosoft);
    document.getElementById("logoutButton")?.addEventListener("click", logoutFromMicrosoft);
}

initializeAccessToken();
setupAuthEventListeners();
