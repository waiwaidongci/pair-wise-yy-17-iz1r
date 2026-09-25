// 汛情接力台规则层：只负责判定与流转，不碰 HTTP。
// 记录层（data/db.json）集合：
//   sites         样点档案，floodWarnLevel 为洞口水位警戒线（cm）
//   floodReports  水情上报（来水点、洞口水位、上涨速率、当班人）
//   floodEvents   汛情单（未结束 / 已销警，含读数累加、撤离名册、封洞与复测）

const STATUS_OPEN = '未结束';
const STATUS_CLOSED = '已销警';

function stamp(action, note) {
  return { at: new Date().toISOString(), action, note: note || '' };
}

function rid(collection) {
  return `${collection}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
}

function openEventFor(db, siteId) {
  return (db.floodEvents || []).find((event) => event.siteId === siteId && event.status === STATUS_OPEN);
}

function reportsOf(db, event) {
  return (db.floodReports || [])
    .filter((report) => report.eventId === event.id)
    .sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt));
}

function rosterRemaining(event) {
  return (event.roster || []).filter((person) => !person.checked).length;
}

// 销警结论重判：复测值优先于最新上报作为判定水位
function evaluate(event, site) {
  const warn = Number(site && site.floodWarnLevel);
  if (!Number.isFinite(warn)) {
    return { conclusion: '警戒线缺失', canClear: false, basis: '', level: null, reason: '样点尚未设置洞口水位警戒线' };
  }
  const hasRetest = event.retestLevel !== null && event.retestLevel !== undefined && event.retestLevel !== '';
  const basis = hasRetest ? '退水复测' : '最新上报';
  const level = hasRetest ? Number(event.retestLevel) : Number(event.latestLevel);
  const left = rosterRemaining(event);
  if (level >= warn) {
    return { conclusion: '达警戒', canClear: false, basis, level, reason: `${basis}水位 ${level}cm ≥ 警戒线 ${warn}cm` };
  }
  if (!hasRetest) {
    return { conclusion: '低于警戒·待复测', canClear: false, basis, level, reason: `最新水位 ${level}cm 已低于警戒线 ${warn}cm，等待录入退水复测值` };
  }
  if (left > 0) {
    return { conclusion: '已退水·待核销', canClear: false, basis, level, reason: `复测水位 ${level}cm 已低于警戒线，名册还差 ${left} 人核销` };
  }
  return { conclusion: '可销警', canClear: true, basis, level, reason: `复测水位 ${level}cm 低于警戒线 ${warn}cm，名册 ${(event.roster || []).length} 人全部核销` };
}

// invalidate=true：上游读数 / 警戒线更正，未销警结论先失效再重判
function applyJudge(db, event, site, invalidate, reason) {
  const prev = event.conclusion || '无';
  const judge = evaluate(event, site);
  event.conclusion = judge.conclusion;
  event.conclusionBasis = judge.basis;
  event.conclusionLevel = judge.level;
  event.conclusionReason = judge.reason;
  event.conclusionAt = new Date().toISOString();
  event.updatedAt = new Date().toISOString();
  event.history = event.history || [];
  if (invalidate) event.history.unshift(stamp('结论失效', reason));
  event.history.unshift(stamp(invalidate ? '重判结论' : '结论判定', `${prev} → ${judge.conclusion}（${reason}）`));
  return judge;
}

function createEvent(db, site, report) {
  const now = new Date().toISOString();
  const event = {
    id: rid('floodEvent'),
    siteId: site.id,
    status: STATUS_OPEN,
    openedAt: report.observedAt || now,
    closedAt: null,
    clearBy: null,
    warnLevelSnapshot: Number(site.floodWarnLevel),
    peakLevel: Number(report.waterLevel),
    latestLevel: Number(report.waterLevel),
    latestRate: Number(report.riseRate || 0),
    latestAt: report.observedAt || now,
    latestOfficer: report.dutyOfficer,
    reportIds: [report.id],
    reportCount: 1,
    roster: [],
    caveSealed: false,
    sealedBy: null,
    sealedAt: null,
    retestLevel: null,
    retestBy: null,
    retestAt: null,
    conclusion: '',
    conclusionBasis: '',
    conclusionLevel: null,
    conclusionReason: '',
    conclusionAt: null,
    createdAt: now,
    updatedAt: now,
    history: []
  };
  report.eventId = event.id;
  db.floodEvents.push(event);
  event.history.unshift(stamp('建立汛情单', `首报水位 ${report.waterLevel}cm 达到警戒线 ${site.floodWarnLevel}cm，当班人 ${report.dutyOfficer}`));
  applyJudge(db, event, site, false, '首报达到警戒线');
  return event;
}

// 重复上报归到原单累加
function accumulate(db, event, report) {
  report.eventId = event.id;
  event.reportIds.push(report.id);
  event.reportCount = event.reportIds.length;
  event.latestLevel = Number(report.waterLevel);
  event.latestRate = Number(report.riseRate || 0);
  event.latestAt = report.observedAt || new Date().toISOString();
  event.latestOfficer = report.dutyOfficer;
  event.peakLevel = Math.max(Number(event.peakLevel), Number(report.waterLevel));
  event.updatedAt = new Date().toISOString();
  event.history = event.history || [];
  event.history.unshift(stamp('重复上报归并', `第 ${event.reportCount} 报：洞口水位 ${report.waterLevel}cm，上涨速率 ${report.riseRate || 0}cm/h，当班人 ${report.dutyOfficer}`));
  const site = db.sites.find((entry) => entry.id === event.siteId);
  applyJudge(db, event, site, false, `第 ${event.reportCount} 报并入累加`);
  return event;
}

function intakeReport(db, input) {
  const site = db.sites.find((entry) => entry.id === input.siteId);
  if (!site) return { error: '来水点（样点）不存在' };
  const warn = Number(site.floodWarnLevel);
  if (!Number.isFinite(warn)) return { error: '该样点未设置洞口水位警戒线，无法判定' };
  const level = Number(input.waterLevel);
  if (!Number.isFinite(level)) return { error: '请填写洞口水位' };
  if (!input.dutyOfficer || !String(input.dutyOfficer).trim()) return { error: '请填写当班人' };
  const now = new Date().toISOString();
  const report = {
    id: rid('floodReport'),
    siteId: site.id,
    waterLevel: level,
    riseRate: Number(input.riseRate) || 0,
    dutyOfficer: String(input.dutyOfficer).trim(),
    observedAt: input.observedAt ? new Date(input.observedAt).toISOString() : now,
    note: input.note || '',
    eventId: null,
    corrected: false,
    createdAt: now,
    updatedAt: now,
    history: [stamp('登记水情', `洞口水位 ${level}cm，当班人 ${input.dutyOfficer.trim()}`)]
  };
  db.floodReports.push(report);

  let event = openEventFor(db, site.id);
  if (level >= warn) {
    event = event ? accumulate(db, event, report) : createEvent(db, site, report);
  } else if (event) {
    accumulate(db, event, report); // 未结束单期间的退水读数仍归原单
  }
  return { report, event: event || null, opened: !event ? false : report.eventId === event.id && event.reportCount === 1 };
}

function findOpenEvent(db, eventId) {
  const event = (db.floodEvents || []).find((entry) => entry.id === eventId);
  if (!event) return { error: '汛情单不存在' };
  if (event.status !== STATUS_OPEN) return { error: '汛情单已销警，不能再操作' };
  return { event };
}

function addRosterPerson(db, eventId, body) {
  const found = findOpenEvent(db, eventId);
  if (found.error) return found;
  const name = String(body.name || '').trim();
  if (!name) return { error: '请填写撤离人员姓名' };
  const event = found.event;
  event.roster = event.roster || [];
  event.roster.push({ id: rid('person'), name, checked: false, checkedBy: null, checkedAt: null });
  event.updatedAt = new Date().toISOString();
  event.history.unshift(stamp('撤离名册登记', name));
  return { event };
}

function checkoff(db, eventId, body) {
  const found = findOpenEvent(db, eventId);
  if (found.error) return found;
  const operator = String(body.operator || '').trim();
  if (!operator) return { error: '请填写执行核销的值班员' };
  const event = found.event;
  const person = (event.roster || []).find((entry) => entry.id === body.personId);
  if (!person) return { error: '名册中没有这个人' };
  if (person.checked) return { error: `${person.name} 已核销，不能重复核销` };
  person.checked = true;
  person.checkedBy = operator;
  person.checkedAt = new Date().toISOString();
  event.updatedAt = new Date().toISOString();
  event.history.unshift(stamp('逐人核销', `${person.name}（值班员 ${operator}），还差 ${rosterRemaining(event)} 人`));
  const site = db.sites.find((entry) => entry.id === event.siteId);
  applyJudge(db, event, site, false, '名册逐人核销');
  return { event };
}

function setSealed(db, eventId, body) {
  const found = findOpenEvent(db, eventId);
  if (found.error) return found;
  const operator = String(body.operator || '').trim();
  if (!operator) return { error: '请填写值班员' };
  const event = found.event;
  const sealed = Boolean(body.sealed);
  if (event.caveSealed === sealed) return { error: sealed ? '洞口已是封洞状态' : '洞口当前未封洞' };
  event.caveSealed = sealed;
  event.sealedBy = sealed ? operator : null;
  event.sealedAt = sealed ? new Date().toISOString() : null;
  event.updatedAt = new Date().toISOString();
  event.history.unshift(stamp(sealed ? '封洞' : '解封', `值班员 ${operator}`));
  return { event };
}

function recordRetest(db, eventId, body) {
  const found = findOpenEvent(db, eventId);
  if (found.error) return found;
  const operator = String(body.operator || '').trim();
  if (!operator) return { error: '请填写值班员' };
  const level = Number(body.retestLevel);
  if (!Number.isFinite(level)) return { error: '请填写退水复测水位' };
  const event = found.event;
  event.retestLevel = level;
  event.retestBy = operator;
  event.retestAt = new Date().toISOString();
  event.updatedAt = new Date().toISOString();
  event.history.unshift(stamp('录入退水复测值', `复测水位 ${level}cm（值班员 ${operator}）`));
  const site = db.sites.find((entry) => entry.id === event.siteId);
  applyJudge(db, event, site, false, '退水复测值录入');
  return { event };
}

// 洞内有访客（名册未核销完）不能直接销警；复测未达标同样拦截
function clearEvent(db, eventId, body) {
  const found = findOpenEvent(db, eventId);
  if (found.error) return found;
  const operator = String(body.operator || '').trim();
  if (!operator) return { error: '请填写值班员' };
  const event = found.event;
  const site = db.sites.find((entry) => entry.id === event.siteId);
  const judge = evaluate(event, site);
  if (!judge.canClear) return { error: judge.reason || '当前条件不满足销警' };
  event.status = STATUS_CLOSED;
  event.closedAt = new Date().toISOString();
  event.clearBy = operator;
  event.updatedAt = event.closedAt;
  event.history.unshift(stamp('销警关闭', `值班员 ${operator}：${judge.reason}`));
  return { event };
}

function recomputeAggregate(db, event) {
  const linked = reportsOf(db, event);
  event.reportIds = linked.map((report) => report.id);
  event.reportCount = linked.length;
  if (linked.length) {
    const latest = linked.reduce((a, b) => (new Date(a.observedAt) > new Date(b.observedAt) ? a : b));
    event.latestLevel = Number(latest.waterLevel);
    event.latestRate = Number(latest.riseRate || 0);
    event.latestAt = latest.observedAt;
    event.latestOfficer = latest.dutyOfficer;
    event.peakLevel = Math.max(...linked.map((report) => Number(report.waterLevel)));
  }
}

// 上游读数更正：未销警结论失效并重判；留档读数若越过警戒线则补建 / 归并汛情单
function correctReport(db, reportId, body) {
  const report = (db.floodReports || []).find((entry) => entry.id === reportId);
  if (!report) return { error: '上报记录不存在' };
  const operator = String(body.operator || '').trim();
  if (!operator) return { error: '请填写更正操作的值班员' };
  const changes = [];
  if (body.waterLevel !== undefined && body.waterLevel !== '' && Number(body.waterLevel) !== Number(report.waterLevel) && Number.isFinite(Number(body.waterLevel))) {
    changes.push(`水位 ${report.waterLevel} → ${body.waterLevel}cm`);
    report.waterLevel = Number(body.waterLevel);
  }
  if (body.riseRate !== undefined && body.riseRate !== '' && Number.isFinite(Number(body.riseRate)) && Number(body.riseRate) !== Number(report.riseRate)) {
    changes.push(`上涨速率 ${report.riseRate} → ${body.riseRate}cm/h`);
    report.riseRate = Number(body.riseRate);
  }
  if (body.note !== undefined) report.note = body.note;
  if (!changes.length) return { error: '没有需要更正的读数' };
  report.corrected = true;
  report.updatedAt = new Date().toISOString();
  report.history.unshift(stamp('上游读数更正', `${changes.join('；')}（值班员 ${operator}）`));

  const site = db.sites.find((entry) => entry.id === report.siteId);
  let event = (db.floodEvents || []).find((entry) => entry.id === report.eventId) || null;
  if (event) {
    if (event.status === STATUS_OPEN) {
      recomputeAggregate(db, event);
      applyJudge(db, event, site, true, `上游读数更正（${changes.join('；')}）`);
    } else {
      event.history.unshift(stamp('读数更正留痕', '汛情单已销警，结论保持不变'));
      event.updatedAt = new Date().toISOString();
    }
  } else {
    const open = openEventFor(db, site.id);
    if (open) {
      accumulate(db, open, report);
      event = open;
    } else if (Number(report.waterLevel) >= Number(site.floodWarnLevel)) {
      event = createEvent(db, site, report);
    }
  }
  return { report, event };
}

// 警戒线更正：该样点所有未销警汛情单结论失效并重判
function afterWarnCorrected(db, site, oldWarn) {
  const affected = [];
  for (const event of db.floodEvents || []) {
    if (event.siteId === site.id && event.status === STATUS_OPEN) {
      applyJudge(db, event, site, true, `样点警戒线由 ${oldWarn}cm 更正为 ${site.floodWarnLevel}cm`);
      affected.push(event.id);
    }
  }
  return affected;
}

module.exports = {
  STATUS_OPEN,
  STATUS_CLOSED,
  rosterRemaining,
  intakeReport,
  addRosterPerson,
  checkoff,
  setSealed,
  recordRetest,
  clearEvent,
  correctReport,
  afterWarnCorrected
};
