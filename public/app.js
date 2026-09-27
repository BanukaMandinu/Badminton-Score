// Badminton Score — client. Vanilla JS, no build step. All game/schedule
// logic lives server-side (functions/api); this file only renders state
// and calls the API.

const RULE_LABEL = {
  bwf21: 'BWF 21 (win by 2, cap 30)',
  classic15: 'Classic 15 (setting at 14-all)',
};

// ---------- API ----------

async function api(path, options) {
  const res = await fetch(`/api${path}`, {
    method: options?.method || 'GET',
    headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// ---------- Theme ----------

const THEME_KEY = 'badminton.theme';
const DEFAULTS_KEY = 'badminton.sessionDefaults';

function applyTheme(pref) {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  document.getElementById('theme-icon-dark').hidden = pref === 'dark';
  document.getElementById('theme-icon-light').hidden = pref !== 'dark';
  document.querySelectorAll('#theme-segmented .segment').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.theme === pref);
  });
}

function getThemePreference() {
  return localStorage.getItem(THEME_KEY) || 'system';
}

function setThemePreference(pref) {
  localStorage.setItem(THEME_KEY, pref);
  applyTheme(pref);
}

function getSessionDefaults() {
  try {
    return {
      courtCount: 1,
      slotMinutes: 15,
      useTimeSlots: true,
      scoringRule: 'bwf21',
      ...JSON.parse(localStorage.getItem(DEFAULTS_KEY) || '{}'),
    };
  } catch {
    return { courtCount: 1, slotMinutes: 15, useTimeSlots: true, scoringRule: 'bwf21' };
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

const views = ['teams', 'schedule', 'history', 'settings'];

function showTab(name) {
  views.forEach((v) => {
    document.getElementById(`view-${v}`).hidden = v !== name;
  });
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  if (name === 'schedule') loadSchedule();
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
      if (!confirm('Delete this team?')) return;
      await api(`/teams/${btn.dataset.deleteTeam}`, { method: 'DELETE' });
      await loadTeams();
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
        alert('Team name is required.');
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

// ---------- Schedule ----------

let scheduleState = { session: null, slots: [] };

async function loadSchedule() {
  const data = await api('/sessions/latest');
  scheduleState = data;
  renderSchedule();
}

function renderSchedule() {
  const container = document.getElementById('schedule-content');
  const { session, slots } = scheduleState;

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

  const byRound = new Map();
  for (const slot of slots) {
    if (!byRound.has(slot.round_number)) byRound.set(slot.round_number, []);
    byRound.get(slot.round_number).push(slot);
  }

  const roundsHtml = Array.from(byRound.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([round, roundSlots]) => {
      const extLabel = roundSlots[0].is_extension ? ` · Extension ${roundSlots[0].extension_number}` : '';
      const slotsHtml = roundSlots
        .map(
          (slot) => h`
        <div class="card slot-card" data-slot-id="${slot.id}">
          <div>
            <div class="slot-teams">${escapeHtml(slot.team_a_name)} vs ${escapeHtml(slot.team_b_name)}</div>
            <div class="slot-meta">Court ${slot.court_number}${session.use_time_slots ? ` · ${formatOffset(session.created_at, slot.start_offset_minutes)}` : ''}</div>
          </div>
          ${statusBadge(slot.status)}
        </div>`,
        )
        .join('');
      return `<div class="round-label">Round ${round}${extLabel}</div>${slotsHtml}`;
    })
    .join('');

  const metaParts = [`${session.court_count} court${session.court_count > 1 ? 's' : ''}`];
  if (session.use_time_slots) metaParts.push(`${session.slot_minutes} min/match`);
  else metaParts.push('play until finish');
  metaParts.push(RULE_LABEL[session.scoring_rule]);

  container.innerHTML = h`
    <div style="margin-bottom:8px">
      <h1 style="margin-bottom:2px">${escapeHtml(session.name)}</h1>
      <p class="muted small">${metaParts.join(' · ')}</p>
    </div>
    <div class="stack">${roundsHtml}</div>
    <div class="stack" style="margin-top:16px">
      <button class="btn btn-secondary btn-block" id="extend-btn">Extend schedule</button>
      <button class="btn btn-secondary btn-block" id="new-session-btn">+ New session</button>
    </div>
  `;

  container.querySelectorAll('[data-slot-id]').forEach((card) => {
    card.addEventListener('click', () => openMatchModal(Number(card.dataset.slotId)));
  });
  container.querySelector('#extend-btn').addEventListener('click', async (e) => {
    e.target.disabled = true;
    await api(`/sessions/${session.id}/extend`, { method: 'POST' });
    await loadSchedule();
  });
  container.querySelector('#new-session-btn').addEventListener('click', openNewSessionForm);
}

function statusBadge(status) {
  const config = {
    pending: { label: 'Pending', color: 'var(--subtext)' },
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
        <label class="field"><span>Courts</span><input type="number" min="1" id="session-courts-input" value="${defaults.courtCount}" /></label>
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
        alert('Pick at least 2 teams to build a schedule.');
        return;
      }
      e.target.disabled = true;
      const courtCount = Math.max(1, Number(root.querySelector('#session-courts-input').value) || 1);
      const slotMinutes = Math.max(5, Number(root.querySelector('#session-minutes-input').value) || 5);
      const name = root.querySelector('#session-name-input').value.trim() || 'Session';
      await api('/sessions', {
        method: 'POST',
        body: {
          name,
          sessionDate: new Date().toISOString().slice(0, 10),
          courtCount,
          slotMinutes,
          useTimeSlots,
          scoringRule,
          teamIds: Array.from(selected),
        },
      });
      setSessionDefaults({ courtCount, slotMinutes, useTimeSlots, scoringRule });
      closeModal();
      await loadSchedule();
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
      if (root) paintMatch(root, fresh.match);
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

  root.querySelectorAll('.round-btn[data-side]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const res = await api(`/matches/${match.id}/score`, {
        method: 'POST',
        body: { side: btn.dataset.side, delta: Number(btn.dataset.delta) },
      });
      paintMatch(root, res.match);
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
  const minutesInput = document.getElementById('default-minutes');
  const minutesField = document.getElementById('default-minutes-field');
  courtsInput.value = defaults.courtCount;
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

  courtsInput.addEventListener('change', () => {
    setSessionDefaults({ ...getSessionDefaults(), courtCount: Math.max(1, Number(courtsInput.value) || 1) });
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

applyTheme(getThemePreference());
initSettingsView();
loadTeams();
