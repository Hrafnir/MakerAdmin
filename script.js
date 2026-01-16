/* Version: #9 */

import { firebaseConfig } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    signInWithPopup, 
    GoogleAuthProvider, 
    onAuthStateChanged, 
    signOut,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    getDocs, 
    addDoc, 
    query, 
    orderBy, 
    serverTimestamp,
    doc,
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// === INITIALISERING ===
console.log("[System] Initialiserer Firebase Versjon #9...");
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// === GLOBAL STATE ===
let currentUser = null;
let materials = [];
let machines = [];
let currentPendingUsage = null;

// === APP LOGIKK ===
window.app = {
    // Navigasjon
    showSection: (sectionId) => {
        console.log(`[UI] Navigerer til seksjon: ${sectionId}`);
        const sections = document.querySelectorAll('.section-content, #auth-section');
        sections.forEach(s => s.classList.add('hidden'));
        
        const target = document.getElementById(`${sectionId}-section`);
        if (target) {
            target.classList.remove('hidden');
        } else {
            console.error(`[UI] Seksjon ikke funnet: ${sectionId}-section`);
        }
    },

    // Autentisering - E-post/Passord Logikk
    handleEmailAuth: async (type) => {
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;

        if (!email || !password) {
            alert("Vennligst fyll ut både e-post og passord.");
            return;
        }

        try {
            if (type === 'signup') {
                console.log(`[Auth] Forsøker å opprette bruker: ${email}`);
                await createUserWithEmailAndPassword(auth, email, password);
                alert("Bruker opprettet!");
            } else {
                console.log(`[Auth] Forsøker å logge inn: ${email}`);
                await signInWithEmailAndPassword(auth, email, password);
            }
        } catch (error) {
            console.error("[Auth] Feil ved e-post autentisering:", error.code, error.message);
            alert(`Feil: ${error.message}`);
        }
    },

    // Henting av data
    loadInitialData: async () => {
        console.log("[Data] Henter ferske data fra Firestore...");
        try {
            const matSnap = await getDocs(collection(db, "materials"));
            materials = matSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const machSnap = await getDocs(collection(db, "machines"));
            machines = machSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            console.log(`[Data] Lastet ${materials.length} materialer og ${machines.length} maskiner.`);
            window.app.populateDropdowns();
            window.app.renderInventory();
        } catch (error) {
            console.error("[Data] Feil ved henting av data:", error);
        }
    },

    populateDropdowns: () => {
        const matSelect = document.getElementById('material-select');
        const machSelect = document.getElementById('machine-select');

        if (matSelect) {
            matSelect.innerHTML = '<option value="">Velg materiale...</option>' + 
                materials.map(m => `<option value="${m.id}">${m.navn} (${m.enhet})</option>`).join('');
        }
        if (machSelect) {
            machSelect.innerHTML = '<option value="">Velg maskin...</option>' + 
                machines.map(m => `<option value="${m.id}">${m.navn}</option>`).join('');
        }
    },

    calculateCurrentPrice: () => {
        const matId = document.getElementById('material-select').value;
        const amount = parseFloat(document.getElementById('amount-input').value) || 0;
        const ownMaterial = document.getElementById('own-material-check').checked;
        
        if (!matId || ownMaterial) {
            document.getElementById('calculated-price').innerText = "0.00";
            return 0;
        }

        const material = materials.find(m => m.id === matId);
        if (material) {
            const prisPrEnhet = currentUser?.isMember ? material.prisMedlem : material.prisDropIn;
            const total = (prisPrEnhet * amount).toFixed(2);
            document.getElementById('calculated-price').innerText = total;
            return parseFloat(total);
        }
        return 0;
    },

    renderInventory: () => {
        const tbody = document.getElementById('inventory-body');
        if (!tbody) return;

        tbody.innerHTML = materials.map(m => {
            const isLow = m.lagerantall <= m.varslingsgrense;
            return `
                <tr>
                    <td>${m.navn}</td>
                    <td class="${isLow ? 'status-low' : ''}">${m.lagerantall} ${m.enhet}</td>
                    <td>M: ${m.prisMedlem} / D: ${m.prisDropIn}</td>
                    <td>${isLow ? '<span class="status-low">LITE LAGER</span>' : 'OK'}</td>
                    <td><button class="btn-small">Endre</button></td>
                </tr>
            `;
        }).join('');
    },

    saveUsageToDatabase: async () => {
        if (!currentPendingUsage) return;
        const { materialId, amount, machineId, price, timeUsed } = currentPendingUsage;

        try {
            await runTransaction(db, async (transaction) => {
                const materialRef = doc(db, "materials", materialId);
                const matDoc = await transaction.get(materialRef);

                if (!matDoc.exists()) throw "Materialet eksisterer ikke!";

                const nyttLagerantall = matDoc.data().lagerantall - amount;
                transaction.update(materialRef, { lagerantall: nyttLagerantall });

                const logRef = doc(collection(db, "usage_logs"));
                transaction.set(logRef, {
                    userId: currentUser.uid,
                    userName: currentUser.displayName || currentUser.email,
                    materialId: materialId,
                    materialName: matDoc.data().navn,
                    machineId: machineId,
                    amount: amount,
                    price: price,
                    timeUsed: timeUsed,
                    timestamp: serverTimestamp()
                });
            });

            console.log("[Transaction] Suksess.");
            alert("Registrert!");
            document.getElementById('vipps-modal').classList.add('hidden');
            document.getElementById('usage-form').reset();
            window.app.loadInitialData();

        } catch (error) {
            console.error("[Transaction] Feilet:", error);
            alert("Feil: " + error);
        }
    }
};

// === EVENT LISTENERS ===

// Innlogging med Google
document.getElementById('google-login-btn')?.addEventListener('click', () => {
    console.log("[Auth] Starter Google Login...");
    signInWithPopup(auth, provider);
});

// E-post Innlogging
document.getElementById('email-auth-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    window.app.handleEmailAuth('login');
});

// Opprett Bruker
document.getElementById('signup-email-btn')?.addEventListener('click', () => {
    window.app.handleEmailAuth('signup');
});

// Utlogging
document.getElementById('logout-btn')?.addEventListener('click', () => signOut(auth));

// Priskalkulator
['material-select', 'amount-input', 'own-material-check'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => window.app.calculateCurrentPrice());
});

// Registrering av bruk
document.getElementById('usage-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const usageData = {
        machineId: document.getElementById('machine-select').value,
        materialId: document.getElementById('material-select').value,
        amount: parseFloat(document.getElementById('amount-input').value),
        timeUsed: parseInt(document.getElementById('time-input').value),
        price: window.app.calculateCurrentPrice()
    };
    if (!usageData.machineId || !usageData.materialId || isNaN(usageData.amount)) return;
    currentPendingUsage = usageData;
    if (usageData.price > 0) {
        document.getElementById('modal-amount').innerText = `${usageData.price} kr`;
        document.getElementById('vipps-modal').classList.remove('hidden');
    } else {
        window.app.saveUsageToDatabase();
    }
});

document.querySelector('.close-modal')?.addEventListener('click', () => {
    document.getElementById('vipps-modal').classList.add('hidden');
});

document.getElementById('confirm-payment-btn')?.addEventListener('click', () => {
    window.app.saveUsageToDatabase();
});

// CSV Eksport
document.getElementById('export-csv-btn')?.addEventListener('click', () => {
    let csv = "data:text/csv;charset=utf-8,Navn,Lager,Enhet,Medlem,Dropin\n";
    materials.forEach(m => csv += `${m.navn},${m.lagerantall},${m.enhet},${m.prisMedlem},${m.prisDropIn}\n`);
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csv));
    link.setAttribute("download", "lager.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// === AUTH STATE OBSERVER ===
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log(`[Auth] Aktiv bruker: ${user.email}`);
        currentUser = user;
        currentUser.isMember = true; // Placeholder for medlemskapssjekk
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('main-header').classList.remove('hidden');
        window.app.showSection('log-use');
        window.app.loadInitialData();
    } else {
        console.log("[Auth] Ingen bruker.");
        currentUser = null;
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('main-header').classList.add('hidden');
    }
});

console.log("[System] script.js Versjon #9 ferdig lastet.");

/* Version: #9 */
