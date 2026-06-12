/* Shared helpers for the Roll-Up web apps. */

function api(path, { method = 'GET', body, token, adminKey } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (adminKey) headers['x-admin-key'] = adminKey;
  return fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.message || 'Request failed'), data);
    return data;
  });
}

/* Live queue feed with auto-reconnect. onQueues receives QueueView[]. */
function liveQueues(onQueues) {
  let ws;
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'queues') onQueues(msg.queues);
    };
    ws.onclose = () => setTimeout(connect, 2000);
  }
  connect();
  // Belt and braces: poll as well, in case the socket silently dies.
  setInterval(() => api('/api/queues').then(onQueues).catch(() => {}), 30000);
}

function fmtTime(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/* Pressing Enter in any of the inputs triggers the action. */
function submitOnEnter(action, ...inputs) {
  for (const input of inputs) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); action(); }
    });
  }
}
