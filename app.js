/*
 * 川赔通 · 页面交互与报告渲染
 */
'use strict';

(function () {
  function $(id) { return document.getElementById(id); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function money(value) {
    return '¥' + Calculator.fmtMoney(value);
  }

  var ITEM_ICONS = {
    severance: '⚖️',
    notice: '📢',
    doubleWage: '📄',
    overtime: '⏰',
    annual: '🌴',
    probation: '⏳',
    none: 'ℹ️'
  };

  var EVIDENCE_ICONS = {
    termination: '📌',
    forced: '✉️',
    doubleWage: '🪪',
    overtime: '📋',
    annual: '🗓️',
    probation: '📝'
  };

  var SCENARIO_ORDER = [
    'negotiate',
    'forced',
    'expire',
    'incompetent',
    'medical',
    'objective',
    'illegal',
    'resign',
    'expire_keep',
    'fault'
  ];

  var CLAIM_FIELDS = {
    doubleWage: { enabled: 'dwEnabled', body: 'dwBody', map: { signed: 'dwSigned', signDate: 'dwSignDate', monthlyWage: 'dwWage' } },
    overtime: { enabled: 'otEnabled', body: 'otBody', map: { baseWage: 'otBase', weekdayHours: 'otWeekday', weekendHours: 'otWeekend', holidayHours: 'otHoliday' } },
    annual: { enabled: 'anEnabled', body: 'anBody', map: { serviceYears: 'anYears', unpaidDays: 'anDays' } },
    probation: { enabled: 'pbEnabled', body: 'pbBody', map: { contractMonths: 'pbContract', openEnded: 'pbOpen', agreedMonths: 'pbAgreed', servedMonths: 'pbServed', postWage: 'pbWage' } }
  };

  var grid = $('scenarioGrid');
  SCENARIO_ORDER.forEach(function (key) {
    var scenario = Calculator.SCENARIOS[key];
    var card = el('label', 'scenario-card');
    var input = el('input');
    input.type = 'radio';
    input.name = 'scenario';
    input.value = key;
    if (key === 'negotiate') input.checked = true;
    input.addEventListener('change', onScenarioChange);
    card.appendChild(input);
    card.appendChild(el('span', 'sc-box'));
    card.appendChild(el('span', 'sc-title', scenario.label));
    var tagClass = scenario.comp === '2N' ? 'tag-danger' : scenario.comp === '—' ? 'tag-muted' : scenario.comp === 'N+1' ? 'tag-warn' : 'tag-ok';
    card.appendChild(el('span', 'sc-tag ' + tagClass, scenario.comp === '—' ? '无补偿' : scenario.comp));
    grid.appendChild(card);
  });

  function currentScenario() {
    var checked = document.querySelector('input[name="scenario"]:checked');
    return checked ? checked.value : 'negotiate';
  }

  function onScenarioChange() {
    var scenario = Calculator.SCENARIOS[currentScenario()];
    $('scenarioHint').textContent = '依据：' + scenario.law;
    var cards = document.querySelectorAll('.scenario-card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.toggle('selected', !!cards[i].querySelector('input').checked);
    }
    $('noticeBlock').classList.toggle('hidden', scenario.comp !== 'N+1');
  }

  function bindToggle(checkboxId, bodyId) {
    $(checkboxId).addEventListener('change', function () {
      $(bodyId).classList.toggle('hidden', !this.checked);
    });
  }

  bindToggle('dwEnabled', 'dwBody');
  bindToggle('otEnabled', 'otBody');
  bindToggle('anEnabled', 'anBody');
  bindToggle('pbEnabled', 'pbBody');

  function updateAnnualHint() {
    var days = Calculator.annualLeaveDays(Number($('anYears').value) || 0);
    $('anHint').textContent = days > 0 ? '按累计工龄，全年应休年休假 ' + days + ' 天' : '累计工龄满1年方可享受带薪年休假';
  }

  function updateProbationHint() {
    var open = $('pbOpen').checked;
    var months = Number($('pbContract').value) || 0;
    if (!open && !months) {
      $('pbHint').textContent = '';
      return;
    }
    var max = Calculator.maxProbationMonths(months, open);
    $('pbHint').textContent = max > 0 ? '当前合同期限的法定试用期上限：' + max + ' 个月' : '合同期限不满3个月，不得约定试用期';
  }

  $('anYears').addEventListener('input', updateAnnualHint);
  $('pbContract').addEventListener('input', updateProbationHint);
  $('pbOpen').addEventListener('change', updateProbationHint);

  function setClaim(key, data) {
    var config = CLAIM_FIELDS[key];
    var enabled = !!(data && data.enabled);
    $(config.enabled).checked = enabled;
    $(config.body).classList.toggle('hidden', !enabled);
    Object.keys(config.map).forEach(function (field) {
      var element = $(config.map[field]);
      var value = data ? data[field] : undefined;
      if (element.type === 'checkbox') {
        element.checked = !!value;
      } else if (value === undefined || value === null || value === '' || Number(value) === 0) {
        element.value = '';
      } else {
        element.value = value;
      }
    });
  }

  function fillForm(input) {
    var radio = document.querySelector('input[name="scenario"][value="' + input.scenario + '"]');
    if (radio) {
      radio.checked = true;
      onScenarioChange();
    }
    $('joinDate').value = input.joinDate || '';
    $('leaveDate').value = input.leaveDate || '';
    $('avgWage').value = input.avgWage || '';
    $('lastMonthWage').value = input.lastMonthWage || '';
    $('notified30').checked = !!input.notified30;
    $('localAvgWage').value = input.localAvgWage || '';
    $('minWage').value = input.minWage || '';
    $('split2008').checked = !!input.split2008;
    var claims = input.claims || {};
    setClaim('doubleWage', claims.doubleWage);
    setClaim('overtime', claims.overtime);
    setClaim('annual', claims.annual);
    setClaim('probation', claims.probation);
    updateAnnualHint();
    updateProbationHint();
  }

  function readForm() {
    return {
      scenario: currentScenario(),
      joinDate: $('joinDate').value,
      leaveDate: $('leaveDate').value,
      avgWage: Number($('avgWage').value) || 0,
      lastMonthWage: Number($('lastMonthWage').value) || 0,
      notified30: $('notified30').checked,
      localAvgWage: Number($('localAvgWage').value) || 0,
      minWage: Number($('minWage').value) || 0,
      split2008: $('split2008').checked,
      claims: {
        doubleWage: { enabled: $('dwEnabled').checked, signed: $('dwSigned').checked, signDate: $('dwSignDate').value, monthlyWage: Number($('dwWage').value) || 0 },
        overtime: { enabled: $('otEnabled').checked, baseWage: Number($('otBase').value) || 0, weekdayHours: Number($('otWeekday').value) || 0, weekendHours: Number($('otWeekend').value) || 0, holidayHours: Number($('otHoliday').value) || 0 },
        annual: { enabled: $('anEnabled').checked, serviceYears: Number($('anYears').value) || 0, unpaidDays: Number($('anDays').value) || 0 },
        probation: { enabled: $('pbEnabled').checked, contractMonths: Number($('pbContract').value) || 0, openEnded: $('pbOpen').checked, agreedMonths: Number($('pbAgreed').value) || 0, servedMonths: Number($('pbServed').value) || 0, postWage: Number($('pbWage').value) || 0 }
      }
    };
  }

  function deadlineStatus(deadline) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var days = Math.round((deadline - today) / 86400000);
    if (days < 0) return { cls: 'danger', text: '已逾期 ' + (-days) + ' 天（一般时效，建议尽快咨询专业人士）' };
    if (days === 0) return { cls: 'danger', text: '仲裁时效今日届满，请立即申请仲裁！' };
    if (days <= 90) return { cls: 'danger', text: '距届满仅剩 ' + days + ' 天，请尽快申请仲裁' };
    return { cls: 'ok', text: '距时效届满还有 ' + days + ' 天' };
  }

  function renderResult(result) {
    var section = $('resultSection');
    section.innerHTML = '';
    section.classList.remove('hidden');

    if (!result.ok) {
      var errorBox = el('div', 'error-box');
      errorBox.appendChild(el('h2', null, '无法计算'));
      (result.errors || ['输入有误。']).forEach(function (message) {
        errorBox.appendChild(el('p', null, message));
      });
      section.appendChild(errorBox);
      return;
    }

    var report = el('div', 'report');

    var head = el('div', 'report-head');
    head.appendChild(el('h2', null, '劳动争议赔偿测算报告'));
    head.appendChild(el('p', 'report-meta', '生成时间：' + new Date().toLocaleString('zh-CN') + '　·　离职情形：' + result.scenario.label));
    report.appendChild(head);

    var totalCard = el('div', 'total-card');
    totalCard.appendChild(el('div', 'total-label', '可主张金额合计（测算）'));
    totalCard.appendChild(el('div', 'total-amount', money(result.total)));
    report.appendChild(totalCard);

    result.items.forEach(function (item) {
      var card = el('div', 'item-card');
      var top = el('div', 'item-top');
      var titleWrap = el('div', 'item-title-wrap');
      titleWrap.appendChild(el('span', 'item-icon', ITEM_ICONS[item.key] || '💰'));
      titleWrap.appendChild(el('div', 'item-title', item.title));
      top.appendChild(titleWrap);
      top.appendChild(el('div', 'item-amount', money(item.amount)));
      card.appendChild(top);
      var lines = el('ul', 'calc-lines');
      item.lines.forEach(function (line) {
        lines.appendChild(el('li', null, line));
      });
      card.appendChild(lines);
      card.appendChild(el('div', 'law-tag', '依据：' + item.law));
      if (item.note) card.appendChild(el('p', 'item-note', item.note));
      report.appendChild(card);
    });

    result.warnings.forEach(function (warning) {
      report.appendChild(el('div', warning.level === 'warn' ? 'warn-box' : 'info-box', warning.text));
    });

    var status = deadlineStatus(result.deadline);
    var deadlineBox = el('div', 'deadline-box ' + status.cls);
    deadlineBox.appendChild(el('strong', null, '仲裁时效提醒'));
    deadlineBox.appendChild(el('p', null, '劳动争议申请仲裁的时效期间为一年，本案时效期至 ' + result.deadlineText + '。' + status.text + '。'));
    report.appendChild(deadlineBox);

    if (result.evidence.length) {
      var evidenceBox = el('div', 'evidence-box');
      evidenceBox.appendChild(el('h3', null, '🧾 建议收集的证据'));
      result.evidence.forEach(function (group) {
        evidenceBox.appendChild(el('h4', null, (EVIDENCE_ICONS[group.key] || '📁') + ' ' + group.title));
        var list = el('ul', 'evidence-list');
        group.list.forEach(function (item) {
          list.appendChild(el('li', null, item));
        });
        evidenceBox.appendChild(list);
      });
      report.appendChild(evidenceBox);
    }

    var stepsBox = el('div', 'steps-box');
    stepsBox.appendChild(el('h3', null, '🚀 下一步建议'));
    var stepList = el('ol', 'steps-list');
    [
      '按上述清单整理并备份证据原件，电子证据注意保留原始载体。',
      '向用人单位所在地或劳动合同履行地的劳动人事争议仲裁委员会提交仲裁申请（不收费）。',
      '关注一年仲裁时效；拖欠劳动报酬争议在劳动关系存续期间不受一年时效限制，离职后一年内提出。'
    ].forEach(function (step) {
      stepList.appendChild(el('li', null, step));
    });
    stepsBox.appendChild(stepList);
    report.appendChild(stepsBox);

    report.appendChild(el('p', 'report-disclaimer', '免责声明：本报告由课程作业演示工具生成，仅供参考，不构成法律意见。具体案件请咨询执业律师或当地劳动人事争议仲裁机构。'));

    var actions = el('div', 'report-actions');
    var printButton = el('button', 'btn-print', '打印 / 导出 PDF');
    printButton.type = 'button';
    printButton.addEventListener('click', function () {
      window.print();
    });
    actions.appendChild(printButton);
    report.appendChild(actions);

    section.appendChild(report);
  }

  var demoSelect = $('demoCase');
  TEST_CASES.forEach(function (testCase, index) {
    if (testCase.expectError) return;
    var option = el('option', null, testCase.name);
    option.value = String(index);
    demoSelect.appendChild(option);
  });

  demoSelect.addEventListener('change', function () {
    if (this.value === '') return;
    fillForm(TEST_CASES[Number(this.value)].input);
  });

  $('btnCalc').addEventListener('click', function () {
    renderResult(Calculator.calculate(readForm()));
    $('resultSection').scrollIntoView({ behavior: 'smooth' });
  });

  $('btnReset').addEventListener('click', function () {
    $('calcForm').reset();
    setClaim('doubleWage', null);
    setClaim('overtime', null);
    setClaim('annual', null);
    setClaim('probation', null);
    onScenarioChange();
    updateAnnualHint();
    updateProbationHint();
    demoSelect.value = '';
    $('resultSection').classList.add('hidden');
    $('resultSection').innerHTML = '';
  });

  $('calcForm').addEventListener('submit', function (event) {
    event.preventDefault();
  });

  onScenarioChange();
  updateAnnualHint();
  updateProbationHint();
})();
