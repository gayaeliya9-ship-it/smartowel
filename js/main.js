// --- 1. הגדרות Firebase ---
const firebaseConfig = {
    apiKey: "AIzaSyBy3VwxAYJ4zfP1N4GJe7D1L7Sf-YlxTeE",
    authDomain: "smarthouse-27843.firebaseapp.com",
    databaseURL: "https://smarthouse-27843-default-rtdb.firebaseio.com",
    projectId: "smarthouse-27843",
    storageBucket: "smarthouse-27843.firebasestorage.app",
    messagingSenderId: "361716939164",
    appId: "1:361716939164:web:4d65492b9ff172264af059"
};

// אתחול Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const database = firebase.database();
const storage = firebase.storage();

// --- בדיקת משתמש מחובר (המקור היחיד לאמת) ---
auth.onAuthStateChanged((user) => {
    const navDashboard = document.getElementById('nav-dashboard');
    const authSections = document.getElementById('auth-sections');
    const welcomeSection = document.getElementById('welcome-section');

    if (user) {
        // User is logged in
        if (navDashboard) {
            navDashboard.style.setProperty('display', 'block', 'important');
        }
        if (authSections) {
            authSections.style.display = 'none';
        }
        if (welcomeSection) {
            welcomeSection.style.display = 'block';
            document.getElementById('userEmailDisplay').textContent = user.email;
        }
    } else {
        // User is logged out
        if (navDashboard) {
            navDashboard.style.setProperty('display', 'none', 'important');
        }
        if (authSections) {
            authSections.style.setProperty('display', 'flex', 'important');
        }
        if (welcomeSection) {
            welcomeSection.style.display = 'none';
        }
        // Redirect to Home if on Dashboard page
        if (window.location.pathname.includes('bakara.html')) {
            window.location.replace('index.html');
        }
        
        // ניקוי שאריות זיכרון
        localStorage.removeItem("authUser");
    }
});

console.log("SmartOwl System Loaded - Auth Managed by Firebase Only");

// --- 2. פונקציות התחברות והרשמה (חדש!) ---

// פונקציית התחברות
window.login = function() {
    const email = document.getElementById('emaillogin').value;
    const password = document.getElementById('passwordlogin').value;
    const alertDiv = document.getElementById('alert');

    if (!email || !password) {
        if(alertDiv) { alertDiv.innerText = "Please enter email and password."; alertDiv.style.display = "block"; }
        return;
    }

    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            console.log("Login successful");
            // אין צורך בפקודת מעבר דף, ה-Listener למעלה יעשה את זה
        })
        .catch((error) => {
            if(alertDiv) { alertDiv.innerText = "Login failed: " + error.message; alertDiv.style.display = "block"; }
        });
};

// פונקציית הרשמה עם תמונה
window.sign = function() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const fileInput = document.getElementById('faceImage');
    const errorDiv = document.getElementById('error');
    const loadingDiv = document.getElementById('loading');

    if (errorDiv) { errorDiv.style.display = "none"; errorDiv.innerText = ""; }

    if (!email || !password) {
        if(errorDiv) { errorDiv.innerText = "Valid email and password required."; errorDiv.style.display = "block"; }
        return;
    }
    if (fileInput.files.length === 0) {
        if(errorDiv) { errorDiv.innerText = "Face image required."; errorDiv.style.display = "block"; }
        return;
    }

    const imageFile = fileInput.files[0];
    if(loadingDiv) loadingDiv.style.display = "block";

    auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            const user = userCredential.user;
            const storageRef = storage.ref('users_faces/' + user.uid + '.jpg');
            const uploadTask = storageRef.put(imageFile);

            uploadTask.on('state_changed', null, 
                (error) => {
                    console.error("Upload error:", error);
                    if(loadingDiv) loadingDiv.style.display = "none";
                }, 
                () => {
                    uploadTask.snapshot.ref.getDownloadURL().then((downloadURL) => {
                        database.ref('users/' + user.uid).set({
                            email: email,
                            faceImageURL: downloadURL,
                            registeredAt: Date.now()
                        }).then(() => {
                            if(loadingDiv) loadingDiv.style.display = "none";
                            alert("Registration successful!");
                            // ה-Listener יכניס אותך אוטומטית
                        });
                    });
                }
            );
        })
        .catch((error) => {
            if(loadingDiv) loadingDiv.style.display = "none";
            if(errorDiv) { errorDiv.innerText = error.message; errorDiv.style.display = "block"; }
        });
};

// --- 3. פונקציית התנתקות (נקייה) ---
window.logout = function() {
    console.log("Logging out...");
    auth.signOut().then(() => {
        localStorage.removeItem("authUser");
        localStorage.clear();
        // אין reload - ה-Listener מעדכן את המסך מיד
    }).catch((error) => {
        console.error('Logout error:', error);
    });
};


// --- 4. משתני מערכת (Smart Home Logic) ---
let currentHomeState = { 
    doorOpen: false, lights: false, alarmArmed: false, fanOn: false, blindsOpen: false 
};
let lastFanAlertTime = 0;
let lastBlindAlertTime = 0;
const ALERT_COOLDOWN = 60000; 
let isAlertShown = false;
let isIntruderShown = false;
let smartModal;
let intruderModal;
let globalCamIp = ""; 

// --- טעינת מודלים לזיהוי פנים ---
const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models'; 
let isModelsLoaded = false;

async function loadFaceModels() {
    try {
        console.log("Loading Face API models...");
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        isModelsLoaded = true;
        console.log("Face Models Loaded");
    } catch (err) {
        console.error("Error loading models:", err);
    }
}
loadFaceModels();

// --- 5. פונקציות שליטה ---
window.refreshCam = function() {
    var camEl = document.getElementById('camStream');
    if (camEl && globalCamIp) {
        camEl.src = `http://${globalCamIp}:81/stream?t=${new Date().getTime()}`;
    }
};

window.controlDevice = function(device, code) {
    console.log(`Command: ${device} -> ${code}`); 
    database.ref('smartHouse/toAltera').set(code);
    
    // אופטימיזציה של ה-UI
    if (device === 'fan') { database.ref('smartHouse/fan').set(code); window.updateFanUI(code === 66); } 
    else if (device === 'blinds') { database.ref('smartHouse/blinds').set(code); window.updateBlindsUI(code === 195); } 
    else if (device === 'door') { database.ref('smartHouse/door').set(code); window.updateDoorUI(code === 3); } 
    else if (device === 'alarm') { database.ref('smartHouse/alarm').set(code); window.updateAlarmUI(code === 129); }
};

// --- לוגיקה לזיהוי פנים דרך ESP32 ---
window.startFaceAuth = async function() {
    if (!isModelsLoaded) { alert("Models loading..."); return; }
    if (!globalCamIp) { alert("No Camera IP found."); return; }

    const statusText = document.getElementById('authStatus');
    const authContainer = document.getElementById('faceAuthContainer');
    const doorWrapper = document.getElementById('doorWrapper');
    const videoEl = document.getElementById('webcamVideo'); 

    if(doorWrapper) doorWrapper.style.display = 'none';
    if(authContainer) authContainer.style.display = 'block';
    if(videoEl) videoEl.style.display = "none"; 

    statusText.innerText = "Capturing from Door...";
    statusText.className = "mt-2 text-warning fw-bold small";

    try {
        const captureUrl = `http://${globalCamIp}/capture?t=${new Date().getTime()}`;
        const imgFromEsp = await faceapi.fetchImage(captureUrl);
        statusText.innerText = "Processing...";
        
        let previewImg = document.getElementById('previewCapture');
        if (!previewImg) {
            previewImg = document.createElement('img');
            previewImg.id = 'previewCapture';
            previewImg.style.width = '100%';
            previewImg.style.borderRadius = '10px';
            authContainer.insertBefore(previewImg, statusText);
        }
        previewImg.src = captureUrl;
        previewImg.style.display = 'block';

        await performFaceScanOnImage(imgFromEsp, statusText);
    } catch (err) {
        console.error("Error capturing from ESP32:", err);
        statusText.innerText = "Error fetching image from door.";
        setTimeout(window.resetAuthUI, 3000);
    }
};

window.resetAuthUI = function() {
    const authContainer = document.getElementById('faceAuthContainer');
    const doorWrapper = document.getElementById('doorWrapper');
    const statusText = document.getElementById('authStatus');
    const previewImg = document.getElementById('previewCapture');
    if(authContainer) authContainer.style.display = 'none';
    if(doorWrapper) doorWrapper.style.display = 'block';
    if(statusText) statusText.innerText = "";
    if(previewImg) previewImg.style.display = 'none';
};

async function performFaceScanOnImage(inputImage, statusText) {
    const user = firebase.auth().currentUser;
    if (!user) { statusText.innerText = "Error: Not Logged In"; setTimeout(window.resetAuthUI, 3000); return; }

    const detection = await faceapi.detectSingleFace(inputImage).withFaceLandmarks().withFaceDescriptor();
    if (!detection) { statusText.innerText = "No face detected."; setTimeout(window.resetAuthUI, 3000); return; }

    statusText.innerText = "Verifying identity...";
    const userImageRef = storage.ref(`users_faces/${user.uid}.jpg`); 
    try {
        const url = await userImageRef.getDownloadURL();
        const imgFromStorage = await faceapi.fetchImage(url);
        const sourceDetection = await faceapi.detectSingleFace(imgFromStorage).withFaceLandmarks().withFaceDescriptor();
        
        if (!sourceDetection) { statusText.innerText = "Profile image invalid."; setTimeout(window.resetAuthUI, 3000); return; }

        const distance = faceapi.euclideanDistance(detection.descriptor, sourceDetection.descriptor);
        if (distance < 0.45) {
            statusText.innerHTML = `<span class="text-success">Access Granted!</span>`;
            window.controlDevice('door', 3);
        } else {
            statusText.innerHTML = `<span class="text-danger">Access Denied.</span>`;
            window.controlDevice('door', 2);
        }
    } catch (error) {
        console.error(error);
        statusText.innerText = "Verification Error";
        window.controlDevice('door', 2);
    }
    setTimeout(window.resetAuthUI, 4000); 
}

// --- עדכוני ממשק וחיישנים ---
window.toggleAlarmSystem = function() { 
    const newCode = currentHomeState.alarmArmed ? 128 : 129;
    window.controlDevice('alarm', newCode);
};
window.setLightState = function(isOn) { 
    currentHomeState.lights = isOn;
    var bulb = document.getElementById('lightBulbWrapper');
    if (bulb) bulb.classList.toggle('is-on', isOn);
    database.ref('smartHouse/lights').set(isOn);
};
window.updateLightFromInput = function() {
    const val = document.getElementById('lightInput').value;
    if (val !== "") { window.setLightState(parseInt(val) > 0); }
};
window.resetIntruderAlert = function() {
    if (intruderModal) intruderModal.hide();
    isIntruderShown = false;
};
window.updateFanUI = function(isOn) {
    currentHomeState.fanOn = isOn;
    const el = document.getElementById('fanWrapper');
    if(el) isOn ? el.classList.add('fan-active') : el.classList.remove('fan-active');
};
window.updateBlindsUI = function(isOpen) {
    currentHomeState.blindsOpen = isOpen;
    const el = document.getElementById('blindsWrapper');
    if(el) isOpen ? el.classList.add('window-open') : el.classList.remove('window-open');
};
window.updateDoorUI = function(isOpen) {
    currentHomeState.doorOpen = isOpen;
    const el = document.getElementById('doorWrapper');
    if (el) el.classList.toggle('door-open', isOpen);
};
window.updateAlarmUI = function(isArmed) {
    currentHomeState.alarmArmed = isArmed;
    const siren = document.getElementById('alarmWrapper');
    const btn = document.getElementById('alarmToggleBtn');
    if(siren) isArmed ? siren.classList.add('alarm-active') : siren.classList.remove('alarm-active');
    if (btn) {
        if (isArmed) { btn.innerText = "Deactivate Alarm"; btn.className = "btn btn-calm-danger w-100 py-2"; } 
        else { btn.innerText = "Active alarm"; btn.className = "btn btn-calm-on w-100 py-2"; }
    }
};

// Events
document.addEventListener('DOMContentLoaded', function() {
    const mEl = document.getElementById('smartAlertModal');
    if (mEl) { smartModal = new bootstrap.Modal(mEl); mEl.addEventListener('hidden.bs.modal', function () { isAlertShown = false; }); }
    const iEl = document.getElementById('intruderModal');
    if (iEl) intruderModal = new bootstrap.Modal(iEl);
});

// Listeners
// האזנה לשינויים בכתובת ה-IP בפיירבייס
database.ref('camIp').on('value', (snapshot) => { 
    const ip = snapshot.val(); 
    
    if(ip) { 
        // שמירת ה-IP למשתנה גלובלי (לשימוש בפונקציות אחרות כמו זיהוי פנים)
        globalCamIp = ip; 
        
        // איתור אלמנט התמונה ב-DOM
        const camEl = document.getElementById('camStream');
        
        if(camEl) {
            // עדכון המקור לכתובת הסטרים (נתיב :81/stream הוא הסטנדרט ב-ESP32-CAM)
            // הוספת Math.random() מונעת מהדפדפן לשמור Cache של תמונה קפואה
            camEl.src = `http://${ip}:81/stream`; 
            
            console.log("Camera stream updated to:", camEl.src);
        }
    } else {
        console.log("Waiting for Camera IP...");
    }
});
database.ref('fromAltera').on('value', (s) => {
    const d = s.val();
    if(d) {
        const now = Date.now();
        document.getElementById('liveLight').innerText = d.B || d.L || 0;
        const dist = d.distance || d.A || 0;
        const distEl = document.getElementById('liveDist');
        if(distEl) distEl.innerText = dist + " ס\"מ";
        
        if (currentHomeState.alarmArmed && dist <= 10 && dist > 0) {
            document.getElementById('alarmWarning').style.display = "block";
            document.getElementById('alarmWrapper').classList.add('alarm-active');
            if(distEl) distEl.className = "status-value text-danger";
            if (intruderModal && !isIntruderShown) { isIntruderShown = true; if(smartModal) smartModal.hide(); isAlertShown = false; document.getElementById('intruderDistVal').innerText = dist; intruderModal.show(); }
        } else {
            document.getElementById('alarmWarning').style.display = "none";
            if (!currentHomeState.alarmArmed) document.getElementById('alarmWrapper').classList.remove('alarm-active');
            if(distEl) distEl.className = "status-value text-white";
        }
        
        const temp = parseFloat(d.temperature || d.T || "--");
        document.getElementById('liveTemp').innerText = isNaN(temp) ? "--" : temp.toFixed(1) + "°C";
        
        if(!isNaN(temp) && (now - lastFanAlertTime > ALERT_COOLDOWN)) {
             if (temp > 30 && !currentHomeState.fanOn && !isAlertShown && !isIntruderShown) { lastFanAlertTime = now; showSmartAlert(`חם (${temp}°C). להפעיל מאוורר?`, () => window.controlDevice('fan', 66)); }
             else if (temp < 28 && currentHomeState.fanOn && !isAlertShown && !isIntruderShown) { lastFanAlertTime = now; showSmartAlert(`קר. לכבות מאוורר?`, () => window.controlDevice('fan', 64)); }
        }
        
        const hum = parseFloat(d.humidity || d.C || 0);
        const rainEl = document.getElementById('liveRain');
        if(rainEl && hum > 0) {
            rainEl.innerText = hum.toFixed(0) + "%";
            rainEl.className = hum > 80 ? "status-value text-info" : "status-value text-warning";
            if(!isNaN(hum) && (now - lastBlindAlertTime > ALERT_COOLDOWN)) {
                if (hum > 80 && currentHomeState.blindsOpen && !isAlertShown && !isIntruderShown) { lastBlindAlertTime = now; showSmartAlert(`גשום. לסגור תריסים?`, () => window.controlDevice('blinds', 194)); }
                else if (hum < 80 && !currentHomeState.blindsOpen && !isAlertShown && !isIntruderShown) { lastBlindAlertTime = now; showSmartAlert(`נעים. לפתוח תריסים?`, () => window.controlDevice('blinds', 195)); }
            }
        }
    }
});
database.ref('smartHouse').on('value', (s) => {
    const d = s.val();
    if(d) {
        if(d.lights !== undefined) window.setLightState(d.lights);
        if(d.door) window.updateDoorUI(d.door === 3);
        if(d.alarm !== undefined) window.updateAlarmUI(d.alarm === 129);
        if(d.fan) window.updateFanUI(d.fan === 66);
        if(d.blinds) window.updateBlindsUI(d.blinds === 195);
    }
});
function showSmartAlert(msg, cb) {
    if(isAlertShown || isIntruderShown) return;
    isAlertShown = true;
    document.getElementById('alertBody').innerText = msg;
    const btn = document.getElementById('alertActionBtn');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', function() { cb(); smartModal.hide(); });
    smartModal.show();
}
