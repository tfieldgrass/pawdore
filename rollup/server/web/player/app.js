/* Roll-Up player app: register -> check in at the club -> join the queue. */

const state = {
  token: localStorage.getItem('rollup.token'),
  me: null,
  club: null,
  queues: [],
};

const $app = document.getElementById('app');

async function refreshMe() {
  if (!state.token) return;
  try {
    state.me = await api('/api/me', { token: state.token });
  } catch (err) {
    if (err.error === 'unauthorized') {
      localStorage.removeItem('rollup.token');
      state.token = null;
      state.me = null;
    }
  }
}

async function boot() {
  state.club = await api('/api/club');
  document.getElementById('club-name').textContent = state.club.name;
  await refreshMe();
  render();
  liveQueues((queues) => {
    state.queues = queues;
    refreshMe().then(render);
  });
}

function render() {
  $app.replaceChildren();
  if (!state.token || !state.me) return renderRegister();
  if (!state.me.player.checkedInAt) return renderCheckIn();
  if (!state.me.group && !state.me.inDraw) return renderJoinOptions();
  renderQueueStatus();
}

/* ---- screens ---- */

function renderRegister() {
  const err = el('div', { class: 'error' });
  const name = el('input', { placeholder: 'e.g. Tom Fieldgrass', autocomplete: 'name' });
  const go = async () => {
    try {
      const { token } = await api('/api/players', {
        method: 'POST',
        body: { name: name.value.trim() },
      });
      state.token = token;
      localStorage.setItem('rollup.token', token);
      await refreshMe();
      render();
    } catch (e) { err.textContent = e.message; }
  };
  submitOnEnter(go, name);
  $app.append(
    el('div', { class: 'card' }, [
      el('h2', {}, 'Welcome'),
      el('p', { class: 'muted' }, 'Your name as the starter and the board should show it.'),
      el('label', {}, 'Your name'),
      name,
      el('button', { onclick: go }, 'Continue'),
      err,
    ]),
  );
}

function renderCheckIn() {
  const err = el('div', { class: 'error' });
  const code = el('input', {
    placeholder: 'Code from the pro-shop poster',
    style: 'text-transform:uppercase',
    autocapitalize: 'characters',
  });
  const withCode = async () => {
    try {
      await api('/api/checkin', {
        method: 'POST',
        token: state.token,
        body: { method: 'code', code: code.value.trim() },
      });
      await refreshMe();
      render();
    } catch (e) { err.textContent = e.message; }
  };
  submitOnEnter(withCode, code);
  $app.append(
    el('div', { class: 'card' }, [
      el('h2', {}, `Check in, ${state.me.player.name}`),
      el('p', { class: 'muted' },
        'You need to be at the club to join the roll-up. Use your location, or scan the QR poster in the pro shop and enter the code.'),
      el('button', {
        onclick: () => {
          err.textContent = '';
          navigator.geolocation.getCurrentPosition(
            async (pos) => {
              try {
                await api('/api/checkin', {
                  method: 'POST',
                  token: state.token,
                  body: { method: 'geo', lat: pos.coords.latitude, lng: pos.coords.longitude },
                });
                await refreshMe();
                render();
              } catch (e) { err.textContent = e.message; }
            },
            () => { err.textContent = 'Location unavailable — use the poster code instead.'; },
            { enableHighAccuracy: true, timeout: 10000 },
          );
        },
      }, '📍 Check in with my location'),
      el('label', {}, 'Or enter the check-in code'),
      code,
      el('button', { class: 'secondary', onclick: withCode }, 'Check in with code'),
      err,
    ]),
  );
}

function renderJoinOptions() {
  const err = el('div', { class: 'error' });
  const sessions = state.club.sessions.filter((s) => s.status !== 'closed');
  if (sessions.length === 0) {
    $app.append(el('div', { class: 'card' }, [
      el('h2', {}, 'No roll-up running'),
      el('p', { class: 'muted' }, 'The clubhouse has not opened a roll-up session yet. Hold tight.'),
    ]));
    return;
  }

  const sessionSel = el('select', {},
    sessions.map((s) => el('option', { value: s.id },
      `${courseName(s.courseId)}${s.mode === 'draw' ? ' (random draw)' : ''}`)));

  const drawMode = () => sessions.find((s) => s.id === sessionSel.value)?.mode === 'draw';

  const size = el('select', {}, [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
    el('option', { value: n }, n === 1 ? 'Just me' : `${n} players`)));
  const open = el('input', { type: 'checkbox', id: 'open', style: 'width:auto' });
  const joinCode = el('input', { placeholder: 'e.g. K7PD', style: 'text-transform:uppercase' });

  const groupCard = el('div', { class: 'card' }, [
    el('h2', {}, 'Join the roll-up'),
    el('label', {}, 'Course'),
    sessionSel,
    el('label', {}, 'How many in your group (including you)?'),
    size,
    el('label', { for: 'open' }, 'Happy for others to join us up?'),
    open,
    el('button', {
      onclick: async () => {
        try {
          if (drawMode()) {
            await api('/api/draw/join', {
              method: 'POST', token: state.token, body: { sessionId: sessionSel.value },
            });
          } else {
            await api('/api/groups', {
              method: 'POST',
              token: state.token,
              body: {
                sessionId: sessionSel.value,
                expectedSize: Number(size.value),
                openToJoiners: open.checked,
              },
            });
          }
          await refreshMe();
          render();
        } catch (e) { err.textContent = e.message; }
      },
    }, 'Join'),
    el('label', {}, 'Or join a friend’s group with their code'),
    joinCode,
    el('button', { class: 'secondary', onclick: joinByCode }, 'Join group'),
    err,
  ]);
  async function joinByCode() {
    try {
      await api('/api/groups/join', {
        method: 'POST', token: state.token, body: { joinCode: joinCode.value.trim() },
      });
      await refreshMe();
      render();
    } catch (e) { err.textContent = e.message; }
  }
  submitOnEnter(joinByCode, joinCode);
  $app.append(groupCard);
}

function renderQueueStatus() {
  const me = state.me;

  if (me.inDraw) {
    $app.append(el('div', { class: 'card' }, [
      el('h2', {}, `In the draw — ${me.courseName}`),
      el('p', { class: 'muted' }, 'You’re in. Groups will be drawn at the cut-off — watch the board.'),
    ]));
    return;
  }

  const group = me.group;
  const slots = me.slots ?? [];
  const called = slots.find((s) => s.status === 'called');

  if (called) {
    notifyOnce(`called-${called.slotId}`, 'You’re called to the tee!');
    $app.append(el('div', { class: 'status-called' },
      `🏌️ You're called — head to the 1st tee`));
    $app.append(el('div', { class: 'card' }, [
      el('p', { class: 'muted' }, 'When everyone has hit, confirm so the next group can be called.'),
      el('button', {
        onclick: () => confirmTeeOff(called.slotId),
      }, 'We’re off — confirm tee-off'),
      el('div', { class: 'error', id: 'tee-err' }),
    ]));
  }

  if (group.status === 'forming') {
    $app.append(el('div', { class: 'card' }, [
      el('h2', {}, 'Waiting for your group'),
      el('p', {}, [
        `${group.memberIds.length} of ${group.expectedSize} checked in. Share code `,
        el('strong', { style: 'font-size:1.3em;letter-spacing:0.15em' }, group.joinCode),
        ' with the others — your place is set when the last one arrives.',
      ]),
      el('button', {
        class: 'secondary',
        onclick: async () => {
          await api(`/api/groups/${group.id}/go`, { method: 'POST', token: state.token });
          await refreshMe();
          render();
        },
      }, 'Go with who’s here'),
    ]));
  } else if (!called && slots.length > 0) {
    const first = slots[0];
    $app.append(el('div', { class: 'card' }, [
      el('h2', {}, `${me.courseName} — position ${first.position}`),
      el('p', { style: 'font-size:1.5em;margin:4px 0' },
        `Estimated tee time: ${fmtTime(first.estimatedTeeAt)}`),
      slots.length > 1
        ? el('p', { class: 'muted' },
            `Your group has ${slots.length} consecutive slots: ` +
            slots.map((s) => `${fmtTime(s.estimatedTeeAt)} (${s.playerNames.join(', ')})`).join(' · '))
        : el('p', { class: 'muted' }, `Playing: ${first.playerNames.join(', ')}`),
      group.openToJoiners
        ? el('p', { class: 'muted' }, `Open to joiners — code ${group.joinCode}`)
        : '',
    ]));
  }

  $app.append(el('div', { class: 'card' }, [
    el('button', {
      class: 'danger',
      onclick: async () => {
        if (!confirm('Leave the roll-up?')) return;
        await api(`/api/groups/${group.id}/withdraw`, { method: 'POST', token: state.token });
        await refreshMe();
        render();
      },
    }, 'Withdraw from the roll-up'),
  ]));
}

async function confirmTeeOff(slotId) {
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        await api(`/api/slots/${slotId}/tee-off`, {
          method: 'POST',
          token: state.token,
          body: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        });
        await refreshMe();
        render();
      } catch (e) {
        const errEl = document.getElementById('tee-err');
        if (errEl) errEl.textContent = e.message;
      }
    },
    () => {
      const errEl = document.getElementById('tee-err');
      if (errEl) errEl.textContent = 'Location unavailable — ask the pro shop to confirm.';
    },
    { enableHighAccuracy: true, timeout: 10000 },
  );
}

const notified = new Set();
function notifyOnce(key, text) {
  if (notified.has(key)) return;
  notified.add(key);
  if ('Notification' in window) {
    if (Notification.permission === 'granted') new Notification('Roll-Up', { body: text });
    else if (Notification.permission !== 'denied') Notification.requestPermission();
  }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

function courseName(courseId) {
  return state.club.courses.find((c) => c.id === courseId)?.name ?? courseId;
}

boot();
