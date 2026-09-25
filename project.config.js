module.exports = {
  port: 3912,
  title: '钟乳石洞穴微环境巡测',
  lede: '雨季上游涨水，巡测页即汛情接力台：登记来水点与洞口水情，达警戒线自动开单并逐报累加；封洞、撤离名册逐人核销、退水复测全部完成才可销警，读数或警戒线更正后未销警结论失效重判。',
  tones: {
    '常规观察': 'ok',
    '正常': 'ok',
    '已复查': 'ok',
    '重点保护': 'warn',
    '异常待复查': 'bad',
    '暂停开放': 'bad',
    '未结束': 'bad',
    '已销警': 'ok',
    '达警戒': 'bad',
    '低于警戒·待复测': 'warn',
    '已退水·待核销': 'warn',
    '可销警': 'ok',
    '警戒线缺失': 'bad'
  },
  collections: {
    sites: { label: '样点档案' },
    surveys: { label: '巡测记录' },
    floodReports: { label: '水情上报' },
    floodEvents: { label: '汛情单' }
  },
  stats: [
    { label: '未结束汛情单', collection: 'floodEvents', filter: { field: 'status', value: '未结束' } },
    { label: '待核销人数', collection: 'floodEvents', pendingRoster: true },
    { label: '今日水情上报', collection: 'floodReports', today: true },
    { label: '封洞中洞口', collection: 'floodEvents', filter: { field: 'caveSealed', value: true } }
  ],
  views: [
    {
      id: 'dashboard',
      label: '趋势看板',
      type: 'dashboard',
      focusTitle: '未结束汛情单',
      focus: { collection: 'floodEvents', field: 'status', values: ['未结束'], limit: 8 }
    },
    {
      id: 'flood',
      label: '汛情接力台',
      type: 'flood',
      collection: 'floodEvents',
      reportCollection: 'floodReports',
      statusField: 'status',
      statusOptions: ['未结束', '已销警'],
      formTitle: '登记来水水情',
      listTitle: '汛情单接力',
      submitLabel: '上报水情',
      searchPlaceholder: '搜索当班人、备注',
      searchFields: ['dutyOfficer', 'note'],
      fields: [
        { label: '来水点（样点）', name: 'siteId', type: 'relation', collection: 'sites', labelFields: ['cave', 'zone', 'pointCode'], required: true, wide: true },
        { label: '观测时间', name: 'observedAt', type: 'datetime-local', required: true },
        { label: '洞口水位(cm)', name: 'waterLevel', type: 'number', required: true },
        { label: '上涨速率(cm/h)', name: 'riseRate', type: 'number' },
        { label: '当班人', name: 'dutyOfficer', required: true },
        { label: '水情备注', name: 'note', type: 'textarea', wide: true }
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
        { label: '洞口水位警戒线(cm)', name: 'floodWarnLevel' }
      ],
      fields: [
        { label: '洞穴', name: 'cave', required: true },
        { label: '分区', name: 'zone', required: true },
        { label: '样点编号', name: 'pointCode', required: true },
        { label: '巡测路线', name: 'route', required: true },
        { label: '敏感等级', name: 'sensitivity', type: 'select', options: ['低', '中', '高'] },
        { label: '保护状态', name: 'protectedStatus', type: 'select', options: ['常规观察', '重点保护', '暂停开放'] },
        { label: '洞口水位警戒线(cm)', name: 'floodWarnLevel', type: 'number', required: true },
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
    { id: 'site-close', label: '暂停开放', collection: 'sites', danger: true, patches: [{ field: 'protectedStatus', value: '暂停开放' }] }
  ]
};
