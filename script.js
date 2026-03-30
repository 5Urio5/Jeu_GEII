/* global DB, confetti, XLSX, Chart, jspdf */

// ==========================================
// 🔒 SÉCURITÉ ET CONFIGURATION (MODIFIABLES)
// ==========================================
// Tu peux changer ces valeurs très facilement ici !
const ADMIN_PASSWORD = "iutgeii"; 

// Coefficients de difficulté appliqués aux points
const DIFF_WEIGHTS = { 
    "Com": 0.75, 
    "STI": 1, 
    "BU1": 1.25, 
    "BU2": 1.5 
};

// Traduction visuelle des catégories pour les joueurs (Pastilles & Excel)
const DIFF_LABELS = { 
    "Com": "CG", 
    "STI": "STI2D", 
    "BU1": "BUT1", 
    "BU2": "BUT2" 
};

// ==========================================
// FIREBASE - CONNEXION BASE DE DONNÉES TEMPS RÉEL
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-analytics.js";
import { getDatabase, ref, push, get, set, runTransaction } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";

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

// ==========================================
// EXPOSITION DES FONCTIONS AU HTML
// ==========================================
window.startQuiz = startQuiz; 
window.goToStart = goToStart; 
window.cancelQuiz = cancelQuiz;
window.showPodium = showPodium; 
window.openModal = openModal; 
window.closeModal = closeModal;
window.toggleKeep = toggleKeep; 
window.deletePlayerScore = deletePlayerScore; 
window.resetPodium = resetPodium; 
window.downloadExcel = downloadExcel;
window.showScreensaver = showScreensaver; 
window.hideScreensaver = hideScreensaver;
window.goToNextQuestion = goToNextQuestion; 
window.togglePasswordVisibility = togglePasswordVisibility;
window.generatePlayerPDF = generatePlayerPDF; 
window.generateAdminPDF = generateAdminPDF;
window.openQuestionEditor = openQuestionEditor; 
window.closeEditor = closeEditor;
window.addNewQuestion = addNewQuestion; 
window.editQuestion = editQuestion;
window.saveQuestion = saveQuestion; 
window.deleteQuestion = deleteQuestion;
window.resetQuestionsToDefault = resetQuestionsToDefault;
window.triggerCheatCode = triggerCheatCode;
window.submitNewPassword = submitNewPassword;
window.filterPodium = filterPodium;
window.editPseudo = editPseudo;
window.changePlayerPassword = changePlayerPassword;

// ==========================================
// VARIABLES GLOBALES & CHARGEMENT
// ==========================================
let playerName = ""; 
let playerPin = ""; 
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

let dynamicDB = [];
let resultsChartInstance = null;
let modalChartInstance = null;
let currentViewingPlayerId = null; 
let isManon = false; 

async function loadQuestionsFromFirebase() {
    try {
        const snap = await get(ref(db, 'questions'));
        if (snap.exists()) {
            dynamicDB = snap.val();
        } else {
            await set(ref(db, 'questions'), DB);
            dynamicDB = DB;
        }
    } catch (error) {
        console.error("Erreur de chargement des questions, utilisation locale.", error);
        dynamicDB = DB; 
    }
}
loadQuestionsFromFirebase();

// ==========================================
// 🛡️ MODALE DU MOT DE PASSE (DYNAMIQUE)
// ==========================================
function askPassword(customTitle = "⚠️ ZONE ADMINISTRATEUR ⚠️", customDesc = "Veuillez entrer le mot de passe :") {
    return new Promise((resolve) => {
        const modal = document.getElementById('password-modal');
        const titleEl = document.getElementById('pwd-modal-title');
        const descEl = document.getElementById('pwd-modal-desc');
        const input = document.getElementById('admin-pwd-input');
        const submitBtn = document.getElementById('submit-pwd-btn');
        const cancelBtn = document.getElementById('cancel-pwd-btn');
        
        titleEl.innerText = customTitle;
        descEl.innerText = customDesc;
        
        input.value = ''; 
        input.type = 'password';
        modal.classList.add('show'); 
        input.focus();

        const cleanup = () => {
            modal.classList.remove('show');
            submitBtn.onclick = null; 
            cancelBtn.onclick = null; 
            input.onkeydown = null;
        };
        
        submitBtn.onclick = () => { cleanup(); resolve(input.value); };
        cancelBtn.onclick = () => { cleanup(); resolve(null); };
        
        input.onkeydown = (e) => { 
            if (e.key === 'Enter') { cleanup(); resolve(input.value); } 
            if (e.key === 'Escape') { cleanup(); resolve(null); }
        };
    });
}

function togglePasswordVisibility() {
    const input = document.getElementById('admin-pwd-input');
    const toggleBtn = document.getElementById('toggle-pwd-btn');
    if (input.type === 'password') { 
        input.type = 'text'; 
        toggleBtn.innerText = '🙈'; 
    } else { 
        input.type = 'password'; 
        toggleBtn.innerText = '👁️'; 
    }
}

function sanitizeString(str) {
    return str.replace(/[&<>'"]/g, function(tag) {
        const charsToReplace = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
        return charsToReplace[tag] || tag;
    });
}

// ==========================================
// GESTION AUDIO & BACKGROUND
// ==========================================
const bgImages = ['appmeas.jpg', 'intérieur_iut.jpg', 'iut.jpg', 'kart.jpg', 'platine.jpg'];

function setRandomBackground() { 
    document.body.style.backgroundImage = `url('${bgImages[Math.floor(Math.random() * bgImages.length)]}')`; 
}

const AudioContextClass = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function playSound(type) {
    if (!audioCtx) audioCtx = new AudioContextClass();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const osc = audioCtx.createOscillator(); 
    const gain = audioCtx.createGain();
    
    osc.connect(gain); 
    gain.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime;
    
    if (type === 'correct') { 
        osc.type = 'sine'; 
        osc.frequency.setValueAtTime(880, now); 
        osc.frequency.setValueAtTime(1046, now + 0.1); 
        gain.gain.setValueAtTime(0.5, now); 
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3); 
        osc.start(now); 
        osc.stop(now + 0.3); 
    } 
    else if (type === 'wrong' || type === 'timeout') { 
        osc.type = 'sawtooth'; 
        osc.frequency.setValueAtTime(150, now); 
        gain.gain.setValueAtTime(0.5, now); 
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4); 
        osc.start(now); 
        osc.stop(now + 0.4); 
    } 
    else if (type === 'fast-tick') { 
        osc.type = 'square'; 
        osc.frequency.setValueAtTime(800, now); 
        gain.gain.setValueAtTime(0.1, now); 
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05); 
        osc.start(now); 
        osc.stop(now + 0.05); 
    } 
    else if (type === 'tick') { 
        osc.type = 'square'; 
        osc.frequency.setValueAtTime(400, now); 
        gain.gain.setValueAtTime(0.1, now); 
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05); 
        osc.start(now); 
        osc.stop(now + 0.05); 
    } 
    else if (type === 'drumroll') { 
        osc.type = 'sawtooth'; 
        osc.frequency.setValueAtTime(60, now); 
        const lfo = audioCtx.createOscillator(); 
        lfo.type = 'sine'; 
        lfo.frequency.value = 25; 
        const lfoGain = audioCtx.createGain(); 
        lfoGain.gain.value = 50; 
        lfo.connect(lfoGain); 
        lfoGain.connect(osc.frequency); 
        lfo.start(now); 
        lfo.stop(now + 3); 
        gain.gain.setValueAtTime(0, now); 
        gain.gain.linearRampToValueAtTime(0.5, now + 2); 
        gain.gain.linearRampToValueAtTime(0, now + 3); 
        osc.start(now); 
        osc.stop(now + 3); 
    }
}

// ==========================================
// LOGIQUE DE JEU & NAVIGATION UI
// ==========================================
function slideTo(screenId) {
    const active = document.querySelector('.active-screen');
    if (active && active.id === screenId) return; 
    
    if (active) { 
        active.classList.remove('active-screen'); 
        active.classList.add('slide-out-left'); 
        setTimeout(() => { 
            active.classList.add('hidden'); 
            active.classList.remove('slide-out-left'); 
        }, 400); 
    }
    
    const nextScreen = document.getElementById(screenId); 
    nextScreen.classList.remove('hidden'); 
    nextScreen.classList.add('slide-in-right'); 
    void nextScreen.offsetWidth; 
    nextScreen.classList.remove('slide-in-right'); 
    nextScreen.classList.add('active-screen');
}

function goToStart() {
    isManon = false;
    setRandomBackground(); 
    resetIdleTimer(); 
    slideTo('screen-start');
}

function cancelQuiz() {
    if (confirm("⚠️ Es-tu sûr de vouloir annuler la partie en cours ?\n\nTa progression ne sera pas sauvegardée et n'apparaîtra pas dans le classement. Tu perdras tout.")) {
        clearInterval(timerInterval); 
        goToStart();
    }
}

function getRandom(arr, n) { 
    let shuffled = [...arr].sort(() => 0.5 - Math.random()); 
    return shuffled.slice(0, n); 
}

// Déclencheur du code triche Manon au clic sur le logo
function triggerCheatCode() {
    let code = prompt("🤫 Code secret administrateur :");
    if (code && code.toLowerCase() === "manon") {
        isManon = true;
        startQuiz();
    }
}

async function startQuiz() {
    if (!audioCtx) audioCtx = new AudioContextClass(); 
    if (audioCtx.state === 'suspended') audioCtx.resume();

    // 🔥 GESTION DU CHEAT CODE "MANON" 🔥
    if (isManon) {
        playerName = "Manon (Démo)";
        scoresCount = {AII: 5, EME: 7, ESE: 6}; 
        scoresPoints = {AII: 4433, EME: 6451, ESE: 5567}; 
        scoreTotal = 16451; 
        
        playerSessionDetails = [];
        for(let i = 0; i < 30; i++) {
            let fakeCat = i < 10 ? "AII" : (i < 20 ? "EME" : "ESE");
            playerSessionDetails.push({
                cat: fakeCat, diff: "BU2", q: `Question masquée ${i+1} (Mode Démo)`, 
                isCorrect: true, time: 1.5, points: 1850, correctAnsText: "Réponse parfaite !"
            });
        }
        
        slideTo('screen-suspense'); 
        playSound('drumroll'); 
        setTimeout(async () => { 
            document.getElementById('cp-player-name').innerText = playerName;
            slideTo('screen-create-password'); 
        }, 3000);
        return; 
    }

    // 🔒 TRANSACTION FIREBASE : Génération du Numéro Séquentiel (Player0001, Player0002...)
    const countRef = ref(db, 'metadata/playerCount');
    let newPlayerId = 1;
    
    try {
        const result = await runTransaction(countRef, (currentData) => {
            return (currentData || 0) + 1;
        });
        newPlayerId = result.snapshot.val();
    } catch (error) {
        console.error("Échec de la transaction séquentielle, utilisation de l'aléatoire en secours.", error);
        newPlayerId = Math.floor(1000 + Math.random() * 9000); 
    }

    playerName = "Player" + newPlayerId.toString().padStart(4, '0'); 
    
    // Initialisation
    playerPin = ""; 
    scoresPoints = {AII: 0, EME: 0, ESE: 0}; 
    scoresCount = {AII: 0, EME: 0, ESE: 0};
    scoreTotal = 0; 
    currentStreak = 0; 
    currentQIndex = 0; 
    playerSessionDetails = [];
    
    // Mixage des questions depuis la base de données dynamique
    let selected = [];
    ['AII', 'EME', 'ESE'].forEach(cat => {
        let catQ = dynamicDB.filter(q => q.cat === cat);
        let qCom = getRandom(catQ.filter(q => q.diff === "Com"), 2);
        let qSTI = getRandom(catQ.filter(q => q.diff === "STI"), 3);
        let qBU1 = getRandom(catQ.filter(q => q.diff === "BU1"), 3);
        let qBU2 = getRandom(catQ.filter(q => q.diff === "BU2"), 2);
        selected = selected.concat(qCom, qSTI, qBU1, qBU2);
    });
    currentQuestions = selected.sort(() => 0.5 - Math.random());
    
    // Génération de la barre de progression
    let progContainer = document.getElementById('progress-container'); 
    progContainer.innerHTML = '';
    for(let i=0; i<30; i++) { 
        progContainer.innerHTML += `<div class="progress-box" id="box-${i}"></div>`; 
    }
    
    document.getElementById('player-display').innerHTML = `👤 ${playerName} <span style="margin-left:20px; color:#f1c40f;" id="live-score">0 pts</span>`;
    slideTo('screen-game'); 
    loadQuestion();
}

function loadQuestion() {
    resetIdleTimer(); 
    setRandomBackground(); 
    clearInterval(timerInterval); 
    timeLeft = timeLimit;
    
    let timerBar = document.getElementById('timer-bar'); 
    timerBar.style.width = "100%"; 
    timerBar.style.backgroundColor = "#2ecc71"; 
    document.getElementById('timer-text').innerText = `⏱️ ${timeLeft}s`;

    let qData = currentQuestions[currentQIndex];
    let diffClass = "diff-" + qData.diff;
    let displayDiff = DIFF_LABELS[qData.diff] || qData.diff;
    
    let qBox = document.getElementById('question-text');
    qBox.innerHTML = ''; 
    qBox.appendChild(document.createTextNode(`Q${currentQIndex + 1}/${totalQuestions} `));
    
    let badge = document.createElement('span');
    badge.className = `diff-badge ${diffClass}`;
    badge.innerText = displayDiff; 
    qBox.appendChild(badge);
    
    qBox.appendChild(document.createTextNode(` : `));
    
    let qTextSpan = document.createElement('span');
    qTextSpan.innerText = qData.q;
    qBox.appendChild(qTextSpan);
    
    let container = document.getElementById('answers-container'); 
    container.innerHTML = ''; 
    
    let options = qData.opt.map((text, index) => ({text, originalIndex: index}));
    options.sort(() => 0.5 - Math.random());
    
    options.forEach(opt => {
        let btn = document.createElement('button');
        btn.className = 'answer-btn'; 
        btn.innerText = opt.text; 
        btn.dataset.idx = opt.originalIndex; 
        btn.onclick = (e) => processAnswer(opt.originalIndex, qData.ans, e.target);
        container.appendChild(btn);
    });

    timerInterval = setInterval(() => {
        timeLeft--; 
        document.getElementById('timer-text').innerText = `⏱️ ${timeLeft}s`;
        
        if(timeLeft > 0 && timeLeft <= 10) playSound('fast-tick'); 
        else if (timeLeft > 10) playSound('tick');
        
        let pct = (timeLeft / timeLimit) * 100; 
        timerBar.style.width = pct + "%";
        if (pct < 50 && pct > 20) timerBar.style.backgroundColor = "#f1c40f"; 
        if (pct <= 20) timerBar.style.backgroundColor = "#e74c3c"; 

        if (timeLeft <= 0) processAnswer(-1, qData.ans, null); 
    }, 1000);
}

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
        scoresCount[qData.cat]++; 
        currentStreak++; 
        playSound('correct');
        if(clickedBtn) clickedBtn.classList.add('btn-correct'); 
        box.classList.add('prog-correct');
        
        // Calcul des points basé sur les coefficients définis
        let basePoints = Math.round((timeLeft / timeLimit) * 500) + 500;
        let coef = DIFF_WEIGHTS[qData.diff] || 1;
        pointsGained = Math.round(basePoints * coef);
        
        scoreTotal += pointsGained; 
        scoresPoints[qData.cat] += pointsGained;
    } else {
        currentStreak = 0; 
        playSound(isTimeout ? 'timeout' : 'wrong');
        if(clickedBtn) clickedBtn.classList.add('btn-wrong'); 
        box.classList.add('prog-wrong');
        allBtns.forEach(b => { 
            if (parseInt(b.dataset.idx) === correctIndex) b.classList.add('btn-correct'); 
        });
    }
    
    playerSessionDetails.push({ 
        cat: qData.cat, 
        diff: qData.diff, 
        q: qData.q, 
        isCorrect: isCorrect, 
        time: timeTaken, 
        points: pointsGained, 
        correctAnsText: qData.opt[qData.ans] 
    });

    document.getElementById('live-score').innerText = `${scoreTotal} pts`;
    
    setTimeout(() => { 
        showIntermediateScreen(isCorrect, pointsGained, qData.trivia, isTimeout); 
    }, 1500);
}

function showIntermediateScreen(isCorrect, points, trivia, isTimeout) {
    resetIdleTimer();
    
    let title = document.getElementById('intermediate-title'); 
    let ptsText = document.getElementById('intermediate-points'); 
    let streakText = document.getElementById('intermediate-streak');
    
    if (isTimeout) { 
        title.innerText = "⏱️ Temps écoulé !"; 
        title.style.color = "#f39c12"; 
        ptsText.innerText = "0 pts"; 
        ptsText.style.color = "#bdc3c7"; 
    } 
    else if (isCorrect) { 
        title.innerText = "Bonne réponse !"; 
        title.style.color = "#2ecc71"; 
        ptsText.innerText = `+ ${points} pts`; 
        ptsText.style.color = "white"; 
    } 
    else { 
        title.innerText = "Aïe, mauvaise réponse..."; 
        title.style.color = "#e74c3c"; 
        ptsText.innerText = "0 pts"; 
        ptsText.style.color = "#bdc3c7"; 
    }
    
    if (currentStreak >= 3) { 
        streakText.innerText = `Série en cours : ${currentStreak} bonnes réponses 🔥 !`; 
        streakText.style.display = "block"; 
    } else { 
        streakText.style.display = "none"; 
    }
    
    document.getElementById('trivia-text').innerText = trivia; 
    
    let nextBtn = document.getElementById('next-question-btn');
    if (currentQIndex === totalQuestions - 1) {
        nextBtn.innerText = "Voir mon résultat ➡️";
    } else {
        nextBtn.innerText = "Question suivante ➡️";
    }
    
    slideTo('screen-intermediate');
}

function goToNextQuestion() {
    currentQIndex++;
    
    if (currentQIndex < totalQuestions) { 
        slideTo('screen-game'); 
        setTimeout(() => loadQuestion(), 400); 
    } else { 
        slideTo('screen-suspense'); 
        playSound('drumroll'); 
        setTimeout(async () => { 
            // On a fini le suspense, on passe à l'écran de création du mot de passe !
            document.getElementById('cp-player-name').innerText = playerName;
            document.getElementById('new-player-pin').value = '';
            slideTo('screen-create-password');
        }, 3000); 
    }
}

// ==========================================
// CRÉATION MOT DE PASSE ET RÉSULTATS
// ==========================================

async function submitNewPassword() {
    let pinInput = document.getElementById('new-player-pin').value.trim();
    if (!pinInput) return alert("Hé ! Tu dois créer un mot de passe pour protéger tes résultats !");
    
    playerPin = sanitizeString(pinInput); 
    
    window.confetti({ particleCount: 150, spread: 100, origin: { y: 0.6 }, zIndex: 10000 }); 
    await showResultsFinal();
}

const customCanvasBackgroundColor = {
    id: 'customCanvasBackgroundColor',
    beforeDraw: (chart, args, options) => {
        const {ctx} = chart;
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = options.color || '#1c2541'; 
        ctx.fillRect(0, 0, chart.width, chart.height);
        ctx.restore();
    }
};

function calculateRadarData(sessionDetails) {
    let stats = { AII: {maxPts:0, valPts:0}, EME: {maxPts:0, valPts:0}, ESE: {maxPts:0, valPts:0} };
    
    sessionDetails.forEach(q => {
        let w = DIFF_WEIGHTS[q.diff] || 1; 
        let maxQPoints = 1000 * w; 
        
        if(stats[q.cat]) {
            stats[q.cat].maxPts += maxQPoints;
            if(q.isCorrect) stats[q.cat].valPts += q.points;
        }
    });
    
    let pAII = stats.AII.maxPts ? Math.round((stats.AII.valPts / stats.AII.maxPts) * 100) : 0;
    let pEME = stats.EME.maxPts ? Math.round((stats.EME.valPts / stats.EME.maxPts) * 100) : 0;
    let pESE = stats.ESE.maxPts ? Math.round((stats.ESE.valPts / stats.ESE.maxPts) * 100) : 0;
    
    return [pAII, pEME, pESE];
}

function drawRadarChart(canvasId, dataArray, chartInstanceToUpdate) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    if (chartInstanceToUpdate) { 
        chartInstanceToUpdate.destroy(); 
    }
    
    const customLabels = [
        `AII : ${dataArray[0]}%`,
        `EME : ${dataArray[1]}%`,
        `ESE : ${dataArray[2]}%`
    ];
    
    return new Chart(ctx, {
        type: 'radar',
        data: {
            labels: customLabels,
            datasets: [{
                label: 'Affinité (%)', 
                data: dataArray,
                backgroundColor: 'rgba(46, 204, 113, 0.4)', 
                borderColor: '#2ecc71',
                pointBackgroundColor: '#f1c40f', 
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff', 
                pointHoverBorderColor: '#f1c40f',
                borderWidth: 2
            }]
        },
        plugins: [customCanvasBackgroundColor], 
        options: {
            animation: false,
            responsive: true, 
            maintainAspectRatio: false,
            layout: { padding: 15 },
            scales: {
                r: { 
                    min: 0,
                    max: 100,
                    angleLines: { color: 'rgba(255, 255, 255, 0.2)' }, 
                    grid: { color: 'rgba(255, 255, 255, 0.2)' }, 
                    pointLabels: { color: '#fff', font: { size: 14, weight: 'bold' } }, 
                    ticks: { display: false, stepSize: 20 } 
                }
            },
            plugins: { 
                legend: { display: false },
                customCanvasBackgroundColor: { color: '#1c2541' } 
            }
        }
    });
}

// 🔥 FONCTION CORRIGÉE ET NETTOYÉE (Plus de demande d'email inutile) 🔥
async function showResultsFinal() {
    resetIdleTimer();
    
    let htmlScores = ""; 
    let bestCat = ""; 
    let maxScorePts = -1; 
    
    for (let cat of ["AII", "EME", "ESE"]) {
        let count = scoresCount[cat]; 
        let pts = scoresPoints[cat];
        let color = count >= 6 ? "#2ecc71" : (count >= 4 ? "#f1c40f" : "#e74c3c");
        
        htmlScores += `Parcours ${cat} : <span style="color:${color}; font-weight:bold;">${count}/10</span> - <span style="color:#bdc3c7;">${pts} pts</span><br>`;
        
        if (pts > maxScorePts) { 
            maxScorePts = pts; 
            bestCat = cat; 
        } else if (pts === maxScorePts && maxScorePts > 0) { 
            bestCat += " & " + cat; 
        }
    }
    
    document.getElementById('final-score').innerText = `Score Final : ${scoreTotal} pts`;
    document.getElementById('results-player-name').innerText = playerName; 
    document.getElementById('scores-display').innerHTML = htmlScores;
    document.getElementById('best-path').innerText = `👉 PARCOURS CONSEILLÉ : ${bestCat} 👈`;

    let radarData = calculateRadarData(playerSessionDetails);
    resultsChartInstance = drawRadarChart('results-chart', radarData, resultsChartInstance);

    // Sauvegarde Finale dans Firebase
    saveScoreFirebase(playerName, scoreTotal, bestCat, playerPin);
    slideTo('screen-results');
}

function saveScoreFirebase(name, totalScore, profil, pin) {
    push(ref(db, 'scores'), { 
        "Candidat": name, 
        "Score Points": totalScore, 
        "Profil": profil, 
        "ScoresCount": scoresCount, 
        "ScoresPoints": scoresPoints, 
        "SessionDetails": playerSessionDetails, 
        "keep": false, 
        "PIN": pin || "" 
    });
}

// ==========================================
// PODIUM ET MODALE DÉTAILS
// ==========================================
async function showPodium() {
    resetIdleTimer(); 
    slideTo('screen-podium'); 
    
    document.getElementById('search-podium').value = ''; 
    
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
        console.error(error); 
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#e74c3c;">Erreur réseau ❌</td></tr>'; 
    }
}

function filterPodium() {
    let input = document.getElementById('search-podium').value.toLowerCase();
    let rows = document.querySelectorAll('#podium-body tr');
    
    rows.forEach(row => {
        if (row.cells.length > 1) { 
            let name = row.cells[1].innerText.toLowerCase();
            if (name.includes(input)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        }
    });
}

async function openModal(playerId) {
    try {
        const snapshot = await get(ref(db, 'scores')); 
        if(!snapshot.exists()) return;
        
        let scoresObj = snapshot.val(); 
        let allPlayers = Object.values(scoresObj);
        let player = { id: playerId, ...scoresObj[playerId] };
        
        let pwd = await askPassword(
            "🔒 Accès Sécurisé", 
            `Pour voir les détails, entre le mot de passe de ${player.Candidat} :`
        );
        
        if (pwd !== ADMIN_PASSWORD && pwd !== player.PIN) {
            if (pwd !== null) alert("❌ Mot de passe incorrect.");
            return; 
        }

        currentViewingPlayerId = playerId;

        if(player.SessionDetails) {
            let radarData = calculateRadarData(player.SessionDetails);
            modalChartInstance = drawRadarChart('modal-chart', radarData, modalChartInstance);
        }

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

        // En-tête Flexbox avec Crayon d'édition et Changement de MDP
        document.getElementById('modal-header-content').innerHTML = `
            <h2 style="color:#f1c40f; margin:0; font-size:1.6em;">
                Analyse de : <span id="detail-pseudo-display">${player.Candidat}</span> 
                <span style="cursor:pointer;" onclick="editPseudo('${player.id}')" title="Modifier le pseudo">✏️</span>
            </h2>
            <div class="modal-header-actions">
                <label class="keep-label"><input type="checkbox" onchange="toggleKeep('${player.id}', this.checked)" ${player.keep ? "checked" : ""}> 📌 Conserver</label>
                <button class="secondary-btn" style="background:#8e44ad; padding:6px 12px; font-size:0.85em; margin:0;" onclick="changePlayerPassword('${player.id}')">🔑 Changer MDP</button>
                <button class="delete-player-btn" onclick="deletePlayerScore('${player.id}')">🗑️ Supprimer</button>
            </div>`;

        let tbody = document.getElementById('modal-table-body'); 
        tbody.innerHTML = '';
        
        if (player.SessionDetails) {
            player.SessionDetails.forEach(q => {
                let resIcon = q.isCorrect ? `<span class="correct-cell">✅</span>` : `<span class="incorrect-cell">❌</span>`;
                let successRate = (globalStats[q.q] && globalStats[q.q].asked > 0) ? Math.round((globalStats[q.q].correct / globalStats[q.q].asked) * 100) + "%" : "-";
                
                let displayDiff = DIFF_LABELS[q.diff] || q.diff || '-';
                let badgeHtml = `<span class="diff-badge diff-${q.diff || 'Com'}">${displayDiff}</span>`;
                
                tbody.innerHTML += `<tr>
                    <td style="text-align:center;">${q.cat}</td>
                    <td style="text-align:center;">${badgeHtml}</td>
                    <td>${q.q}</td>
                    <td style="text-align:center;">${resIcon}</td>
                    <td style="text-align:center;">${q.points}</td>
                    <td style="text-align:center;">${successRate}</td>
                </tr>`;
            });
        }
        
        document.getElementById('details-modal').classList.add('show');
    } catch (error) { 
        console.error(error); 
    }
}

async function editPseudo(playerId) {
    let newName = prompt("Choisis ton nouveau pseudonyme pour apparaître sur le podium (laisser vide pour annuler) :");
    if (newName && newName.trim() !== "") {
        let cleanName = sanitizeString(newName.trim());
        try {
            await set(ref(db, `scores/${playerId}/Candidat`), cleanName);
            document.getElementById('detail-pseudo-display').innerText = cleanName;
            showPodium(); 
        } catch(e) {
            alert("Erreur lors de la modification.");
        }
    }
}

async function changePlayerPassword(playerId) {
    let newPin = prompt("Entrez le nouveau mot de passe pour ce compte :");
    if (newPin && newPin.trim() !== "") {
        try {
            await set(ref(db, `scores/${playerId}/PIN`), sanitizeString(newPin.trim()));
            alert("Mot de passe mis à jour avec succès !");
        } catch(e) {
            alert("Erreur lors de la modification.");
        }
    }
}

function closeModal() { 
    document.getElementById('details-modal').classList.remove('show'); 
}

async function toggleKeep(playerId, isChecked) { 
    try { await set(ref(db, 'scores/' + playerId + '/keep'), isChecked); } 
    catch (e) { console.error(e); } 
}

async function deletePlayerScore(playerId) {
    if (confirm("⚠️ Voulez-vous vraiment supprimer ce joueur de la base de données ? Action irréversible.")) {
        try {
            await set(ref(db, 'scores/' + playerId), null);
            closeModal();
            showPodium(); 
        } catch (e) {
            console.error(e);
            alert("Erreur lors de la suppression.");
        }
    }
}

async function resetPodium() {
    let pwd = await askPassword("⚠️ ZONE ADMINISTRATEUR ⚠️", "Veuillez entrer le mot de passe :");
    
    if (pwd === ADMIN_PASSWORD) {
        if (confirm("⚠️ Voulez-vous vraiment effacer TOUS les scores ? Action irréversible.")) {
            try { 
                await set(ref(db, 'scores'), null); 
                alert("🗑️ Base de données réinitialisée !"); 
                showPodium(); 
            } catch (error) { alert("Erreur lors de la réinitialisation."); }
        }
    } else if (pwd !== null) { 
        alert("❌ Mot de passe incorrect."); 
    }
}

// ==========================================
// EXPORT EXCEL
// ==========================================
async function downloadExcel() {
    let pwd = await askPassword("⚠️ ZONE ADMINISTRATEUR ⚠️", "Veuillez entrer le mot de passe :");
    
    if (pwd === ADMIN_PASSWORD) {
        try {
            const snapshot = await get(ref(db, 'scores')); 
            if (!snapshot.exists()) return alert("Aucune donnée à exporter.");
            
            let dataPlayers = []; 
            let dataQuestions = []; 
            let dataDetails = []; 
            const scoresObj = snapshot.val(); 
            let allPlayers = Object.values(scoresObj);
            
            for (let key in scoresObj) {
                let p = scoresObj[key];
                dataPlayers.push({ 
                    "Candidat": p.Candidat || "Inconnu", 
                    "Code Secret": p.PIN || "N/A", 
                    "Score Global": p["Score Points"] || 0, 
                    "Profil": p.Profil || "", 
                    "Points AII": p.ScoresPoints ? p.ScoresPoints.AII : 0, 
                    "Points EME": p.ScoresPoints ? p.ScoresPoints.EME : 0, 
                    "Points ESE": p.ScoresPoints ? p.ScoresPoints.ESE : 0, 
                    "Bonnes Rép. AII": p.ScoresCount ? p.ScoresCount.AII : 0, 
                    "Bonnes Rép. EME": p.ScoresCount ? p.ScoresCount.EME : 0, 
                    "Bonnes Rép. ESE": p.ScoresCount ? p.ScoresCount.ESE : 0, 
                    "Conserver": p.keep ? "OUI" : "NON" 
                });
                
                if (p.SessionDetails) { 
                    p.SessionDetails.forEach((q, index) => { 
                        dataDetails.push({ 
                            "Candidat": p.Candidat, 
                            "Num": index + 1, 
                            "Catégorie": q.cat, 
                            "Diff": DIFF_LABELS[q.diff] || q.diff || '-', 
                            "Question": q.q, 
                            "Résultat": q.isCorrect ? "VRAI" : "FAUX", 
                            "Temps (s)": q.time, 
                            "Points": q.points 
                        }); 
                    }); 
                }
            }
            
            dataPlayers.sort((a, b) => b["Score Global"] - a["Score Global"]);
            
            let globalStats = {};
            allPlayers.forEach(p => {
                if (p.SessionDetails) { 
                    p.SessionDetails.forEach(q => { 
                        if (!globalStats[q.q]) { globalStats[q.q] = { cat: q.cat, asked: 0, correct: 0 }; } 
                        globalStats[q.q].asked++; 
                        if (q.isCorrect) globalStats[q.q].correct++; 
                    }); 
                }
            });
            
            for (let qText in globalStats) {
                let stat = globalStats[qText]; 
                let successRate = stat.asked > 0 ? Math.round((stat.correct / stat.asked) * 100) + "%" : "0%";
                dataQuestions.push({ 
                    "Catégorie": stat.cat, 
                    "Question": qText, 
                    "Fois Posée": stat.asked, 
                    "Bonnes Réponses": stat.correct, 
                    "Taux Réussite": successRate 
                });
            }
            
            dataQuestions.sort((a, b) => a.Catégorie.localeCompare(b.Catégorie));
            
            const wb = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(dataPlayers), "Classement");
            window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(dataQuestions), "Stats Questions");
            if(dataDetails.length > 0) window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(dataDetails), "Détail Brut");
            
            window.XLSX.writeFile(wb, "Resultats_GEII.xlsx");
        } catch (e) { 
            alert("Erreur lors de la création du fichier Excel."); 
        }
    } else if (pwd !== null) { 
        alert("❌ Mot de passe incorrect."); 
    }
}

// ==========================================
// EXPORT PDF
// ==========================================
function buildPDF(playerData, chartDataUrl) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    let logoW = 60;
    let logoH = 18;
    
    const finalize = (logoUrl, qrUrl) => {
        if(logoUrl) { 
            let logoX = 105 - (logoW / 2); 
            doc.addImage(logoUrl, 'PNG', logoX, 10, logoW, logoH); 
        }
        
        doc.setFont("helvetica", "bold"); 
        doc.setFontSize(20);
        doc.text("BILAN DE COMPÉTENCES GEII", 105, 38, {align: "center"});
        
        doc.setFontSize(14); 
        doc.setTextColor(0, 102, 204);
        doc.text(`Identifiant : ${playerData.Candidat}`, 15, 50);
        
        doc.setTextColor(0, 0, 0); 
        doc.setFontSize(12);
        doc.text(`Score Final : ${playerData["Score Points"] || scoreTotal} pts`, 15, 58);
        
        let profil = playerData.Profil || document.getElementById('best-path').innerText.replace('👉 PARCOURS CONSEILLÉ : ', '').replace(' 👈', '');
        doc.text(`Profil Recommandé : ${profil}`, 15, 66);

        if(chartDataUrl) { 
            doc.addImage(chartDataUrl, 'PNG', 120, 40, 75, 75); 
        }

        let tableData = [];
        if(playerData.SessionDetails) { 
            playerData.SessionDetails.forEach(q => { 
                tableData.push([ q.cat, q.q, q.isCorrect ? "VRAI" : "FAUX", q.correctAnsText || "N/A" ]); 
            }); 
        }
        
        doc.autoTable({
            startY: 120,
            head: [['Catégorie', 'Question Posée', 'Résultat', 'Bonne Réponse']],
            body: tableData,
            headStyles: { fillColor: [46, 204, 113] },
            styles: { fontSize: 9 },
            columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 90 }, 2: { cellWidth: 20 }, 3: { cellWidth: 50 } }
        });

        let finalY = doc.lastAutoTable.finalY + 15;

        if (finalY > 220) { 
            doc.addPage(); 
            finalY = 20; 
        }

        doc.setFont("helvetica", "bold"); 
        doc.setFontSize(14); 
        doc.setTextColor(0, 102, 204);
        doc.text("Et maintenant ?", 15, finalY);

        doc.setFont("helvetica", "italic"); 
        doc.setFontSize(10); 
        doc.setTextColor(80, 80, 80);
        let conclusionText = "Attention : Ce bilan est issu d'un jeu récréatif scientifique. Il ne définit en rien ton avenir scolaire ou professionnel, mais souligne tes affinités actuelles. L'important est de choisir la voie qui te passionne !";
        doc.text(conclusionText, 15, finalY + 8, { maxWidth: 125, align: 'justify' });

        doc.setFont("helvetica", "bold"); 
        doc.setFontSize(11); 
        doc.setTextColor(39, 174, 96);
        let rejouerText = "Envie de rejouer ou de relever le défi entre amis ?";
        doc.text(rejouerText, 15, finalY + 28);
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(52, 152, 219); 
        let clickText = "Clique ici";
        doc.text(clickText, 15, finalY + 34);

        let textWidth = doc.getTextWidth(clickText);
        doc.setDrawColor(52, 152, 219);
        doc.setLineWidth(0.3);
        doc.line(15, finalY + 35, 15 + textWidth, finalY + 35);

        doc.link(15, finalY + 30, textWidth, 6, { url: 'https://5urio5.github.io/Jeu_GEII/' }); 

        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 80);
        let suiteText = " pour y accéder, ou scanne le code QR";
        doc.text(suiteText, 15 + textWidth + 1, finalY + 34);

        if(qrUrl) {
            doc.addImage(qrUrl, 'PNG', 155, finalY + 5, 35, 35); 
            doc.setFontSize(8); 
            doc.setTextColor(100, 100, 100); 
            doc.setFont("helvetica", "normal");
            doc.text("Scannez pour jouer !", 172.5, finalY + 43, { align: "center" });
        }

        doc.save(`Bilan_GEII_${playerData.Candidat}.pdf`);
    };

    let logoLoaded = false; let logoDataUrl = null;
    let qrLoaded = false; let qrDataUrl = null;

    const checkAllLoaded = () => { 
        if(logoLoaded && qrLoaded) finalize(logoDataUrl, qrDataUrl); 
    };

    const imgLogo = new Image(); 
    imgLogo.crossOrigin = "anonymous"; 
    imgLogo.src = "logo_noir.png";
    imgLogo.onload = () => {
        const canvas = document.createElement('canvas'); 
        canvas.width = imgLogo.naturalWidth; 
        canvas.height = imgLogo.naturalHeight;
        canvas.getContext('2d').drawImage(imgLogo, 0, 0); 
        logoDataUrl = canvas.toDataURL('image/png');
        
        let ratio = imgLogo.naturalWidth / imgLogo.naturalHeight;
        logoH = 18;
        logoW = 18 * ratio;
        
        logoLoaded = true; 
        checkAllLoaded();
    };
    imgLogo.onerror = () => { logoLoaded = true; checkAllLoaded(); };

    const imgQR = new Image(); 
    imgQR.src = "qr_code.png"; 
    imgQR.onload = () => {
        const canvas = document.createElement('canvas'); 
        canvas.width = imgQR.naturalWidth; 
        canvas.height = imgQR.naturalHeight;
        canvas.getContext('2d').drawImage(imgQR, 0, 0); 
        qrDataUrl = canvas.toDataURL('image/png');
        qrLoaded = true; 
        checkAllLoaded();
    };
    imgQR.onerror = () => { qrLoaded = true; checkAllLoaded(); };
}

function generatePlayerPDF() {
    if(!resultsChartInstance) return alert("Graphique non disponible.");
    let chartUrl = resultsChartInstance.toBase64Image();
    let pData = { Candidat: playerName, "Score Points": scoreTotal, SessionDetails: playerSessionDetails };
    buildPDF(pData, chartUrl);
}

async function generateAdminPDF() {
    if(!currentViewingPlayerId || !modalChartInstance) return;
    try {
        const snapshot = await get(ref(db, `scores/${currentViewingPlayerId}`));
        if (snapshot.exists()) { 
            let pData = snapshot.val(); 
            let chartUrl = modalChartInstance.toBase64Image(); 
            buildPDF(pData, chartUrl); 
        }
    } catch(e) { 
        console.error(e); 
        alert("Erreur lors de la récupération du joueur."); 
    }
}

// ==========================================
// EDITEUR DE QUESTIONS (ADMIN)
// ==========================================
async function openQuestionEditor() {
    let pwd = await askPassword("⚠️ ZONE ADMINISTRATEUR ⚠️", "Veuillez entrer le mot de passe :");
    
    if (pwd === ADMIN_PASSWORD) { 
        renderEditorList(); 
        document.getElementById('editor-modal').classList.add('show'); 
    } else if (pwd !== null) { 
        alert("❌ Mot de passe incorrect."); 
    }
}

function closeEditor() { 
    document.getElementById('editor-modal').classList.remove('show'); 
    document.getElementById('editor-form-container').classList.add('hidden'); 
}

function renderEditorList() {
    let tbody = document.getElementById('editor-table-body'); 
    tbody.innerHTML = '';
    
    dynamicDB.forEach((q, i) => { 
        tbody.innerHTML += `<tr>
            <td style="text-align:center;">${i}</td>
            <td style="text-align:center;">${q.cat}</td>
            <td style="text-align:center;">${q.diff}</td>
            <td>${q.q}</td>
            <td style="text-align:center;">
                <button class="btn-details" style="background:#f39c12; margin-bottom:5px;" onclick="editQuestion(${i})">Éditer</button>
                <button class="btn-details" style="background:#e74c3c;" onclick="deleteQuestion(${i})">X</button>
            </td>
        </tr>`; 
    });
}

function addNewQuestion() { 
    dynamicDB.push({ 
        cat: "AII", 
        diff: "Com", 
        q: "Nouvelle Question", 
        opt: ["Rép 1", "Rép 2", "Rép 3", "Rép 4"], 
        ans: 0, 
        trivia: "Le saviez-vous ?" 
    }); 
    editQuestion(dynamicDB.length - 1); 
}

async function deleteQuestion(index) { 
    if(confirm("Supprimer cette question de la base de données ?")) { 
        dynamicDB.splice(index, 1); 
        try { 
            await set(ref(db, 'questions'), dynamicDB); 
            renderEditorList(); 
        } catch(e) { 
            alert("Erreur de sauvegarde Firebase"); 
        } 
    } 
}

async function resetQuestionsToDefault() { 
    if(confirm("⚠️ Écraser toutes les modifications et remettre la base de données d'origine ?")) { 
        dynamicDB = JSON.parse(JSON.stringify(DB)); 
        try { 
            await set(ref(db, 'questions'), dynamicDB); 
            renderEditorList(); 
            alert("Restauration réussie !"); 
        } catch(e) { 
            alert("Erreur de sauvegarde Firebase"); 
        } 
    } 
}

function editQuestion(index) {
    let q = dynamicDB[index];
    
    let formHtml = `
        <h3 style="margin-top:0; color:#2ecc71;">Modification (ID: ${index})</h3>
        <select id="edit-cat" class="editor-select">
            <option value="AII" ${q.cat==='AII'?'selected':''}>AII</option>
            <option value="EME" ${q.cat==='EME'?'selected':''}>EME</option>
            <option value="ESE" ${q.cat==='ESE'?'selected':''}>ESE</option>
        </select>
        <select id="edit-diff" class="editor-select">
            <option value="Com" ${q.diff==='Com'?'selected':''}>CG (x0.75)</option>
            <option value="STI" ${q.diff==='STI'?'selected':''}>STI2D (x1)</option>
            <option value="BU1" ${q.diff==='BU1'?'selected':''}>BUT1 (x1.25)</option>
            <option value="BU2" ${q.diff==='BU2'?'selected':''}>BUT2 (x1.5)</option>
        </select>
        <br>
        <input type="text" id="edit-q" class="editor-input" value="${q.q.replace(/"/g, '&quot;')}" placeholder="Texte question">
        
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <label><input type="radio" name="edit-ans" value="0" ${q.ans===0?'checked':''}> <input type="text" id="edit-o0" class="editor-input" style="width:85%" value="${q.opt[0].replace(/"/g, '&quot;')}"></label>
            <label><input type="radio" name="edit-ans" value="1" ${q.ans===1?'checked':''}> <input type="text" id="edit-o1" class="editor-input" style="width:85%" value="${q.opt[1].replace(/"/g, '&quot;')}"></label>
            <label><input type="radio" name="edit-ans" value="2" ${q.ans===2?'checked':''}> <input type="text" id="edit-o2" class="editor-input" style="width:85%" value="${q.opt[2].replace(/"/g, '&quot;')}"></label>
            <label><input type="radio" name="edit-ans" value="3" ${q.ans===3?'checked':''}> <input type="text" id="edit-o3" class="editor-input" style="width:85%" value="${q.opt[3].replace(/"/g, '&quot;')}"></label>
        </div>
        
        <input type="text" id="edit-trivia" class="editor-input" value="${q.trivia.replace(/"/g, '&quot;')}" placeholder="Le Saviez-vous ?">
        
        <button class="main-btn" style="width:auto; padding:10px 20px;" onclick="saveQuestion(${index})">💾 Sauvegarder</button>
        <button class="secondary-btn" style="background:#e74c3c;" onclick="document.getElementById('editor-form-container').classList.add('hidden')">Annuler</button>
    `;
    
    let container = document.getElementById('editor-form-container'); 
    container.innerHTML = formHtml; 
    container.classList.remove('hidden'); 
    container.scrollIntoView({ behavior: "smooth" });
}

async function saveQuestion(index) {
    let ansRadios = document.getElementsByName('edit-ans'); 
    let ans = 0; 
    
    for(let i=0; i<ansRadios.length; i++) { 
        if(ansRadios[i].checked) ans = parseInt(ansRadios[i].value); 
    }
    
    dynamicDB[index] = { 
        cat: document.getElementById('edit-cat').value, 
        diff: document.getElementById('edit-diff').value, 
        q: document.getElementById('edit-q').value, 
        opt: [
            document.getElementById('edit-o0').value, 
            document.getElementById('edit-o1').value, 
            document.getElementById('edit-o2').value, 
            document.getElementById('edit-o3').value
        ], 
        ans: ans, 
        trivia: document.getElementById('edit-trivia').value 
    };
    
    try { 
        await set(ref(db, 'questions'), dynamicDB); 
        document.getElementById('editor-form-container').classList.add('hidden'); 
        renderEditorList(); 
        alert("✅ Question sauvegardée dans la base Firebase !"); 
    } catch(e) { 
        alert("Erreur lors de la sauvegarde Firebase."); 
    }
}

// ==========================================
// ECRAN DE VEILLE (INACTIVITÉ)
// ==========================================
function resetIdleTimer() { 
    clearTimeout(idleTimer); 
    idleTimer = setTimeout(showScreensaver, IDLE_TIME); 
}

document.addEventListener('mousemove', resetIdleTimer); 
document.addEventListener('click', resetIdleTimer); 
document.addEventListener('touchstart', resetIdleTimer);

async function showScreensaver() {
    const screen = document.getElementById('screensaver'); 
    screen.classList.remove('hidden'); 
    
    let scrollContent = document.getElementById('screensaver-scroll'); 
    scrollContent.innerHTML = 'Chargement du classement...';
    
    try { 
        const snapshot = await get(ref(db, 'scores')); 
        
        if (snapshot.exists()) { 
            let data = Object.values(snapshot.val()); 
            data.sort((a, b) => b["Score Points"] - a["Score Points"]); 
            
            let top10 = data.slice(0, 10); 
            let html = ""; 
            
            top10.forEach((p, i) => { 
                let medaille = i === 0 ? "🥇" : (i === 1 ? "🥈" : (i === 2 ? "🥉" : `${i+1}.`)); 
                html += `<div>${medaille} ${p.Candidat} - ${p["Score Points"]} pts</div>`; 
            }); 
            
            scrollContent.innerHTML = html + "<br><br><br>" + html; 
        } else { 
            scrollContent.innerHTML = "Soyez le premier à jouer !"; 
        } 
    } catch (error) { 
        scrollContent.innerHTML = "Prêt à jouer !"; 
    }
}

function hideScreensaver() { 
    document.getElementById('screensaver').classList.add('hidden'); 
    resetIdleTimer(); 
}

resetIdleTimer();

// ==========================================
// SUPER ÉCOUTEUR CLAVIER (FOCUS DYNAMIQUE)
// ==========================================
document.addEventListener('keydown', function(e) {
    const activeScreen = document.querySelector('.active-screen'); 
    const detailsModal = document.getElementById('details-modal'); 
    const pwdModal = document.getElementById('password-modal'); 
    const editorModal = document.getElementById('editor-modal');
    const screensaver = document.getElementById('screensaver');
    
    if (!screensaver.classList.contains('hidden')) { 
        hideScreensaver(); 
        return; 
    }
    
    if (e.key === 'Escape') { 
        if (detailsModal.classList.contains('show')) { 
            closeModal(); 
        } else if (editorModal.classList.contains('show')) { 
            closeEditor(); 
        } else if (pwdModal.classList.contains('show')) {
            // Géré par la modale
        } else if (activeScreen && (activeScreen.id === 'screen-game' || activeScreen.id === 'screen-intermediate')) { 
            cancelQuiz(); 
        } 
    }
    
    if (e.key === 'Enter') { 
        if (pwdModal.classList.contains('show')) {
            return;
        }
        if (activeScreen) { 
            if (activeScreen.id === 'screen-start' && document.activeElement && document.activeElement.tagName === 'BUTTON') { 
                // Laisse le bouton focalisé fonctionner
            } else if (activeScreen.id === 'screen-start') {
                startQuiz();
            } else if (activeScreen.id === 'screen-intermediate') { 
                goToNextQuestion(); 
            } else if (activeScreen.id === 'screen-results') { 
                goToStart(); 
            } 
        } 
    }
    
    if (activeScreen && activeScreen.id === 'screen-game') {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault(); 
            
            const btns = Array.from(document.querySelectorAll('#answers-container .answer-btn:not(:disabled)')); 
            if (btns.length === 0) return;
            
            let currentIndex = btns.indexOf(document.activeElement);
            
            if (currentIndex === -1) { 
                btns[0].focus(); 
            } else { 
                if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { 
                    currentIndex = (currentIndex + 1) % btns.length; 
                } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { 
                    currentIndex = (currentIndex - 1 + btns.length) % btns.length; 
                } 
                btns[currentIndex].focus(); 
            }
        }
    }
});