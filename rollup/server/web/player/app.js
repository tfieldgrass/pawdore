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
  sessionSel.addEventListener('change', () => loadJoinable());

  const drawMode = () => sessions.find((s) => s.id === sessionSel.value)?.mode === 'draw';

  const invitees = el('input', {
    placeholder: 'e.g. Dave Smith, Bill Jones — blank if alone',
  });
  const open = el('input', { type: 'checkbox', id: 'open', checked: '', style: 'width:auto' });

  const create = async () => {
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
            inviteeNames: invitees.value.split(',').map((n) => n.trim()).filter(Boolean),
            openToJoiners: open.checked,
          },
        });
      }
      await refreshMe();
      render();
    } catch (e) { err.textContent = e.message; }
  };
  submitOnEnter(create, invitees);

  $app.append(el('div', { class: 'card' }, [
    el('h2', {}, 'Start your group'),
    el('label', {}, 'Course'),
    sessionSel,
    el('label', {}, 'Who are you playing with? (they check in when they arrive)'),
    invitees,
    el('label', { for: 'open' }, 'Happy for others to join your spare slots?'),
    open,
    el('button', { onclick: create }, 'Join the roll-up'),
    err,
  ]));

  // Groups you could join: friends expecting you, and groups with open slots.
  const joinableCard = el('div', { class: 'card' }, [el('h2', {}, 'Join a group')]);
  const joinableBody = el('div', {}, el('p', { class: 'muted' }, 'Loading…'));
  const joinCode = el('input', { placeholder: 'e.g. K7PD', style: 'text-transform:uppercase' });
  const joinByCode = async () => {
    try {
      await api('/api/groups/join', {
        method: 'POST', token: state.token, body: { joinCode: joinCode.value.trim() },
      });
      await refreshMe();
      render();
    } catch (e) { err.textContent = e.message; }
  };
  submitOnEnter(joinByCode, joinCode);
  joinableCard.append(
    joinableBody,
    el('label', {}, 'Or use a code a friend shared'),
    joinCode,
    el('button', { class: 'secondary', onclick: joinByCode }, 'Join with code'),
  );
  $app.append(joinableCard);

  async function loadJoinable() {
    if (drawMode()) {
      joinableBody.replaceChildren(
        el('p', { class: 'muted' }, 'Random draw — groups are drawn at the cut-off.'));
      return;
    }
    try {
      const { forming, queued } = await api(
        `/api/sessions/${sessionSel.value}/joinable`, { token: state.token });
      joinableBody.replaceChildren();
      const joinOpen = (groupId) => async () => {
        try {
          await api(`/api/groups/${groupId}/join-open`, { method: 'POST', token: state.token });
          await refreshMe();
          render();
        } catch (e) { err.textContent = e.message; }
      };
      for (const f of forming) {
        joinableBody.append(el('div', { class: 'joinable-row' }, [
          el('div', {}, [
            f.expectingYou ? el('strong', {}, '⭐ They’re expecting you! ') : '',
            el('span', {}, `${f.groupName} — here: ${f.hereNames.join(', ')}`),
            f.waitingForNames.length
              ? el('span', { class: 'muted' }, ` · waiting for ${f.waitingForNames.join(', ')}`)
              : '',
            f.openSpots > 0 ? el('span', { class: 'muted' }, ` · ${f.openSpots} open spot${f.openSpots > 1 ? 's' : ''}`) : '',
          ]),
          el('button', { class: 'small', onclick: joinOpen(f.groupId) }, 'Join'),
        ]));
      }
      for (const q of queued) {
        joinableBody.append(el('div', { class: 'joinable-row' }, [
          el('div', {}, [
            el('span', {}, `#${q.position} on the list — ${q.playerNames.join(', ')}`),
            el('span', { class: 'muted' }, ` · ${q.openSpots} open spot${q.openSpots > 1 ? 's' : ''}`),
          ]),
          el('button', { class: 'small', onclick: joinOpen(q.groupId) }, 'Join'),
        ]));
      }
      if (forming.length === 0 && queued.length === 0) {
        joinableBody.append(el('p', { class: 'muted' }, 'No open groups right now.'));
      }
    } catch {
      joinableBody.replaceChildren();
    }
  }
  loadJoinable();
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
    const waitingFor = group.invitees.filter((i) => !i.claimedBy).map((i) => i.name);
    const isCreator = state.me.player.id === group.creatorId;
    $app.append(el('div', { class: 'card' }, [
      el('h2', {}, 'Waiting for your group'),
      el('p', {}, [
        waitingFor.length
          ? `Still to arrive: ${waitingFor.join(', ')}. `
          : `${group.memberIds.length} checked in. `,
        'Your place on the list is set the moment the last one checks in. Share code ',
        el('strong', { style: 'font-size:1.3em;letter-spacing:0.15em' }, group.joinCode),
        ' in case anyone has trouble.',
      ]),
      isCreator
        ? el('button', {
            class: 'secondary',
            onclick: async () => {
              await api(`/api/groups/${group.id}/go`, { method: 'POST', token: state.token });
              await refreshMe();
              render();
            },
          }, 'Go with who’s here')
        : '',
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
