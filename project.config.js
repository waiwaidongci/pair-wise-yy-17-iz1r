module.exports = {
  port: 3912,
  title: '钟乳石洞穴微环境巡测',
  lede: '巡测登记与汛情接力：登记来水点、洞口水位与上涨速率，达警自动建单封洞，按名册逐人核销、录入退水复测后销警。',
  tones: {
    '常规观察': 'ok',
    '正常': 'ok',
    '已复查': 'ok',
    '重点保护': 'warn',
    '异常待复查': 'bad',
    '暂停开放': 'bad',
    '开放': 'ok',
    '已封洞': 'bad',
    '在洞': 'warn',
    '已核销': 'ok',
    '未结束': 'warn',
    '已销警': 'ok',
    '超警未销': 'bad',
    '回落待销': 'warn',
    '新建汛情单': 'bad',
    '并入原单累加': 'warn',
    '未达警戒线': 'ok'
  },
  collections: {
    sites: { label: '样点档案' },
    surveys: { label: '巡测记录' },
    visitors: { label: '撤离名册' },
    floodReports: { label: '汛情上报' },
    floodEvents: { label: '汛情单' }
  },
  stats: [
    { label: '未结束汛情单', collection: 'floodEvents', filter: { field: 'status', value: '未结束' } },
    { label: '在洞未核销', collection: 'visitors', filter: { field: 'status', value: '在洞' } },
    { label: '已封洞样点', collection: 'sites', filter: { field: 'sealStatus', value: '已封洞' } },
    { label: '汛情上报', collection: 'floodReports' }
  ],
  views: [
    {
      id: 'dashboard',
      label: '汛情看板',
      type: 'dashboard',
      focusTitle: '未结束汛情',
      focus: { collection: 'floodEvents', field: 'status', values: ['未结束'], limit: 8 }
    },
    {
      id: 'relay',
      label: '汛情接力台',
      type: 'relay',
      collection: 'floodReports',
      formTitle: '汛情上报',
      submitLabel: '提交上报',
      eventsTitle: '未结束汛情单',
      logTitle: '上报流水',
      logLimit: 10,
      fields: [
        { label: '关联样点', name: 'siteId', type: 'relation', collection: 'sites', labelFields: ['cave', 'zone', 'pointCode'], required: true, wide: true },
        { label: '来水点', name: 'sourcePoint', required: true },
        { label: '当班人', name: 'dutyOfficer', required: true },
        { label: '洞口水位(m)', name: 'waterLevel', type: 'number', required: true },
        { label: '上涨速率(m/h)', name: 'riseRate', type: 'number', required: true },
        { label: '上报时间', name: 'reportedAt', type: 'datetime-local', required: true, wide: true },
        { label: '备注', name: 'note', type: 'textarea', wide: true }
      ],
      eventView: {
        titleFields: ['sourcePoint'],
        statusField: 'status',
        extraStatusField: 'conclusion',
        relation: { collection: 'sites', localKey: 'siteId', labelFields: ['cave', 'zone', 'pointCode'] },
        detailFields: [
          { label: '最新水位', name: 'latestLevel', suffix: ' m' },
          { label: '上涨速率', name: 'latestRiseRate', suffix: ' m/h' },
          { label: '警戒线', name: 'warningLevel', suffix: ' m' },
          { label: '上报次数', name: 'reportCount', suffix: ' 次' },
          { label: '退水复测', name: 'recedeLevel', suffix: ' m' },
          { label: '还差几人核销', name: 'remainingCount', suffix: ' 人', emphasize: true },
          { label: '当班人', name: 'dutyOfficer' }
        ]
      },
      logView: {
        titleFields: ['sourcePoint'],
        statusField: 'result',
        relation: { collection: 'sites', localKey: 'siteId', labelFields: ['cave', 'zone', 'pointCode'] },
        summaryFields: ['note'],
        detailFields: [
          { label: '洞口水位', name: 'waterLevel', suffix: ' m' },
          { label: '上涨速率', name: 'riseRate', suffix: ' m/h' },
          { label: '当班人', name: 'dutyOfficer' },
          { label: '上报时间', name: 'reportedAt', type: 'datetime' }
        ]
      }
    },
    {
      id: 'visitors',
      label: '撤离名册',
      collection: 'visitors',
      formTitle: '登记进洞',
      listTitle: '名册列表',
      submitLabel: '登记进洞',
      searchPlaceholder: '搜索姓名、团队、备注',
      searchFields: ['name', 'groupName', 'note'],
      statusField: 'status',
      statusOptions: ['在洞', '已核销'],
      titleFields: ['name'],
      relation: { collection: 'sites', localKey: 'siteId', labelFields: ['cave', 'zone', 'pointCode'] },
      summaryFields: ['note'],
      detailFields: [
        { label: '团队/批次', name: 'groupName' },
        { label: '核销人', name: 'checkedBy' },
        { label: '核销时间', name: 'checkedAt', type: 'datetime' }
      ],
      defaults: { status: '在洞' },
      fields: [
        { label: '姓名', name: 'name', required: true },
        { label: '团队/批次', name: 'groupName' },
        { label: '进洞样点', name: 'siteId', type: 'relation', collection: 'sites', labelFields: ['cave', 'zone', 'pointCode'], required: true, wide: true },
        { label: '备注', name: 'note', type: 'textarea', wide: true }
      ]
    },
    {
      id: 'events',
      label: '汛情单档案',
      collection: 'floodEvents',
      noForm: true,
      listTitle: '全部汛情单',
      searchPlaceholder: '搜索来水点、当班人、洞穴',
      searchFields: ['sourcePoint', 'dutyOfficer', 'cave'],
      statusField: 'status',
      statusOptions: ['未结束', '已销警'],
      extraStatusField: 'conclusion',
      titleFields: ['sourcePoint'],
      relation: { collection: 'sites', localKey: 'siteId', labelFields: ['cave', 'zone', 'pointCode'] },
      detailFields: [
        { label: '最新水位', name: 'latestLevel', suffix: ' m' },
        { label: '峰值水位', name: 'peakLevel', suffix: ' m' },
        { label: '警戒线', name: 'warningLevel', suffix: ' m' },
        { label: '上报次数', name: 'reportCount', suffix: ' 次' },
        { label: '退水复测', name: 'recedeLevel', suffix: ' m' },
        { label: '还差几人核销', name: 'remainingCount', suffix: ' 人', emphasize: true },
        { label: '当班人', name: 'dutyOfficer' },
        { label: '销警时间', name: 'clearedAt', type: 'datetime' }
      ]
    },
    {
      id: 'surveys',
      label: '巡测记录',
      collection: 'surveys',
      formTitle: '登记巡测',
      listTitle: '巡测历史',
      submitLabel: '保存巡测',
      searchPlaceholder: '搜索人员、干扰痕迹、照片',
      searchFields: ['surveyor', 'disturbance', 'photoUrl'],
      statusField: 'status',
      statusOptions: ['正常', '异常待复查', '已复查'],
      titleFields: ['surveyor', 'date'],
      relation: { collection: 'sites', localKey: 'siteId', labelFields: ['cave', 'zone', 'pointCode'] },
      summaryFields: ['disturbance', 'reviewNote'],
      detailFields: [
        { label: '温度', name: 'temperature' },
        { label: '湿度', name: 'humidity' },
        { label: 'CO2', name: 'co2' }
      ],
      defaults: { status: '正常', reviewNote: '' },
      fields: [
        { label: '样点', name: 'siteId', type: 'relation', collection: 'sites', labelFields: ['cave', 'zone', 'pointCode'], required: true, wide: true },
        { label: '巡测人员', name: 'surveyor', required: true },
        { label: '日期', name: 'date', type: 'date', required: true },
        { label: '温度', name: 'temperature', type: 'number', required: true },
        { label: '湿度', name: 'humidity', type: 'number', required: true },
        { label: 'CO2', name: 'co2', type: 'number', required: true },
        { label: '滴水频率', name: 'dripRate', type: 'number', required: true },
        { label: '照片链接', name: 'photoUrl' },
        { label: '游客干扰痕迹', name: 'disturbance', type: 'textarea', wide: true }
      ]
    },
    {
      id: 'sites',
      label: '样点档案',
      collection: 'sites',
      formTitle: '新增样点',
      listTitle: '样点列表',
      submitLabel: '保存样点',
      searchPlaceholder: '搜索洞穴、分区、样点、路线',
      searchFields: ['cave', 'zone', 'pointCode', 'route'],
      statusField: 'protectedStatus',
      statusOptions: ['常规观察', '重点保护', '暂停开放'],
      titleFields: ['pointCode', 'zone'],
      summaryFields: ['note'],
      detailFields: [
        { label: '洞穴', name: 'cave' },
        { label: '巡测路线', name: 'route' },
        { label: '敏感等级', name: 'sensitivity' },
        { label: '警戒线', name: 'warningLevel', suffix: ' m' },
        { label: '封洞状态', name: 'sealStatus' }
      ],
      defaults: { sealStatus: '开放' },
      fields: [
        { label: '洞穴', name: 'cave', required: true },
        { label: '分区', name: 'zone', required: true },
        { label: '样点编号', name: 'pointCode', required: true },
        { label: '巡测路线', name: 'route', required: true },
        { label: '敏感等级', name: 'sensitivity', type: 'select', options: ['低', '中', '高'] },
        { label: '保护状态', name: 'protectedStatus', type: 'select', options: ['常规观察', '重点保护', '暂停开放'] },
        { label: '警戒线水位', name: 'warningLevel', type: 'number', required: true },
        { label: '封洞状态', name: 'sealStatus', type: 'select', options: ['开放', '已封洞'] },
        { label: '基准温度', name: 'baselineTemp', type: 'number', required: true },
        { label: '基准湿度', name: 'baselineHumidity', type: 'number', required: true },
        { label: '基准CO2', name: 'baselineCo2', type: 'number', required: true },
        { label: '备注', name: 'note', type: 'textarea', wide: true }
      ]
    }
  ],
  actions: [
    { id: 'site-normal', label: '常规观察', collection: 'sites', patches: [{ field: 'protectedStatus', value: '常规观察' }] },
    { id: 'site-focus', label: '重点保护', collection: 'sites', patches: [{ field: 'protectedStatus', value: '重点保护' }] },
    { id: 'site-close', label: '暂停开放', collection: 'sites', danger: true, patches: [{ field: 'protectedStatus', value: '暂停开放' }] },
    {
      id: 'site-seal',
      label: '封洞',
      collection: 'sites',
      danger: true,
      visibleWhen: { field: 'sealStatus', values: ['开放'] },
      patches: [{ field: 'sealStatus', value: '已封洞' }]
    },
    {
      id: 'site-unseal',
      label: '恢复开放',
      collection: 'sites',
      visibleWhen: { field: 'sealStatus', values: ['已封洞'] },
      patches: [{ field: 'sealStatus', value: '开放' }]
    },
    {
      id: 'site-warning-correct',
      label: '更正警戒线',
      collection: 'sites',
      prompt: { message: '更正后警戒线水位（m）', field: 'warningLevel', type: 'number' },
      note: '警戒线更正为 {body.warningLevel}m，未销警结论重判',
      patches: [{ field: 'warningLevel', valuePath: 'body.warningLevel' }]
    },
    {
      id: 'visitor-check',
      label: '核销出洞',
      collection: 'visitors',
      visibleWhen: { field: 'status', values: ['在洞'] },
      prompt: { message: '核销值班员姓名', field: 'checkedBy' },
      note: '{body.checkedBy} 按名册核销出洞',
      patches: [
        { field: 'status', value: '已核销' },
        { field: 'checkedBy', valuePath: 'body.checkedBy' },
        { field: 'checkedAt', valuePath: 'now' }
      ]
    },
    {
      id: 'event-recede',
      label: '录入退水复测',
      collection: 'floodEvents',
      visibleWhen: { field: 'status', values: ['未结束'] },
      prompt: { message: '退水复测水位（m）', field: 'recedeLevel', type: 'number' },
      note: '退水复测 {body.recedeLevel}m',
      patches: [{ field: 'recedeLevel', valuePath: 'body.recedeLevel' }]
    },
    {
      id: 'event-clear',
      label: '销警',
      collection: 'floodEvents',
      visibleWhen: { field: 'status', values: ['未结束'] },
      relation: { collection: 'sites', localKey: 'siteId' },
      note: '名册清零，退水复测 {item.recedeLevel}m，销警',
      guards: [
        { left: 'item.status', op: 'eq', right: '未结束', message: '汛情单已销警，无需重复操作' },
        { left: 'item.remainingCount', op: 'eq', right: 0, message: '洞内还有 {item.remainingCount} 人未核销，不能直接销警' },
        { left: 'item.recedeLevel', op: 'missing', message: '请先录入退水复测值再销警' },
        { left: 'item.recedeLevel', op: 'lt', rightPath: 'related.warningLevel', message: '退水复测 {item.recedeLevel}m 仍达警戒线 {related.warningLevel}m，不能销警' }
      ],
      patches: [
        { field: 'status', value: '已销警' },
        { field: 'conclusion', value: '已销警' },
        { field: 'clearedAt', valuePath: 'now' }
      ]
    },
    {
      id: 'report-correct',
      label: '更正读数',
      collection: 'floodReports',
      prompt: { message: '更正后洞口水位（m）', field: 'waterLevel', type: 'number' },
      note: '洞口水位更正为 {body.waterLevel}m，未销警结论重判',
      patches: [{ field: 'waterLevel', valuePath: 'body.waterLevel' }]
    },
    {
      id: 'survey-alert',
      label: '标记异常',
      collection: 'surveys',
      relation: { collection: 'sites', localKey: 'siteId' },
      patches: [
        { field: 'status', value: '异常待复查' },
        { target: 'related', field: 'protectedStatus', value: '重点保护' }
      ]
    },
    { id: 'survey-review', label: '完成复查', collection: 'surveys', patches: [{ field: 'status', value: '已复查' }, { field: 'reviewNote', value: '异常已复核' }] }
  ]
};
