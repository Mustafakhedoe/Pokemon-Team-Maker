// ======== CONFIG ========
const GEN_RANGES = [
  { key: 'gen1', label: 'Gen 1 (Kanto)', start: 1, end: 151 },
  { key: 'gen2', label: 'Gen 2 (Johto)', start: 152, end: 251 },
  { key: 'gen3', label: 'Gen 3 (Hoenn)', start: 252, end: 386 },
  { key: 'gen4', label: 'Gen 4 (Sinnoh)', start: 387, end: 493 },
  { key: 'gen5', label: 'Gen 5 (Unova)', start: 494, end: 649 },
  { key: 'gen6', label: 'Gen 6 (Kalos)', start: 650, end: 721 },
  { key: 'gen7', label: 'Gen 7 (Alola)', start: 722, end: 809 },
  { key: 'gen8', label: 'Gen 8 (Galar/Hisui)', start: 810, end: 905 },
  { key: 'gen9', label: 'Gen 9 (Paldea)', start: 906, end: 1025 },
];

const STORAGE_KEY = 'ptb_teams';
const LAST_KEY = 'ptb_last_slug';

// Official artwork URL
const artUrl = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

// ======== STATE ========
const state = {
  slug: null,
  teamName: null,
  teamMax: 6,
  selected: [],
  selectedSet: new Set(),
  currentGen: GEN_RANGES[0],
  filterNumber: '',
  filterType: null,
  dbTeamId: null,
  dbSecret: null,
};

// ======== HELPERS ========
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function slugify(str) {
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') || 'team';
}

function loadAllTeams() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}
function saveAllTeams(obj) { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); }

function loadTeam(slug) { return loadAllTeams()[slug] || null; }
function saveTeamLocal() {
  if (!state.slug) state.slug = slugify(state.teamName || 'team');
  const all = loadAllTeams();
  all[state.slug] = {
    name: state.teamName,
    max: state.teamMax,
    genKey: state.currentGen.key,
    selected: state.selected,
    savedAt: new Date().toISOString()
  };
  saveAllTeams(all);
  localStorage.setItem(LAST_KEY, state.slug);
  showAlert('Team lokaal opgeslagen!', 'success');
  updateSelectedUI();
}

function showAlert(message, variant = 'primary') {
  const wrap = $('#alertWrap');
  const box = $('#alertBox');
  if (!wrap || !box) { alert(message); return; }
  box.className = `alert alert-${variant}`;
  box.textContent = message;
  wrap.classList.remove('d-none');
  window.clearTimeout(showAlert._t);
  showAlert._t = setTimeout(() => wrap.classList.add('d-none'), 1800);
}

function setView(start = true) {
  $('#startView').classList.toggle('d-none', !start);
  $('#builderView').classList.toggle('d-none', start);
  $('#builderNav').classList.toggle('d-none', start);
}

// ======== TYPES (PokéAPI) ========
const typeCache = new Map();
async function getPokemonTypes(id) {
  if (typeCache.has(id)) return typeCache.get(id);
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
    if (!res.ok) throw new Error('PokeAPI error');
    const data = await res.json();
    const types = data.types.map((t) => t.type.name);
    typeCache.set(id, types);
    return types;
  } catch {
    typeCache.set(id, null);
    return null;
  }
}

async function getUsedTypes() {
  const sets = await Promise.all(state.selected.map((id) => getPokemonTypes(id)));
  return new Set(sets.flat().map(t => t.toLowerCase()));
}

const TYPE_ALIASES = {
  gras: 'grass', plant: 'grass', grass: 'grass',
  vuur: 'fire', fire: 'fire',
  water: 'water',
  bliksem: 'electric', electric: 'electric',
  ijs: 'ice', ice: 'ice',
  vecht: 'fighting', fighting: 'fighting',
  gif: 'poison', poison: 'poison',
  grond: 'ground', ground: 'ground',
  vlieg: 'flying', flying: 'flying',
  psychic: 'psychic',
  insect: 'bug', bug: 'bug',
  steen: 'rock', rock: 'rock',
  spook: 'ghost', ghost: 'ghost',
  draak: 'dragon', dragon: 'dragon',
  donker: 'dark', dark: 'dark',
  staal: 'steel', steel: 'steel',
  fee: 'fairy', fairy: 'fairy',
  normaal: 'normal', normal: 'normal',
};
function canonType(v) {
  if (!v) return null;
  const k = String(v).trim().toLowerCase();
  return TYPE_ALIASES[k] ?? null;
}

// ======== SUPABASE HELPERS ========
async function fetchBusySet() {
  const { data, error } = await sb.from('pokemon_claim').select('pokemon_id').eq('active', true);
  if (error) return new Set();
  return new Set(data.map(d => Number(d.pokemon_id)));
}

// ======== POKEAPI CACHES VOOR VARIANTEN ========
const speciesCache = new Map();
const pokemonDetailCache = new Map();

async function fetchSpecies(speciesId) {
  if (speciesCache.has(speciesId)) return speciesCache.get(speciesId);
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${speciesId}`);
  if (!res.ok) throw new Error('species fetch error');
  const data = await res.json();
  speciesCache.set(speciesId, data);
  return data;
}

async function fetchPokemonDetail(key) {
  const k = String(key).toLowerCase();
  if (pokemonDetailCache.has(k)) return pokemonDetailCache.get(k);
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${k}`);
  if (!res.ok) throw new Error('pokemon fetch error');
  const data = await res.json();
  const art =
    data?.sprites?.other?.['official-artwork']?.front_default ||
    data?.sprites?.other?.home?.front_default ||
    data?.sprites?.front_default || '';
  const types = (data.types || []).map(t => t.type.name);
  const payload = { id: data.id, name: data.name, types, art };
  pokemonDetailCache.set(k, payload);
  pokemonDetailCache.set(String(data.id), payload);
  return payload;
}

/**
 * Maak entries voor een species:
 * - default vorm (pid = speciesId)
 * - Alola / Galar / Hisui / Paldea varianten (eigen pid + variant-art)
 * Altijd tonen onder het originele species-nummer.
 */
async function getEntriesForSpecies(speciesId) {
  const entries = [];
  entries.push({ pid: speciesId, displayNo: speciesId, art: artUrl(speciesId) });

  try {
    const species = await fetchSpecies(speciesId);
    const vars = species?.varieties || [];

    // filter op Alola / Galar / Hisui / Paldea
    const wanted = vars.filter(v => {
      const name = v?.pokemon?.name || '';
      return (
        name.includes('-alola') ||
        name.includes('-galar') ||
        name.includes('-hisui') ||
        name.includes('-paldea')
      );
    });

    for (const v of wanted) {
      const name = v.pokemon.name;
      try {
        const det = await fetchPokemonDetail(name);
        if (!det.art) continue;
        entries.push({ pid: det.id, displayNo: speciesId, art: det.art });
      } catch {}
    }
  } catch {}

  return entries;
}

// ======== RENDERING ========
function renderGenMenu() {
  const ul = $('#genMenu');
  ul.innerHTML = '';
  GEN_RANGES.forEach((g) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'dropdown-item';
    a.href = '#';
    a.textContent = g.label;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      state.currentGen = g;
      $('#genDropdown').textContent = g.label;
      renderGrid();
      updateSelectedUI();
    });
    li.appendChild(a);
    ul.appendChild(li);
  });
}

function buildIdList() {
  const { start, end } = state.currentGen;
  const ids = [];
  for (let i = start; i <= end; i++) ids.push(i);
  return ids;
}

async function renderGrid() {
  const grid = $('#grid');
  grid.innerHTML = '';

  // soort-ids van de huidige generatie
  const speciesIds = buildIdList();

  // entries bouwen (default + varianten)
  const groups = await Promise.all(speciesIds.map(id => getEntriesForSpecies(id)));
  let entries = groups.flat();

  // --- dedupe op pid (voorkomt dubbele kaarten) ---
  {
    const seen = new Set();
    entries = entries.filter(e => {
      if (seen.has(e.pid)) return false;
      seen.add(e.pid);
      return true;
    });
  }

  // type-filter (zonder dubbele render)
  const t = canonType(state.filterType);
  if (t) {
    const matches = await Promise.all(
      entries.map(async (e) => {
        const types = await getPokemonTypes(e.pid);
        return Array.isArray(types) && types.map(x => x.toLowerCase()).includes(t);
      })
    );
    entries = entries.filter((_, i) => matches[i]);

    // --- nogmaals dedupe na typefilter (extra zekerheid) ---
    {
      const seen = new Set();
      entries = entries.filter(e => {
        if (seen.has(e.pid)) return false;
        seen.add(e.pid);
        return true;
      });
    }
  }

  $('#gridEmpty').style.display = entries.length ? 'none' : 'block';

  const busySet = await fetchBusySet();
  const tmpl = $('#pokeCardTmpl');

  for (const e of entries) {
    const node = tmpl.content.firstElementChild.cloneNode(true);
    const card = $('.poke-card', node);
    const img = $('.poke-img', node);
    const idSpan = $('.poke-id', node);

    img.src = e.art || artUrl(e.pid);
    img.alt = `Pokémon #${e.displayNo}`;
    idSpan.textContent = `#${String(e.displayNo).padStart(3, '0')}`;

    if (state.selectedSet.has(e.pid)) card.classList.add('selected');
    if (busySet.has(e.pid) && !state.selectedSet.has(e.pid)) card.classList.add('busy');

    card.addEventListener('click', () => togglePick(e.pid, card));
    grid.appendChild(node);

    getPokemonTypes(e.pid).then((types) => {
      if (!types || !types.length) return;
      const line = document.createElement('div');
      line.className = 'type-line';
      types.forEach((tt, idx) => {
        const span = document.createElement('span');
        span.className = `type--${tt}`;
        span.textContent = tt;
        line.appendChild(span);
        if (idx < types.length - 1) line.appendChild(document.createTextNode(' / '));
      });
      idSpan.parentElement.appendChild(line);
    });
  }

  $('#selectedCount').textContent = `${state.selected.length} geselecteerd`;
}

function updateSelectedUI() {
  const chips = $('#chips');
  const none = $('#noneSelected');
  chips.innerHTML = '';
  if (!state.selected.length) {
    none.style.display = 'inline';
  } else {
    none.style.display = 'none';
    state.selected.forEach((id) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `
        <img class="chip-img" src="${artUrl(id)}" alt="#${id}">
        <span>#${String(id).padStart(3, '0')}</span>
        <button type="button" class="btn btn-sm btn-link text-danger p-0 remove">×</button>
      `;
      // vervang chip-artwork door varianten-art indien beschikbaar
      fetchPokemonDetail(id).then(det => {
        if (det?.art) chip.querySelector('.chip-img').src = det.art;
      }).catch(()=>{});
      chip.querySelector('.remove').addEventListener('click', async () => {
        await toggleRemove(id);
        updateSelectedUI();   // direct verversen
        renderGrid();         // en lijst hertekenen
      });
      chips.appendChild(chip);
    });
  }
  $('#selectedCount').textContent = `${state.selected.length} geselecteerd`;
}

// ======== SELECTION LOGIC ========
async function toggleRemove(id) {
  const teamId = localStorage.getItem('ptb_team_id');
  const secret = localStorage.getItem('ptb_team_secret');
  if (!teamId || !secret) { showAlert('Geen team in database. Begin opnieuw.', 'danger'); return; }
  const { error } = await sb.rpc('remove_pokemon', { p_team_id: teamId, p_secret: secret, p_pokemon_id: id });
  if (error) { showAlert(error.message, 'danger'); return; }
  state.selectedSet.delete(id);
  state.selected = state.selected.filter((x) => x !== id);
}

async function togglePick(id, cardEl) {
  const teamId = localStorage.getItem('ptb_team_id');
  const secret = localStorage.getItem('ptb_team_secret');
  if (!teamId || !secret) { showAlert('Geen team in database. Begin opnieuw.', 'danger'); return; }

  if (state.selectedSet.has(id)) {
    const { error } = await sb.rpc('remove_pokemon', { p_team_id: teamId, p_secret: secret, p_pokemon_id: id });
    if (error) { showAlert(error.message, 'danger'); return; }
    state.selectedSet.delete(id);
    state.selected = state.selected.filter((x) => x !== id);
    cardEl.classList.remove('selected', 'busy');
  } else {
    if (state.selected.length >= state.teamMax) {
      showAlert(`Max ${state.teamMax} Pokémon bereikt.`, 'warning');
      return;
    }

    // dubbele type check (ook voor varianten)
    const newTypes = await getPokemonTypes(id);
    const used = await getUsedTypes();
    if (newTypes?.some(t => used.has(t.toLowerCase()))) {
      showAlert('Je kunt dit type maar 1x kiezen in je team!', 'warning');
      return;
    }

    const { error } = await sb.rpc('add_pokemon', { p_team_id: teamId, p_secret: secret, p_pokemon_id: id });
    if (error) {
      if (String(error.code) === '23505') showAlert('Deze Pokémon is al bezet door een ander team.', 'warning');
      else showAlert(error.message, 'danger');
      return;
    }
    state.selected.push(id);
    state.selectedSet.add(id);
    cardEl.classList.add('selected');
  }

  updateSelectedUI();
  renderGrid();
}

// ======== INIT & EVENTS ========
function hydrateFromTeam(team) {
  state.teamName = team.name;
  state.teamMax = Number(team.max) || 6;
  state.currentGen = GEN_RANGES.find((g) => g.key === team.genKey) || GEN_RANGES[0];
  state.selected = Array.isArray(team.selected) ? [...team.selected] : [];
  state.selectedSet = new Set(state.selected);
  $('#genDropdown').textContent = state.currentGen.label;
}

function init() {
  renderGenMenu();

  // type-zoekveld
  const search = $('#searchInput');
  if (search) {
    search.setAttribute('placeholder', 'Zoek op type (bv. fire, water)');
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); renderGrid(); }
    });
    const onChange = (e) => {
      state.filterType = canonType(e.target.value);
      renderGrid();
    };
    search.addEventListener('input', onChange);
    search.addEventListener('change', onChange);
  }

  // start → team aanmaken
  $('#startForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#teamName').value.trim();
    if (!name) {
      $('#teamName').classList.add('is-invalid');
      return;
    }
    $('#teamName').classList.remove('is-invalid');

    state.teamName = name;
    state.teamMax = Number($('#teamMax').value) || 6;

    (async () => {
      const { data, error } = await sb.rpc('create_team', { p_name: state.teamName, p_max: state.teamMax });
      if (error) { showAlert(error.message, 'danger'); return; }
      const row = Array.isArray(data) ? data[0] : data;
      state.dbTeamId = row.team_id;
      state.dbSecret  = row.edit_secret;

      localStorage.setItem('ptb_team_id', state.dbTeamId);
      localStorage.setItem('ptb_team_secret', state.dbSecret);

      state.slug = slugify(name);
      state.selected = [];
      state.selectedSet = new Set();

      setView(false);
      state.currentGen = GEN_RANGES[0];
      $('#genDropdown').textContent = state.currentGen.label;
      renderGrid();
      updateSelectedUI();
    })();
  });

  $('#backToStartBtn').addEventListener('click', () => setView(true));

  const saveBtn = $('#saveTeamBtn');
  if (saveBtn) saveTeamBtn.addEventListener('click', saveTeamLocal);

  // Reset-knop: leeg team en wis filter
  $('#clearTeamBtn').addEventListener('click', async () => {
    const btn = $('#clearTeamBtn');
    btn.disabled = true;
    try {
      const teamId = localStorage.getItem('ptb_team_id');
      const secret = localStorage.getItem('ptb_team_secret');

      if (teamId && secret && state.selected.length) {
        const ids = [...state.selected];
        await Promise.allSettled(
          ids.map(pid => sb.rpc('remove_pokemon', { p_team_id: teamId, p_secret: secret, p_pokemon_id: pid }))
        );
      }
      state.selected = [];
      state.selectedSet = new Set();

      state.filterType = null;
      if (search) search.value = '';

      await renderGrid();
      updateSelectedUI();
      showAlert('Team is gereset.', 'success');
    } catch (err) {
      console.error(err);
      showAlert('Resetten mislukt.', 'danger');
    } finally {
      btn.disabled = false;
    }
  });

  // lokaal team laden
  $('#loadLastBtn')?.addEventListener('click', () => {
    const last = localStorage.getItem(LAST_KEY);
    if (!last) { showAlert('Geen eerder (lokaal) team gevonden.', 'secondary'); return; }
    const team = loadTeam(last);
    if (!team) { showAlert('Teamdata niet gevonden.', 'danger'); return; }
    state.slug = last;
    hydrateFromTeam(team);
    setView(false);
    renderGrid();
    updateSelectedUI();
    showAlert(`Team “${team.name}” (lokaal) geladen.`, 'success');
  });

  // lokale data wissen
  $('#wipeAllBtn')?.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LAST_KEY);
    localStorage.removeItem('ptb_team_id');
    localStorage.removeItem('ptb_team_secret');
    showAlert('Alle lokale data verwijderd.', 'warning');
  });
}

// <<< heel belangrijk: init aanroepen zodra DOM klaar is >>>
document.addEventListener('DOMContentLoaded', init);