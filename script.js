/* Version: #7 */

import { firebaseConfig } from "./config.js";
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
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// === INITIALISERING ===
console.log("[System] Initialiserer Firebase Versjon #7...");
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// === GLOBAL STATE ===
let currentUser = null;
let materials = [];
let machines = [];
let currentPendingUsage = null; // Lagrer data midlertidig mens vi venter på Vipps-bekreftelse

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

    // Henting av data (Lager og Maskiner)
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

    // Oppdater UI-elementer
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

    // Beregn pris basert på input
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
            // Sjekker om bruker er medlem eller drop-in
            const prisPrEnhet = currentUser?.isMember ? material.prisMedlem : material.prisDropIn;
            const total = (prisPrEnhet * amount).toFixed(2);
            document.getElementById('calculated-price').innerText = total;
            return parseFloat(total);
        }
        return 0;
    },

    // Oppdater lagertabellen i UI
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
                    <td><button class="btn-small" onclick="alert('Redigering kommer i neste versjon')">Endre</button></td>
                </tr>
            `;
        }).join('');
    },

    // === HOVEDFUNKSJON: LAGRING AV BRUK ===
    // Bruker en Firestore Transaction for å sikre at lagerbeholdningen oppdateres trygt (Race Condition Proof)
    saveUsageToDatabase: async () => {
        if (!currentPendingUsage) return;

        const { materialId, amount, machineId, price, timeUsed } = currentPendingUsage;
        console.log("[Transaction] Starter lagringsprosess for:", currentPendingUsage);

        try {
            await runTransaction(db, async (transaction) => {
                const materialRef = doc(db, "materials", materialId);
                const matDoc = await transaction.get(materialRef);

                if (!matDoc.exists()) {
                    throw "Materialet eksisterer ikke i databasen!";
                }

                const nyttLagerantall = matDoc.data().lagerantall - amount;
                
                // 1. Oppdater lagerbeholdning
                transaction.update(materialRef, { lagerantall: nyttLagerantall });

                // 2. Lagre logg-oppføring
                const logRef = doc(collection(db, "usage_logs"));
                transaction.set(logRef, {
                    userId: currentUser.uid,
                    userName: currentUser.displayName,
                    materialId: materialId,
                    materialName: matDoc.data().navn,
                    machineId: machineId,
                    amount: amount,
                    price: price,
                    timeUsed: timeUsed,
                    timestamp: serverTimestamp()
                });
            });

            console.log("[Transaction] Suksess! Lager oppdatert og logg lagret.");
            alert("Bruk er registrert og lageret er oppdatert.");
            document.getElementById('vipps-modal').classList.add('hidden');
            document.getElementById('usage-form').reset();
            window.app.loadInitialData(); // Oppdaterer lista

        } catch (error) {
            console.error("[Transaction] Feilet:", error);
            alert("Kunne ikke lagre: " + error);
        }
    }
};

// === EVENT LISTENERS ===

// Auth
document.getElementById('google-login-btn')?.addEventListener('click', () => signInWithPopup(auth, provider));
document.getElementById('logout-btn')?.addEventListener('click', () => signOut(auth));

// Priskalkulator-trigger
['material-select', 'amount-input', 'own-material-check'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => window.app.calculateCurrentPrice());
});

// Skjema-innsending
document.getElementById('usage-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const usageData = {
        machineId: document.getElementById('machine-select').value,
        materialId: document.getElementById('material-select').value,
        amount: parseFloat(document.getElementById('amount-input').value),
        timeUsed: parseInt(document.getElementById('time-input').value),
        price: window.app.calculateCurrentPrice()
    };

    if (!usageData.machineId || !usageData.materialId || isNaN(usageData.amount)) {
        alert("Vennligst fyll ut alle påkrevde felter.");
        return;
    }

    currentPendingUsage = usageData;

    if (usageData.price > 0) {
        document.getElementById('modal-amount').innerText = `${usageData.price} kr`;
        document.getElementById('vipps-modal').classList.remove('hidden');
    } else {
        // Hvis prisen er 0 (eget materiale), lagre direkte
        window.app.saveUsageToDatabase();
    }
});

// Modal-handlinger
document.querySelector('.close-modal')?.addEventListener('click', () => {
    document.getElementById('vipps-modal').classList.add('hidden');
});

document.getElementById('confirm-payment-btn')?.addEventListener('click', () => {
    console.log("[UI] Bruker bekreftet betaling.");
    window.app.saveUsageToDatabase();
});

// === AUTH STATE OBSERVER ===
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log(`[Auth] Innlogget: ${user.email}`);
        currentUser = user;
        currentUser.isMember = true; // Her kan vi senere legge inn sjekk mot en 'users' collection
        
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('main-header').classList.remove('hidden');
        window.app.showSection('log-use');
        window.app.loadInitialData();
    } else {
        console.log("[Auth] Utlogget.");
        currentUser = null;
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('main-header').classList.add('hidden');
    }
});

console.log("[System] script.js Versjon #7 ferdig lastet.");

/* Version: #7 */
