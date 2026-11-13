/* global document, window, fetch, FormData, URL */
const byId = (id) => document.getElementById(id);
const sections = [...document.querySelectorAll('main > section')];
function navigate() {
  const target =
    sections.find((s) => '#' + s.id === window.location.hash) || sections[0];
  sections.forEach((s) => (s.hidden = s !== target));
  document.querySelectorAll('nav a').forEach((a) => {
    if (a.hash === '#' + target.id) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}
window.addEventListener('hashchange', navigate);
navigate();

function element(tag, value, className) {
  const node = document.createElement(tag);
  if (value != null) node.textContent = value;
  if (className) node.className = className;
  return node;
}
async function api(path, body) {
  const options = body === undefined ? {} : { method: 'POST', body };
  if (body !== undefined && !(body instanceof FormData)) {
    options.body = JSON.stringify(body);
    options.headers = { 'Content-Type': 'application/json' };
  }
  const response = await fetch('/api/v1/' + path, options);
  const data = await response.json();
  if (!response.ok) {
    const detail = data.error?.message ?? data.error;
    const error = new Error(
      Array.isArray(detail)
        ? detail.join(' ')
        : typeof detail === 'string'
          ? detail
          : 'Service unavailable.',
    );
    error.status = response.status;
    throw error;
  }
  return data;
}
function status(id, message, failed = false) {
  const node = byId(id);
  node.textContent = message;
  node.classList.toggle('error', failed);
}
function bindForm(id, output, pending, run) {
  byId(id).addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button');
    if (button.disabled) return;
    button.disabled = true;
    status(output, pending);
    try {
      await run();
    } catch (error) {
      status(output, error.message, true);
    } finally {
      button.disabled = false;
    }
  });
}
let reports = [];
async function loadReports() {
  reports = await api('dashboard/reports');
  for (const id of ['scope', 'chatScope']) {
    const select = byId(id);
    const previous = select.value;
    select.replaceChildren();
    for (const report of [{ id: '', name: 'All reports' }, ...reports]) {
      const option = element('option', report.name);
      option.value = report.id;
      select.append(option);
    }
    select.value = reports.some((r) => r.id === previous) ? previous : '';
  }
  status('nr', reports.length);
  for (const [id, key] of [
    ['np', 'indexedPages'],
    ['nc', 'chunks'],
  ]) {
    status(id, reports.reduce((sum, r) => sum + r[key], 0).toLocaleString());
  }
  const list = byId('reports');
  list.replaceChildren();
  if (!reports.length)
    list.textContent = 'Your indexed reports will appear here.';
  for (const report of reports) {
    const row = element('div', null, 'row');
    row.append(
      element('strong', report.name),
      element(
        'div',
        report.indexedPages + ' indexed pages · ' + report.chunks + ' passages',
        'detail',
      ),
    );
    list.append(row);
  }
}
bindForm('upload', 'uploadStatus', 'Indexing PDF…', async () => {
  const file = byId('pdf').files[0];
  if (file.size > 20 * 1024 * 1024)
    throw new Error('Choose a PDF of 20 MB or less.');
  const result = await api('documents/ingest', new FormData(byId('upload')));
  status(
    'uploadStatus',
    file.name + ' processed. ' + result.chunkCount + ' passages indexed.',
  );
  byId('upload').reset();
  await loadReports().catch((error) => status('reports', error.message, true));
});
function showAnswer(target, response) {
  target.append(element('p', response.answer || 'Insufficient evidence.'));
  for (const citation of response.citations || []) {
    const row = element('div', null, 'row');
    const title =
      '[' +
      citation.id +
      '] ' +
      (citation.title || citation.filename || citation.documentId) +
      (citation.pageNumber ? ' · p. ' + citation.pageNumber : '');
    const url =
      citation.url && URL.canParse(citation.url) ? new URL(citation.url) : null;
    if (url && ['https:', 'http:'].includes(url.protocol)) {
      const link = element('a', title);
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      row.append(link);
    } else row.append(element('strong', title));
    row.append(element('blockquote', citation.quote));
    target.append(row);
  }
}
byId('mode').onchange = () => {
  const web = byId('mode').value === 'answers/web';
  byId('scope').disabled = web;
  byId('question').maxLength = web ? 400 : 4000;
};
bindForm('ask', 'result', 'Searching sources…', async () => {
  const mode = byId('mode').value;
  const body = { query: byId('question').value.trim() };
  if (mode !== 'answers/web' && byId('scope').value)
    body.documentId = byId('scope').value;
  const target = byId('result');
  let data;
  try {
    data = await api(mode, body);
    target.replaceChildren();
  } catch (error) {
    if (mode !== 'answers' || error.status !== 502) throw error;
    status(
      'result',
      'The model could not produce a verified answer. Looking up matching passages…',
    );
    data = await api('retrieval/search', body);
    target.replaceChildren(
      element(
        'p',
        'The model could not produce a verified answer. These are matching passages from the selected reports.',
      ),
    );
  }
  if (!data.results) return showAnswer(target, data);
  if (!data.results.length)
    target.append(element('p', 'No matching passages.'));
  for (const r of data.results) {
    target.append(
      element(
        'strong',
        (r.metadata?.sourceFilename || r.documentId) +
          (r.pageNumber ? ' · p. ' + r.pageNumber : '') +
          ' · similarity ' +
          r.score.toFixed(3),
      ),
      element('blockquote', r.content),
    );
  }
});
let chat = null;
let selection = 0;
async function loadChat(id) {
  const token = ++selection;
  chat = null;
  byId('reply').hidden = true;
  status('history', 'Loading conversation…');
  const turns = [];
  let data;
  do {
    data = await api(
      'conversations/' +
        encodeURIComponent(id) +
        '?after=' +
        (turns.at(-1)?.sequence || 0),
    );
    if (token !== selection) return;
    turns.push(...data.turns);
  } while (data.turns.length && turns.at(-1).sequence < data.version);
  chat = data;
  const target = byId('history');
  target.replaceChildren();
  const scope =
    reports.find((r) => r.id === data.documentId)?.name ||
    data.documentId ||
    'All reports';
  target.append(element('p', 'Scope · ' + scope, 'detail'));
  for (const turn of turns) {
    target.append(element('h3', turn.question));
    showAnswer(target, turn);
  }
  byId('reply').hidden = false;
  status('chatStatus', '');
}
async function loadThreads() {
  const rows = await api('dashboard/conversations');
  const list = byId('threads');
  list.replaceChildren();
  if (!rows.length) list.textContent = 'No saved conversations yet.';
  for (const row of rows) {
    const button = element(
      'button',
      row.turns[0]?.question ||
        'Conversation · ' + new Date(row.createdAt).toLocaleString(),
      'thread',
    );
    button.onclick = () =>
      loadChat(row.id).catch((error) => status('history', error.message, true));
    list.append(button);
  }
}
bindForm('newChat', 'chatStatus', 'Creating conversation…', async () => {
  const doc = byId('chatScope').value;
  const created = await api('conversations', doc ? { documentId: doc } : {});
  await loadChat(created.id);
  await loadThreads();
});
bindForm('reply', 'chatStatus', 'Generating answer…', async () => {
  const current = chat;
  try {
    await api('conversations/' + current.id + '/turns', {
      query: byId('follow').value.trim(),
      version: current.version,
    });
    if (chat?.id === current.id) {
      byId('follow').value = '';
      await loadChat(current.id);
    }
  } catch (error) {
    if (chat?.id === current.id) await loadChat(current.id);
    throw error;
  }
  await loadThreads();
});
async function baseline() {
  const data = await api('dashboard/baseline');
  const s = data.summary;
  status(
    'benchInfo',
    s.cases + ' questions · ' + data.reports.length + ' annual reports',
  );
  status(
    'models',
    'Saved ' +
      data.date.slice(0, 10) +
      ' · ' +
      data.models.embedding +
      ' / ' +
      data.models.chat,
  );
  for (const [label, score, total] of [
    ['Source page in top 5', s.top5, s.numeric],
    ['Correct numerical answers', s.correct, s.numeric],
    ['All checks passed', s.passed, s.cases],
  ]) {
    const row = element('div', label, 'bar');
    row.append(element('strong', score + ' / ' + total));
    const track = element('div', null, 'track');
    const fill = element('div', null, 'fill');
    fill.style.width = (100 * score) / total + '%';
    track.append(fill);
    row.append(track);
    byId('bars').append(row);
  }
  const list = byId('cases');
  list.replaceChildren();
  for (const r of data.rows) {
    const item = element('details');
    item.append(
      element('summary', (r.pass ? 'Passed' : 'Failed') + ' · ' + r.question),
      element(
        'p',
        r.error || r.answer?.answer || 'Answer and citation checks failed.',
      ),
    );
    if (r.expected?.pages)
      item.append(
        element(
          'p',
          'Reference: ' +
            r.expected.report +
            ' report · pages ' +
            r.expected.pages.join(', '),
        ),
      );
    list.append(item);
  }
}
loadReports().catch((e) => status('reports', e.message, true));
loadThreads().catch((e) => status('threads', e.message, true));
baseline().catch((e) => {
  status('benchInfo', e.message, true);
  status('cases', e.message, true);
});
fetch('/api/v1/health')
  .then((r) => r.json())
  .then((data) => {
    const deps = data.dependencies || data.error?.dependencies;
    status(
      'health',
      deps
        ? 'PostgreSQL ' + deps.postgres + ' · Ollama ' + deps.ollama
        : 'Health unavailable',
    );
  })
  .catch(() => status('health', 'Health unavailable'));
