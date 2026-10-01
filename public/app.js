// Badminton Score — client. Vanilla JS, no build step. All game/schedule
// logic lives server-side (functions/api); this file only renders state
// and calls the API.

const RULE_LABEL = {
  bwf21: 'BWF 21 (win by 2, cap 30)',
  classic15: 'Classic 15 (setting at 14-all)',
};

// ---------- API ----------

async function api(path, options) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method: options?.method || 'GET',
      headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `${res.status} ${res.statusText}` }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// Every button click handler in this file is an async function passed
// straight to addEventListener; a thrown/rejected error in one would
// otherwise vanish as an unhandled rejection with no visible feedback.
// This is the one net that catches all of them and actually tells the
// person something went wrong, instead of the button just doing nothing.
window.addEventListener('unhandledrejection', (event) => {
  console.error(event.reason);
  toast((event.reason && event.reason.message) || 'Something went wrong. Please try again.', 'error');
  event.preventDefault();
});

// ---------- In-app dialogs & toasts (replace browser alert/confirm) ----------

function toast(message, type = 'info', action = null) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const text = document.createElement('span');
  text.textContent = message;
  el.appendChild(text);
  const dismiss = () => {
    el.classList.add('toast-out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  };
  if (action) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      dismiss();
      action.onClick();
    });
    el.appendChild(btn);
  }
  root.appendChild(el);
  setTimeout(dismiss, action ? 6000 : type === 'error' ? 5000 : 3000);
}

function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const root = document.getElementById('dialog-root');
    root.hidden = false;
    root.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'dialog';
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');
    box.innerHTML = `
      <h3></h3>
      <p class="muted"></p>
      <div class="row" style="margin-top:18px">
        <button class="btn btn-secondary" data-act="cancel">Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok"></button>
      </div>`;
    box.querySelector('h3').textContent = title;
    box.querySelector('p').textContent = message;
    box.querySelector('[data-act="ok"]').textContent = confirmLabel;
    root.appendChild(box);

    const finish = (result) => {
      document.removeEventListener('keydown', onKey);
      root.hidden = true;
      root.innerHTML = '';
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') finish(false);
    };
    document.addEventListener('keydown', onKey);
    root.onclick = (e) => {
      if (e.target === root) finish(false);
    };
    box.querySelector('[data-act="cancel"]').addEventListener('click', () => finish(false));
    box.querySelector('[data-act="ok"]').addEventListener('click', () => finish(true));
    box.querySelector('[data-act="cancel"]').focus();
  });
}

// ---------- Theme ----------

const THEME_KEY = 'badminton.theme';
const DEFAULTS_KEY = 'badminton.sessionDefaults';

const ACCENT_KEY = 'badminton.accent';

// id: [label, primary in light mode, primary in dark mode]
const ACCENTS = {
  green: ['Green', '#1E6F46', '#3FA873'],
  blue: ['Blue', '#2563EB', '#60A5FA'],
  purple: ['Purple', '#7C3AED', '#A78BFA'],
  pink: ['Pink', '#BE185D', '#F472B6'],
  orange: ['Orange', '#C2410C', '#FB923C'],
  teal: ['Teal', '#0F766E', '#2DD4BF'],
  red: ['Red', '#B91C1C', '#F87171'],
  slate: ['Slate', '#475569', '#94A3B8'],
};

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode) — preference just won't persist
  }
}

function getAccentPreference() {
  const stored = safeGet(ACCENT_KEY);
  return ACCENTS[stored] ? stored : 'green';
}

function applyAccent() {
  const accent = getAccentPreference();
  const pref = getThemePreference();
  const dark = pref === 'dark' || (pref === 'system' && darkQuery.matches);
  const [, lightColor, darkColor] = ACCENTS[accent];
  const root = document.documentElement;
  root.style.setProperty('--primary', dark ? darkColor : lightColor);
  root.style.setProperty('--primary-text', dark ? '#08110C' : '#FFFFFF');
  document.querySelectorAll('#accent-swatches .swatch').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.accent === accent);
  });
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#0C0F14' : '#F3F5F9';
}

function setAccentPreference(accent) {
  safeSet(ACCENT_KEY, accent);
  applyAccent();
}

function renderAccentSwatches() {
  const wrap = document.getElementById('accent-swatches');
  wrap.innerHTML = Object.entries(ACCENTS)
    .map(
      ([id, [label, lightColor]]) =>
        `<button class="swatch" data-accent="${id}" aria-label="${label}"><span class="swatch-dot" style="background:${lightColor}"></span>${label}</button>`,
    )
    .join('');
  wrap.querySelectorAll('.swatch').forEach((btn) => {
    btn.addEventListener('click', () => setAccentPreference(btn.dataset.accent));
  });
}

function applyTheme(pref) {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  document.getElementById('theme-icon-dark').hidden = pref === 'dark';
  document.getElementById('theme-icon-light').hidden = pref !== 'dark';
  document.querySelectorAll('#theme-segmented .segment').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.theme === pref);
  });
  applyAccent();
}

function getThemePreference() {
  return safeGet(THEME_KEY) || 'system';
}

function setThemePreference(pref) {
  safeSet(THEME_KEY, pref);
  applyTheme(pref);
}

darkQuery.addEventListener('change', applyAccent);

const FALLBACK_DEFAULTS = {
  courtCount: 1,
  slotMinutes: 15,
  useTimeSlots: true,
  rounds: 3,
  hasFinal: true,
  scoringRule: 'bwf21',
};

function getSessionDefaults() {
  try {
    return { ...FALLBACK_DEFAULTS, ...JSON.parse(localStorage.getItem(DEFAULTS_KEY) || '{}') };
  } catch {
    return { ...FALLBACK_DEFAULTS };
  }
}

function setSessionDefaults(defaults) {
  localStorage.setItem(DEFAULTS_KEY, JSON.stringify(defaults));
}

document.getElementById('theme-toggle').addEventListener('click', () => {
  const order = ['system', 'light', 'dark'];
  const next = order[(order.indexOf(getThemePreference()) + 1) % order.length];
  setThemePreference(next);
});

// ---------- Tabs ----------

const views = ['schedule', 'leaderboard', 'teams', 'history', 'settings'];

function showTab(name) {
  views.forEach((v) => {
    document.getElementById(`view-${v}`).hidden = v !== name;
  });
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  if (name === 'schedule') loadSchedule();
  if (name === 'leaderboard') loadLeaderboard();
  if (name === 'history') loadHistory();
  if (name === 'teams') loadTeams();
}

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
});

// ---------- Helpers ----------

function h(strings, ...values) {
  return strings.reduce((acc, s, i) => acc + s + (values[i] ?? ''), '');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatOffset(baseTimeMs, offsetMinutes) {
  const d = new Date(baseTimeMs + offsetMinutes * 60000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ---------- Teams ----------

let teamsCache = [];

async function loadTeams() {
  const { teams } = await api('/teams');
  teamsCache = teams;
  renderTeams();
}

function renderTeams() {
  const list = document.getElementById('teams-list');
  if (teamsCache.length === 0) {
    list.innerHTML = `<div class="empty-state">No teams yet. Add your first team with its players to start scheduling matches.</div>`;
    return;
  }
  list.innerHTML = teamsCache
    .map(
      (team) => h`
    <div class="card team-card" data-team-id="${team.id}">
      <div class="team-card-head">
        <h3>${escapeHtml(team.name)}</h3>
        <button class="icon-btn-plain" data-delete-team="${team.id}" title="Delete team">✕</button>
      </div>
      <div class="chip-row">
        ${team.players.length ? team.players.map((p) => `<span class="chip">${escapeHtml(p.name)}</span>`).join('') : '<span class="muted small">No players added</span>'}
      </div>
    </div>`,
    )
    .join('');

  list.querySelectorAll('[data-team-id]').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-delete-team]')) return;
      const team = teamsCache.find((t) => t.id === Number(card.dataset.teamId));
      openTeamForm(team);
    });
  });
  list.querySelectorAll('[data-delete-team]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await confirmDialog({
        title: 'Delete team?',
        message: 'This team will be removed from your roster.',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      await api(`/teams/${btn.dataset.deleteTeam}`, { method: 'DELETE' });
      await loadTeams();
      toast('Team deleted', 'success');
    });
  });
}

document.getElementById('teams-add-btn').addEventListener('click', () => openTeamForm(null));

function openTeamForm(team) {
  const playerNames = team ? team.players.map((p) => p.name) : ['', ''];
  showModal(() => {
    const root = document.createElement('div');
    root.innerHTML = h`
      <h2 style="margin-bottom:14px">${team ? 'Edit team' : 'New team'}</h2>
      <div class="stack">
        <label class="field"><span>Team name</span><input id="team-name-input" value="${team ? escapeHtml(team.name) : ''}" placeholder="e.g. Smashers" /></label>
        <div class="field-label">Players</div>
        <div id="player-fields" class="stack"></div>
        <button class="btn btn-secondary" id="add-player-field-btn" type="button">+ Add player</button>
        <div class="row" style="margin-top:8px">
          <button class="btn btn-secondary" id="team-cancel-btn">Cancel</button>
          <button class="btn btn-primary" id="team-save-btn">Save team</button>
        </div>
      </div>
    `;

    const fieldsContainer = root.querySelector('#player-fields');
    let names = [...playerNames];

    function renderPlayerFields() {
      fieldsContainer.innerHTML = names
        .map(
          (n, i) => h`
        <div class="row" data-player-row="${i}">
          <input class="player-input" data-index="${i}" value="${escapeHtml(n)}" placeholder="Player ${i + 1}" style="flex:1;font-size:15px;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--text)" />
          <button type="button" class="icon-btn-plain" data-remove-index="${i}" style="flex:0">✕</button>
        </div>`,
        )
        .join('');
      fieldsContainer.querySelectorAll('.player-input').forEach((input) => {
        input.addEventListener('input', () => {
          names[Number(input.dataset.index)] = input.value;
        });
      });
      fieldsContainer.querySelectorAll('[data-remove-index]').forEach((btn) => {
        btn.addEventListener('click', () => {
          names.splice(Number(btn.dataset.removeIndex), 1);
          renderPlayerFields();
        });
      });
    }
    renderPlayerFields();

    root.querySelector('#add-player-field-btn').addEventListener('click', () => {
      names.push('');
      renderPlayerFields();
    });
    root.querySelector('#team-cancel-btn').addEventListener('click', closeModal);
    root.querySelector('#team-save-btn').addEventListener('click', async () => {
      const name = root.querySelector('#team-name-input').value.trim();
      if (!name) {
        toast('Team name is required.', 'error');
        return;
      }
      const cleaned = names.map((n) => n.trim()).filter(Boolean);
      if (team) {
        await api(`/teams/${team.id}`, { method: 'PUT', body: { name, playerNames: cleaned } });
      } else {
        await api('/teams', { method: 'POST', body: { name, playerNames: cleaned } });
      }
      closeModal();
      await loadTeams();
    });

    return root;
  });
}

// ---------- Randomize teams ----------

function computeWinRate(stat) {
  if (!stat) return 0.5;
  const total = stat.wins + stat.losses;
  return total > 0 ? stat.wins / total : 0.5;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Standard "snake draft" order (0,1,2,..,2,1,0,0,1,2,...) so alternating
// picks keep each team's total rating close, instead of just stacking the
// strongest players on team 1.
function snakeTeamOrder(numTeams, count) {
  const order = [];
  let forward = true;
  while (order.length < count) {
    const seq = [...Array(numTeams).keys()];
    order.push(...(forward ? seq : seq.reverse()));
    forward = !forward;
  }
  return order.slice(0, count);
}

function generateBalancedTeams(players, playersPerTeam) {
  const numTeams = Math.max(1, Math.floor(players.length / Math.max(1, playersPerTeam)));
  // Shuffle first so players tied on rating (including everyone with no
  // history yet, all at 0.5) land in random order, not always the same seats.
  const ranked = shuffleArray(players).sort((a, b) => b.rating - a.rating);
  const order = snakeTeamOrder(numTeams, ranked.length);
  const teams = Array.from({ length: numTeams }, () => []);
  ranked.forEach((p, i) => teams[order[i]].push(p));
  return teams;
}

document.getElementById('teams-randomize-btn').addEventListener('click', openRandomizeTeamsForm);

async function openRandomizeTeamsForm() {
  const { players, stats } = await api('/players');
  if (players.length < 2) {
    toast('Add at least 2 players (via Teams) before randomizing.', 'error');
    return;
  }
  const statsByPlayer = new Map(stats.map((s) => [s.playerId, s]));
  const pool = players.map((p) => ({ id: p.id, name: p.name, rating: computeWinRate(statsByPlayer.get(p.id)) }));
  const selected = new Set(pool.map((p) => p.id));
  let generatedTeams = null;
  let lastPlayersPerTeam = 2;

  showModal(() => {
    const root = document.createElement('div');

    function renderSelectStep() {
      root.innerHTML = h`
        <h2 style="margin-bottom:14px">Randomize teams</h2>
        <div class="stack">
          <label class="field"><span>Players per team</span><input type="number" min="1" id="rt-size-input" value="${lastPlayersPerTeam}" /></label>
          <div class="field-label">Players (<span id="rt-count">${selected.size}</span> selected)</div>
          <p class="muted small" style="margin-top:-4px">Balanced by win rate from History — new players with no record yet count as average.</p>
          <div class="stack" id="rt-player-list"></div>
          <div class="row" style="margin-top:8px">
            <button class="btn btn-secondary" id="rt-cancel-btn">Cancel</button>
            <button class="btn btn-primary" id="rt-generate-btn">Generate teams</button>
          </div>
        </div>
      `;

      const list = root.querySelector('#rt-player-list');
      const countLabel = root.querySelector('#rt-count');
      list.innerHTML = pool
        .map(
          (p) => h`
        <div class="card" data-pick-player="${p.id}" style="display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;padding:12px 14px;opacity:${selected.has(p.id) ? '1' : '.5'}">
          <div style="display:flex;align-items:center;gap:10px;min-width:0">
            <span class="pick-mark">${selected.has(p.id) ? '☑' : '☐'}</span>
            <strong style="overflow-wrap:anywhere">${escapeHtml(p.name)}</strong>
          </div>
          <span class="muted small" style="flex-shrink:0">${Math.round(p.rating * 100)}% win</span>
        </div>`,
        )
        .join('');
      list.querySelectorAll('[data-pick-player]').forEach((card) => {
        card.addEventListener('click', () => {
          const id = Number(card.dataset.pickPlayer);
          if (selected.has(id)) selected.delete(id);
          else selected.add(id);
          countLabel.textContent = String(selected.size);
          card.querySelector('.pick-mark').textContent = selected.has(id) ? '☑' : '☐';
          card.style.opacity = selected.has(id) ? '1' : '.5';
        });
      });

      root.querySelector('#rt-cancel-btn').addEventListener('click', closeModal);
      root.querySelector('#rt-generate-btn').addEventListener('click', () => {
        lastPlayersPerTeam = Math.max(1, Number(root.querySelector('#rt-size-input').value) || 2);
        const chosen = pool.filter((p) => selected.has(p.id));
        if (chosen.length < 2) {
          toast('Select at least 2 players.', 'error');
          return;
        }
        generatedTeams = generateBalancedTeams(chosen, lastPlayersPerTeam);
        renderPreviewStep();
      });
    }

    function renderPreviewStep() {
      root.innerHTML = h`
        <h2 style="margin-bottom:14px">Review teams</h2>
        <div class="stack" id="rt-preview-list"></div>
        <div class="row" style="margin-top:12px">
          <button class="btn btn-secondary" id="rt-back-btn">Back</button>
          <button class="btn btn-secondary" id="rt-reshuffle-btn">Shuffle again</button>
        </div>
        <button class="btn btn-primary btn-block" id="rt-save-btn" style="margin-top:10px">Save teams</button>
      `;
      const list = root.querySelector('#rt-preview-list');
      list.innerHTML = generatedTeams
        .map(
          (team, i) => h`
        <div class="card">
          <input
            class="rt-team-name"
            data-index="${i}"
            value="Team ${i + 1}"
            style="font-weight:700;font-size:15px;border:none;background:transparent;color:var(--text);padding:0;margin-bottom:8px;width:100%"
          />
          <div class="chip-row">
            ${team.map((p) => `<span class="chip">${escapeHtml(p.name)}</span>`).join('')}
          </div>
        </div>`,
        )
        .join('');

      root.querySelector('#rt-back-btn').addEventListener('click', renderSelectStep);
      root.querySelector('#rt-reshuffle-btn').addEventListener('click', () => {
        const chosen = pool.filter((p) => selected.has(p.id));
        generatedTeams = generateBalancedTeams(chosen, lastPlayersPerTeam);
        renderPreviewStep();
      });
      root.querySelector('#rt-save-btn').addEventListener('click', async (e) => {
        e.target.disabled = true;
        try {
          const names = Array.from(root.querySelectorAll('.rt-team-name')).map((input) => input.value.trim());
          for (let i = 0; i < generatedTeams.length; i++) {
            const teamName = names[i] || `Team ${i + 1}`;
            await api('/teams', {
              method: 'POST',
              body: { name: teamName, playerNames: generatedTeams[i].map((p) => p.name) },
            });
          }
          closeModal();
          await loadTeams();
        } finally {
          e.target.disabled = false;
        }
      });
    }

    renderSelectStep();
    return root;
  });
}

// ---------- Schedule ----------

let scheduleState = { session: null, slots: [], sessions: [] };
let selectedSessionId = null;

async function loadSchedule() {
  const [data, { sessions }] = await Promise.all([
    api(selectedSessionId ? `/sessions/latest?id=${selectedSessionId}` : '/sessions/latest'),
    api('/sessions'),
  ]);
  selectedSessionId = data.session ? data.session.id : null;
  scheduleState = { ...data, sessions };
  renderSchedule();
}

function renderSlotCard(slot, session) {
  const done = slot.status === 'completed';
  const winnerSide = !done ? null : slot.match_winner_team_id === slot.team_a_id ? 'a' : 'b';
  const hasScore = done && (slot.match_team_a_score || slot.match_team_b_score);
  const when = `Court ${slot.court_number}${session.use_time_slots ? ` · ${formatOffset(session.created_at, slot.start_offset_minutes)}` : ''}`;

  const side = (key, name, score) => {
    const won = winnerSide === key;
    const lost = done && !won;
    const inner = `<span class="side-name">${won ? '🏆 ' : ''}${escapeHtml(name)}</span>${hasScore ? `<span class="side-score">${score}</span>` : ''}`;
    return done
      ? `<div class="side ${won ? 'side-won' : ''} ${lost ? 'side-lost' : ''}">${inner}</div>`
      : `<button class="side side-pick" data-pick-slot="${slot.id}" data-side="${key}" aria-label="${escapeHtml(name)} won">${inner}</button>`;
  };

  return h`
    <div class="card slot-card" data-slot-id="${slot.id}">
      <div class="slot-head">
        <span class="slot-meta">${when}</span>
        ${statusBadge(slot.status)}
      </div>
      <div class="matchup">
        ${side('a', slot.team_a_name, slot.match_team_a_score)}
        <span class="vs">VS</span>
        ${side('b', slot.team_b_name, slot.match_team_b_score)}
      </div>
      <div class="slot-foot">
        <span>${done ? 'Tap card to edit' : 'Tap the winning team'}</span>
        <span class="slot-foot-link">Live score ›</span>
      </div>
    </div>`;
}

// Optimistic: the card flips to "Done" immediately; the server call and the
// refresh happen in the background and roll back on failure.
function pickWinnerFromSchedule(slotId, side, teamName) {
  const slot = scheduleState.slots.find((x) => x.id === slotId);
  if (!slot || slot.status === 'completed') return;
  const before = { status: slot.status, winner: slot.match_winner_team_id };
  slot.status = 'completed';
  slot.match_winner_team_id = side === 'a' ? slot.team_a_id : slot.team_b_id;
  renderSchedule();

  const request = api(`/slots/${slotId}/declare-winner`, { method: 'POST', body: { winnerSide: side } });
  request
    .then(() => loadSchedule())
    .catch((err) => {
      slot.status = before.status;
      slot.match_winner_team_id = before.winner;
      renderSchedule();
      toast(err.message || 'Could not save the result. Try again.', 'error');
    });

  toast(`${teamName} won`, 'success', {
    label: 'Undo',
    onClick: async () => {
      slot.status = before.status;
      slot.match_winner_team_id = before.winner;
      renderSchedule();
      try {
        const { match } = await request;
        await api(`/matches/${match.id}/reopen`, { method: 'POST' });
      } finally {
        await loadSchedule();
      }
    },
  });
}

function renderSchedule() {
  const container = document.getElementById('schedule-content');
  const { session, slots, sessions } = scheduleState;

  if (!session) {
    container.innerHTML = `
      <div class="empty-state" style="padding-top:60px">
        <p style="margin-bottom:16px">No session yet. Create one to generate today's match schedule.</p>
      </div>
      <button class="btn btn-primary btn-block" id="new-session-btn">+ New session</button>
    `;
    container.querySelector('#new-session-btn').addEventListener('click', openNewSessionForm);
    return;
  }

  const regularSlots = slots.filter((s) => !s.is_final);
  const finalSlot = slots.find((s) => s.is_final);
  const finalDone = finalSlot?.status === 'completed';

  const byRound = new Map();
  for (const slot of regularSlots) {
    if (!byRound.has(slot.round_number)) byRound.set(slot.round_number, []);
    byRound.get(slot.round_number).push(slot);
  }

  const roundsHtml = Array.from(byRound.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([round, roundSlots]) => {
      const extLabel = roundSlots[0].is_extension ? ` · Extension ${roundSlots[0].extension_number}` : '';
      const slotsHtml = roundSlots.map((slot) => renderSlotCard(slot, session)).join('');
      return `<div class="round-label">Round ${round}${extLabel}</div>${slotsHtml}`;
    })
    .join('');

  const finalHtml = finalSlot
    ? `<div class="round-label">🏆 Final</div>${renderSlotCard(finalSlot, session)}`
    : '';

  const metaParts = [`${session.court_count} court${session.court_count > 1 ? 's' : ''}`];
  if (session.use_time_slots) metaParts.push(`${session.slot_minutes} min/match`);
  else metaParts.push('play until finish');
  metaParts.push(RULE_LABEL[session.scoring_rule]);

  container.innerHTML = h`
    <div class="session-header">
      <div class="session-row">
        <div class="session-select-wrap">
          <select id="session-select" class="session-select" aria-label="Select session">
            ${sessions.map((s) => `<option value="${s.id}"${s.id === session.id ? ' selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
          </select>
        </div>
        <button class="icon-btn icon-btn-danger" id="delete-session-btn" aria-label="Delete session" title="Delete session">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>
        </button>
      </div>
      <p class="muted small session-meta">${metaParts.join(' · ')}</p>
    </div>
    <div class="stack">${roundsHtml}</div>
    ${finalHtml}
    <div class="stack" style="margin-top:16px">
      <button class="btn btn-secondary btn-block" id="extend-btn" ${finalDone ? 'disabled title="The final is finished"' : ''}>Extend schedule</button>
      ${finalDone ? '<p class="muted small" style="text-align:center">The final is finished, so the schedule can't be extended.</p>' : ''}
      <button class="btn btn-secondary btn-block" id="new-session-btn">+ New session</button>
    </div>
  `;

  container.querySelectorAll('[data-slot-id]').forEach((card) => {
    card.addEventListener('click', () => openMatchModal(Number(card.dataset.slotId)));
  });
  container.querySelectorAll('[data-pick-slot]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      pickWinnerFromSchedule(Number(btn.dataset.pickSlot), btn.dataset.side, btn.textContent.trim());
    });
  });
  container.querySelector('#extend-btn').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      await api(`/sessions/${session.id}/extend`, { method: 'POST' });
      await loadSchedule();
    } finally {
      e.target.disabled = false;
    }
  });
  container.querySelector('#new-session-btn').addEventListener('click', openNewSessionForm);
  container.querySelector('#session-select').addEventListener('change', async (e) => {
    selectedSessionId = Number(e.target.value);
    await loadSchedule();
  });
  container.querySelector('#delete-session-btn').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Delete session?',
      message: `"${session.name}" will be removed along with its schedule, matches and scores. Teams are kept.`,
      confirmLabel: 'Delete session',
      danger: true,
    });
    if (!ok) return;
    await api(`/sessions/${session.id}`, { method: 'DELETE' });
    selectedSessionId = null;
    await loadSchedule();
    toast('Session deleted', 'success');
  });
}

function statusBadge(status) {
  const config = {
    pending: { label: 'Pending', color: 'var(--primary)' },
    in_progress: { label: 'Live', color: 'var(--warning)' },
    completed: { label: 'Done', color: 'var(--success)' },
  }[status];
  return `<span class="badge" style="background:color-mix(in srgb, ${config.color} 18%, transparent); color:${config.color}">${config.label}</span>`;
}

function openNewSessionForm() {
  const defaults = getSessionDefaults();
  const selected = new Set();

  showModal(() => {
    const root = document.createElement('div');
    root.innerHTML = h`
      <h2 style="margin-bottom:14px">New session</h2>
      <div class="stack">
        <label class="field"><span>Session name</span><input id="session-name-input" value="Session – ${new Date().toLocaleDateString()}" /></label>
        <div class="row">
          <label class="field"><span>Courts</span><input type="number" min="1" id="session-courts-input" value="${defaults.courtCount}" /></label>
          <label class="field"><span>Rounds</span><input type="number" min="1" id="session-rounds-input" value="${defaults.rounds}" /></label>
        </div>
        <div class="field-label">Match duration</div>
        <div class="segmented" id="session-timing-segmented">
          <button class="segment" data-timing="finish">Play until finish</button>
          <button class="segment" data-timing="timed">Timed</button>
        </div>
        <label class="field" id="session-minutes-field"><span>Minutes per match</span><input type="number" min="5" id="session-minutes-input" value="${defaults.slotMinutes}" /></label>
        <div class="field-label">Default scoring rule</div>
        <div class="segmented" id="session-rule-segmented">
          <button class="segment" data-rule="bwf21">BWF 21</button>
          <button class="segment" data-rule="classic15">Classic 15</button>
        </div>
        <div class="field-label">Final match</div>
        <div class="segmented" id="session-final-segmented">
          <button class="segment" data-final="yes">With final</button>
          <button class="segment" data-final="no">Without final</button>
        </div>
        <p class="muted small" style="margin-top:-6px">If enabled, once all rounds finish a Final is added automatically between the top 2 teams.</p>
        <div class="field-label" style="margin-top:6px">Teams playing (<span id="team-count-label">0</span> selected)</div>
        <div class="stack" id="team-pick-list"></div>
        <div class="row" style="margin-top:8px">
          <button class="btn btn-secondary" id="session-cancel-btn">Cancel</button>
          <button class="btn btn-primary" id="session-save-btn">Generate schedule</button>
        </div>
      </div>
    `;

    let scoringRule = defaults.scoringRule;
    function paintRule() {
      root.querySelectorAll('#session-rule-segmented .segment').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.rule === scoringRule);
      });
    }
    paintRule();
    root.querySelectorAll('#session-rule-segmented .segment').forEach((btn) => {
      btn.addEventListener('click', () => {
        scoringRule = btn.dataset.rule;
        paintRule();
      });
    });

    let useTimeSlots = defaults.useTimeSlots;
    const minutesField = root.querySelector('#session-minutes-field');
    function paintTiming() {
      root.querySelectorAll('#session-timing-segmented .segment').forEach((btn) => {
        btn.classList.toggle('active', (btn.dataset.timing === 'timed') === useTimeSlots);
      });
      minutesField.hidden = !useTimeSlots;
    }
    paintTiming();
    root.querySelectorAll('#session-timing-segmented .segment').forEach((btn) => {
      btn.addEventListener('click', () => {
        useTimeSlots = btn.dataset.timing === 'timed';
        paintTiming();
      });
    });

    let hasFinal = defaults.hasFinal;
    function paintFinal() {
      root.querySelectorAll('#session-final-segmented .segment').forEach((btn) => {
        btn.classList.toggle('active', (btn.dataset.final === 'yes') === hasFinal);
      });
    }
    paintFinal();
    root.querySelectorAll('#session-final-segmented .segment').forEach((btn) => {
      btn.addEventListener('click', () => {
        hasFinal = btn.dataset.final === 'yes';
        paintFinal();
      });
    });

    const teamPickList = root.querySelector('#team-pick-list');
    const countLabel = root.querySelector('#team-count-label');
    if (teamsCache.length === 0) {
      teamPickList.innerHTML = `<p class="muted small">No teams yet — add teams first from the Teams tab.</p>`;
    } else {
      teamPickList.innerHTML = teamsCache
        .map((t) => h`<div class="card" data-pick-team="${t.id}" style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:12px 14px"><span class="pick-mark">☐</span><strong>${escapeHtml(t.name)}</strong></div>`)
        .join('');
      teamPickList.querySelectorAll('[data-pick-team]').forEach((card) => {
        card.addEventListener('click', () => {
          const id = Number(card.dataset.pickTeam);
          if (selected.has(id)) selected.delete(id);
          else selected.add(id);
          card.querySelector('.pick-mark').textContent = selected.has(id) ? '☑' : '☐';
          card.style.borderColor = selected.has(id) ? 'var(--primary)' : 'var(--border)';
          countLabel.textContent = String(selected.size);
        });
      });
    }

    root.querySelector('#session-cancel-btn').addEventListener('click', closeModal);
    root.querySelector('#session-save-btn').addEventListener('click', async (e) => {
      if (selected.size < 2) {
        toast('Pick at least 2 teams to build a schedule.', 'error');
        return;
      }
      e.target.disabled = true;
      const courtCount = Math.max(1, Number(root.querySelector('#session-courts-input').value) || 1);
      const rounds = Math.max(1, Number(root.querySelector('#session-rounds-input').value) || 1);
      const slotMinutes = Math.max(5, Number(root.querySelector('#session-minutes-input').value) || 5);
      const name = root.querySelector('#session-name-input').value.trim() || 'Session';
      try {
        await api('/sessions', {
          method: 'POST',
          body: {
            name,
            sessionDate: new Date().toISOString().slice(0, 10),
            courtCount,
            slotMinutes,
            useTimeSlots,
            rounds,
            hasFinal,
            scoringRule,
            teamIds: Array.from(selected),
          },
        });
        setSessionDefaults({ courtCount, slotMinutes, useTimeSlots, rounds, hasFinal, scoringRule });
        closeModal();
        selectedSessionId = null;
        await loadSchedule();
      } finally {
        e.target.disabled = false;
      }
    });

    return root;
  });
}

// ---------- Live match modal ----------

let matchPollTimer = null;

async function openMatchModal(slotId) {
  const { match } = await api(`/slots/${slotId}/start`, { method: 'POST' });
  renderMatchModal(match);
}

function renderMatchModal(match) {
  showModal(
    () => {
      const root = document.createElement('div');
      root.id = 'match-modal-root';
      paintMatch(root, match);
      return root;
    },
    () => {
      if (matchPollTimer) clearInterval(matchPollTimer);
      matchPollTimer = null;
    },
  );

  if (matchPollTimer) clearInterval(matchPollTimer);
  matchPollTimer = setInterval(async () => {
    try {
      const fresh = await api(`/matches/${match.id}`);
      const root = document.getElementById('match-modal-root');
      if (root && !root._pending) paintMatch(root, fresh.match);
    } catch {
      /* transient network hiccup — next tick retries */
    }
  }, 2500);
}

function paintMatch(root, match) {
  const isComplete = match.status === 'completed';
  const canChangeRule = match.team_a_score === 0 && match.team_b_score === 0 && !isComplete;
  const needsSetting =
    !isComplete &&
    match.scoring_rule === 'classic15' &&
    !match.is_set &&
    match.team_a_score === 14 &&
    match.team_b_score === 14;

  root.innerHTML = h`
    ${canChangeRule
      ? `<div class="segmented" id="match-rule-segmented">
           <button class="segment" data-rule="bwf21">BWF 21</button>
           <button class="segment" data-rule="classic15">Classic 15</button>
         </div>`
      : `<p class="muted small" style="text-align:center">${RULE_LABEL[match.scoring_rule]}</p>`}

    <div class="scoreboard">
      <div class="score-col">
        <div class="team-name">${escapeHtml(match.team_a_name)}${match.winner_team_id === match.team_a_id ? ' 🏆' : ''}</div>
        <div class="score-num">${match.team_a_score}</div>
        <div class="score-buttons">
          <button class="round-btn" data-side="a" data-delta="-1" ${isComplete || needsSetting || match.team_a_score === 0 ? 'disabled' : ''}>−</button>
          <button class="round-btn primary" data-side="a" data-delta="1" ${isComplete || needsSetting ? 'disabled' : ''}>+</button>
        </div>
      </div>
      <div class="vs-col">VS<br/>Target ${match.target_points}</div>
      <div class="score-col">
        <div class="team-name">${escapeHtml(match.team_b_name)}${match.winner_team_id === match.team_b_id ? ' 🏆' : ''}</div>
        <div class="score-num">${match.team_b_score}</div>
        <div class="score-buttons">
          <button class="round-btn" data-side="b" data-delta="-1" ${isComplete || needsSetting || match.team_b_score === 0 ? 'disabled' : ''}>−</button>
          <button class="round-btn primary" data-side="b" data-delta="1" ${isComplete || needsSetting ? 'disabled' : ''}>+</button>
        </div>
      </div>
    </div>

    ${needsSetting
      ? `<div class="setting-banner">
           <p style="font-weight:600;margin-bottom:10px">Score is tied 14-14. Set the game?</p>
           <div class="row">
             <button class="btn btn-secondary" id="setting-straight-btn">Play to 15</button>
             <button class="btn btn-primary" id="setting-set-btn">Set to 17</button>
           </div>
         </div>`
      : ''}

    ${!isComplete
      ? `<div class="quick-winner">
           <p class="muted small" style="text-align:center;margin-bottom:8px">Or just pick the winner</p>
           <div class="row">
             <button class="btn btn-secondary" id="quick-winner-a-btn">${escapeHtml(match.team_a_name)} won</button>
             <button class="btn btn-secondary" id="quick-winner-b-btn">${escapeHtml(match.team_b_name)} won</button>
           </div>
         </div>`
      : ''}

    ${isComplete
      ? `<div class="complete-banner">
           <div style="font-size:22px">🏆</div>
           <strong>${match.winner_team_id === match.team_a_id ? escapeHtml(match.team_a_name) : escapeHtml(match.team_b_name)} wins!</strong>
           <div class="row" style="width:100%">
             <button class="btn btn-secondary" id="reopen-btn">Reopen</button>
             <button class="btn btn-primary" id="back-to-schedule-btn">Back to schedule</button>
           </div>
         </div>`
      : ''}
  `;

  if (canChangeRule) {
    root.querySelectorAll('#match-rule-segmented .segment').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.rule === match.scoring_rule);
      btn.addEventListener('click', async () => {
        const res = await api(`/matches/${match.id}/rule`, { method: 'POST', body: { rule: btn.dataset.rule } });
        paintMatch(root, res.match);
      });
    });
  }

  // Score taps update the number instantly; requests are chained so the
  // server applies them in order, and the screen is repainted from the
  // server's answer only once the last one has landed.
  const local = { a: match.team_a_score, b: match.team_b_score };
  root.querySelectorAll('.round-btn[data-side]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const side = btn.dataset.side;
      const delta = Number(btn.dataset.delta);
      local[side] = Math.max(0, local[side] + delta);
      const col = btn.closest('.score-col');
      col.querySelector('.score-num').textContent = local[side];
      col.querySelector('.round-btn:not(.primary)').disabled = local[side] === 0;

      root._pending = (root._pending || 0) + 1;
      root._chain = (root._chain || Promise.resolve())
        .then(() => api(`/matches/${match.id}/score`, { method: 'POST', body: { side, delta } }))
        .then((res) => {
          root._pending -= 1;
          if (root._pending === 0) paintMatch(root, res.match);
        })
        .catch(async (err) => {
          root._pending -= 1;
          toast(err.message || 'Could not save the score.', 'error');
          if (root._pending === 0) {
            const fresh = await api(`/matches/${match.id}`).catch(() => null);
            if (fresh) paintMatch(root, fresh.match);
          }
        });
    });
  });

  const settingStraight = root.querySelector('#setting-straight-btn');
  const settingSet = root.querySelector('#setting-set-btn');
  if (settingStraight)
    settingStraight.addEventListener('click', async () => {
      const res = await api(`/matches/${match.id}/setting`, { method: 'POST', body: { choice: 'straight' } });
      paintMatch(root, res.match);
    });
  if (settingSet)
    settingSet.addEventListener('click', async () => {
      const res = await api(`/matches/${match.id}/setting`, { method: 'POST', body: { choice: 'set' } });
      paintMatch(root, res.match);
    });

  const quickWinnerA = root.querySelector('#quick-winner-a-btn');
  const quickWinnerB = root.querySelector('#quick-winner-b-btn');
  if (quickWinnerA)
    quickWinnerA.addEventListener('click', async () => {
      const res = await api(`/matches/${match.id}/declare-winner`, { method: 'POST', body: { winnerSide: 'a' } });
      paintMatch(root, res.match);
    });
  if (quickWinnerB)
    quickWinnerB.addEventListener('click', async () => {
      const res = await api(`/matches/${match.id}/declare-winner`, { method: 'POST', body: { winnerSide: 'b' } });
      paintMatch(root, res.match);
    });

  const reopenBtn = root.querySelector('#reopen-btn');
  if (reopenBtn)
    reopenBtn.addEventListener('click', async () => {
      const res = await api(`/matches/${match.id}/reopen`, { method: 'POST' });
      paintMatch(root, res.match);
    });

  const backBtn = root.querySelector('#back-to-schedule-btn');
  if (backBtn)
    backBtn.addEventListener('click', async () => {
      closeModal();
      await loadSchedule();
    });
}

// ---------- Leaderboard ----------

async function loadLeaderboard() {
  const { session } = await api(selectedSessionId ? `/sessions/latest?id=${selectedSessionId}` : '/sessions/latest');
  if (!session) {
    renderLeaderboard(null, [], null);
    return;
  }
  const { standings, finalSlot } = await api(`/sessions/${session.id}/leaderboard`);
  renderLeaderboard(session, standings, finalSlot);
}

function renderLeaderboard(session, standings, finalSlot) {
  const container = document.getElementById('leaderboard-content');
  if (!session) {
    container.innerHTML = `<p class="muted">No session yet. Create one from the Schedule tab.</p>`;
    return;
  }

  const rowsHtml = standings
    .map((s, i) => {
      const isChampion = finalSlot && finalSlot.match_winner_team_id === s.team_id;
      const isFinalist =
        !isChampion && finalSlot && (s.team_id === finalSlot.team_a_id || s.team_id === finalSlot.team_b_id);
      const badge = isChampion ? ' 🏆' : isFinalist ? ' 🎖️' : '';
      return `<tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(s.team_name)}${badge}</td>
        <td>${s.wins}-${s.losses}</td>
        <td class="muted">${s.points_for}/${s.points_against}</td>
      </tr>`;
    })
    .join('');

  const finalStatusText =
    finalSlot?.status === 'completed'
      ? `Winner: ${escapeHtml(finalSlot.match_winner_team_id === finalSlot.team_a_id ? finalSlot.team_a_name : finalSlot.team_b_name)}`
      : finalSlot?.status === 'in_progress'
        ? 'In progress'
        : 'Not started yet';

  const finalHtml = finalSlot
    ? h`
      <div class="card" style="margin-top:12px">
        <div style="font-weight:700;margin-bottom:4px">🏆 Final</div>
        <div>${escapeHtml(finalSlot.team_a_name)} vs ${escapeHtml(finalSlot.team_b_name)}</div>
        <div class="muted small" style="margin-top:4px">${finalStatusText}</div>
      </div>`
    : session.has_final
      ? `<p class="muted small" style="margin-top:12px">The Final will appear here once every round is finished.</p>`
      : '';

  container.innerHTML = h`
    <h2 style="font-size:17px;margin-bottom:4px">${escapeHtml(session.name)}</h2>
    <div class="card">
      <table class="stats-table">
        <tr><th>#</th><th>Team</th><th>W-L</th><th>Pts</th></tr>
        ${rowsHtml || '<tr><td colspan="4" class="muted">No matches played yet.</td></tr>'}
      </table>
    </div>
    ${finalHtml}
  `;
}

// ---------- History ----------

async function loadHistory() {
  const { weeks, stats } = await api('/history');
  renderHistory(weeks, stats);
}

function renderHistory(weeks, stats) {
  const container = document.getElementById('history-content');
  const statsHtml =
    stats.length === 0
      ? `<p class="muted">No completed matches yet.</p>`
      : `<div class="card"><table class="stats-table">
          <tr><th>Player</th><th>W-L</th><th>Pts</th></tr>
          ${stats.map((s) => `<tr><td>${escapeHtml(s.playerName)}</td><td>${s.wins}-${s.losses}</td><td class="muted">${s.pointsFor}/${s.pointsAgainst}</td></tr>`).join('')}
        </table></div>`;

  const weeksHtml =
    weeks.length === 0
      ? `<p class="muted">Play and finish a match to see it here.</p>`
      : weeks
          .map(
            (w) => h`
      <div class="round-label">${w.weekLabel}</div>
      <div class="stack">
        ${w.matches
          .map(
            (m) => h`
          <div class="card">
            <div>${escapeHtml(m.team_a_name)} <strong style="color:var(--primary)">${m.team_a_score}</strong> — <strong style="color:var(--primary)">${m.team_b_score}</strong> ${escapeHtml(m.team_b_name)}</div>
            <div class="muted small" style="margin-top:4px">Winner: ${m.winner_team_id === m.team_a_id ? escapeHtml(m.team_a_name) : escapeHtml(m.team_b_name)}</div>
          </div>`,
          )
          .join('')}
      </div>`,
          )
          .join('');

  container.innerHTML = `
    <h2 style="font-size:17px;margin-bottom:10px">Player standings</h2>
    ${statsHtml}
    <h2 style="font-size:17px;margin:18px 0 4px">Weekly history</h2>
    ${weeksHtml}
  `;
}

// ---------- Settings ----------

function initSettingsView() {
  document.querySelectorAll('#theme-segmented .segment').forEach((btn) => {
    btn.addEventListener('click', () => setThemePreference(btn.dataset.theme));
  });

  const defaults = getSessionDefaults();
  const courtsInput = document.getElementById('default-courts');
  const roundsInput = document.getElementById('default-rounds');
  const minutesInput = document.getElementById('default-minutes');
  const minutesField = document.getElementById('default-minutes-field');
  courtsInput.value = defaults.courtCount;
  roundsInput.value = defaults.rounds;
  minutesInput.value = defaults.slotMinutes;

  function paintRule() {
    document.querySelectorAll('#default-rule-segmented .segment').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.rule === getSessionDefaults().scoringRule);
    });
  }
  paintRule();

  function paintTiming() {
    const useTimeSlots = getSessionDefaults().useTimeSlots;
    document.querySelectorAll('#default-timing-segmented .segment').forEach((btn) => {
      btn.classList.toggle('active', (btn.dataset.timing === 'timed') === useTimeSlots);
    });
    minutesField.hidden = !useTimeSlots;
  }
  paintTiming();

  function paintFinal() {
    const hasFinal = getSessionDefaults().hasFinal;
    document.querySelectorAll('#default-final-segmented .segment').forEach((btn) => {
      btn.classList.toggle('active', (btn.dataset.final === 'yes') === hasFinal);
    });
  }
  paintFinal();

  courtsInput.addEventListener('change', () => {
    setSessionDefaults({ ...getSessionDefaults(), courtCount: Math.max(1, Number(courtsInput.value) || 1) });
  });
  roundsInput.addEventListener('change', () => {
    setSessionDefaults({ ...getSessionDefaults(), rounds: Math.max(1, Number(roundsInput.value) || 1) });
  });
  minutesInput.addEventListener('change', () => {
    setSessionDefaults({ ...getSessionDefaults(), slotMinutes: Math.max(5, Number(minutesInput.value) || 5) });
  });
  document.querySelectorAll('#default-rule-segmented .segment').forEach((btn) => {
    btn.addEventListener('click', () => {
      setSessionDefaults({ ...getSessionDefaults(), scoringRule: btn.dataset.rule });
      paintRule();
    });
  });
  document.querySelectorAll('#default-timing-segmented .segment').forEach((btn) => {
    btn.addEventListener('click', () => {
      setSessionDefaults({ ...getSessionDefaults(), useTimeSlots: btn.dataset.timing === 'timed' });
      paintTiming();
    });
  });
  document.querySelectorAll('#default-final-segmented .segment').forEach((btn) => {
    btn.addEventListener('click', () => {
      setSessionDefaults({ ...getSessionDefaults(), hasFinal: btn.dataset.final === 'yes' });
      paintFinal();
    });
  });
}

// ---------- Modal shell ----------

function showModal(renderContent, onClose) {
  const overlayRoot = document.getElementById('modal-root');
  overlayRoot.innerHTML = '';
  overlayRoot.hidden = false;

  const sheet = document.createElement('div');
  sheet.className = 'modal-sheet';
  sheet.innerHTML = `<div class="modal-handle"></div><div class="modal-close-row"><button class="icon-btn" id="modal-close-btn">✕</button></div>`;
  const content = renderContent();
  sheet.appendChild(content);
  overlayRoot.appendChild(sheet);

  overlayRoot._onClose = onClose;
  sheet.querySelector('#modal-close-btn').addEventListener('click', closeModal);
  overlayRoot.addEventListener('click', (e) => {
    if (e.target === overlayRoot) closeModal();
  });
}

function closeModal() {
  const overlayRoot = document.getElementById('modal-root');
  if (overlayRoot._onClose) overlayRoot._onClose();
  overlayRoot.hidden = true;
  overlayRoot.innerHTML = '';
}

// ---------- Boot ----------

renderAccentSwatches();
applyTheme(getThemePreference());
initSettingsView();
loadTeams();
loadSchedule();
