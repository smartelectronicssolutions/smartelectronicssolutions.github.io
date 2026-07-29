function checkForTokenAndRedirect() {
    const tokenDataJSON = localStorage.getItem("sToken");
    if (tokenDataJSON) {
        const tokenData = JSON.parse(tokenDataJSON);
        const currentTime = new Date().getTime();
        if (tokenData.sToken && tokenData.expiresAt && tokenData.expiresAt > currentTime) {
            // Token is present and not expired
            return;
        }
    }
    alert("Login To Continue...");
    window.location.href = "index.html";
}
checkForTokenAndRedirect();
