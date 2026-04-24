import { getDatabase, get, ref, set } from "./firebase-init.js";

export async function updateVisitCount(ipAddress) {
  const db = getDatabase();
  const sanitizedIP = ipAddress.replace(/\./g, "-");
  const visitCountRef = ref(db, "public/log/visitCount");
  const visitsLogRef = ref(db, `public/log/visits/${sanitizedIP}`);
  const visitTime = new Date().toISOString();
  const visitURL = window.location.href;

  try {
    const snapshot = await get(visitCountRef);
    let visitCount = snapshot.exists() ? snapshot.val() : 0;
    visitCount += 1;

    const counterElement = document.getElementById("visit-counter");
    if (counterElement) {
      counterElement.textContent = ` | Visits: ${visitCount}`;
    }

    await set(visitCountRef, visitCount);

    const logSnapshot = await get(visitsLogRef);
    const visitEntry = { time: visitTime, url: visitURL };

    if (logSnapshot.exists()) {
      const existingData = logSnapshot.val();
      if (!existingData.visits) existingData.visits = [];
      existingData.visits.push(visitEntry);
      await set(visitsLogRef, existingData);
    } else {
      await set(visitsLogRef, {
        ip: ipAddress,
        visits: [visitEntry],
      });
    }
  } catch (error) {
    console.error("Error logging visit:", error);
  }
}

export function getIP() {
  return fetch("https://api.ipify.org?format=json")
    .then((response) => response.json())
    .then((data) => data.ip)
    .catch((error) => {
      console.error("Error fetching IP address:", error);
      return "Unknown IP";
    });
}
