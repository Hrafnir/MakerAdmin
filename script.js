/* Version: #4 */
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
// VIKTIG: Erstatt verdiene nedenfor med dine egne fra Firebase Console -> Project Settings
const firebaseConfig = {
apiKey: "DIN_API_KEY",
authDomain: "DITT_PROSJEKT.firebaseapp.com",
projectId: "DITT_PROSJEKT",
storageBucket: "DITT_PROSJEKT.appspot.com",
messagingSenderId: "DIN_SENDER_ID",
appId: "DIN_APP_ID"
};
console.log("[System] Initialiserer Firebase Versjon #4...");
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
console.log([UI] Navigerer til seksjon: ${sectionId});
const sections = document.querySelectorAll('.section-content, #auth-section');
sections.forEach(s => s.classList.add('hidden'));
code
Code
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
    console.log("[Data] Starter henting av materialer og maskiner fra Firestore...");
    try {
        // Hent Materialer
        const matSnap = await getDocs(collection(db, "materials"));
        materials = matSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`[Data] Lastet ${materials.length} materialer.`, materials);

        // Hent Maskiner
        const machSnap = await getDocs(collection(db, "machines"));
        machines = machSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`[Data] Lastet ${machines.length} maskiner.`, machines);

        window.app.populateDropdowns();
        window.app.renderInventory();
    } catch (error) {
        console.error("[Data] Kritisk feil ved henting av data:", error);
    }
},

// Oppdater dropdown-menyer i skjemaet
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
    console.log("[UI] Dropdowns oppdatert.");
},

// Priskalkulering basert på valg og medlemskap
calculateCurrentPrice: () => {
    const matId = document.getElementById('material-select').value;
    const amount = parseFloat(document.getElementById('amount-input').value) || 0;
    const ownMaterial = document.getElementById('own-material-check').checked;
    
    console.log(`[Calc] Beregner pris: Materiale=${matId}, Mengde=${amount}, Eget=${ownMaterial}`);

    if (!matId || ownMaterial) {
        document.getElementById('calculated-price').innerText = "0.00";
        return 0;
    }

    const material = materials.find(m => m.id === matId);
    if (material) {
        // Sjekk om brukeren har 'isMember' flagg i sin profil (vi simulerer true her inntil videre)
        const prisPrEnhet = currentUser?.isMember ? material.prisMedlem : material.prisDropIn;
        const total = (prisPrEnhet * amount).toFixed(2);
        
        document.getElementById('calculated-price').innerText = total;
        console.log(`[Calc] Ferdig beregnet: ${total} kr (Basert på ${prisPrEnhet} pr enhet)`);
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
        tbody.innerHTML = '<tr><td colspan="5">Ingen materialer funnet i databasen.</td></tr>';
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
                <td><button class="btn-small" onclick="console.log('Edit ${m.id} trykket')">Endre</button></td>
            </tr>
        `;
    }).join('');
}
};
// === EVENT LISTENERS ===
// Google Innlogging
document.getElementById('google-login-btn')?.addEventListener('click', async () => {
console.log("[Auth] Starter Google Login-prosess...");
try {
const result = await signInWithPopup(auth, provider);
console.log("[Auth] Login suksess for:", result.user.email);
} catch (error) {
console.error("[Auth] Login feilet:", error);
alert("Innlogging feilet: " + error.message);
}
});
// Utlogging
document.getElementById('logout-btn')?.addEventListener('click', async () => {
console.log("[Auth] Logger ut bruker...");
try {
await signOut(auth);
console.log("[Auth] Utlogging fullført.");
} catch (error) {
console.error("[Auth] Feil ved utlogging:", error);
}
});
// Reager på endringer i skjemaet for å oppdatere pris løpende
['material-select', 'amount-input', 'own-material-check'].forEach(id => {
const el = document.getElementById(id);
if (el) {
el.addEventListener('change', () => window.app.calculateCurrentPrice());
el.addEventListener('input', () => window.app.calculateCurrentPrice());
}
});
// Innsending av logg-skjema
document.getElementById('usage-form')?.addEventListener('submit', async (e) => {
e.preventDefault();
console.log("[Usage] Skjema sendt inn. Validerer data...");
code
Code
const matId = document.getElementById('material-select').value;
const amount = parseFloat(document.getElementById('amount-input').value);
const price = window.app.calculateCurrentPrice();

if (!matId || isNaN(amount)) {
    alert("Vennligst fyll ut alle felter.");
    return;
}

const modal = document.getElementById('vipps-modal');
const modalAmount = document.getElementById('modal-amount');

if (price > 0) {
    console.log(`[Usage] Betaling kreves: ${price} kr. Åpner Vipps-modal.`);
    modalAmount.innerText = `${price} kr`;
    modal.classList.remove('hidden');
} else {
    console.log("[Usage] Ingen betaling kreves (eget materiale eller gratiskvote). Registrerer direkte.");
    alert("Bruk registrert! (Demo: ingen database-skriving ennå)");
}
});
// Lukk Modal-vindu
document.querySelector('.close-modal')?.addEventListener('click', () => {
console.log("[UI] Lukker Vipps-modal.");
document.getElementById('vipps-modal').classList.add('hidden');
});
// === AUTH STATE OBSERVER (OVERVÅKER INNLOGGING) ===
onAuthStateChanged(auth, (user) => {
if (user) {
console.log([Auth State] Aktiv sesjon: ${user.email});
currentUser = user;
// Midlertidig simulering av medlemsstatus
currentUser.isMember = true;
code
Code
document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('main-header').classList.remove('hidden');
    
    window.app.showSection('log-use');
    window.app.loadInitialData();
} else {
    console.log("[Auth State] Ingen aktiv sesjon (bruker er logget ut).");
    currentUser = null;
    document.getElementById('auth-section').classList.remove('hidden');
    document.getElementById('main-header').classList.add('hidden');
    document.querySelectorAll('.section-content').forEach(s => s.classList.add('hidden'));
}
});
// === EKSPORT TIL CSV ===
document.getElementById('export-csv-btn')?.addEventListener('click', () => {
console.log("[Export] Genererer CSV-fil fra lagerdata...");
if (materials.length === 0) {
alert("Ingen data å eksportere.");
return;
}
code
Code
let csvContent = "data:text/csv;charset=utf-8,Navn,Lager,Enhet,Pris Medlem,Pris Dropin\n";
materials.forEach(m => {
    csvContent += `${m.navn},${m.lagerantall},${m.enhet},${m.prisMedlem},${m.prisDropIn}\n`;
});

const encodedUri = encodeURI(csvContent);
const link = document.createElement("a");
link.setAttribute("href", encodedUri);
link.setAttribute("download", `makerspace_lager_${new Date().toLocaleDateString()}.csv`);
document.body.appendChild(link);
link.click();
document.body.removeChild(link);
console.log("[Export] CSV nedlasting startet.");
});
// === INITIAL CHECK ===
console.log("[System] script.js Versjon #4 ferdig lastet.");
/* Version: #4 */
