const state = {
  config: null,
  db: {},
  activeTab: ''
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fmtDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function nowLocalInput() {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1800);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || '请求失败');
  }
  if (res.status === 204) return null;
  return res.json();
}

function valueByPath(source, pathName) {
  return pathName.split('.').reduce((value, key) => value?.[key], source);
}

function displayField(item, field) {
  const value = item[field.name] ?? '';
  if (field.type === 'select' && field.options) return value || field.options[0];
  return value;
}

function collectionLabel(collection) {
  return state.config.collections[collection]?.label || collection;
}

function relationLabel(relation, id) {
  const item = state.db[relation.collection]?.find((entry) => entry.id === id);
  if (!item) return '未关联';
  return relation.labelFields.map((field) => item[field]).filter(Boolean).join(' / ');
}

function findSite(id) {
  return (state.db.sites || []).find((entry) => entry.id === id);
}

function siteLabel(site) {
  if (!site) return '未关联来水点';
  return [site.cave, site.zone, site.pointCode].filter(Boolean).join(' / ');
}

function optionList(items, labelFields) {
  return items.map((item) => {
    const label = labelFields.map((field) => item[field]).filter(Boolean).join(' / ');
    return `<option value="${item.id}">${escapeHtml(label)}</option>`;
  }).join('');
}

function formField(field) {
  const required = field.required ? 'required' : '';
  if (field.type === 'textarea') {
    return `<label class="${field.wide ? 'wide' : ''}">${field.label}<textarea name="${field.name}" ${required}></textarea></label>`;
  }
  if (field.type === 'select') {
    return `<label class="${field.wide ? 'wide' : ''}">${field.label}<select name="${field.name}" ${required}>${field.options.map((option) => `<option>${escapeHtml(option)}</option>`).join('')}</select></label>`;
  }
  if (field.type === 'relation') {
    const items = state.db[field.collection] || [];
    return `<label class="${field.wide ? 'wide' : ''}">${field.label}<select name="${field.name}" ${required}>${optionList(items, field.labelFields)}</select></label>`;
  }
  if (field.type === 'datetime-local') {
    return `<label class="${field.wide ? 'wide' : ''}">${field.label}<input type="datetime-local" name="${field.name}" value="${nowLocalInput()}" ${required}></label>`;
  }
  return `<label class="${field.wide ? 'wide' : ''}">${field.label}<input type="${field.type || 'text'}" name="${field.name}" ${required}></label>`;
}

function pill(value, tone = '') {
  return `<span class="pill ${tone}">${escapeHtml(value || '-')}</span>`;
}

function toneFor(value) {
  return state.config.tones?.[value] || '';
}

function historyHtml(item) {
  const history = item.history || [];
  if (!history.length) return '';
  return `<div class="history">${history.slice(0, 6).map((entry) => `
    <div class="history-item"><span>${fmtDate(entry.at)}</span><span>${escapeHtml(entry.action)}${entry.note ? '：' + escapeHtml(entry.note) : ''}</span></div>
  `).join('')}</div>`;
}

function values(form, view) {
  const payload = Object.fromEntries(new FormData(form).entries());
  for (const field of view.fields || []) {
    if (field.type === 'number') payload[field.name] = Number(payload[field.name] || 0);
  }
  return { ...view.defaults, ...payload };
}

function renderTabs() {
  $('#tabs').innerHTML = state.config.views.map((view, index) => `
    <button class="tab${index === 0 ? ' active' : ''}" data-tab="${view.id}">${escapeHtml(view.label)}</button>
  `).join('');
  state.activeTab = state.config.views[0].id;
}

function setTab(tabId) {
  state.activeTab = tabId;
  $$('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === tabId));
  $$('.view').forEach((view) => view.classList.toggle('active', view.id === tabId));
}

function statValue(stat) {
  const items = state.db[stat.collection] || [];
  if (stat.pendingRoster) {
    return items
      .filter((item) => item.status === '未结束')
      .reduce((sum, item) => sum + (item.roster || []).filter((person) => !person.checked).length, 0);
  }
  if (stat.today) {
    const day = new Date().toDateString();
    return items.filter((item) => new Date(item.observedAt || item.createdAt).toDateString() === day).length;
  }
  if (stat.filter) return items.filter((item) => item[stat.filter.field] === stat.filter.value).length;
  return items.length;
}

function renderStats() {
  return `<div class="stats">${state.config.stats.map((stat) => `
    <div class="stat"><span>${escapeHtml(stat.label)}</span><strong>${statValue(stat)}</strong></div>
  `).join('')}</div>`;
}

function renderCard(item, collection, view) {
  if (collection === 'floodEvents') return renderFloodEventCard(item);
  const title = view.titleFields.map((field) => item[field]).filter(Boolean).join(' / ') || item.id;
  const statusValue = item[view.statusField];
  const relation = view.relation ? `<div class="meta">${escapeHtml(relationLabel(view.relation, item[view.relation.localKey]))}</div>` : '';
  const details = (view.detailFields || []).map((field) => {
    const raw = item[field.name];
    const value = field.type === 'relation' ? relationLabel(field, raw) : raw;
    return `<div>${escapeHtml(field.label)}<br><strong>${escapeHtml(value || '-')}</strong></div>`;
  }).join('');
  const summary = (view.summaryFields || []).map((field) => item[field]).filter(Boolean).join(' · ');
  const actions = state.config.actions
    .filter((action) => action.collection === collection)
    .map((action) => `<button class="${action.danger ? 'danger' : 'ghost'}" data-action="${action.id}" data-id="${item.id}">${escapeHtml(action.label)}</button>`)
    .join('');
  const warnEdit = collection === 'sites' ? renderWarnEditor(item) : '';
  return `<article class="card" data-card="${collection}" data-id="${item.id}">
    <div class="card-head"><h3>${escapeHtml(title)}</h3>${statusValue ? pill(statusValue, toneFor(statusValue)) : ''}</div>
    ${relation}
    ${summary ? `<p>${escapeHtml(summary)}</p>` : ''}
    ${details ? `<div class="detail">${details}</div>` : ''}
    ${warnEdit}
    ${actions ? `<div class="actions">${actions}</div>` : ''}
    ${historyHtml(item)}
  </article>`;
}

// 警戒线更正入口（更正后服务端对未销警汛情单结论失效重判）
function renderWarnEditor(site) {
  return `<div class="warn-edit">
    <button class="ghost small" data-flood-action="warn-edit" data-site="${site.id}">更正警戒线（当前 ${escapeHtml(site.floodWarnLevel ?? '-')}cm）</button>
    <div class="warn-form" hidden>
      <input type="number" name="floodWarnLevel" value="${escapeHtml(site.floodWarnLevel ?? '')}" placeholder="新警戒线 cm">
      <input type="text" name="operator" placeholder="值班员">
      <button data-flood-action="warn-save" data-site="${site.id}">保存并重判</button>
      <button class="ghost" data-flood-action="warn-cancel" data-site="${site.id}">取消</button>
    </div>
  </div>`;
}

function remainingOf(event) {
  return (event.roster || []).filter((person) => !person.checked).length;
}

function reportRow(report, event) {
  const linked = Boolean(event);
  const standaloneTag = linked ? '' : pill('未达警戒留档', 'warn');
  return `<div class="report-row" data-report-row="${report.id}">
    <div class="report-line">
      <span>${fmtDate(report.observedAt)}</span>
      <strong>${escapeHtml(report.waterLevel)}cm</strong>
      <span>↑${escapeHtml(report.riseRate || 0)}cm/h</span>
      <span>${escapeHtml(report.dutyOfficer)}</span>
      ${report.corrected ? pill('已更正', 'warn') : ''}
      ${standaloneTag}
      ${event && event.status === '未结束' ? `<button class="ghost small" data-flood-action="report-edit" data-report="${report.id}">更正</button>` : ''}
    </div>
    ${report.note ? `<div class="meta">${escapeHtml(report.note)}</div>` : ''}
    <div class="report-edit" hidden>
      <input type="number" name="waterLevel" value="${escapeHtml(report.waterLevel)}" placeholder="洞口水位 cm">
      <input type="number" name="riseRate" value="${escapeHtml(report.riseRate ?? 0)}" placeholder="上涨速率 cm/h">
      <input type="text" name="operator" placeholder="值班员">
      <button data-flood-action="report-save" data-report="${report.id}">保存更正</button>
      <button class="ghost" data-flood-action="report-cancel" data-report="${report.id}">取消</button>
    </div>
  </div>`;
}

function renderFloodEventCard(event) {
  const site = findSite(event.siteId);
  const reports = (state.db.floodReports || [])
    .filter((report) => event.reportIds.includes(report.id))
    .sort((a, b) => new Date(b.observedAt) - new Date(a.observedAt));
  const remaining = remainingOf(event);
  const total = (event.roster || []).length;
  const isOpen = event.status === '未结束';

  const roster = (event.roster || []).map((person) => `
    <li class="${person.checked ? 'checked' : ''}">
      <span>${escapeHtml(person.name)}</span>
      ${person.checked
        ? `<span class="meta">已核销 · ${escapeHtml(person.checkedBy)} · ${fmtDate(person.checkedAt)}</span>`
        : `<button class="ghost small" data-flood-action="checkoff" data-event="${event.id}" data-person="${person.id}">核销</button>`}
    </li>`).join('');

  const rosterPanel = `
    <div class="sub">
      <h4>撤离名册（按名册逐人核销）</h4>
      <div class="roster-bar">
        <input type="text" name="personName" placeholder="洞内人员姓名/身份">
        <button class="ghost" data-flood-action="roster-add" data-event="${event.id}">登记入册</button>
      </div>
      ${total ? `<ul class="roster">${roster}</ul>` : '<div class="meta">名册为空，登记洞内访客后逐人核销</div>'}
      ${isOpen && remaining > 0 ? `<div class="alert-badge">还差 ${remaining} 人核销，不能销警</div>` : ''}
      ${isOpen && total > 0 && remaining === 0 ? '<div class="ok-badge">名册已全部核销</div>' : ''}
    </div>`;

  const sealPanel = `
    <div class="sub">
      <h4>封洞状态</h4>
      <div class="seal-line">
        ${event.caveSealed
          ? `${pill('已封洞', 'bad')}<span class="meta">${escapeHtml(event.sealedBy || '')} · ${fmtDate(event.sealedAt)}</span>`
          : pill('未封洞', 'warn')}
        ${isOpen ? `
          <div class="operator-line">
            <input type="text" name="operator" placeholder="值班员">
            <button class="${event.caveSealed ? 'ghost' : 'danger'}" data-flood-action="seal" data-event="${event.id}" data-sealed="${event.caveSealed ? 0 : 1}">
              ${event.caveSealed ? '解封洞口' : '执行封洞'}
            </button>
          </div>` : ''}
      </div>
    </div>`;

  const retestPanel = isOpen ? `
    <div class="sub">
      <h4>退水复测</h4>
      ${event.retestLevel !== null && event.retestLevel !== undefined
        ? `<div class="meta">复测水位 <strong>${escapeHtml(event.retestLevel)}cm</strong> · ${escapeHtml(event.retestBy || '')} · ${fmtDate(event.retestAt)}</div>`
        : '<div class="meta">尚未录入退水复测值</div>'}
      <div class="retest-line">
        <input type="number" name="retestLevel" placeholder="复测水位 cm" value="${event.retestLevel ?? ''}">
        <input type="text" name="operator" placeholder="值班员">
        <button class="ghost" data-flood-action="retest" data-event="${event.id}">录入复测值并重判</button>
      </div>
    </div>` : `
    <div class="sub"><h4>退水复测</h4><div class="meta">复测水位 <strong>${escapeHtml(event.retestLevel)}cm</strong> · ${escapeHtml(event.retestBy || '')} · ${fmtDate(event.retestAt)}</div></div>`;

  const clearPanel = isOpen ? `
    <div class="sub clear-panel">
      <div class="operator-line">
        <input type="text" name="operator" placeholder="销警值班员">
        <button data-flood-action="clear" data-event="${event.id}" ${event.conclusion === '可销警' ? '' : 'disabled'}>${event.conclusion === '可销警' ? '销警关闭汛情单' : '暂不可销警'}</button>
      </div>
      <div class="meta">判定依据：${escapeHtml(event.conclusionReason || '-')}</div>
    </div>` : `
    <div class="sub clear-panel"><span class="ok-badge">已销警</span><span class="meta">销警人 ${escapeHtml(event.clearBy || '-')} · ${fmtDate(event.closedAt)}</span></div>`;

  return `<article class="card flood-card">
    <div class="card-head">
      <h3>${escapeHtml(siteLabel(site))}</h3>
      ${pill(event.status, toneFor(event.status))}
    </div>
    <div class="meta">建单 ${fmtDate(event.openedAt)} · 建单时警戒线 ${escapeHtml(event.warnLevelSnapshot)}cm${Number(site && site.floodWarnLevel) !== Number(event.warnLevelSnapshot) ? ` · 现行警戒线 ${escapeHtml(site.floodWarnLevel)}cm` : ''}</div>
    <div class="detail">
      <div>最新洞口水位<br><strong>${escapeHtml(event.latestLevel)}cm</strong></div>
      <div>上涨速率<br><strong>${escapeHtml(event.latestRate || 0)}cm/h</strong></div>
      <div>峰值水位<br><strong>${escapeHtml(event.peakLevel)}cm</strong></div>
      <div>累计上报<br><strong>${event.reportCount} 报</strong></div>
      <div>最近当班人<br><strong>${escapeHtml(event.latestOfficer || '-')}</strong></div>
      <div>最新观测<br><strong>${fmtDate(event.latestAt)}</strong></div>
    </div>
    <div class="conclusion ${toneFor(event.conclusion)}">
      ${pill(event.conclusion || '未判定', toneFor(event.conclusion))}
      <span>${escapeHtml(event.conclusionReason || '')}</span>
      ${isOpen ? '<span class="meta">（读数/警戒线更正后结论自动失效重判）</span>' : ''}
    </div>
    <div class="sub">
      <h4>水情上报流水（重复上报归本单累加）</h4>
      <div class="report-list">${reports.length ? reports.map((report) => reportRow(report, event)).join('') : '<div class="meta">暂无上报</div>'}</div>
    </div>
    ${sealPanel}
    ${rosterPanel}
    ${retestPanel}
    ${clearPanel}
    ${historyHtml(event)}
  </article>`;
}

function renderFloodList(view) {
  const query = ($(`#search-${view.id}`)?.value.trim() || '').toLowerCase();
  const status = $(`#status-${view.id}`)?.value || '';
  let events = [...(state.db.floodEvents || [])];
  if (status) events = events.filter((event) => event.status === status);
  if (query) {
    events = events.filter((event) => {
      const site = findSite(event.siteId);
      const haystack = [event.latestOfficer, site && site.cave, site && site.zone, site && site.pointCode]
        .filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }
  events.sort((a, b) => {
    if (a.status !== b.status) return a.status === '未结束' ? -1 : 1;
    return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
  });
  return events.length
    ? events.map((event) => renderFloodEventCard(event)).join('')
    : '<div class="empty">暂无汛情单，达到警戒线的上报会自动建单</div>';
}

function renderStandaloneReports() {
  const items = (state.db.floodReports || [])
    .filter((report) => !report.eventId)
    .sort((a, b) => new Date(b.observedAt) - new Date(a.observedAt));
  if (!items.length) return '';
  return `<div class="panel standalone">
    <h2>未达警戒上报留档（更正后越过警戒线会补建汛情单）</h2>
    <div class="report-list">${items.map((report) => reportRow(report, null)).join('')}</div>
  </div>`;
}

function renderDashboardView(view) {
  const source = view.focus;
  let items = [...(state.db[source.collection] || [])];
  if (source.field) items = items.filter((item) => source.values.includes(item[source.field]));
  items = items.slice(0, source.limit || 8);
  return `<section class="view active" id="${view.id}">
    ${renderStats()}
    <div class="panel"><h2>${escapeHtml(view.focusTitle)}</h2><div class="list">${items.length ? items.map((item) => renderCard(item, source.collection, {})).join('') : '<div class="empty">暂无重点事项</div>'}</div></div>
  </section>`;
}

function renderFloodView(view) {
  const statusOptions = view.statusOptions || [];
  return `<section class="view" id="${view.id}">
    <div class="grid">
      <form class="panel" data-flood-report>
        <h2>${escapeHtml(view.formTitle)}</h2>
        <div class="form-grid">${view.fields.map(formField).join('')}</div>
        <div class="actions"><button>${escapeHtml(view.submitLabel || '上报')}</button></div>
        <p class="meta">洞口水位达到来水点警戒线下发即自动建立未结束汛情单；同一来水点重复上报归到原单累加。</p>
      </form>
      <div class="panel">
        <h2>${escapeHtml(view.listTitle)}</h2>
        <div class="toolbar">
          <input id="search-${view.id}" placeholder="${escapeHtml(view.searchPlaceholder || '搜索')}">
          <select id="status-${view.id}">
            <option value="">全部状态</option>
            ${statusOptions.map((option) => `<option>${escapeHtml(option)}</option>`).join('')}
          </select>
        </div>
        <div class="list" id="list-${view.id}">${renderFloodList(view)}</div>
      </div>
    </div>
    ${renderStandaloneReports()}
  </section>`;
}

function renderCrudView(view) {
  const statusOptions = view.statusOptions || [];
  return `<section class="view" id="${view.id}">
    <div class="grid">
      <form class="panel" data-create="${view.collection}" data-view="${view.id}">
        <h2>${escapeHtml(view.formTitle)}</h2>
        <div class="form-grid">${view.fields.map(formField).join('')}</div>
        <div class="actions"><button>${escapeHtml(view.submitLabel || '保存')}</button></div>
      </form>
      <div class="panel">
        <h2>${escapeHtml(view.listTitle)}</h2>
        <div class="toolbar">
          <input id="search-${view.id}" placeholder="${escapeHtml(view.searchPlaceholder || '搜索')}">
          <select id="status-${view.id}">
            <option value="">全部状态</option>
            ${statusOptions.map((option) => `<option>${escapeHtml(option)}</option>`).join('')}
          </select>
        </div>
        <div class="list" id="list-${view.id}">${renderList(view)}</div>
      </div>
    </div>
  </section>`;
}

function renderList(view) {
  const collection = view.collection;
  const query = $(`#search-${view.id}`)?.value.trim() || '';
  const status = $(`#status-${view.id}`)?.value || '';
  let items = [...(state.db[collection] || [])];
  if (query) {
    items = items.filter((item) => view.searchFields.some((field) => String(item[field] || '').includes(query)));
  }
  if (status) {
    items = items.filter((item) => item[view.statusField] === status);
  }
  return items.length ? items.map((item) => renderCard(item, collection, view)).join('') : `<div class="empty">暂无${escapeHtml(collectionLabel(collection))}</div>`;
}

function render() {
  $('#title').textContent = state.config.title;
  document.title = state.config.title;
  $('#lede').textContent = state.config.lede;
  $('#main').innerHTML = state.config.views.map((view) => {
    if (view.type === 'dashboard') return renderDashboardView(view);
    if (view.type === 'flood') return renderFloodView(view);
    return renderCrudView(view);
  }).join('');
  setTab(state.activeTab || state.config.views[0].id);
}

async function load() {
  state.db = await api('/api/db');
  render();
}

function closestInputs(el) {
  return Object.fromEntries([...el.parentElement.querySelectorAll('input, select, textarea')].map((input) => [input.name, input.value]));
}

document.addEventListener('click', async (event) => {
  const tab = event.target.closest('.tab');
  const action = event.target.closest('[data-action]');
  const floodAction = event.target.closest('[data-flood-action]');
  if (tab) setTab(tab.dataset.tab);
  if (action) {
    try {
      await api(`/api/action/${action.dataset.action}/${action.dataset.id}`, { method: 'POST' });
      await load();
      toast('已更新');
    } catch (error) {
      toast(error.message);
    }
    return;
  }
  if (!floodAction) return;

  const kind = floodAction.dataset.floodAction;
  // 纯界面切换
  if (kind === 'report-edit') {
    const row = floodAction.closest('[data-report-row]');
    $('.report-edit', row).hidden = false;
    $('.report-line', row).style.display = 'none';
    return;
  }
  if (kind === 'report-cancel') {
    const row = floodAction.closest('[data-report-row]');
    $('.report-edit', row).hidden = true;
    $('.report-line', row).style.display = '';
    return;
  }
  if (kind === 'warn-edit') {
    const box = floodAction.closest('.warn-edit');
    floodAction.hidden = true;
    $('.warn-form', box).hidden = false;
    return;
  }
  if (kind === 'warn-cancel') {
    const box = floodAction.closest('.warn-edit');
    $('.warn-form', box).hidden = true;
    $('[data-flood-action="warn-edit"]', box).hidden = false;
    return;
  }

  try {
    const body = closestInputs(floodAction);
    let path;
    let method = 'POST';
    if (kind === 'checkoff') {
      path = `/api/flood/events/${floodAction.dataset.event}/checkoff`;
      body.personId = floodAction.dataset.person;
    } else if (kind === 'roster-add') {
      path = `/api/flood/events/${floodAction.dataset.event}/roster`;
      body.name = body.personName;
    } else if (kind === 'seal') {
      path = `/api/flood/events/${floodAction.dataset.event}/seal`;
      body.sealed = floodAction.dataset.sealed === '1';
    } else if (kind === 'retest') {
      path = `/api/flood/events/${floodAction.dataset.event}/retest`;
      body.retestLevel = Number(body.retestLevel);
    } else if (kind === 'clear') {
      path = `/api/flood/events/${floodAction.dataset.event}/clear`;
    } else if (kind === 'report-save') {
      path = `/api/flood/reports/${floodAction.dataset.report}`;
      method = 'PATCH';
      body.waterLevel = body.waterLevel === '' ? undefined : Number(body.waterLevel);
      body.riseRate = body.riseRate === '' ? undefined : Number(body.riseRate);
    } else if (kind === 'warn-save') {
      path = `/api/sites/${floodAction.dataset.site}`;
      method = 'PATCH';
      body.floodWarnLevel = Number(body.floodWarnLevel);
    }
    const result = await api(path, { method, body: JSON.stringify(body) });
    await load();
    if (kind === 'warn-save' && result.rejudged?.length) toast(`警戒线已更正，${result.rejudged.length} 张未结束汛情单结论失效重判`);
    else if (kind === 'roster-add') toast('已登记入册，等待逐人核销');
    else toast('已更新');
  } catch (error) {
    toast(error.message);
  }
});

document.addEventListener('input', (event) => {
  const view = state.config.views.find((entry) => entry.id && (event.target.id === `search-${entry.id}` || event.target.id === `status-${entry.id}`));
  if (!view) return;
  $(`#list-${view.id}`).innerHTML = view.type === 'flood' ? renderFloodList(view) : renderList(view);
});

document.addEventListener('submit', async (event) => {
  const floodForm = event.target.closest('[data-flood-report]');
  if (floodForm) {
    event.preventDefault();
    const view = state.config.views.find((entry) => entry.type === 'flood');
    try {
      const payload = values(floodForm, view);
      const result = await api('/api/flood/reports', { method: 'POST', body: JSON.stringify(payload) });
      floodForm.reset();
      $('input[type="datetime-local"]', floodForm).value = nowLocalInput();
      await load();
      if (result.event && result.opened) toast('达到警戒线：已建立未结束汛情单');
      else if (result.event) toast('已归到原汛情单累加');
      else toast('已登记留档（未达警戒线）');
    } catch (error) {
      toast(error.message);
    }
    return;
  }

  const form = event.target.closest('[data-create]');
  if (!form) return;
  event.preventDefault();
  const view = state.config.views.find((entry) => entry.id === form.dataset.view);
  await api(`/api/${form.dataset.create}`, { method: 'POST', body: JSON.stringify(values(form, view)) });
  form.reset();
  await load();
  toast('已保存');
});

$('#refreshBtn').addEventListener('click', () => load().then(() => toast('已刷新')));

async function boot() {
  state.config = await api('/api/config');
  renderTabs();
  await load();
}

boot().catch((error) => toast(error.message));
