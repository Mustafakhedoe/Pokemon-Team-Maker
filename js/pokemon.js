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
  
  const STORAGE_KEY = 'ptb_teams'; // (lokaal, optioneel)
  const LAST_KEY = 'ptb_last_slug';
  
  // Official artwork URL
  const artUrl = (id) =>
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
  
  // ======== STATE ========
  const state = {
    slug: null,
    teamName: null,
    teamMax: 6,
    selected: [],            // volgorde bewaren
    selectedSet: new Set(),  // snelle lookup
    currentGen: GEN_RANGES[0],
    filterNumber: '',
    dbTeamId: null,          // Supabase team id (uuid)
    dbSecret: null           // Supabase edit_secret (uuid)
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
  const typeCache = new Map(); // id -> ['grass','poison']
  async function getPokemonTypes(id) {
    if (typeCache.has(id)) return typeCache.get(id);
    try {
      const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
      if (!res.ok) throw new Error('PokeAPI error');
      const data = await res.json();
      const types = data.types.map((t) => t.type.name); // e.g. ['grass','poison']
      typeCache.set(id, types);
      return types;
    } catch {
      typeCache.set(id, null);
      return null;
    }
  }
  
  // ======== SUPABASE HELPERS ========
  async function fetchBusySet() {
    // lees alle actieve claims en maak Set van ids
    const { data, error } = await sb.from('pokemon_claim').select('pokemon_id').eq('active', true);
    if (error) return new Set();
    return new Set(data.map(d => Number(d.pokemon_id)));
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
    let ids = [];
    for (let i = start; i <= end; i++) ids.push(i);
    if (state.filterNumber) {
      const n = String(Number(state.filterNumber));
      ids = ids.filter((id) => String(id).includes(n));
    }
    return ids;
  }
  
  async function renderGrid() {
    const grid = $('#grid');
    grid.innerHTML = '';
  
    const ids = buildIdList();
    $('#gridEmpty').style.display = ids.length ? 'none' : 'block';
  
    // Haal bezette pokemon op
    const busySet = await fetchBusySet();
  
    const tmpl = $('#pokeCardTmpl');
  
    ids.forEach((id) => {
      const node = tmpl.content.firstElementChild.cloneNode(true);
      const card = $('.poke-card', node);
      const img = $('.poke-img', node);
      const idSpan = $('.poke-id', node);
  
      img.src = artUrl(id);
      img.alt = `Pokémon #${id}`;
      idSpan.textContent = `#${String(id).padStart(3, '0')}`;
  
      // eigen selectie highlighten
      if (state.selectedSet.has(id)) card.classList.add('selected');
  
      // indien door ander team bezet: markeer busy (niet voor eigen selectie)
      if (busySet.has(id) && !state.selectedSet.has(id)) card.classList.add('busy');
  
      // click-selectie
      card.addEventListener('click', () => togglePick(id, card));
  
      grid.appendChild(node);
  
      // Types ophalen en tonen (gekleurde tekst, stijl via CSS)
      getPokemonTypes(id).then((types) => {
        if (!types || !types.length) return;
        const line = document.createElement('div');
        line.className = 'type-line';
        types.forEach((t, idx) => {
          const span = document.createElement('span');
          span.className = `type--${t}`;
          span.textContent = t;
          line.appendChild(span);
          if (idx < types.length - 1) line.appendChild(document.createTextNode(' / '));
        });
        idSpan.parentElement.appendChild(line);
      });
    });
  
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
          <img src="${artUrl(id)}" alt="#${id}">
          <span>#${String(id).padStart(3, '0')}</span>
          <button type="button" class="btn btn-sm btn-link text-danger p-0 remove" aria-label="Verwijder">×</button>
        `;
        chip.querySelector('.remove').addEventListener('click', async () => {
          await toggleRemove(id); // via RPC verwijderen
          renderGrid();           // refresh busy-status
        });
        chips.appendChild(chip);
      });
    }
    $('#selectedCount').textContent = `${state.selected.length} geselecteerd`;
  }
  
  // ======== SELECTION LOGIC (Supabase RPC) ========
  async function toggleRemove(id) {
    // helper om via knopje uit chips te verwijderen
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
      // verwijderen
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
      const { error } = await sb.rpc('add_pokemon', { p_team_id: teamId, p_secret: secret, p_pokemon_id: id });
      if (error) {
        // 23505 = unique violation (al geclaimd)
        if (String(error.code) === '23505') showAlert('Deze Pokémon is al bezet door een ander team.', 'warning');
        else showAlert(error.message, 'danger');
        return;
      }
      state.selected.push(id);
      state.selectedSet.add(id);
      cardEl.classList.add('selected');
    }
  
    updateSelectedUI();
    renderGrid(); // busy-status hertekenen
  }
  
  function removePick(id) {
    if (!state.selectedSet.has(id)) return;
    state.selectedSet.delete(id);
    state.selected = state.selected.filter((x) => x !== id);
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
    // Gen dropdown vullen
    renderGenMenu();
  
    // Zoeken op nummer
    const search = $('#searchInput');
    if (search) {
      search.addEventListener('input', (e) => {
        state.filterNumber = e.target.value.replace(/\D+/g, '');
        renderGrid();
      });
    }
  
    // Start formulier → DB-team maken → naar builder
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
  
        // lokaal bewaren om later te mogen bewerken vanaf dit device
        localStorage.setItem('ptb_team_id', state.dbTeamId);
        localStorage.setItem('ptb_team_secret', state.dbSecret);
  
        // reset selectie bij nieuw team
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
  
    // Navbar knoppen
    $('#backToStartBtn').addEventListener('click', () => setView(true));
  
    // Optioneel: lokaal opslaan (heeft niks met DB te maken)
    const saveBtn = $('#saveTeamBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveTeamLocal);
  
    $('#clearTeamBtn').addEventListener('click', async () => {
      // verwijder alle gekozen pokémon via RPC, dan UI cleanen
      const teamId = localStorage.getItem('ptb_team_id');
      const secret = localStorage.getItem('ptb_team_secret');
      if (teamId && secret) {
        // kopie om foreach te kunnen doen
        const toRemove = [...state.selected];
        for (const pid of toRemove) {
          await sb.rpc('remove_pokemon', { p_team_id: teamId, p_secret: secret, p_pokemon_id: pid });
          removePick(pid);
        }
      } else {
        state.selected = [];
        state.selectedSet = new Set();
      }
      renderGrid();
      updateSelectedUI();
    });
  
    // Start view extra knoppen (lokaal)
    $('#loadLastBtn').addEventListener('click', () => {
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
  
    $('#wipeAllBtn').addEventListener('click', () => {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LAST_KEY);
      localStorage.removeItem('ptb_team_id');
      localStorage.removeItem('ptb_team_secret');
      showAlert('Alle lokale data verwijderd.', 'warning');
    });
  }
  
  document.addEventListener('DOMContentLoaded', init);
  

  