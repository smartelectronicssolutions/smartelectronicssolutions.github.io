export function createRoomEditor({
    database,
    ref,
    update,
    getTile,
    getGrid
}) {

    let currentRoom = null;
    let roomsRef = null;
    let roomData = null;

    const canvas = document.getElementById('editorCanvas');
    const ctx = canvas.getContext('2d');

    ctx.imageSmoothingEnabled = false;

    /* ================= BACKGROUND ================= */

    const bgImage = new Image();

    let bgX = 0;
    let bgY = 0;
    let bgWidth = 0;
    let bgHeight = 0;

    let draggingBg = false;
    let resizingBg = false;
    let dragStart = null;

    canvas.addEventListener("contextmenu", e => e.preventDefault());

    /* ================= OPEN ================= */

    function open(roomName, roomsData, basePath) {

        currentRoom = roomName;
        roomsRef = `${basePath}/gameData/rooms/${roomName}`;

        roomData = JSON.parse(JSON.stringify(roomsData[roomName]));

        if (!roomData.walls) roomData.walls = [];

        const { x: GRID_X, y: GRID_Y } = getGrid();
        const TILE = getTile();

        canvas.width = GRID_X * TILE;
        canvas.height = GRID_Y * TILE;

        if (roomData.bg) {
            bgImage.src = roomData.bg;
            bgWidth = canvas.width;
            bgHeight = canvas.height;
        }

        draw();
    }

    /* ================= DRAW ================= */

    function draw() {

        const { x: GRID_X, y: GRID_Y } = getGrid();
        const TILE = getTile();

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Background
        if (bgImage.complete && bgImage.naturalWidth > 0) {
            ctx.drawImage(bgImage, bgX, bgY, bgWidth, bgHeight);
        }

        // Grid
        for (let y = 0; y < GRID_Y; y++) {
            for (let x = 0; x < GRID_X; x++) {

                ctx.strokeStyle = "rgba(255,255,255,0.08)";
                ctx.strokeRect(x * TILE, y * TILE, TILE, TILE);

                const hasWall = roomData.walls.some(w => w.x === x && w.y === y);

                if (hasWall) {
                    ctx.fillStyle = "rgba(255,0,0,0.5)";
                    ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
                }
            }
        }

        // Resize handle
        ctx.fillStyle = "#fff";
        ctx.fillRect(bgX + bgWidth - 10, bgY + bgHeight - 10, 10, 10);
    }

    /* ================= TILE ================= */

    function getTilePos(e) {

        const rect = canvas.getBoundingClientRect();

        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;

        const TILE = getTile();

        return {
            x: Math.floor(canvasX / TILE),
            y: Math.floor(canvasY / TILE)
        };
    }

    /* ================= MOUSE ================= */

    canvas.addEventListener("mousedown", e => {

        const { x: GRID_X, y: GRID_Y } = getGrid();
        const TILE = getTile();

        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // Resize handle
        if (
            mx > bgX + bgWidth - 10 &&
            mx < bgX + bgWidth &&
            my > bgY + bgHeight - 10 &&
            my < bgY + bgHeight
        ) {
            resizingBg = true;
            dragStart = { x: mx, y: my };
            return;
        }

        // Drag background (SHIFT)
        if (
            e.shiftKey &&
            mx > bgX &&
            mx < bgX + bgWidth &&
            my > bgY &&
            my < bgY + bgHeight
        ) {
            draggingBg = true;
            dragStart = { x: mx - bgX, y: my - bgY };
            return;
        }

        const { x, y } = getTilePos(e);

        if (x < 0 || x >= GRID_X || y < 0 || y >= GRID_Y) return;

        if (e.button === 2) {
            roomData.walls = roomData.walls.filter(w => !(w.x === x && w.y === y));
        } else {
            const exists = roomData.walls.some(w => w.x === x && w.y === y);
            if (!exists) roomData.walls.push({ x, y });
        }

        draw();
    });

    canvas.addEventListener("mousemove", e => {

        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        if (draggingBg) {
            bgX = mx - dragStart.x;
            bgY = my - dragStart.y;
            draw();
        }

        if (resizingBg) {
            bgWidth += mx - dragStart.x;
            bgHeight += my - dragStart.y;
            dragStart = { x: mx, y: my };
            draw();
        }
    });

    canvas.addEventListener("mouseup", () => {
        draggingBg = false;
        resizingBg = false;
    });

    /* ================= SAVE ================= */

    async function save() {

        if (!roomsRef || !roomData) return;

        await update(ref(database, roomsRef), {
            walls: roomData.walls
        });
    }

    return { open, save };
}