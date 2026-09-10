// ==========================================================================
// 1. CONFIGURATION
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
  { id: 'premier_pas', nom: 'Zoreil Débarqué', desc: 'Valider 1 spot', icone: '🩴', condition: (v) => v.length >= 1 },
  { id: 'cinq_spots', nom: 'Explorateur Péi', desc: 'Valider 5 spots', icone: '🎒', condition: (v) => v.length >= 5 },
  { id: 'cabri_hauts', nom: 'Cabri des Hauts', desc: 'Faire 3 randos ou crêtes', icone: '🐐', condition: (v, s) => s.filter(x => v.includes(x.id) && (x.categorie === 'Rando' || x.micro_region === 'Hauts')).length >= 3 },
  { id: 'maitre_eau', nom: 'Chasseur de Cascades', desc: 'Visiter 3 bassins', icone: '🏊', condition: (v, s) => s.filter(x => v.includes(x.id) && (x.categorie === 'Bassin')).length >= 3 }
];

// ==========================================================================
// 2. ÉTAT DU PROJET
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

let isListViewOnMobile = false;

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

  // Forcer Leaflet à recalculer immédiatement et après délai ses dimensions
  map.invalidateSize();
  setTimeout(() => { map.invalidateSize(); }, 250);
}

// ==========================================================================
// 4. BASCULE MOBILE
// ==========================================================================
function basculerVueMobile() {
  const sidebar = document.getElementById('sidebar-panel');
  const icon = document.getElementById('mobile-view-icon');
  const text = document.getElementById('mobile-view-text');

  isListViewOnMobile = !isListViewOnMobile;

  if (isListViewOnMobile) {
    sidebar.classList.add('is-visible-mobile');
    icon.innerText = "🗺️";
    text.innerText = "Voir la carte";
  } else {
    sidebar.classList.remove('is-visible-mobile');
    icon.innerText = "📋";
    text.innerText = `Voir la liste (${spots.length})`;
    setTimeout(() => { map.invalidateSize(); }, 150);
  }
}

// ==========================================================================
// 5. CHARGEMENT JSON
// ==========================================================================
async function chargerDonnees() {
  try {
    const res = await fetch('./spots.json');
    if (!res.ok) throw new Error('Impossible de lire spots.json');
    spots = await res.json();

    genererBoutonsFiltres();
    rendreMarqueurs();
    rendreUI();

    const btnText = document.getElementById('mobile-view-text');
    if (btnText && !isListViewOnMobile) {
      btnText.innerText = `Voir la liste (${spots.length})`;
    }
  } catch (err) {
    console.error(err);
    document.getElementById('spots-list').innerHTML = `
      <div style="padding:16px; color:#ef4444; font-size:12px;">
        Erreur de chargement de spots.json
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
// 6. MARQUEURS
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

    const customIcon = L.divIcon({
      className: '',
      html: `<div id="pin-${spot.id}" class="marker-volcan" style="background:${pinBg}; width:32px; height:32px; font-size:13px;">${pinContent}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16]
    });

    const marker = L.marker([spot.coordonnees.lat, spot.coordonnees.lng], { icon: customIcon }).addTo(map);

    marker.bindPopup(`
      <div style="font-family:sans-serif; min-width:180px; padding:4px;">
        <span style="font-size:9px; font-weight:bold; color:#ff5858; text-transform:uppercase;">${spot.categorie} • ${spot.commune}</span>
        <h4 style="font-size:14px; margin:4px 0 6px;">${spot.nom}</h4>
        <p style="font-size:11px; opacity:0.85; line-height:1.4;">${spot.description}</p>
      </div>
    `);

    markers[spot.id] = marker;
  });
}

// ==========================================================================
// 7. LISTE ET SELECTION
// ==========================================================================
function rendreUI() {
  const container = document.getElementById('spots-list');
  container.innerHTML = '';

  const listeFiltree = obtenirSpotsFiltres();

  if (listeFiltree.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:48px 16px; color:var(--text-muted); font-size:13px;">Aucun résultat 🌋</div>`;
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
      <div class="card-actions">
        <div class="meta-info">⏱️ ${spot.duree_estimee || 'Variable'}</div>
        <div class="action-btn-group">
          <button class="btn-action ${isInTrip ? 'active-trip' : ''}" onclick="event.stopPropagation(); toggleTripStep('${spot.id}')">
            ${isInTrip ? 'Étape ' + (tripSteps.indexOf(spot.id) + 1) : '+ Étape'}
          </button>
          <button class="btn-action ${isPrio ? 'active-prio' : ''}" onclick="event.stopPropagation(); togglePriority('${spot.id}')">🔥</button>
          <button class="btn-action ${isDone ? 'active-done' : ''}" onclick="event.stopPropagation(); toggleVisited('${spot.id}')">✓</button>
        </div>
      </div>
    `;

    card.onclick = () => {
      document.querySelectorAll('.spot-card').forEach(c => c.classList.remove('is-focused'));
      card.classList.add('is-focused');

      if (window.innerWidth <= 860 && isListViewOnMobile) {
        basculerVueMobile();
      }

      map.flyTo([spot.coordonnees.lat, spot.coordonnees.lng], 13, { duration: 1.2 });
      if (markers[spot.id]) markers[spot.id].openPopup();
    };

    container.appendChild(card);
  });

  mettreAJourStats();
}

// ==========================================================================
// 8. ACTIONS, ROADTRIP & STATS
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
}

function toggleTripStep(id) {
  tripSteps = tripSteps.includes(id) ? tripSteps.filter(x => x !== id) : [...tripSteps, id];
  rendreMarqueurs();
  rendreUI();
  calculerItineraire();
}

async function calculerItineraire() {
  const panel = document.getElementById('route-panel');
  if (tripSteps.length < 2) {
    if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'flex';
  document.getElementById('route-stats').innerText = "Tracé...";

  const coordonneesStr = tripSteps
    .map(id => spots.find(s => s.id === id))
    .filter(Boolean)
    .map(s => `${s.coordonnees.lng},${s.coordonnees.lat}`)
    .join(';');

  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordonneesStr}?overview=full&geometries=geojson`);
    const data = await res.json();
    const route = data.routes[0];
    const distanceKm = (route.distance / 1000).toFixed(1);
    const m = Math.round(route.duration / 60);
    const h = Math.floor(m / 60);
    const min = m % 60;
    const dureeStr = h > 0 ? `${h}h${min < 10 ? '0' : ''}${min}` : `${min} min`;

    document.getElementById('route-stats').innerText = `${distanceKm} km • ~${dureeStr}`;

    if (routeLayer) map.removeLayer(routeLayer);
    routeLayer = L.geoJSON(route.geometry, { style: { color: '#FF0844', weight: 4 } }).addTo(map);
    map.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });
  } catch (e) {
    document.getElementById('route-stats').innerText = "Erreur itinéraire";
  }
}

function reinitialiserItineraire() {
  tripSteps = [];
  if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
  document.getElementById('route-panel').style.display = 'none';
  rendreMarqueurs();
  rendreUI();
}

function ouvrirDansGoogleMaps() {
  if (tripSteps.length === 0) return;
  const etapes = tripSteps.map(id => spots.find(s => s.id === id)).filter(Boolean);
  const origine = `${etapes[0].coordonnees.lat},${etapes[0].coordonnees.lng}`;
  const destination = `${etapes[etapes.length - 1].coordonnees.lat},${etapes[etapes.length - 1].coordonnees.lng}`;
  const waypoints = etapes.slice(1, -1).map(s => `${s.coordonnees.lat},${s.coordonnees.lng}`).join('|');
  window.open(`https://www.google.com/maps/dir/?api=1&origin=${origine}&destination=${destination}&waypoints=${waypoints}`, '_blank');
}

function sauvegarderRoadtripActuel() {
  if (tripSteps.length < 2) return;
  const nom = prompt("Nom de l'itinéraire :", `Roadtrip du ${new Date().toLocaleDateString('fr-FR')}`);
  if (!nom) return;
  savedRoadtrips.unshift({ id: 'trip_' + Date.now(), nom, etapes: [...tripSteps], stats: document.getElementById('route-stats').innerText });
  localStorage.setItem('explore_roadtrips', JSON.stringify(savedRoadtrips));
}

function ouvrirModalRoadtrips() {
  const modal = document.getElementById('roadtrips-modal');
  const list = document.getElementById('roadtrips-list');
  list.innerHTML = savedRoadtrips.length === 0 ? `<div style="text-align:center; padding:20px; font-size:12px;">Aucun roadtrip enregistré.</div>` : '';
  savedRoadtrips.forEach(trip => {
    list.innerHTML += `
      <div class="roadtrip-item">
        <strong>${trip.nom}</strong>
        <div style="font-size:11px; color:var(--c-flame);">${trip.stats}</div>
        <button class="btn-action active-trip" onclick="chargerRoadtrip('${trip.id}')">Charger</button>
      </div>
    `;
  });
  modal.style.display = 'flex';
}

function fermerModalRoadtrips() { document.getElementById('roadtrips-modal').style.display = 'none'; }
function chargerRoadtrip(id) {
  const t = savedRoadtrips.find(x => x.id === id);
  if (!t) return;
  tripSteps = [...t.etapes];
  rendreMarqueurs();
  rendreUI();
  calculerItineraire();
  fermerModalRoadtrips();
}

function tirerSortieHasard() {
  const pool = spots.filter(s => !visitedSpots.includes(s.id));
  const spot = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : spots[0];
  if (!spot) return;

  if (window.innerWidth <= 860 && isListViewOnMobile) {
    basculerVueMobile();
  }

  map.flyTo([spot.coordonnees.lat, spot.coordonnees.lng], 14, { duration: 1.5 });
  setTimeout(() => { if (markers[spot.id]) markers[spot.id].openPopup(); }, 1200);
}

function ouvrirModalBadges() {
  const modal = document.getElementById('badges-modal');
  const grid = document.getElementById('badges-grid');
  grid.innerHTML = '';
  BADGES.forEach(b => {
    const isUnlocked = b.condition(visitedSpots, spots);
    grid.innerHTML += `
      <div class="badge-item ${isUnlocked ? 'unlocked' : 'locked'}">
        <div style="font-size:24px;">${b.icone}</div>
        <strong>${b.nom}</strong>
        <div style="font-size:11px; color:var(--text-muted);">${b.desc}</div>
      </div>
    `;
  });
  modal.style.display = 'flex';
}

function fermerModalBadges() { document.getElementById('badges-modal').style.display = 'none'; }

// ==========================================================================
// 9. ÉCOUTEURS
// ==========================================================================
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
}
