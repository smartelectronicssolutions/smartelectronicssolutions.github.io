export function createQuizModule({
    database,
    ref,
    onValue,
    set,
    remove,
    state,
    update,
    rewardCorrect,
    punishWrong,
    renderHUD,
    persistPlayer,
    basePathGetter
}) {
    let questions = [];
    let currentQuestionIndex = 0;
    let answeredQuestions = {};
    let currentCategory = null;

    const quizSection = document.getElementById('quizSection');
    const LAST_TOPIC_KEY = "knowledgeRpg_lastTopic";

    /* ================= PATHS ================= */

    function progressPath() {
        return `${basePathGetter()}/gameData/progress`;
    }

    /* ================= LOAD PROGRESS ================= */

    function loadQuizProgress() {
        onValue(ref(database, progressPath()), snap => {
            answeredQuestions = snap.val() || {};
        });
    }

    function saveProgress() {
        return set(ref(database, progressPath()), answeredQuestions);
    }

    /* ================= RESET ================= */

    function resetQuizProgress() {

        if (!confirm("Reset ALL quiz progress?")) return;

        answeredQuestions = {};

        set(ref(database, progressPath()), {})
            .then(() => {
                alert("Quiz progress reset.");

                if (currentCategory) {
                    loadCategory(currentCategory);
                }

                renderRecoveryShop();
            });
    }

    /* ================= DROPDOWN ================= */

    function populateQuizIndex() {

        const select = document.getElementById('quizTopicSelect');
        if (!select) return;

        select.innerHTML = `<option value="">-- Choose Topic --</option>`;

        onValue(ref(database, 'share/questions'), snapshot => {

            const data = snapshot.val();
            if (!data) return;

            Object.keys(data).forEach(description => {

                const option = document.createElement('option');
                option.value = description;
                option.textContent = description;

                select.appendChild(option);
            });

            const savedTopic = localStorage.getItem(LAST_TOPIC_KEY);

            if (savedTopic && data[savedTopic]) {
                select.value = savedTopic;
                loadCategory(savedTopic);
            }

        }, { onlyOnce: true });

        select.onchange = (e) => {
            const topic = e.target.value;
            if (!topic) return;

            localStorage.setItem(LAST_TOPIC_KEY, topic);
            loadCategory(topic);
        };

        /* Wire reset button */
        const resetBtn = document.getElementById('resetProgressBtn');
        if (resetBtn) {
            resetBtn.onclick = resetQuizProgress;
        }
    }

    /* ================= LOAD CATEGORY ================= */

    function loadCategory(description) {

        currentCategory = description;

        onValue(ref(database, `share/questions/${description}`), snapshot => {

            const data = snapshot.val();
            if (!data) return;

            questions = [];
            const allTopicQuestions = [];

            Object.entries(data).forEach(([id, value]) => {

                const full = { id, description, ...value };
                allTopicQuestions.push(full);

                if (answeredQuestions[id]?.status === 'answered') return;
                if (answeredQuestions[id]?.status === 'incorrect') return;

                questions.push(full);
            });

            currentQuestionIndex = 0;

            renderTopicStats(allTopicQuestions);

            if (questions.length > 0) {
                renderQuestion();
            } else {
                quizSection.innerHTML = "<p>No available questions in this topic.</p>";
            }

            renderRecoveryShop();

        }, { onlyOnce: true });
    }

    /* ================= STATS ================= */

    function renderTopicStats(allTopicQuestions) {

        const statsEl = document.getElementById('quizStats');
        if (!statsEl) return;

        const total = allTopicQuestions.length;

        const correct = allTopicQuestions.filter(q =>
            answeredQuestions[q.id]?.status === 'answered'
        ).length;

        const incorrect = allTopicQuestions.filter(q =>
            answeredQuestions[q.id]?.status === 'incorrect'
        ).length;

        const remaining = total - correct - incorrect;

        const percent = total > 0
            ? Math.round((correct / total) * 100)
            : 0;

        statsEl.innerHTML = `
            Remaining: ${remaining} |
            Incorrect: ${incorrect} |
            Completed: ${percent}%
        `;
    }

    /* ================= RENDER QUESTION ================= */

    function renderQuestion() {

        const q = questions[currentQuestionIndex];
        if (!q) {
            quizSection.innerHTML = "<p>No more questions.</p>";
            return;
        }

        quizSection.innerHTML = `
        <p><strong>${q.description}</strong></p>
        <p>${q.question}</p>
    `;

        if (q.options) {
            q.options.forEach(option => {

                const label = document.createElement('label');
                label.innerHTML = `
                <input type="checkbox" name="answer" value="${option}">
                ${option}
            `;
                quizSection.appendChild(label);
                quizSection.appendChild(document.createElement('br'));
            });
        }

        const btn = document.createElement('button');
        btn.textContent = "Submit Answer";
        btn.onclick = submitAnswer;
        quizSection.appendChild(btn);
    }

    /* ================= SUBMIT ================= */

    function submitAnswer() {

        const q = questions[currentQuestionIndex];
        if (!q) return;

        const selected = [...document.querySelectorAll('input[name="answer"]:checked')]
            .map(el => el.value);

        if (!selected.length) {
            alert("Select at least one answer.");
            return;
        }

        const correctAnswers = Array.isArray(q.correctAnswer)
            ? q.correctAnswer
            : [q.correctAnswer];

        const isCorrect =
            selected.length === correctAnswers.length &&
            selected.every(val => correctAnswers.includes(val));

        if (isCorrect) {

            answeredQuestions[q.id] = {
                status: 'answered',
                description: q.description,
                question: q.question
            };

            rewardCorrect(q.description);
            alert("Correct!");

        } else {

            answeredQuestions[q.id] = {
                status: 'incorrect',
                description: q.description,
                question: q.question
            };

            punishWrong(q.description);
            alert("Incorrect!");
        }

        saveProgress();
        renderHUD();
        persistPlayer();

        loadCategory(currentCategory);
    }

    /* ================= RECOVERY SHOP ================= */

    function renderRecoveryShop() {

        const container = document.getElementById('recoveryShop');
        if (!container || !currentCategory) return;

        container.innerHTML = "<h3>Recover Incorrect Questions</h3>";

        const incorrect = Object.entries(answeredQuestions)
            .filter(([_, data]) =>
                data.status === 'incorrect' &&
                data.description === currentCategory
            );

        if (!incorrect.length) {
            container.innerHTML += "<div class='hint'>No incorrect questions.</div>";
            return;
        }

        incorrect.forEach(([id, data]) => {

            const wrapper = document.createElement('div');
            wrapper.className = 'panel';
            wrapper.style.marginBottom = '8px';

            const title = document.createElement('div');
            title.innerHTML = `<strong>${data.question || id}</strong>`;

            const btn = document.createElement('button');
            btn.textContent = `Recover (Cost: 50 coins)`;
            btn.onclick = () => recoverQuestion(id);

            wrapper.appendChild(title);
            wrapper.appendChild(btn);

            container.appendChild(wrapper);
        });
    }

    function recoverQuestion(id) {

        const COST = 5000;

        if (state.coins < COST) {
            alert("Not enough coins.");
            return;
        }

        state.coins -= COST;

        delete answeredQuestions[id];

        saveProgress();
        renderHUD();
        persistPlayer();

        loadCategory(currentCategory);
    }

    /* ================= PUBLIC API ================= */

    return {
        loadQuizProgress,
        populateQuizIndex,
        resetQuizProgress
    };
}

export function createMathModule({
    database,
    ref,
    get,
    set,
    update,
    state,
    renderHUD,
    persistPlayer,
    basePathGetter,
        levelFromXP

}) {

    function mathPath() {
        return `${basePathGetter()}/gameData/mathProgress`;
    }

    /* ================= MATH GAME ================= */

    let mathNum1 = 0;
    let mathNum2 = 0;
    let mathScore = 0;
    let answeredSet = new Set();
    let mathStartTime = null;
    let mathEndTime = null;

    const CORRECT_REWARD = 500;
    const WRONG_COST = 200;
    let mathFlash = null; // { key: "3_7", color: "green"|"red", until: number }
    const FLASH_MS = 500;

    function setMathFlash(key, color) {
        mathFlash = { key, color, until: Date.now() + FLASH_MS };
        generateMathTable(); // re-render to show flash immediately

        setTimeout(() => {
            // only clear if it's the same flash (avoid race)
            if (mathFlash && mathFlash.key === key && Date.now() >= mathFlash.until) {
                mathFlash = null;
                generateMathTable();
            }
        }, FLASH_MS + 20);
    }

    function generateMathTable() {

        const table = document.getElementById('mathTable');
        table.innerHTML = '';

        for (let i = 0; i <= 9; i++) {

            const row = table.insertRow();

            for (let j = 0; j <= 9; j++) {

                const cell = row.insertCell();
                cell.style.width = '64px';
                cell.style.height = '64px';
                cell.style.textAlign = 'center';
                cell.style.border = '1px solid #444';

                if (i === 0 && j > 0) {
                    cell.textContent = j;
                } else if (j === 0 && i > 0) {
                    cell.textContent = i;
                } else if (i > 0 && j > 0) {
                    const key = `${i}_${j}`;

                    // Base styling for multiply cells
                    cell.dataset.key = key;

                    // Show solved values
                    if (answeredSet.has(key)) {
                        cell.textContent = i * j;
                    } else {
                        cell.textContent = '';
                    }

                    // Highlight the CURRENT target cell (where answer goes)
                    if (i === mathNum1 && j === mathNum2 && !answeredSet.has(key)) {
                        cell.style.outline = '3px solid #d4af37'; // gold outline
                        cell.style.boxShadow = '0 0 10px rgba(212,175,55,.6)';
                    }

                    // Flash effect (red/green)
                    if (mathFlash && mathFlash.key === key && Date.now() < mathFlash.until) {
                        // Light flash background; keep text readable
                        cell.style.background = (mathFlash.color === 'green')
                            ? 'rgba(0, 255, 0, 0.25)'
                            : 'rgba(255, 0, 0, 0.25)';

                        cell.style.outline = (mathFlash.color === 'green')
                            ? '3px solid rgba(0,255,0,.9)'
                            : '3px solid rgba(255,0,0,.9)';
                    }
                }
            }
        }
    }

    function generateMathQuestion() {

        if (answeredSet.size >= 81) {
            endMathGame();
            return;
        }

        do {
            mathNum1 = Math.floor(Math.random() * 9) + 1;
            mathNum2 = Math.floor(Math.random() * 9) + 1;
        } while (answeredSet.has(`${mathNum1}_${mathNum2}`));

        document.getElementById('mathPrompt').innerHTML =
            `What is <strong>${mathNum1} × ${mathNum2}</strong>?`;

        document.getElementById('mathAnswerInput').value = '';
        generateMathTable(); // ✅ move target highlight

    }

    function updateMathStats() {
        document.getElementById('mathStats').innerHTML =
            `Solved: ${answeredSet.size} / 81`;
    }

    async function submitMathAnswer() {
        const input = document.getElementById('mathAnswerInput');
        const answer = parseInt(input.value);

        if (isNaN(answer)) return;

        const correct = answer === mathNum1 * mathNum2;
        const key = `${mathNum1}_${mathNum2}`;

        if (correct) {
            setMathFlash(key, 'green');

            if (!mathStartTime) {
                mathStartTime = Date.now();
                await persistMathStartTime();
            }

            answeredSet.add(key);
            mathScore++;

            state.coins += CORRECT_REWARD;
            state.xp += 3;
        } else {
            setMathFlash(key, 'red');
            state.coins = Math.max(0, state.coins - WRONG_COST);
        } state.level = levelFromXP(state.xp);

        renderHUD();
        persistPlayer();

        generateMathTable();
        updateMathStats();
        generateMathQuestion();
        persistMath();
    }

    async function startMathGame() {

        await loadMathProgress();

        const snap = await get(ref(database, mathPath()));
        const data = snap.val();

        if (data?.bestDurationMs) {
            const bestSeconds = Math.floor(data.bestDurationMs / 1000);
            const bestMin = Math.floor(bestSeconds / 60);
            const bestSec = bestSeconds % 60;

            document.getElementById('mathStats').innerHTML =
                `🏆 Top Time: ${bestMin}m ${bestSec}s`;
        }
    }

    async function resetMathGame() {

        const snap = await get(ref(database, mathPath()));
        const existing = snap.val() || {};

        const best = existing.bestDurationMs || null;

        answeredSet.clear();
        mathScore = 0;
        mathStartTime = null;
        mathEndTime = null;

        await set(ref(database, mathPath()), {
            answered: [],
            score: 0,
            startTime: null,
            endTime: null,
            durationMs: null,
            bestDurationMs: best
        });

        generateMathTable();
        updateMathStats();
        generateMathQuestion();

        if (best) {
            const bestSeconds = Math.floor(best / 1000);
            const bestMin = Math.floor(bestSeconds / 60);
            const bestSec = bestSeconds % 60;

            document.getElementById('mathStats').innerHTML =
                `🏆 Top Time: ${bestMin}m ${bestSec}s`;
        }
    }

    async function endMathGame() {

        if (!mathStartTime) return;

        const snap = await get(ref(database, mathPath()));
        const existing = snap.val() || {};

        mathEndTime = Date.now();
        const totalMs = mathEndTime - mathStartTime;

        const totalSeconds = Math.floor(totalMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        const best = existing.bestDurationMs;

        let isNewBest = false;

        if (!best || totalMs < best) {
            isNewBest = true;
        }

        await update(ref(database, mathPath()), {
            startTime: mathStartTime,
            endTime: mathEndTime,
            durationMs: totalMs,
            bestDurationMs: isNewBest ? totalMs : best
        });

        const bestTime = isNewBest ? totalMs : best;

        const bestSeconds = Math.floor(bestTime / 1000);
        const bestMin = Math.floor(bestSeconds / 60);
        const bestSec = bestSeconds % 60;

        document.getElementById('mathPrompt').innerHTML =
            `All problems solved!<br>
         Final Time: ${minutes}m ${seconds}s<br>
         <strong>Top Time: ${bestMin}m ${bestSec}s</strong>
         ${isNewBest ? "<br>🏆 NEW RECORD!" : ""}`;

        document.getElementById('mathStats').innerHTML = "";
    }

    function persistMath() {
        return update(ref(database, mathPath()), {
            answered: Array.from(answeredSet),
            score: mathScore
        });
    }

    async function loadMathProgress() {
        const snap = await get(ref(database, mathPath()));
        const data = snap.val();

        if (!data) {
            answeredSet = new Set();
            mathScore = 0;
            mathStartTime = null;
            mathEndTime = null;

            generateMathTable();
            updateMathStats();
            generateMathQuestion();
            return;
        }

        answeredSet = new Set(data.answered || []);
        mathScore = data.score || 0;

        // ✅ Restore start time if this run is still in progress
        if (data.durationMs) {
            // Completed run: don't treat next correct as continuing old run
            mathStartTime = null;
            mathEndTime = data.endTime ?? null;

            const totalSeconds = Math.floor(data.durationMs / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;

            let bestDisplay = "";
            if (data.bestDurationMs) {
                const bestSeconds = Math.floor(data.bestDurationMs / 1000);
                const bestMin = Math.floor(bestSeconds / 60);
                const bestSec = bestSeconds % 60;
                bestDisplay = `<br><strong>Top Time: ${bestMin}m ${bestSec}s</strong>`;
            }

            document.getElementById('mathPrompt').innerHTML =
                `All problems solved!<br>
                    Final Time: ${minutes}m ${seconds}s
                    ${bestDisplay}`;

            document.getElementById('mathStats').innerHTML = "";
            return;
        }

        // In-progress run
        mathStartTime = data.startTime ?? null;
        mathEndTime = null;

        generateMathTable();
        updateMathStats();
        generateMathQuestion();
    }

    async function persistMathStartTime() {
        if (!mathStartTime) return;
        await update(ref(database, mathPath()), {
            startTime: mathStartTime,
            endTime: null,
            durationMs: null
        });
    }

    /* ================= PUBLIC API ================= */

    return {
        startMathGame,
        submitMathAnswer,
        resetMathGame
    };
}