const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const config = require('./project.config');
const PORT = process.env.PORT || config.port || 3900;
const DB_FILE = path.join(__dirname, 'data', 'db.json');

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function readDb() {
  const raw = await fs.readFile(DB_FILE, 'utf8');
  return JSON.parse(raw);
}

async function writeDb(db) {
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2) + '\n');
}

function stamp(action, note) {
  return {
    at: new Date().toISOString(),
    action,
    note: note || ''
  };
}

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
}

function sortNewest(a, b) {
  return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
}

function getValue(source, pathName) {
  return pathName.split('.').reduce((value, key) => value?.[key], source);
}

function setValue(target, pathName, value) {
  const keys = pathName.split('.');
  let cursor = target;
  while (keys.length > 1) {
    const key = keys.shift();
    cursor[key] = cursor[key] || {};
    cursor = cursor[key];
  }
  cursor[keys[0]] = value;
}

function interpolate(text, context) {
  return String(text || '').replace(/\{([\w.]+)\}/g, (_, pathName) => {
    const value = getValue(context, pathName);
    return value === undefined || value === null ? '' : String(value);
  });
}

function hasReading(value) {
  return value !== null && value !== undefined && value !== '';
}

// 汛情派生：累加统计、还差几人核销、未销警结论重判。
// 上游读数或警戒线一经更正，这里随下一次写入自动重算，结论变化会留痕。
function refreshFloodDerived(db, options = {}) {
  const sites = db.sites || [];
  const reports = db.floodReports || [];
  const visitors = db.visitors || [];
  for (const event of db.floodEvents || []) {
    const site = sites.find((entry) => entry.id === event.siteId);
    const caveSiteIds = sites.filter((entry) => entry.cave === site?.cave).map((entry) => entry.id);
    event.cave = site?.cave || '';
    event.warningLevel = site ? Number(site.warningLevel) : null;
    event.remainingCount = visitors.filter((visitor) => visitor.status === '在洞' && caveSiteIds.includes(visitor.siteId)).length;
    const linked = reports.filter((report) => report.eventId === event.id);
    if (linked.length) {
      event.reportCount = linked.length;
      event.peakLevel = Math.max(...linked.map((report) => Number(report.waterLevel) || 0));
      const last = linked[linked.length - 1];
      event.latestLevel = Number(last.waterLevel) || 0;
      event.latestRiseRate = Number(last.riseRate) || 0;
      event.dutyOfficer = last.dutyOfficer || event.dutyOfficer;
    }
    if (event.status === '已销警') continue;
    const basis = hasReading(event.recedeLevel) ? Number(event.recedeLevel) : Number(event.latestLevel);
    const next = basis >= Number(event.warningLevel) ? '超警未销' : '回落待销';
    if (event.conclusion && event.conclusion !== next && options.log) {
      event.history = event.history || [];
      event.history.unshift(stamp('结论重判', `${event.conclusion} → ${next}`));
      event.updatedAt = new Date().toISOString();
    }
    event.conclusion = next;
  }
}

// 汛情上报：达到样点警戒线建未结束汛情单；已有未结束单则归到原单累加。
function handleFloodReport(db, report) {
  db.floodEvents = db.floodEvents || [];
  const site = (db.sites || []).find((entry) => entry.id === report.siteId);
  const warning = site ? Number(site.warningLevel) : NaN;
  const now = new Date().toISOString();
  const open = db.floodEvents.find((event) => event.siteId === report.siteId && event.status !== '已销警');
  if (open) {
    report.eventId = open.id;
    report.result = '并入原单累加';
    open.history = open.history || [];
    if (Number(report.waterLevel) >= warning && hasReading(open.recedeLevel)) {
      open.recedeLevel = null;
      open.history.unshift(stamp('汛情复涨', '读数再达警戒线，退水复测值失效，需重新复测'));
    }
    open.history.unshift(stamp('上报累加', `${report.sourcePoint || '来水点'} ${report.waterLevel}m（当班：${report.dutyOfficer || '-'}）`));
    open.updatedAt = now;
    return;
  }
  if (Number(report.waterLevel) >= warning) {
    const event = {
      id: newId('floodEvents'),
      siteId: report.siteId,
      sourcePoint: report.sourcePoint,
      status: '未结束',
      conclusion: '',
      recedeLevel: null,
      createdAt: now,
      updatedAt: now,
      history: [stamp('创建', `达到警戒线 ${warning}m，建未结束汛情单`)]
    };
    db.floodEvents.push(event);
    report.eventId = event.id;
    report.result = '新建汛情单';
    if (site) {
      site.sealStatus = '已封洞';
      site.updatedAt = now;
      site.history = site.history || [];
      site.history.unshift(stamp('自动封洞', '汛情单建立，洞口先行封闭'));
    }
    return;
  }
  report.result = '未达警戒线';
}

app.get('/api/config', (req, res) => {
  res.json(config);
});

app.get('/api/db', async (req, res) => {
  const db = await readDb();
  refreshFloodDerived(db);
  for (const key of Object.keys(db)) {
    if (Array.isArray(db[key])) db[key].sort(sortNewest);
  }
  res.json(db);
});

app.post('/api/:collection', async (req, res) => {
  const db = await readDb();
  const { collection } = req.params;
  if (!Array.isArray(db[collection])) return res.status(404).json({ error: 'unknown collection' });
  const now = new Date().toISOString();
  const item = {
    id: newId(collection),
    ...req.body,
    createdAt: now,
    updatedAt: now,
    history: [stamp('创建', req.body.note || req.body.memo || '')]
  };
  db[collection].push(item);
  if (collection === 'floodReports') handleFloodReport(db, item);
  refreshFloodDerived(db, { log: true });
  await writeDb(db);
  res.status(201).json(item);
});

app.patch('/api/:collection/:id', async (req, res) => {
  const db = await readDb();
  const { collection, id } = req.params;
  if (!Array.isArray(db[collection])) return res.status(404).json({ error: 'unknown collection' });
  const item = db[collection].find((entry) => entry.id === id);
  if (!item) return res.status(404).json({ error: 'not found' });
  const historyAction = req.body.historyAction;
  delete req.body.historyAction;
  Object.assign(item, req.body, { updatedAt: new Date().toISOString() });
  item.history = item.history || [];
  if (historyAction || req.body.note || req.body.memo || req.body.status) {
    item.history.unshift(stamp(historyAction || req.body.status || '更新', req.body.note || req.body.memo || ''));
  }
  refreshFloodDerived(db, { log: true });
  await writeDb(db);
  res.json(item);
});

app.delete('/api/:collection/:id', async (req, res) => {
  const db = await readDb();
  const { collection, id } = req.params;
  if (!Array.isArray(db[collection])) return res.status(404).json({ error: 'unknown collection' });
  const before = db[collection].length;
  db[collection] = db[collection].filter((entry) => entry.id !== id);
  if (db[collection].length === before) return res.status(404).json({ error: 'not found' });
  refreshFloodDerived(db, { log: true });
  await writeDb(db);
  res.status(204).end();
});

app.post('/api/action/:actionId/:id', async (req, res) => {
  const db = await readDb();
  const action = config.actions.find((entry) => entry.id === req.params.actionId);
  if (!action) return res.status(404).json({ error: 'unknown action' });
  const item = db[action.collection]?.find((entry) => entry.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  refreshFloodDerived(db);
  const result = runAction(db, action, item, req.body || {});
  if (result.error) return res.status(409).json({ error: result.error });
  refreshFloodDerived(db, { log: true });
  await writeDb(db);
  res.json(result.item);
});

function findRelated(db, relation, item) {
  return db[relation.collection]?.find((entry) => entry.id === item[relation.localKey]);
}

function runAction(db, action, item, body) {
  const related = action.relation ? findRelated(db, action.relation, item) : null;
  const context = { item, related, body: body || {}, now: new Date().toISOString() };
  const levelRank = { '低': 1, '中': 2, '高': 3 };
  for (const guard of action.guards || []) {
    const left = getValue(context, guard.left);
    const right = guard.rightPath ? getValue(context, guard.rightPath) : guard.right;
    const fail = () => ({ error: interpolate(guard.message, context) });
    if (guard.op === 'missing' && left) continue;
    if (guard.op === 'missing' && !left) return fail();
    if (guard.op === 'eq' && left !== right) return fail();
    if (guard.op === 'neq' && left === right) return fail();
    if (guard.op === 'gte' && Number(left) < Number(right)) return fail();
    if (guard.op === 'lt' && !(Number(left) < Number(right))) return fail();
    if (guard.op === 'gt' && !(Number(left) > Number(right))) return fail();
    if (guard.op === 'levelGte' && (levelRank[left] || 0) < (levelRank[right] || 0)) return fail();
    if (guard.op === 'notIn' && guard.values.includes(left)) return fail();
  }
  const touched = new Set();
  for (const patch of action.patches || []) {
    const target = patch.target === 'related' ? related : item;
    if (!target) continue;
    const next = patch.valuePath ? getValue(context, patch.valuePath) : patch.value;
    setValue(target, patch.field, next);
    touched.add(target);
  }
  for (const delta of action.deltas || []) {
    const target = delta.target === 'related' ? related : item;
    if (!target) continue;
    const sourceAmount = delta.amountPath ? Number(getValue(context, delta.amountPath)) : 1;
    const multiplier = delta.amount === undefined ? 1 : Number(delta.amount);
    const amount = sourceAmount * multiplier;
    const current = Number(getValue({ target }, `target.${delta.field}`) || 0);
    setValue(target, delta.field, current + amount);
    touched.add(target);
  }
  for (const target of touched) {
    target.updatedAt = new Date().toISOString();
    target.history = target.history || [];
    target.history.unshift(stamp(action.label, interpolate(action.note || '状态流转', context)));
  }
  return { item };
}

app.listen(PORT, () => {
  console.log(`${config.title} running at http://localhost:${PORT}`);
});
