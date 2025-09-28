// =============== Helpers ===============
const $ = (s, r = document) => r.querySelector(s);

// artwork url + padding
function artUrl(id){
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
}
function pad3(n){ return String(n).padStart(3,'0'); }

// Supabase RPC helper
async function rpc(fn, params = {}) {
  const { data, error } = await sb.rpc(fn, params);
  if (error) {
    console.error(`RPC ${fn} error:`, error);
    throw new Error(error.message);
  }
  return data;
}

// small dom utils
function row(html){ const tr=document.createElement('tr'); tr.innerHTML=html; return tr; }
function getAdminCode(){ return sessionStorage.getItem('ptb_admin_code') || null; }
function setAdminCode(c){ sessionStorage.setItem('ptb_admin_code', c); }
function clearAdminCode(){ sessionStorage.removeItem('ptb_admin_code'); }

// =============== UI refs ===============
const loginCard   = $('#loginCard');
const loginForm   = $('#loginForm');
const adminUI     = $('#adminUI');
const loginErr    = $('#loginErr');
const logoutBtn   = $('#logoutBtn');

const teamBody    = $('#teamBody');
const membersCard = $('#membersCard');
const membersGrid = $('#membersGrid');

const repairIdInp = $('#repairId');

// Edit modal refs
const editForm      = $('#editTeamForm');
const editTeamId    = $('#editTeamId');
const editTeamName  = $('#editTeamName');
const editTeamMax   = $('#editTeamMax');
const editErr       = $('#editErr');

// Replace modal refs
const replForm      = $('#replaceForm');
const replTeamId    = $('#replTeamId');
const replOldId     = $('#replOldId');
const replNewId     = $('#replNewId');
const replErr       = $('#replErr');
const replOldImg    = $('#replOldImg');
const replNewImg    = $('#replNewImg');
const replOldLabel  = $('#replOldLabel');
const replNewLabel  = $('#replNewLabel');

function showAdminUI(show){
  loginCard.classList.toggle('d-none', show);
  adminUI.classList.toggle('d-none', !show);
  logoutBtn.classList.toggle('d-none', !show);
}

// =============== Login / Logout ===============
loginForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  loginErr.classList.add('d-none');

  const code = $('#adminCode').value.trim();
  if (!code) return;

  try {
    await rpc('admin_list', { p_code: code });
    setAdminCode(code);
    showAdminUI(true);
  } catch (err) {
    if (String(err.message).includes('no admin access')) {
      loginErr.textContent = 'Ongeldige admincode.';
    } else {
      loginErr.textContent = 'Inloggen mislukt: ' + err.message;
    }
    loginErr.classList.remove('d-none');
  }
});

logoutBtn?.addEventListener('click', ()=>{
  clearAdminCode();
  showAdminUI(false);
  teamBody.innerHTML = '<tr><td colspan="5">Klik “Laad teams”.</td></tr>';
  membersCard.classList.add('d-none');
  membersGrid.innerHTML = '';
});

// =============== Teams laden (Leden / Bewerk / Verwijder) ===============
async function listTeams() {
  const code = getAdminCode();
  if (!code) return alert('Niet ingelogd.');
  teamBody.innerHTML = '<tr><td colspan="5">Laden…</td></tr>';

  let data;
  try {
    data = await rpc('admin_list', { p_code: code });
  } catch (err) {
    teamBody.innerHTML = `<tr><td colspan="5" class="text-danger">Fout: ${err.message}</td></tr>`;
    return;
  }

  if (!data?.length) {
    teamBody.innerHTML = '<tr><td colspan="5">Geen teams gevonden.</td></tr>';
    return;
  }

  teamBody.innerHTML = '';
  data.forEach(t => {
    const tr = row(`
      <td class="small text-break">${t.team_id}</td>
      <td>${t.name}</td>
      <td>${t.max_size}</td>
      <td>${new Date(t.created_at).toLocaleString()}</td>
      <td class="d-flex gap-2 flex-wrap">
        <button class="btn btn-sm btn-outline-primary">Leden</button>
        <button class="btn btn-sm btn-outline-secondary">Bewerk</button>
        <button class="btn btn-sm btn-outline-danger">Verwijder</button>
      </td>
    `);

    const [btnMembers, btnEdit, btnDelete] = tr.querySelectorAll('button');

    btnMembers.addEventListener('click', () => showMembers(t.team_id));

    btnEdit.addEventListener('click', () => {
      if (!editForm) return alert('Edit formulier niet gevonden.');
      editTeamId.value   = t.team_id;
      editTeamName.value = t.name;
      editTeamMax.value  = t.max_size;
      editErr?.classList.add('d-none');
      const m = new bootstrap.Modal('#editTeamModal');
      m.show();
    });

    btnDelete.addEventListener('click', async () => {
      if (!confirm('Weet je zeker? Dit verwijdert ook alle claims.')) return;
      try {
        await rpc('admin_delete_team', { p_code: code, p_team_id: t.team_id });
        listTeams();
      } catch (err) {
        alert('Fout: ' + err.message);
      }
    });

    teamBody.appendChild(tr);
  });
}

// =============== Leden per team (Vervang + Kick) ===============
async function showMembers(teamId) {
  const code = getAdminCode();
  if (!code) return alert('Niet ingelogd.');
  membersGrid.innerHTML = '';
  membersCard.classList.remove('d-none');

  let data;
  try {
    data = await rpc('admin_team_members', { p_code: code, p_team_id: teamId });
  } catch (err) {
    console.error('admin_team_members error:', err);
    membersGrid.innerHTML = `<div class="col-12 text-danger">Fout: ${err.message}</div>`;
    return;
  }

  if (!data?.length) {
    membersGrid.innerHTML = '<div class="col-12 text-secondary">Geen leden.</div>';
    return;
  }

  membersGrid.innerHTML = '';
  data.forEach(m => {
    const col = document.createElement('div');
    col.className = 'col-6 col-sm-4 col-md-3 col-lg-2';
    col.innerHTML = `
      <div class="card border-0">
        <img class="poke-img" src="${artUrl(m.pokemon_id)}" alt="#${m.pokemon_id}">
        <div class="text-center id-badge pt-2">#${pad3(m.pokemon_id)} — slot ${m.slot}</div>
        <div class="d-grid gap-2 mt-2">
          <button class="btn btn-sm btn-outline-secondary">Vervang</button>
          <button class="btn btn-sm btn-outline-danger">Kick</button>
        </div>
      </div>
    `;
    const [btnReplace, btnKick] = col.querySelectorAll('button');

    btnReplace.addEventListener('click', () => openReplaceModal(teamId, m.pokemon_id));

    btnKick.addEventListener('click', async () => {
      if (!confirm(`Verwijder #${m.pokemon_id} uit dit team?`)) return;
      try {
        await rpc('admin_kick_member', {
          p_code: code, p_team_id: teamId, p_pokemon_id: m.pokemon_id
        });
        await showMembers(teamId);
        await listTeams();
      } catch (err) {
        alert('Fout: ' + err.message);
      }
    });

    membersGrid.appendChild(col);
  });
}

// =============== Repair (claim vrijgeven op Pokémon-ID) ===============
async function repairPokemon() {
  const code = getAdminCode();
  if (!code) return alert('Niet ingelogd.');
  const id = Number($('#repairId').value.trim());
  if (!id) return alert('Vul een Pokémon ID in.');

  try {
    const released = await rpc('admin_release_claim', { p_code: code, p_pokemon_id: id });
    if ((+released) > 0) {
      alert(`Claim vrijgegeven voor #${pad3(id)} (records: ${released}).`);
    } else {
      alert(`Geen actieve claim gevonden voor #${pad3(id)}.`);
    }
    listTeams();
  } catch (err) {
    alert('Fout bij vrijgeven: ' + err.message);
  }
}

// =============== Edit-team submit ===============
editForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const code = getAdminCode();
  if (!code) return alert('Niet ingelogd.');

  const teamId = editTeamId?.value;
  const name   = editTeamName?.value?.trim() ?? '';
  const max    = parseInt(editTeamMax?.value ?? '6', 10);

  editErr?.classList.add('d-none');

  if (!(max >= 6 && max <= 10)) {
    if (editErr) {
      editErr.textContent = 'Max moet tussen 6 en 10 liggen.';
      editErr.classList.remove('d-none');
    } else {
      alert('Max moet tussen 6 en 10 liggen.');
    }
    return;
  }

  try {
    await rpc('admin_update_team', {
      p_code: code, p_team_id: teamId, p_name: name, p_max: max
    });
    bootstrap.Modal.getInstance($('#editTeamModal'))?.hide();
    await listTeams();
  } catch (err) {
    if (editErr) {
      editErr.textContent = err.message;
      editErr.classList.remove('d-none');
    } else {
      alert('Fout: ' + err.message);
    }
  }
});

// =============== Replace modal logic ===============
function openReplaceModal(teamId, oldId) {
  replTeamId.value = teamId;
  replOldId.value  = oldId;
  replNewId.value  = '';
  replErr.classList.add('d-none');

  replOldImg.src = artUrl(oldId);
  replOldImg.alt = `#${oldId}`;
  replOldLabel.textContent = `Huidig: #${pad3(oldId)}`;

  replNewImg.src = '';
  replNewImg.alt = '';
  replNewLabel.textContent = '';

  const m = new bootstrap.Modal('#replaceModal');
  m.show();
}

function updateNewPreview() {
  const v = Number(replNewId.value.trim());
  if (!v || v < 1) {
    replNewImg.src = '';
    replNewLabel.textContent = '';
    return;
  }
  replNewImg.src = artUrl(v);
  replNewImg.alt = `#${v}`;
  replNewLabel.textContent = `Nieuw: #${pad3(v)}`;
}
replNewId?.addEventListener('input', updateNewPreview);

replForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const code   = getAdminCode();
  if (!code) return alert('Niet ingelogd.');

  const teamId = replTeamId.value;
  const oldId  = Number(replOldId.value);
  const newId  = Number(replNewId.value.trim());

  replErr.classList.add('d-none');

  if (!Number.isInteger(newId) || newId <= 0) {
    replErr.textContent = 'Vul een geldig nieuw Pokémon ID in.';
    replErr.classList.remove('d-none');
    return;
  }
  if (newId === oldId) {
    replErr.textContent = 'Oud en nieuw ID mogen niet gelijk zijn.';
    replErr.classList.remove('d-none');
    return;
  }

  try {
    await rpc('admin_replace_member', {
      p_code: code, p_team_id: teamId, p_old_id: oldId, p_new_id: newId
    });
    bootstrap.Modal.getInstance($('#replaceModal'))?.hide();
    await showMembers(teamId);
    await listTeams();
  } catch (err) {
    replErr.textContent = err.message;
    replErr.classList.remove('d-none');
  }
});

// =============== Buttons & init ===============
$('#loadBtn')?.addEventListener('click', listTeams);
$('#repairBtn')?.addEventListener('click', repairPokemon);

document.addEventListener('DOMContentLoaded', ()=>{
  if (getAdminCode()) showAdminUI(true);
});


