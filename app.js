// ==========================================================================
// 1. CONFIGURATION DES CATÉGORIES & TROPHÉES 974
// ==========================================================================
const CATEGORIE_CONFIG = {
  "Rando": { icone: "🥾", couleur: "linear-gradient(135deg, #10b981, #059669)" },
  "Point de vue": { icone: "🏞️", couleur: "linear-gradient(135deg, #06b6d4, #0891b2)" },
  "Culture": { icone: "🏛️", couleur: "linear-gradient(135deg, #8b5cf6, #6d28d9)" },
  "Bassin": { icone: "🐠", couleur: "linear-gradient(135deg, #3b82f6, #1d4ed8)" },
  "Loisir": { icone: "🪁", couleur: "linear-gradient(135deg, #ec4899, #be185d)" },
  "Sunset": { icone: "🌅", couleur: "linear-gradient(135deg, #f59e0b, #d97706)" },
  "Volcan": { icone: "🌋", couleur: "linear-gradient(135deg, #ff0844, #ffb199)" }
};

const BADGES = [
  { id: 'premier_pas', nom: 'Zoreil Débarqué', desc: 'Valider un premier spot', icone: '🩴', condition: (v) => v.length >= 1 },
  { id: 'cinq_spots', nom: 'Explorateur Péi', desc: 'Valider 5 spots sur l\'île', icone: '🎒', condition: (v) => v.length >= 5 },
  { id: 'cabri_hauts', nom: 'Cabri des Hauts', desc: 'Faire 3 randos ou crêtes', icone: '🐐', condition: (v, s) => s.filter(x => v.includes(x.id) && (x.categorie === 'Rando' || x.micro_region === 'Hauts' || x.micro_region === 'Cirques')).length >= 3 },
  { id: 'maitre_eau', nom: 'Chasseur de Cascades', desc: 'Visiter 3 bassins', icone: '🏊', condition: (v, s) => s.filter(x => v.includes(x.id) && (x.categorie === 'Bassin')).length >= 3 },
  { id: 'gran_moun', nom: 'Gran Moun 974', desc: 'Compléter plus de 50% de l\'île', icone: '👑', condition: (v, s) => s.length > 0 && (v.length / s.length) >= 0.5 }
];

// ==========================================================================
// 2. ÉTAT GLOBAL
// ==========================================================================
let spots = [];
let visitedSpots = JSON.parse(localStorage.getItem('explore_visited') || '[]');
let prioritySpots = JSON.parse(localStorage.getItem('explore_priorities') || '[]');
let tripSteps = [];
let savedRoadtrips = JSON.parse(localStorage.getItem('explore_roadtrips') || '[]');

let currentTheme = localStorage.getItem('explore_theme') || 'dark';
let currentTab = 'all'; 
let currentRegion = 'Tous';
let currentCategory = 'Toutes';
let searchQuery = '';

let map;
let markers = {};
let routeLayer = null;

// ==========================================================================
// 3. INITIALISATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  appliquerTheme(currentTheme);
  initialiserCarte();
  chargerDonnees();
  configurerEcouteurs();
});

function appliquerTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.querySelector('.theme-icon');
  if (icon) icon.innerText = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('explore_theme', theme);
}

function toggleTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  appliquerTheme(currentTheme);
}

function initialiserCarte() {
  map = L.map('map', { zoomControl: false }).setView([-21.115, 55.536], 10);
  L.control.zoom({ position: 'topright' }).addTo(map);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);
}

// ==========================================================================
// 4. CHARGEMENT DONNÉES
// ==========================================================================
async function chargerDonnees() {
  try {
    const reponse = await fetch('./spots.json');
    if (!reponse.ok) throw new Error('Erreur spots.json');
    spots = await reponse.json();

    genererBoutonsFiltres();
    rendreMarqueurs();
    rendreUI();
  } catch (err) {
    console.error(err);
    document.getElementById('spots-list').innerHTML = `
      <div style="padding: 16px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 12px; font-size: 13px;">
        ⚠️ Assure-toi que <b>spots.json</b> est bien sauvegardé.
      </div>
    `;
  }
}

function genererBoutonsFiltres() {
  const regions = ['Tous', ...new Set(spots.map(s => s.micro_region).filter(Boolean))];
  const categories = ['Toutes', ...new Set(spots.map(s => s.categorie).filter(Boolean))];

  document.getElementById('regions-chips').innerHTML = regions.map(reg => `
    <button class="chip-btn ${reg === currentRegion ? 'active' : ''}" onclick="filtrerRegion('${reg}')">${reg}</button>
  `).join('');

  document.getElementById('categories-chips').innerHTML = categories.map(cat => {
    const cfg = CATEGORIE_CONFIG[cat] || { icone: '📍' };
    const label = cat === 'Toutes' ? 'Toutes' : `${cfg.icone} ${cat}`;
    return `<button class="chip-btn ${cat === currentCategory ? 'active' : ''}" onclick="filtrerCategorie('${cat}')">${label}</button>`;
  }).join('');
}

function obtenirSpotsFiltres() {
  return spots.filter(spot => {
    const matchRegion = (currentRegion === 'Tous') || (spot.micro_region === currentRegion);
    const matchCat = (currentCategory === 'Toutes') || (spot.categorie === currentCategory);
    const matchSearch = spot.nom.toLowerCase().includes(searchQuery.toLowerCase()) || 
                        spot.commune.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        spot.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchTab = (currentTab === 'all') || (currentTab === 'priorites' && prioritySpots.includes(spot.id));
    return matchRegion && matchCat && matchSearch && matchTab;
  });
}

// ==========================================================================
// 5. MARQUEURS VOLCANIQUES & INTERACTION CROISÉE
// ==========================================================================
function rendreMarqueurs() {
  Object.values(markers).forEach(m => map.removeLayer(m));
  markers = {};

  const spotsAffiches = obtenirSpotsFiltres();

  spotsAffiches.forEach(spot => {
    const isDone = visitedSpots.includes(spot.id);
    const isPrio = prioritySpots.includes(spot.id);
    const isInTrip = tripSteps.includes(spot.id);
    const config = CATEGORIE_CONFIG[spot.categorie] || { icone: '📍', couleur: 'linear-gradient(135deg, #ff0844, #ffb199)' };

    let pinBg = config.couleur;
    let pinContent = config.icone;

    if (isInTrip) {
      pinBg = 'linear-gradient(135deg, #FF0844, #F857A6)';
      pinContent = `<b>${tripSteps.indexOf(spot.id) + 1}</b>`;
    } else if (isDone) {
      pinBg = '#10b981';
      pinContent = '✓';
    } else if (isPrio) {
      pinBg = 'linear-gradient(135deg, #ff5858, #f857a6)';
      pinContent = '🔥';
    }

    const iconHtml = `
      <div id="pin-${spot.id}" class="marker-volcan" style="background: ${pinBg}; width: 34px; height: 34px;">
        <span style="font-size: 13px;">${pinContent}</span>
      </div>
    `;

    const customIcon = L.divIcon({
      className: '',
      html: iconHtml,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -18]
    });

    const marker = L.marker([spot.coordonnees.lat, spot.coordonnees.lng], { icon: customIcon }).addTo(map);

    marker.bindPopup(`
      <div style="font-family: 'Plus Jakarta Sans', sans-serif; min-width: 200px; padding: 4px;">
        <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #ff5858;">${spot.categorie} • ${spot.commune}</span>
        <h4 style="font-size: 14px; margin: 4px 0 6px; font-weight: 800;">${spot.nom}</h4>
        <p style="font-size: 11px; opacity: 0.85; line-height: 1.4; margin-bottom: 8px;">${spot.description}</p>
        ${spot.conseil_local ? `<div style="font-size: 10px; border-left: 2px solid #ff0844; padding-left: 6px; color: #cbd5e1; font-style: italic;">💡 ${spot.conseil_local}</div>` : ''}
      </div>
    `);

    marker.on('click', () => {
      const el = document.getElementById(`card-${spot.id}`);
      if (el) {
        document.querySelectorAll('.spot-card').forEach(c => c.classList.remove('is-focused'));
        el.classList.add('is-focused');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    markers[spot.id] = marker;
  });
}

// ==========================================================================
// 6. LISTE DES CARTES
// ==========================================================================
function rendreUI() {
  const container = document.getElementById('spots-list');
  container.innerHTML = '';

  const listeFiltree = obtenirSpotsFiltres();

  if (listeFiltree.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 48px 16px; color: var(--text-2); font-size: 13px;">Aucun spot trouvé pour cette sélection 🌋</div>`;
  }

  listeFiltree.forEach((spot) => {
    const isDone = visitedSpots.includes(spot.id);
    const isPrio = prioritySpots.includes(spot.id);
    const isInTrip = tripSteps.includes(spot.id);
    const cfg = CATEGORIE_CONFIG[spot.categorie] || { icone: '📍' };

    const card = document.createElement('div');
    card.id = `card-${spot.id}`;
    card.className = `spot-card ${isDone ? 'is-done' : ''} ${isInTrip ? 'is-focused' : ''}`;

    card.innerHTML = `
      <div class="card-top">
        <div>
          <span class="badge-cat">${cfg.icone} ${spot.categorie} • ${spot.commune}</span>
          <h3 class="spot-title">${spot.nom}</h3>
        </div>
        <span class="badge-cost ${spot.payant ? 'paid' : 'free'}">${spot.payant ? 'Payant' : 'Gratuit'}</span>
      </div>

      <p class="spot-desc">${spot.description}</p>
      
      ${spot.conseil_local ? `<div class="conseil-box">💡 ${spot.conseil_local}</div>` : ''}

      <div class="card-actions">
        <div class="meta-info">
          <span>⏱️ ${spot.duree_estimee || 'Variable'}</span>
        </div>
        <div class="action-btn-group">
          <button class="btn-action ${isInTrip ? 'active-trip' : ''}" onclick="event.stopPropagation(); toggleTripStep('${spot.id}')">
            ${isInTrip ? '📍 Étape ' + (tripSteps.indexOf(spot.id) + 1) : '➕ Étape'}
          </button>
          <button class="btn-action ${isPrio ? 'active-prio' : ''}" onclick="event.stopPropagation(); togglePriority('${spot.id}')">🔥</button>
          <button class="btn-action ${isDone ? 'active-done' : ''}" onclick="event.stopPropagation(); toggleVisited('${spot.id}')">✓</button>
        </div>
      </div>
    `;

    card.onmouseenter = () => {
      const pin = document.getElementById(`pin-${spot.id}`);
      if (pin) pin.classList.add('pulse');
    };
    card.onmouseleave = () => {
      const pin = document.getElementById(`pin-${spot.id}`);
      if (pin) pin.classList.remove('pulse');
    };

    card.onclick = () => {
      document.querySelectorAll('.spot-card').forEach(c => c.classList.remove('is-focused'));
      card.classList.add('is-focused');
      map.flyTo([spot.coordonnees.lat, spot.coordonnees.lng], 13, { duration: 1.2 });
      if (markers[spot.id]) markers[spot.id].openPopup();
    };

    container.appendChild(card);
  });

  mettreAJourStats();
}

// ==========================================================================
// 7. ITINÉRAIRE ROADTRIP ROUTIER (OSRM)
// ==========================================================================
function toggleTripStep(id) {
  if (tripSteps.includes(id)) {
    tripSteps = tripSteps.filter(item => item !== id);
  } else {
    tripSteps.push(id);
  }
  rendreMarqueurs();
  rendreUI();
  calculerItineraire();
}

async function calculerItineraire() {
  const panel = document.getElementById('route-panel');
  if (tripSteps.length < 2) {
    if (routeLayer) {
      map.removeLayer(routeLayer);
      routeLayer = null;
    }
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'flex';
  document.getElementById('route-stats').innerText = "Tracé en cours...";

  const coordonneesStr = tripSteps
    .map(id => spots.find(s => s.id === id))
    .filter(Boolean)
    .map(s => `${s.coordonnees.lng},${s.coordonnees.lat}`)
    .join(';');

  const url = `https://router.project-osrm.org/route/v1/driving/${coordonneesStr}?overview=full&geometries=geojson`;

  try {
    const reponse = await fetch(url);
    const data = await reponse.json();
    if (!data.routes || data.routes.length === 0) throw new Error();

    const route = data.routes[0];
    const distanceKm = (route.distance / 1000).toFixed(1);
    const minutes = Math.round(route.duration / 60);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const dureeStr = h > 0 ? `${h}h${m < 10 ? '0' : ''}${m}` : `${m} min`;

    document.getElementById('route-stats').innerText = `${distanceKm} km • ~${dureeStr} (${tripSteps.length} étapes)`;

    if (routeLayer) map.removeLayer(routeLayer);
    routeLayer = L.geoJSON(route.geometry, {
      style: { color: '#FF0844', weight: 5, opacity: 0.9, dashArray: '1, 8' }
    }).addTo(map);

    map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
  } catch (err) {
    document.getElementById('route-stats').innerText = "Tracé indisponible";
  }
}

function reinitialiserItineraire() {
  tripSteps = [];
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
  document.getElementById('route-panel').style.display = 'none';
  rendreMarqueurs();
  rendreUI();
}

function sauvegarderRoadtripActuel() {
  if (tripSteps.length < 2) return;
  const nom = prompt("Donne un nom à cet itinéraire :", `Sortie du ${new Date().toLocaleDateString('fr-FR')}`);
  if (!nom) return;

  savedRoadtrips.unshift({
    id: 'trip_' + Date.now(),
    nom: nom.trim(),
    etapes: [...tripSteps],
    date: new Date().toLocaleDateString('fr-FR'),
    stats: document.getElementById('route-stats').innerText
  });

  localStorage.setItem('explore_roadtrips', JSON.stringify(savedRoadtrips));
  alert("Roadtrip consigné avec succès ! Retrouve-le sur l'icône 🗺️.");
}

function ouvrirModalRoadtrips() {
  const modal = document.getElementById('roadtrips-modal');
  const list = document.getElementById('roadtrips-list');
  list.innerHTML = '';

  if (savedRoadtrips.length === 0) {
    list.innerHTML = `<div style="text-align:center; padding:24px; color:var(--text-3); font-size:12px;">Aucun itinéraire consigné.</div>`;
  } else {
    savedRoadtrips.forEach(trip => {
      const stops = trip.etapes.map(id => spots.find(s => s.id === id)?.nom).filter(Boolean).join(' ➔ ');
      list.innerHTML += `
        <div class="roadtrip-item">
          <div style="display:flex; justify-content:space-between; align-items:baseline;">
            <strong style="font-size:14px; color:var(--text-1);">${trip.nom}</strong>
            <span style="font-size:10px; color:var(--text-3);">${trip.date}</span>
          </div>
          <p style="font-size:11px; color:var(--text-2); line-height:1.4;">📍 ${stops}</p>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
            <span style="font-size:11px; font-weight:700; color:var(--c-flame);">${trip.stats}</span>
            <div style="display:flex; gap:6px;">
              <button class="btn-action active-trip" onclick="chargerRoadtrip('${trip.id}')">🗺️ Charger</button>
              <button class="btn-action" onclick="supprimerRoadtrip('${trip.id}')" style="color:#ef4444;">🗑️</button>
            </div>
          </div>
        </div>
      `;
    });
  }
  modal.style.display = 'flex';
}

function fermerModalRoadtrips() {
  document.getElementById('roadtrips-modal').style.display = 'none';
}

function chargerRoadtrip(id) {
  const t = savedRoadtrips.find(x => x.id === id);
  if (!t) return;
  tripSteps = [...t.etapes];
  rendreMarqueurs();
  rendreUI();
  calculerItineraire();
  fermerModalRoadtrips();
}

function supprimerRoadtrip(id) {
  if (!confirm("Supprimer cet itinéraire ?")) return;
  savedRoadtrips = savedRoadtrips.filter(x => x.id !== id);
  localStorage.setItem('explore_roadtrips', JSON.stringify(savedRoadtrips));
  ouvrirModalRoadtrips();
}

function ouvrirDansGoogleMaps() {
  if (tripSteps.length === 0) return;
  const etapes = tripSteps.map(id => spots.find(s => s.id === id)).filter(Boolean);
  const origine = `${etapes[0].coordonnees.lat},${etapes[0].coordonnees.lng}`;
  const destination = `${etapes[etapes.length - 1].coordonnees.lat},${etapes[etapes.length - 1].coordonnees.lng}`;
  const waypoints = etapes.slice(1, -1).map(s => `${s.coordonnees.lat},${s.coordonnees.lng}`).join('|');
  window.open(`https://www.google.com/maps/dir/?api=1&origin=${origine}&destination=${destination}&waypoints=${waypoints}`, '_blank');
}

// ==========================================================================
// 8. ROULETTE & BADGES
// ==========================================================================
function tirerSortieHasard() {
  const nonVisites = spots.filter(s => !visitedSpots.includes(s.id));
  const pool = nonVisites.length > 0 ? nonVisites : spots;
  const spot = pool[Math.floor(Math.random() * pool.length)];
  if (!spot) return;

  confetti({ particleCount: 90, spread: 60, origin: { y: 0.2 }, colors: ['#FF0844', '#F857A6', '#FFB199', '#FFF'] });

  map.flyTo([spot.coordonnees.lat, spot.coordonnees.lng], 14, { duration: 1.5 });
  setTimeout(() => {
    if (markers[spot.id]) markers[spot.id].openPopup();
    const el = document.getElementById(`card-${spot.id}`);
    if (el) {
      document.querySelectorAll('.spot-card').forEach(c => c.classList.remove('is-focused'));
      el.classList.add('is-focused');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 1000);
}

function ouvrirModalBadges() {
  const modal = document.getElementById('badges-modal');
  const grid = document.getElementById('badges-grid');
  grid.innerHTML = '';

  BADGES.forEach(b => {
    const isUnlocked = b.condition(visitedSpots, spots);
    grid.innerHTML += `
      <div class="badge-item ${isUnlocked ? 'unlocked' : 'locked'}">
        <span style="font-size:28px;">${b.icone}</span>
        <span style="font-weight:800; font-size:13px; color:var(--text-1);">${b.nom}</span>
        <span style="font-size:11px; color:var(--text-2);">${b.desc}</span>
        <span style="font-size:10px; font-weight:800; color:${isUnlocked ? '#10b981' : 'var(--text-3)'}">
          ${isUnlocked ? 'DÉBLOQUÉ ✓' : 'À faire'}
        </span>
      </div>
    `;
  });

  modal.style.display = 'flex';
}

function fermerModalBadges() {
  document.getElementById('badges-modal').style.display = 'none';
}

// ==========================================================================
// 9. ACTIONS & STATS
// ==========================================================================
function toggleVisited(id) {
  visitedSpots = visitedSpots.includes(id) ? visitedSpots.filter(x => x !== id) : [...visitedSpots, id];
  prioritySpots = prioritySpots.filter(x => x !== id);
  sauvegarder();
}

function togglePriority(id) {
  prioritySpots = prioritySpots.includes(id) ? prioritySpots.filter(x => x !== id) : [...prioritySpots, id];
  sauvegarder();
}

function sauvegarder() {
  localStorage.setItem('explore_visited', JSON.stringify(visitedSpots));
  localStorage.setItem('explore_priorities', JSON.stringify(prioritySpots));
  rendreMarqueurs();
  rendreUI();
}

function mettreAJourStats() {
  const doneCount = visitedSpots.length;
  const totalCount = spots.length;
  const percent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  document.getElementById('progress-text').innerText = `${doneCount} / ${totalCount} (${percent}%)`;
  document.getElementById('progress-bar').style.width = `${percent}%`;

  let rang = "Zoreil Débarqué";
  if (percent > 15) rang = "Randonneur Dimanche";
  if (percent > 35) rang = "Cabri des Hauts";
  if (percent > 65) rang = "Marron Expérimenté";
  if (percent >= 100) rang = "Gran Moun 974";
  document.getElementById('badge-title-level').innerText = `Niveau : ${rang}`;
}

function configurerEcouteurs() {
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    rendreMarqueurs();
    rendreUI();
  });
}

function changerOnglet(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === tab));
  rendreMarqueurs();
  rendreUI();
}

function filtrerRegion(reg) {
  currentRegion = reg;
  genererBoutonsFiltres();
  rendreMarqueurs();
  rendreUI();
}

function filtrerCategorie(cat) {
  currentCategory = cat;
  genererBoutonsFiltres();
  rendreMarqueurs();
  rendreUI();
}// ==========================================================================
// GESTION DU TIROIR TACTILE MOBILE (BOTTOM SHEET)
// ==========================================================================
const sheet = document.getElementById('sidebar-sheet');
let sheetState = 'collapsed'; // 'collapsed' | 'half' | 'expanded'

function basculerTiroirMobile() {
  if (window.innerWidth > 860) return;

  if (sheetState === 'collapsed') {
    reglerTiroir('half');
  } else if (sheetState === 'half') {
    reglerTiroir('expanded');
  } else {
    reglerTiroir('collapsed');
  }
}

function ouvrirTiroirPleinEcran() {
  if (window.innerWidth <= 860) {
    reglerTiroir('expanded');
  }
}

function reglerTiroir(nouvelEtat) {
  sheetState = nouvelEtat;
  sheet.classList.remove('sheet-collapsed', 'sheet-half', 'sheet-expanded');
  sheet.classList.add(`sheet-${nouvelEtat}`);
  
  // Recentrer la carte proprement quand la hauteur change
  setTimeout(() => {
    map.invalidateSize();
  }, 350);
}

// Support du geste de glissement (Swipe Up / Swipe Down)
let touchStartY = 0;

if (sheet) {
  sheet.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  sheet.addEventListener('touchend', (e) => {
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchStartY - touchEndY;

    // Glissement vers le haut (monte le tiroir)
    if (diff > 45) {
      if (sheetState === 'collapsed') reglerTiroir('half');
      else if (sheetState === 'half') reglerTiroir('expanded');
    }
    // Glissement vers le bas (descend le tiroir)
    else if (diff < -45 && sheet.scrollTop <= 0) {
      if (sheetState === 'expanded') reglerTiroir('half');
      else if (sheetState === 'half') reglerTiroir('collapsed');
    }
  }, { passive: true });
}
