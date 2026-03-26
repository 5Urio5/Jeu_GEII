/* global DB, confetti, XLSX */

// ==========================================
// FIREBASE - CONNEXION BASE DE DONNÉES TEMPS RÉEL
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-analytics.js";
import { getDatabase, ref, push, get, set } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyA5xccoSduwPvhrnR769i_2Fhp9zW63C5M",
  authDomain: "jeu-geii.firebaseapp.com",
  databaseURL: "https://jeu-geii-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "jeu-geii",
  storageBucket: "jeu-geii.firebasestorage.app",
  messagingSenderId: "891268021614",
  appId: "1:891268021614:web:18ff4b03d9ea07f284157f",
  measurementId: "G-TMHEK2JKFS"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getDatabase(app);

// Exposition des fonctions au HTML
window.startQuiz = startQuiz;
window.goToStart = goToStart;
window.cancelQuiz = cancelQuiz;
window.showPodium = showPodium;
window.openModal = openModal;
window.closeModal = closeModal;
window.toggleKeep = toggleKeep;
window.resetPodium = resetPodium;
window.downloadExcel = downloadExcel;
window.showScreensaver = showScreensaver;
window.hideScreensaver = hideScreensaver;
window.goToNextQuestion = goToNextQuestion;

// ==========================================
// FONDS D'ÉCRAN DYNAMIQUES
// ==========================================
const bgImages = ['appmeas.jpg', 'intérieur_iut.jpg', 'iut.jpg', 'kart.jpg', 'platine.jpg'];

function setRandomBackground() {
    const randomImg = bgImages[Math.floor(Math.random() * bgImages.length)];
    document.body.style.backgroundImage = `url('${randomImg}')`;
}

// ==========================================
// VARIABLES DE JEU
// ==========================================
let playerName = "";
let currentQuestions = [];
let currentQIndex = 0;
let scoresPoints = {AII: 0, EME: 0, ESE: 0};
let scoresCount = {AII: 0, EME: 0, ESE: 0};
let scoreTotal = 0;
let currentStreak = 0;
let playerSessionDetails = []; 
let totalQuestions = 30; 
let timeLimit = 30; 
let timeLeft = timeLimit;
let timerInterval;
let idleTimer; 
const IDLE_TIME = 120000; 

// ==========================================
// GESTION AUDIO
// ==========================================
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function playSound(type) {
    if (!audioCtx) audioCtx = new AudioContextClass();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    
    if (type === 'correct') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(880, now); osc.frequency.setValueAtTime(1046, now + 0.1);
        gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    } else if (type === 'wrong' || type === 'timeout') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, now);
        gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now); osc.stop(now + 0.4);
    } else if (type === 'tick') {
        osc.type = 'square'; osc.frequency.setValueAtTime(400, now);
        gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now); osc.stop(now + 0.05);
    } else if (type === 'fast-tick') {
        osc.type = 'square'; osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now); osc.stop(now + 0.05);
    } else if (type === 'drumroll') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(60, now);
        const lfo = audioCtx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 25; 
        const lfoGain = audioCtx.createGain(); lfoGain.gain.value = 50;
        lfo.connect(lfoGain); lfoGain.connect(osc.frequency); lfo.start(now); lfo.stop(now + 3);
        gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.5, now + 2); gain.gain.linearRampToValueAtTime(0, now + 3);
        osc.start(now); osc.stop(now + 3);
    }
}

// ==========================================
// LOGIQUE INTERFACE & SLIDES
// ==========================================
function slideTo(screenId) {
    const active = document.querySelector('.active-screen');
    if (active && active.id === screenId) return; 

    if (active) {
        active.classList.remove('active-screen'); active.classList.add('slide-out-left');
        setTimeout(() => { active.classList.add('hidden'); active.classList.remove('slide-out-left'); }, 400);
    }
    const nextScreen = document.getElementById(screenId);
    nextScreen.classList.remove('hidden'); nextScreen.classList.add('slide-in-right');
    void nextScreen.offsetWidth;
    nextScreen.classList.remove('slide-in-right'); nextScreen.classList.add('active-screen');
}

function goToStart() {
    document.getElementById('player-name').value = '';
    setRandomBackground(); 
    resetIdleTimer(); slideTo('screen-start');
    setTimeout(() => { document.getElementById('player-name').focus(); }, 500);
}

function cancelQuiz() {
    if (confirm("⚠️ Es-tu sûr de vouloir annuler la partie en cours ?\n\nTa progression ne sera pas sauvegardée et n'apparaîtra pas dans le classement. Tu perdras tout.")) {
        clearInterval(timerInterval);
        goToStart();
    }
}

function getRandom(arr, n) {
    let shuffled = [...arr].sort(() => 0.5 - Math.random()); return shuffled.slice(0, n);
}

// ==========================================
// MOTEUR DU QUIZ
// ==========================================
function startQuiz() {
    let nameInput = document.getElementById('player-name').value.trim();
    if (!nameInput) return alert("Hé ! N'oublie pas de taper ton prénom !");
    
    document.getElementById('player-name').blur(); 
    
    if (!audioCtx) audioCtx = new AudioContextClass();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    // ========================================================
    // 🔥 CHEAT CODE / EASTER EGG POUR "MANON"
    // ========================================================
    if (nameInput.toLowerCase() === "manon") {
        playerName = "Manon";
        scoresCount = {AII: 5, EME: 7, ESE: 6}; 
        scoresPoints = {AII: 4433, EME: 6451, ESE: 5567}; 
        scoreTotal = 16451; 
        
        playerSessionDetails = [];
        for(let i = 0; i < 30; i++) {
            let fakeCat = i < 10 ? "AII" : (i < 20 ? "EME" : "ESE");
            playerSessionDetails.push({
                cat: fakeCat, q: `Question masquée ${i+1} (Mode Démo)`, 
                isCorrect: true, time: 1.5, points: 850
            });
        }
        triggerSuspense();
        return; 
    }
    // ========================================================

    playerName = nameInput;
    scoresPoints = {AII: 0, EME: 0, ESE: 0};
    scoresCount = {AII: 0, EME: 0, ESE: 0};
    scoreTotal = 0; currentStreak = 0; currentQIndex = 0; playerSessionDetails = [];
    
    let selected = [];
    ['AII', 'EME', 'ESE'].forEach(cat => {
        let catQ = DB.filter(q => q.cat === cat);
        let qCom = getRandom(catQ.filter(q => q.diff === "Com"), 2);
        let qSTI = getRandom(catQ.filter(q => q.diff === "STI"), 3);
        let qBU1 = getRandom(catQ.filter(q => q.diff === "BU1"), 3);
        let qBU2 = getRandom(catQ.filter(q => q.diff === "BU2"), 2);
        selected = selected.concat(qCom, qSTI, qBU1, qBU2);
    });
    
    currentQuestions = selected.sort(() => 0.5 - Math.random());
    
    let progContainer = document.getElementById('progress-container');
    progContainer.innerHTML = '';
    for(let i=0; i<30; i++) { progContainer.innerHTML += `<div class="progress-box" id="box-${i}"></div>`; }

    document.getElementById('player-display').innerHTML = `👤 ${playerName} <span style="margin-left:20px; color:#f1c40f;" id="live-score">0 pts</span>`;
    
    slideTo('screen-game'); loadQuestion();
}

function loadQuestion() {
    resetIdleTimer(); 
    setRandomBackground(); 
    clearInterval(timerInterval); timeLeft = timeLimit;
    
    let timerBar = document.getElementById('timer-bar');
    timerBar.style.width = "100%"; timerBar.style.backgroundColor = "#2ecc71"; 
    updateTimerText();

    let qData = currentQuestions[currentQIndex];
    document.getElementById('question-text').innerText = `Q${currentQIndex + 1}/${totalQuestions} : ${qData.q}`;
    
    let container = document.getElementById('answers-container'); container.innerHTML = ''; 
    let options = qData.opt.map((text, index) => ({text, originalIndex: index}));
    options.sort(() => 0.5 - Math.random());
    
    options.forEach(opt => {
        let btn = document.createElement('button');
        btn.className = 'answer-btn'; btn.innerText = opt.text; btn.dataset.idx = opt.originalIndex; 
        btn.onclick = (e) => processAnswer(opt.originalIndex, qData.ans, e.target);
        container.appendChild(btn);
    });

    timerInterval = setInterval(() => {
        timeLeft--; updateTimerText();
        if(timeLeft > 0 && timeLeft <= 10) playSound('fast-tick'); else if (timeLeft > 10) playSound('tick');
        
        let pct = (timeLeft / timeLimit) * 100;
        timerBar.style.width = pct + "%";
        if (pct < 50 && pct > 20) timerBar.style.backgroundColor = "#f1c40f"; 
        if (pct <= 20) timerBar.style.backgroundColor = "#e74c3c"; 

        if (timeLeft <= 0) processAnswer(-1, qData.ans, null); 
    }, 1000);
}

function updateTimerText() { document.getElementById('timer-text').innerText = `⏱️ ${timeLeft}s`; }

function processAnswer(selectedIndex, correctIndex, clickedBtn) {
    clearInterval(timerInterval);
    let allBtns = document.querySelectorAll('.answer-btn');
    allBtns.forEach(b => b.disabled = true);
    
    let qData = currentQuestions[currentQIndex];
    let isTimeout = (selectedIndex === -1);
    let isCorrect = (selectedIndex === correctIndex);
    let box = document.getElementById(`box-${currentQIndex}`);
    let timeTaken = timeLimit - timeLeft;
    let pointsGained = 0;
    
    if (isCorrect) {
        scoresCount[qData.cat]++; currentStreak++; playSound('correct');
        if(clickedBtn) clickedBtn.classList.add('btn-correct');
        box.classList.add('prog-correct');
        pointsGained = Math.round((timeLeft / timeLimit) * 500) + 500;
        scoreTotal += pointsGained; scoresPoints[qData.cat] += pointsGained;
    } else {
        currentStreak = 0;
        playSound(isTimeout ? 'timeout' : 'wrong');
        if(clickedBtn) clickedBtn.classList.add('btn-wrong');
        allBtns.forEach(b => { if (parseInt(b.dataset.idx) === correctIndex) b.classList.add('btn-correct'); });
        box.classList.add('prog-wrong');
    }
    
    playerSessionDetails.push({
        cat: qData.cat, q: qData.q, isCorrect: isCorrect, time: timeTaken, points: pointsGained
    });

    document.getElementById('live-score').innerText = `${scoreTotal} pts`;
    setTimeout(() => { showIntermediateScreen(isCorrect, pointsGained, qData.trivia, isTimeout); }, 1500);
}

function showIntermediateScreen(isCorrect, points, trivia, isTimeout) {
    resetIdleTimer();
    let title = document.getElementById('intermediate-title');
    let ptsText = document.getElementById('intermediate-points');
    let streakText = document.getElementById('intermediate-streak');
    
    if (isTimeout) {
        title.innerText = "⏱️ Temps écoulé !"; title.style.color = "#f39c12";
        ptsText.innerText = "0 pts"; ptsText.style.color = "#bdc3c7";
    } else if (isCorrect) {
        title.innerText = "Bonne réponse !"; title.style.color = "#2ecc71";
        ptsText.innerText = `+ ${points} pts`; ptsText.style.color = "white";
    } else {
        title.innerText = "Aïe, mauvaise réponse..."; title.style.color = "#e74c3c";
        ptsText.innerText = "0 pts"; ptsText.style.color = "#bdc3c7";
    }
    
    if (currentStreak >= 3) {
        streakText.innerText = `Série en cours : ${currentStreak} bonnes réponses 🔥 !`;
        streakText.style.display = "block";
    } else { streakText.style.display = "none"; }
    
    document.getElementById('trivia-text').innerText = trivia;
    slideTo('screen-intermediate');
}

function goToNextQuestion() {
    currentQIndex++;
    if (currentQIndex < totalQuestions) {
        slideTo('screen-game'); setTimeout(() => loadQuestion(), 400);
    } else { triggerSuspense(); }
}

function triggerSuspense() {
    slideTo('screen-suspense'); playSound('drumroll');
    setTimeout(() => { showResults(); window.confetti({ particleCount: 150, spread: 100, origin: { y: 0.6 }, zIndex: 10000 }); }, 3000);
}

function showResults() {
    resetIdleTimer();
    let htmlScores = ""; let bestCat = ""; let maxScore = -1;
    
    for (let cat of ["AII", "EME", "ESE"]) {
        let count = scoresCount[cat]; let pts = scoresPoints[cat];
        let color = count >= 6 ? "#2ecc71" : (count >= 4 ? "#f1c40f" : "#e74c3c");
        htmlScores += `Parcours ${cat} : <span style="color:${color}; font-weight:bold;">${count}/10</span> - <span style="color:#bdc3c7;">${pts} pts</span><br>`;
        if (count > maxScore) { maxScore = count; bestCat = cat; } else if (count === maxScore) { bestCat += " & " + cat; }
    }
    
    document.getElementById('final-score').innerText = `Score Final : ${scoreTotal} pts`;
    document.getElementById('scores-display').innerHTML = htmlScores;
    document.getElementById('best-path').innerText = `👉 PARCOURS CONSEILLÉ : ${bestCat} 👈`;

    saveScoreFirebase(playerName, scoreTotal, bestCat);
    slideTo('screen-results');
}

// ==========================================
// FIREBASE : SAUVEGARDE, PODIUM & EXPORT
// ==========================================
function saveScoreFirebase(name, totalScore, profil) {
    let newEntry = {
        "Candidat": name, "Score Points": totalScore, "Profil": profil,
        "ScoresCount": scoresCount, "ScoresPoints": scoresPoints, "SessionDetails": playerSessionDetails,
        "keep": false 
    };
    push(ref(db, 'scores'), newEntry);
}

async function showPodium() {
    resetIdleTimer();
    slideTo('screen-podium');
    let tbody = document.getElementById('podium-body'); 
    
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#bdc3c7;">Chargement <div class="spinner"></div></td></tr>';
    
    try {
        const snapshot = await get(ref(db, 'scores'));
        let data = [];
        if (snapshot.exists()) {
            const scoresObj = snapshot.val();
            for (let key in scoresObj) {
                data.push({ id: key, ...scoresObj[key] });
            }
        }
        
        data.sort((a, b) => b["Score Points"] - a["Score Points"]);
        tbody.innerHTML = '';
        
        if(data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#bdc3c7;">Aucun joueur enregistré.</td></tr>';
        } else {
            data.forEach((joueur, index) => {
                let medaille = index === 0 ? "🥇" : (index === 1 ? "🥈" : (index === 2 ? "🥉" : ""));
                tbody.innerHTML += `<tr>
                    <td>${medaille} ${index+1}</td>
                    <td>${joueur.Candidat}</td>
                    <td>${joueur["Score Points"]}</td>
                    <td>${joueur.Profil}</td>
                    <td><button class="btn-details" onclick="openModal('${joueur.id}')">Détails 🔍</button></td>
                </tr>`;
            });
        }
    } catch (error) {
        console.error("Erreur Firebase:", error);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#e74c3c;">Erreur de connexion réseau ❌</td></tr>';
    }
}

async function openModal(playerId) {
    try {
        const snapshot = await get(ref(db, 'scores'));
        if(!snapshot.exists()) return;
        
        let scoresObj = snapshot.val();
        let allPlayers = Object.values(scoresObj);
        let player = { id: playerId, ...scoresObj[playerId] };
        
        let globalStats = {};
        allPlayers.forEach(p => {
            if(p.SessionDetails) {
                p.SessionDetails.forEach(q => {
                    if(!globalStats[q.q]) globalStats[q.q] = { asked: 0, correct: 0 };
                    globalStats[q.q].asked++;
                    if(q.isCorrect) globalStats[q.q].correct++;
                });
            }
        });

        let isChecked = player.keep ? "checked" : "";
        document.getElementById('modal-header-content').innerHTML = `
            <h2 style="color:#f1c40f; margin-top:0; display:inline-block;">Analyse de : ${player.Candidat}</h2>
            <label class="keep-label">
                <input type="checkbox" onchange="toggleKeep('${player.id}', this.checked)" ${isChecked}> 
                📌 Conserver
            </label>
        `;
        
        let tbody = document.getElementById('modal-table-body'); tbody.innerHTML = '';
        
        player.SessionDetails.forEach(q => {
            let resIcon = q.isCorrect ? `<span class="correct-cell">✅</span>` : `<span class="wrong-cell">❌</span>`;
            let ptsClass = q.isCorrect ? "correct-cell" : "";
            
            let successPct = globalStats[q.q] ? Math.round((globalStats[q.q].correct / globalStats[q.q].asked) * 100) : 100;
            if(player.Candidat === "Manon") successPct = 100; 
            let successColor = successPct > 70 ? "#2ecc71" : (successPct < 40 ? "#e74c3c" : "#f1c40f");
            
            tbody.innerHTML += `<tr>
                <td><strong>${q.cat}</strong></td>
                <td style="text-align:left;">${q.q}</td>
                <td style="text-align:center;">${resIcon}</td>
                <td style="text-align:center;">${q.time}s</td>
                <td style="text-align:center;" class="${ptsClass}">${q.points}</td>
                <td style="text-align:center; color:${successColor}; font-weight:bold;">${successPct}%</td>
            </tr>`;
        });
        
        document.getElementById('details-modal').classList.add('show');
    } catch(e) { console.error(e); }
}

function closeModal() { document.getElementById('details-modal').classList.remove('show'); }

async function toggleKeep(playerId, isKept) {
    await set(ref(db, 'scores/' + playerId + '/keep'), isKept);
}

// 🔒 FONCTION SÉCURISÉE PAR MOT DE PASSE
async function resetPodium() {
    let pwd = prompt("⚠️ ZONE ADMINISTRATEUR ⚠️\nVeuillez entrer le mot de passe pour réinitialiser la base de données :");
    if (pwd !== "iutgeii") {
        if (pwd !== null) alert("❌ Mot de passe incorrect ! Action annulée.");
        return;
    }

    if(confirm("⚠️ Attention, cela effacera tous les scores du réseau mondial (SAUF ceux cochés '📌 Conserver'). Continuer ?")) {
        const snapshot = await get(ref(db, 'scores'));
        if (snapshot.exists()) {
            const scoresObj = snapshot.val();
            let keptScores = {};
            for (let key in scoresObj) {
                if (scoresObj[key].keep) {
                    keptScores[key] = scoresObj[key];
                }
            }
            await set(ref(db, 'scores'), keptScores);
        }
        showPodium();
    }
}

// 🔒 FONCTION SÉCURISÉE PAR MOT DE PASSE
async function downloadExcel() {
    let pwd = prompt("⚠️ ZONE ADMINISTRATEUR ⚠️\nVeuillez entrer le mot de passe pour télécharger le rapport Excel :");
    if (pwd !== "iutgeii") {
        if (pwd !== null) alert("❌ Mot de passe incorrect ! Action annulée.");
        return;
    }

    const snapshot = await get(ref(db, 'scores'));
    if (!snapshot.exists()) return alert("Aucun score enregistré sur le réseau pour le moment !");
    
    let scoresObj = snapshot.val();
    let dataJoueurs = Object.values(scoresObj);
    dataJoueurs.sort((a, b) => b["Score Points"] - a["Score Points"]);
    
    let globalStats = {};
    dataJoueurs.forEach(p => {
        if(p.SessionDetails) {
            p.SessionDetails.forEach(q => {
                if(!globalStats[q.q]) globalStats[q.q] = { cat: q.cat, asked: 0, correct: 0 };
                globalStats[q.q].asked++;
                if(q.isCorrect) globalStats[q.q].correct++;
            });
        }
    });

    let wb = window.XLSX.utils.book_new();
    let exportJoueurs = dataJoueurs.map(j => ({
        "Candidat": j.Candidat, "Score Global": j["Score Points"], "Profil": j.Profil,
        "AII (Bonnes Rép.)": j.ScoresCount.AII + "/10", "AII (Points)": j.ScoresPoints.AII,
        "EME (Bonnes Rép.)": j.ScoresCount.EME + "/10", "EME (Points)": j.ScoresPoints.EME,
        "ESE (Bonnes Rép.)": j.ScoresCount.ESE + "/10", "ESE (Points)": j.ScoresPoints.ESE
    }));
    let ws1 = window.XLSX.utils.json_to_sheet(exportJoueurs); window.XLSX.utils.book_append_sheet(wb, ws1, "Classement Joueurs");
    
    let exportStats = Object.keys(globalStats).map(qText => {
        let st = globalStats[qText];
        return { "Catégorie": st.cat, "Question": qText, "Fois posée": st.asked, "Fois réussie": st.correct, "Taux de réussite (%)": Math.round((st.correct / st.asked) * 100) };
    });
    exportStats.sort((a, b) => b["Taux de réussite (%)"] - a["Taux de réussite (%)"]);
    
    let ws2 = window.XLSX.utils.json_to_sheet(exportStats); window.XLSX.utils.book_append_sheet(wb, ws2, "Statistiques Questions");
    window.XLSX.writeFile(wb, "Rapport_Analytique_GEII_Cloud.xlsx");
}

// ==========================================
// GESTION CLAVIER (Touche Entrée)
// ==========================================
document.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        const activeScreen = document.querySelector('.active-screen');
        if (activeScreen && activeScreen.id === 'screen-start') {
            startQuiz();
        } else if (activeScreen && activeScreen.id === 'screen-intermediate') {
            goToNextQuestion();
        }
    }
});

// ==========================================
// ÉCRAN DE VEILLE (Screensaver Réseau)
// ==========================================
function resetIdleTimer() { clearTimeout(idleTimer); hideScreensaver(); idleTimer = setTimeout(showScreensaver, IDLE_TIME); }

async function showScreensaver() {
    const active = document.querySelector('.active-screen');
    if(active && (active.id === 'screen-start' || active.id === 'screen-podium')) {
        let ss = document.getElementById('screensaver');
        let scrollBox = document.getElementById('screensaver-scroll');
        
        try {
            const snapshot = await get(ref(db, 'scores'));
            let data = [];
            if (snapshot.exists()) {
                Object.values(snapshot.val()).forEach(p => data.push(p));
            }
            data.sort((a, b) => b["Score Points"] - a["Score Points"]);
            
            if (data.length > 0) {
                let html = "";
                data.slice(0, 10).forEach((j, i) => { html += `<div style="margin-bottom:20px;">#${i+1} <strong>${j.Candidat}</strong> - ${j["Score Points"]} pts (${j.Profil})</div>`; });
                scrollBox.innerHTML = html;
            } else { scrollBox.innerHTML = "<div>Soyez le premier à jouer sur le réseau !</div>"; }
            ss.classList.remove('hidden');
        } catch(e) { console.error(e); }
    } else { resetIdleTimer(); }
}

function hideScreensaver() { document.getElementById('screensaver').classList.add('hidden'); }

document.addEventListener('mousemove', resetIdleTimer); 
document.addEventListener('touchstart', resetIdleTimer); 
document.addEventListener('keydown', resetIdleTimer);
resetIdleTimer();
