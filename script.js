/* Version: #5 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    signInWithPopup, 
    GoogleAuthProvider, 
    onAuthStateChanged, 
    signOut 
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
    updateDoc,
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// === CONFIGURATION ===
// VIKTIG: Erstatt verdiene nedenfor med dine egne fra Firebase Console
const firebaseConfig = {
    apiKey: "DIN_API_KEY",
    authDomain: "DITT_PROSJEKT.firebaseapp.com",
    projectId: "DITT_PROSJEKT",
    storageBucket: "DITT_PROSJEKT.appspot.com",
    messagingSenderId: "DIN_SENDER_ID",
    appId: "DIN_APP_ID"
};

console.log("[System] Initialiserer Firebase Versjon #5...");
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// === GLOBAL STATE ===
let currentUser = null;
let materials = [];
let machines = [];

// === APP LOGIKK ===
window.app = {
    // Navigasjon mellom seksjoner
    showSection: (sectionId) => {
        console.log(`[UI] Navigerer til seksjon: ${sectionId}`);
        const sections = document.querySelectorAll('.section-content, #auth-section');
        sections.forEach(s => s.classList.add('hidden'));
        
        const target = document.getElementById(`${sectionId}-section`);
        if (target) {
            target.classList.remove('hidden');
            console.log(`[UI] Seksjon ${sectionId} er nå synlig.`);
        } else {
            console.error(`[UI] Fant ikke seksjonen: ${sectionId}-section`);
        }
    },

    // Lasting av data fra Firestore
    loadInitialData: async () => {
        console.log("[Data] Starter henting av materialer og maskiner...");
        try {
            const matSnap = await getDocs(collection(db, "materials"));
            materials = matSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`[Data] Lastet ${materials.length} materialer.`, materials);

            const machSnap = await getDocs(collection(db, "machines"));
            machines = machSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`[Data] Lastet ${machines.length} maskiner.`, machines);

            window.app.populateDropdowns();
            window.app.renderInventory();
        } catch (error) {
            console.error("[Data] Kritisk feil ved henting av data:", error);
        }
    },

    // Oppdater dropdown-menyer
    populateDropdowns: () => {
        console.log("[UI] Oppdaterer dropdown-menyer...");
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

    // Kalkuler pris
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
            return total;
        }
        return 0;
    },

    // Tegner opp lagertabellen
    renderInventory: () => {
        console.log("[UI] Oppdaterer lagertabell...");
        const tbody = document.getElementById('inventory-body');
        if (!tbody) return;

        if (materials.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">Ingen materialer funnet.</td></tr>';
            return;
        }

        tbody.innerHTML = materials.map(m => {
            const isLow = m.lagerantall <= m.varslingsgrense;
            return `
                <tr>
                    <td>${m.navn}</td>
                    <td class="${isLow ? 'status-low' : ''}">${m.lagerantall} ${m.enhet}</td>
                    <td>M: ${m.prisMedlem} / D: ${m.prisDropIn}</td>
                    <td>${isLow ? '<span class="status-low">LITE PÅ LAGER</span>' : 'OK'}</td>
                    <td><button class="btn-small">Endre</button></td>
                </tr>
            `;
        }).join('');
    }
};

// === EVENT LISTENERS ===

document.getElementById('google-login-btn')?.addEventListener('click', async () => {
    console.log("[Auth] Starter Google Login...");
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("[Auth] Login feilet:", error);
    }
});

document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("[Auth] Feil ved utlogging:", error);
    }
});

['material-select', 'amount-input', 'own-material-check'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('change', () => window.app.calculateCurrentPrice());
        el.addEventListener('input', () => window.app.calculateCurrentPrice());
    }
});

document.getElementById('usage-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const price = window.app.calculateCurrentPrice();
    if (price > 0) {
        document.getElementById('modal-amount').innerText = `${price} kr`;
        document.getElementById('vipps-modal').classList.remove('hidden');
    } else {
        alert("Bruk registrert!");
    }
});

document.querySelector('.close-modal')?.addEventListener('click', () => {
    document.getElementById('vipps-modal').classList.add('hidden');
});

// === AUTH STATE OBSERVER ===
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log(`[Auth State] Aktiv sesjon: ${user.email}`);
        currentUser = user;
        currentUser.isMember = true; 
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('main-header').classList.remove('hidden');
        window.app.showSection('log-use');
        window.app.loadInitialData();
    } else {
        console.log("[Auth State] Ingen aktiv sesjon.");
        currentUser = null;
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('main-header').classList.add('hidden');
        document.querySelectorAll('.section-content').forEach(s => s.classList.add('hidden'));
    }
});

// === EKSPORT ===
document.getElementById('export-csv-btn')?.addEventListener('click', () => {
    console.log("[Export] Genererer CSV...");
    let csvContent = "data:text/csv;charset=utf-8,Navn,Lager,Enhet,Pris Medlem,Pris Dropin\n";
    materials.forEach(m => {
        csvContent += `${m.navn},${m.lagerantall},${m.enhet},${m.prisMedlem},${m.prisDropIn}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "lagerbeholdning.csv");
    document.body.appendChild(link);
    link.click();
});

console.log("[System] script.js Versjon #5 ferdig lastet.");

/* Version: #5 */
