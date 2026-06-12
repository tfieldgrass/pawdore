/* Roll-Up clubhouse admin: sessions, queue control, kiosk check-in. */

const state = {
  key: localStorage.getItem('rollup.adminKey'),
  data: null,
};

const $app = document.getElementById('app');

async function refresh() {
  try {
    state.data = await api('/api/admin/state', { adminKey: state.key });
    document.getElementById('club-name').textContent = state.data.club.name;
  } catch (err) {
    if (err.error === 'unauthorized') {
      localStorage.removeItem('rollup.adminKey');
      state.key = null;
      state.data = null;
    }
  }
  render();
}

function act(path, { method = 'POST', body } = {}) {
  return api(path, { method, body, adminKey: state.key })
    .then(refresh)
    .catch((e) => { alert(e.message); refresh(); });
}

function render() {
  $app.replaceChildren();
  if (!state.key || !state.data) return renderLogin();
  renderSessions();
  renderOpenSession();
  renderKiosk();
  renderEvents();
}

function renderLogin() {
  const key = el('input', { type: 'password', placeholder: 'Admin key' });
  const signIn = () => {
    state.key = key.value.trim();
    localStorage.setItem('rollup.adminKey', state.key);
    refresh();
  };
  submitOnEnter(signIn, key);
  $app.append(el('div', { class: 'card', style: 'max-width:420px' }, [
    el('h2', {}, 'Clubhouse sign-in'),
    el('p', { class: 'muted' }, 'Wrong key? The field clears and stays on this screen.'),
    key,
    el('button', { onclick: signIn }, 'Sign in'),
  ]));
}

function renderSessions() {
  const { sessions, queues } = state.data;
  if (sessions.length === 0) {
    $app.append(el('div', { class: 'card' }, [
      el('h2', {}, 'No session running'),
      el('p', { class: 'muted' }, 'Open a roll-up session below to start the queue.'),
    ]));
    return;
  }

  for (const session of sessions) {
    const q = queues.find((x) => x.sessionId === session.id);
    const card = el('div', { class: 'card' });
    card.append(el('h2', {}, [
      `${q.courseName} — ${session.settings.mode === 'draw' ? 'random draw' : 'arrival order'} `,
      el('span', { class: `badge ${session.status === 'paused' ? 'paused' : 'queued'}` }, session.status),
    ]));
    card.append(el('p', { class: 'muted' },
      `Interval ${session.settings.teeIntervalMin} min · max ${session.settings.maxGroupSize}-ball · grace ${session.settings.graceMin} min` +
      (session.settings.mode === 'draw' ? ` · ${session.drawPool.length} in the draw` : '')));

    const controls = el('div', {});
    controls.append(el('button', { class: 'small', onclick: () => act(`/api/admin/sessions/${session.id}/call-next`) }, '🔔 Call next'));
    if (session.settings.mode === 'draw') {
      controls.append(el('button', { class: 'small', onclick: () => act(`/api/admin/sessions/${session.id}/draw`) }, '🎲 Run draw'));
    }
    controls.append(el('button', {
      class: 'small secondary',
      onclick: () => act(`/api/admin/sessions/${session.id}`, { method: 'PATCH', body: { status: session.status === 'paused' ? 'open' : 'paused' } }),
    }, session.status === 'paused' ? '▶ Resume' : '⏸ Pause (frost)'));
    controls.append(el('button', {
      class: 'small danger',
      onclick: () => { if (confirm('Close this session?')) act(`/api/admin/sessions/${session.id}`, { method: 'PATCH', body: { status: 'closed' } }); },
    }, 'Close session'));
    card.append(controls);

    const table = el('table', {}, [
      el('tr', {}, [el('th', {}, '#'), el('th', {}, 'Players'), el('th', {}, 'Est tee'), el('th', {}, 'Status'), el('th', {}, 'Actions')]),
    ]);
    for (const e of q.entries) {
      const actions = el('td', {});
      actions.append(el('button', { class: 'small', onclick: () => act(`/api/admin/slots/${e.slotId}/tee-off`) }, 'Teed off'));
      if (e.status === 'called') {
        actions.append(el('button', { class: 'small secondary', onclick: () => act(`/api/admin/slots/${e.slotId}/no-show`, { body: { action: 'demote', force: true } }) }, 'No-show ↓'));
        actions.append(el('button', { class: 'small danger', onclick: () => act(`/api/admin/slots/${e.slotId}/no-show`, { body: { action: 'remove', force: true } }) }, 'No-show ✕'));
      } else {
        actions.append(el('button', { class: 'small secondary', onclick: () => act(`/api/admin/slots/${e.slotId}/move`, { body: { sessionId: session.id, index: e.position - 2 } }) }, '↑'));
        actions.append(el('button', { class: 'small secondary', onclick: () => act(`/api/admin/slots/${e.slotId}/move`, { body: { sessionId: session.id, index: e.position } }) }, '↓'));
        actions.append(el('button', { class: 'small danger', onclick: () => { if (confirm('Remove from the list?')) act(`/api/admin/slots/${e.slotId}`, { method: 'DELETE' }); } }, '✕'));
      }
      table.append(el('tr', {}, [
        el('td', {}, String(e.position)),
        el('td', {}, e.playerNames.join(', ') + (e.waveCount > 1 ? ` — ${e.groupName} (${e.wave + 1}/${e.waveCount})` : '')),
        el('td', {}, fmtTime(e.estimatedTeeAt)),
        el('td', {}, el('span', { class: `badge ${e.status}` }, e.status)),
        actions,
      ]));
    }
    if (q.entries.length === 0) {
      table.append(el('tr', {}, el('td', { colspan: 5, class: 'muted' }, 'Queue is empty')));
    }
    card.append(table);

    if (q.forming && q.forming.length > 0) {
      card.append(el('h2', { style: 'margin-top:14px' }, 'Waiting for players'));
      const ftable = el('table', {});
      for (const f of q.forming) {
        ftable.append(el('tr', {}, [
          el('td', {}, f.hereNames.join(', ')),
          el('td', { class: 'muted' },
            f.waitingForNames.length ? `waiting for ${f.waitingForNames.join(', ')}` : 'ready'),
          el('td', { class: 'muted' }, f.openSpots > 0 ? `${f.openSpots} open` : ''),
        ]));
      }
      card.append(ftable);
    }

    // Merge two queued groups (e.g. two 2-balls) into one slot.
    const mergeable = q.entries.filter((e) => e.status === 'queued' && e.waveCount === 1);
    if (mergeable.length >= 2) {
      const optionFor = (e) => el('option', { value: e.groupId },
        `#${e.position} ${e.playerNames.join(', ')}`);
      const selA = el('select', {}, mergeable.map(optionFor));
      const selB = el('select', {}, mergeable.map(optionFor));
      if (selB.options.length > 1) selB.selectedIndex = 1;
      card.append(el('h2', { style: 'margin-top:14px' }, 'Merge groups'));
      card.append(el('div', { class: 'row' }, [
        el('div', {}, [el('label', {}, 'Group A'), selA]),
        el('div', {}, [el('label', {}, 'Group B'), selB]),
        el('div', {}, el('button', {
          onclick: () => act('/api/admin/groups/merge', {
            body: { groupIdA: selA.value, groupIdB: selB.value },
          }),
        }, 'Merge')),
      ]));
    }
    $app.append(card);
  }
}

function renderOpenSession() {
  const { club, sessions } = state.data;
  const available = club.courses.filter(
    (c) => !sessions.some((s) => s.settings.courseId === c.id),
  );
  if (available.length === 0) return;

  const course = el('select', {}, available.map((c) => el('option', { value: c.id }, c.name)));
  const mode = el('select', {}, [
    el('option', { value: 'arrival' }, 'Arrival order'),
    el('option', { value: 'draw' }, 'Random draw (swindle)'),
  ]);
  const interval = el('input', { type: 'number', value: '9', min: '5', max: '20' });
  const maxSize = el('select', {}, [4, 3, 2].map((n) => el('option', { value: n }, `${n}-balls`)));
  const grace = el('input', { type: 'number', value: '5', min: '0', max: '30' });

  $app.append(el('div', { class: 'card' }, [
    el('h2', {}, 'Open a roll-up session'),
    el('div', { class: 'row' }, [
      el('div', {}, [el('label', {}, 'Course'), course]),
      el('div', {}, [el('label', {}, 'Mode'), mode]),
    ]),
    el('div', { class: 'row' }, [
      el('div', {}, [el('label', {}, 'Tee interval (min)'), interval]),
      el('div', {}, [el('label', {}, 'Max group size'), maxSize]),
      el('div', {}, [el('label', {}, 'No-show grace (min)'), grace]),
    ]),
    el('button', {
      onclick: () => act('/api/admin/sessions', {
        body: {
          courseId: course.value,
          mode: mode.value,
          teeIntervalMin: Number(interval.value),
          maxGroupSize: Number(maxSize.value),
          graceMin: Number(grace.value),
        },
      }),
    }, 'Open session'),
  ]));
}

function renderKiosk() {
  const { sessions } = state.data;
  if (sessions.length === 0) return;
  const name = el('input', { placeholder: 'Player name' });
  const sessionSel = el('select', {}, sessions.map((s) =>
    el('option', { value: s.id }, state.data.queues.find((q) => q.sessionId === s.id)?.courseName ?? s.id)));
  const open = el('input', { type: 'checkbox', style: 'width:auto' });

  $app.append(el('div', { class: 'card' }, [
    el('h2', {}, 'Kiosk — add a player without a phone'),
    el('div', { class: 'row' }, [
      el('div', {}, [el('label', {}, 'Name'), name]),
      el('div', {}, [el('label', {}, 'Course'), sessionSel]),
    ]),
    el('label', {}, 'Happy to be joined up?'),
    open,
    el('button', {
      onclick: () => act('/api/admin/players', {
        body: { name: name.value, sessionId: sessionSel.value, openToJoiners: open.checked },
      }).then(() => { name.value = ''; }),
    }, 'Check in & queue as single'),
  ]));
}

function renderEvents() {
  const rows = (state.data.events ?? []).slice().reverse().slice(0, 20);
  $app.append(el('div', { class: 'card' }, [
    el('h2', {}, 'Recent activity (audit log)'),
    el('table', {}, rows.map((e) => el('tr', {}, [
      el('td', { class: 'muted' }, new Date(e.at).toLocaleTimeString()),
      el('td', {}, e.type),
      el('td', { class: 'muted' }, JSON.stringify(e.detail)),
    ]))),
  ]));
}

refresh();
liveQueues(() => refresh());
