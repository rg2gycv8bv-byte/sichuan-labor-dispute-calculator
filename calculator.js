/*
 * 川赔通 · 四川省劳动争议赔偿计算器 —— 核心计算逻辑
 * 纯函数实现，无 DOM 依赖，浏览器与 Node.js 均可运行。
 *
 * 主要计算口径：
 * - 经济补偿年限系数：每满一年支付一个月工资；六个月以上不满一年的按一年计算；
 *   不满六个月的支付半个月工资（《劳动合同法》第47条）。
 * - 月平均工资高于本地区上年度职工月平均工资三倍的，按三倍支付，
 *   支付年限最高不超过十二年。
 * - 未签书面合同二倍工资差额按自然月计数（不足整月按一个月计），最多11个月。
 * - 加班费：工作日延时150%、休息日未补休200%、法定节假日300%；
 *   日工资 = 月工资 ÷ 21.75，时薪 = 日工资 ÷ 8。
 * - 社平工资与最低工资为可配置参数，默认值为示例数据，
 *   正式使用前请以四川省人力资源和社会保障厅最新公布数据更新。
 */
'use strict';

var DAY_MS = 24 * 60 * 60 * 1000;
var DATE_2008_01_01 = new Date(2008, 0, 1);

var SCENARIOS = {
  negotiate: {
    label: '协商一致解除（用人单位提出）',
    comp: 'N',
    law: '《劳动合同法》第36、46、47条'
  },
  forced: {
    label: '被迫解除（拖欠工资、未缴社保等）',
    comp: 'N',
    law: '《劳动合同法》第38、46、47条'
  },
  expire: {
    label: '合同期满，单位不续签或降低条件续签',
    comp: 'N',
    law: '《劳动合同法》第44、46、47条'
  },
  incompetent: {
    label: '不能胜任工作解除',
    comp: 'N+1',
    law: '《劳动合同法》第40条第2项、《实施条例》第20条'
  },
  medical: {
    label: '医疗期满不能从事工作解除',
    comp: 'N+1',
    law: '《劳动合同法》第40条第1项、《实施条例》第20条'
  },
  objective: {
    label: '客观情况重大变化解除',
    comp: 'N+1',
    law: '《劳动合同法》第40条第3项、《实施条例》第20条'
  },
  illegal: {
    label: '违法解除 / 无理由辞退',
    comp: '2N',
    law: '《劳动合同法》第87条'
  },
  resign: {
    label: '劳动者主动辞职（个人原因）',
    comp: '—',
    law: '《劳动合同法》第37条'
  },
  expire_keep: {
    label: '期满单位维持条件续签，劳动者不愿续',
    comp: '—',
    law: '《劳动合同法》第46条第5项'
  },
  fault: {
    label: '过失性辞退（第39条情形）',
    comp: '—',
    law: '《劳动合同法》第39条'
  }
};

var SCENARIO_NOTES = {
  negotiate: '协商一致解除需由用人单位提出；劳动者主动提出的通常无经济补偿。',
  forced: '需单位存在拖欠工资、未缴社保等第38条过错情形；建议以书面方式（EMS邮寄）通知解除并保留凭证。',
  expire: '单位维持或提高原合同条件续签而劳动者不同意续签的，无经济补偿。',
  incompetent: '单位应先培训或调岗，仍不能胜任方可解除，并需事先通知工会；程序违法可能被认定为违法解除（2N）。',
  medical: '需医疗期满后不能从事原工作，也不能从事另行安排的工作，并需提前30日通知或支付代通知金。',
  objective: '需客观情况发生重大变化且协商未达成变更协议，并需提前30日通知或支付代通知金。',
  illegal: '主张违法解除赔偿金（2N）后，同一解除行为不再重复主张经济补偿（N）；若仲裁认定解除合法，则按N处理。',
  resign: '个人原因辞职通常无经济补偿；若单位存在第38条过错情形，可考虑主张被迫解除（N）。',
  expire_keep: '单位维持或提高劳动合同约定条件续签，劳动者不同意续签的，无需支付经济补偿。',
  fault: '第39条过失性辞退无需支付经济补偿；单位需对劳动者的过错事实承担举证责任。'
};

var EVIDENCE = {
  termination: ['辞退通知书 / 解除劳动合同通知书', '微信、钉钉等工作沟通记录', '与负责人谈话录音', '工资银行流水', '考勤记录'],
  forced: ['拖欠工资期间的工资流水对比', '社保缴费记录', '被迫解除通知书及EMS邮寄凭证'],
  doubleWage: ['工资银行流水', '社保缴费记录', '工牌 / 工服 / 门禁卡', '入职登记表', '工作沟通记录'],
  overtime: ['考勤 / 打卡记录', '排班表', '加班审批单', '工作群聊天记录'],
  annual: ['年假申请与审批记录', '考勤记录'],
  probation: ['劳动合同', '试用期考核材料', '工资条']
};

var EVIDENCE_GROUPS = {
  termination: '解除 / 终止类',
  forced: '被迫解除类',
  doubleWage: '劳动关系存续类',
  overtime: '加班类',
  annual: '年休假类',
  probation: '试用期类'
};

function toDate(value) {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  if (value === null || value === undefined || value === '') return null;
  var parts = String(value).trim().split('-');
  if (parts.length !== 3) return null;
  var year = parseInt(parts[0], 10);
  var month = parseInt(parts[1], 10);
  var day = parseInt(parts[2], 10);
  if (!year || !month || !day) return null;
  var date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function addDays(date, count) {
  var result = toDate(date);
  result.setDate(result.getDate() + count);
  return result;
}

function addMonths(date, count) {
  var result = toDate(date);
  var day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + count);
  var lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

function addYears(date, count) {
  return addMonths(date, count * 12);
}

function fmtDate(date) {
  var value = toDate(date);
  if (!value) return '';
  var month = String(value.getMonth() + 1);
  var day = String(value.getDate());
  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;
  return value.getFullYear() + '-' + month + '-' + day;
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function fmtMoney(value) {
  var number = round2(value);
  var parts = number.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts[0] + '.' + parts[1];
}

function coefficientPost2008(startDate, endDate) {
  var start = toDate(startDate);
  var end = toDate(endDate);
  if (!start || !end || end < start) return 0;
  var years = end.getFullYear() - start.getFullYear();
  var anchor = addYears(start, years);
  if (anchor > end) {
    years -= 1;
    anchor = addYears(start, years);
  }
  var coefficient = years;
  if (addMonths(anchor, 6) <= end) {
    coefficient += 1;
  } else if (end > anchor) {
    coefficient += 0.5;
  }
  return Math.max(coefficient, 0);
}

function coefficientPre2008(startDate, endDate) {
  var start = toDate(startDate);
  var end = toDate(endDate);
  if (!start || !end || end < start) return 0;
  var years = end.getFullYear() - start.getFullYear();
  if (addYears(start, years) > end) years -= 1;
  var anchor = addYears(start, years);
  if (end > anchor) years += 1;
  return Math.max(Math.min(years, 12), 0);
}

function severanceCoefficient(startDate, endDate, split2008) {
  var start = toDate(startDate);
  var end = toDate(endDate);
  if (!start || !end) return 0;
  if (!split2008 || start >= DATE_2008_01_01) return coefficientPost2008(start, end);
  if (end < DATE_2008_01_01) return coefficientPre2008(start, end);
  return coefficientPre2008(start, addDays(DATE_2008_01_01, -1)) + coefficientPost2008(DATE_2008_01_01, end);
}

function severancePay(options) {
  var wage = Number(options.avgWage);
  var cap = Number(options.localAvgWage) * 3;
  var capped = wage > cap;
  var base = capped ? cap : wage;
  var coefficient = severanceCoefficient(options.joinDate, options.leaveDate, !!options.split2008);
  if (capped) coefficient = Math.min(coefficient, 12);
  return { amount: round2(base * coefficient), base: base, coefficient: coefficient, capped: capped };
}

function doubleWageDetail(joinDate, signDate, leaveDate) {
  var join = toDate(joinDate);
  if (!join) return { months: 0, start: null, end: null };
  var start = addDays(addMonths(join, 1), 1);
  var hardEnd = addDays(addYears(join, 1), -1);
  var end = toDate(leaveDate) || hardEnd;
  if (signDate) {
    var signEnd = addDays(toDate(signDate), -1);
    if (signEnd && signEnd < end) end = signEnd;
  }
  if (end > hardEnd) end = hardEnd;
  if (end < start) return { months: 0, start: null, end: null };
  var months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  months = Math.max(0, Math.min(months, 11));
  return { months: months, start: months > 0 ? start : null, end: months > 0 ? end : null };
}

function doubleWageMonths(joinDate, signDate, leaveDate) {
  return doubleWageDetail(joinDate, signDate, leaveDate).months;
}

function overtimePay(options) {
  var base = Number(options.monthlyWage);
  var daily = base / 21.75;
  var hourly = daily / 8;
  var weekday = round2((Number(options.weekdayHours) || 0) * hourly * 1.5);
  var weekend = round2((Number(options.weekendHours) || 0) * hourly * 2);
  var holiday = round2((Number(options.holidayHours) || 0) * hourly * 3);
  return { daily: daily, hourly: hourly, weekday: weekday, weekend: weekend, holiday: holiday, total: round2(weekday + weekend + holiday) };
}

function annualLeaveDays(totalYears) {
  var years = Number(totalYears) || 0;
  if (years < 1) return 0;
  if (years < 10) return 5;
  if (years < 20) return 10;
  return 15;
}

function annualLeavePay(options) {
  var daily = Number(options.avgWage) / 21.75;
  return round2((Number(options.unpaidDays) || 0) * daily * 2);
}

function maxProbationMonths(contractMonths, openEnded) {
  if (openEnded) return 6;
  var months = Number(contractMonths) || 0;
  if (months < 3) return 0;
  if (months < 12) return 1;
  if (months < 36) return 2;
  return 6;
}

function probationPenalty(options) {
  var legal = maxProbationMonths(options.contractMonths, options.openEnded);
  var served = Math.min(Number(options.agreedMonths) || 0, Number(options.servedMonths) || 0);
  var excess = Math.max(served - legal, 0);
  return { legal: legal, excess: excess, amount: round2(excess * Number(options.postWage)) };
}

function arbitrationDeadline(leaveDate) {
  var leave = toDate(leaveDate);
  return leave ? addYears(leave, 1) : null;
}

function validateInputs(inputs) {
  var errors = [];
  if (!inputs || !SCENARIOS[inputs.scenario]) {
    errors.push('请选择离职情形。');
    return errors;
  }
  var join = toDate(inputs.joinDate);
  var leave = toDate(inputs.leaveDate);
  if (!join) errors.push('请填写正确的入职日期。');
  if (!leave) errors.push('请填写正确的解除/离职日期。');
  if (join && leave && leave <= join) errors.push('解除/离职日期必须晚于入职日期。');
  if (!(Number(inputs.avgWage) > 0)) errors.push('请填写离职前12个月平均应发工资。');
  if (!(Number(inputs.localAvgWage) > 0)) errors.push('请填写上年度职工月平均工资参数。');
  if (!(Number(inputs.minWage) > 0)) errors.push('请填写当地最低工资参数。');
  var scenario = SCENARIOS[inputs.scenario];
  if (scenario.comp === 'N+1' && !inputs.notified30 && !(Number(inputs.lastMonthWage) > 0)) {
    errors.push('未提前30日书面通知的，请填写解除前上一个月工资（用于计算代通知金）。');
  }
  var claims = inputs.claims || {};
  if (claims.doubleWage && claims.doubleWage.enabled) {
    if (!(Number(claims.doubleWage.monthlyWage) > 0)) errors.push('未签合同二倍工资：请填写未签期间月工资。');
    if (claims.doubleWage.signed) {
      var signDate = toDate(claims.doubleWage.signDate);
      if (!signDate) errors.push('未签合同二倍工资：已补签的请填写补签日期。');
      else if (join && signDate < join) errors.push('未签合同二倍工资：补签日期不能早于入职日期。');
    }
  }
  if (claims.overtime && claims.overtime.enabled) {
    if (!(Number(claims.overtime.baseWage) > 0)) errors.push('加班费：请填写加班工资计算基数。');
    ['weekdayHours', 'weekendHours', 'holidayHours'].forEach(function (key) {
      var value = Number(claims.overtime[key]);
      if (isNaN(value) || value < 0) errors.push('加班费：加班小时数不能为负数。');
    });
  }
  if (claims.annual && claims.annual.enabled) {
    var years = Number(claims.annual.serviceYears);
    if (isNaN(years) || years < 0) errors.push('年休假：累计工龄不能为负数。');
    var days = Number(claims.annual.unpaidDays);
    if (isNaN(days) || days < 0) errors.push('年休假：未休天数不能为负数。');
  }
  if (claims.probation && claims.probation.enabled) {
    if (!claims.probation.openEnded && !(Number(claims.probation.contractMonths) > 0)) {
      errors.push('试用期：请填写合同期限（月）。');
    }
    var agreed = Number(claims.probation.agreedMonths);
    var served = Number(claims.probation.servedMonths);
    if (isNaN(agreed) || agreed < 0) errors.push('试用期：约定试用期不能为负数。');
    if (isNaN(served) || served < 0) errors.push('试用期：已履行试用期不能为负数。');
    if (!(Number(claims.probation.postWage) > 0)) errors.push('试用期：请填写转正后月工资。');
  }
  return errors;
}

function calculate(inputs) {
  var errors = validateInputs(inputs);
  if (errors.length) return { ok: false, errors: errors };

  var scenario = SCENARIOS[inputs.scenario];
  var join = toDate(inputs.joinDate);
  var leave = toDate(inputs.leaveDate);
  var items = [];
  var warnings = [];
  var evidenceKeys = [];
  var total = 0;

  function addEvidence(key) {
    if (EVIDENCE[key] && evidenceKeys.indexOf(key) < 0) evidenceKeys.push(key);
  }

  var minWage = Number(inputs.minWage);
  var avgWage = Number(inputs.avgWage);
  if (avgWage < minWage) {
    avgWage = minWage;
    warnings.push({ level: 'warn', text: '填写的月平均工资低于当地最低工资标准，已按最低工资 ' + fmtMoney(minWage) + ' 元/月作为计算基数。' });
  }
  warnings.push({ level: 'info', text: '社平工资、最低工资为内置示例参数，正式使用前请以四川省人力资源和社会保障厅最新公布数据更新。' });

  if (scenario.comp === 'N' || scenario.comp === 'N+1' || scenario.comp === '2N') {
    addEvidence('termination');
    if (inputs.scenario === 'forced') addEvidence('forced');
    var severance = severancePay({
      joinDate: join,
      leaveDate: leave,
      avgWage: avgWage,
      localAvgWage: Number(inputs.localAvgWage),
      split2008: inputs.split2008
    });
    var lines = [
      '工作年限：' + fmtDate(join) + ' 至 ' + fmtDate(leave) + '，折算系数 ' + severance.coefficient,
      '计算基数：' + fmtMoney(severance.base) + ' 元/月' + (severance.capped ? '（已按社平工资3倍封顶，年限最高不超过12年）' : '')
    ];
    if (scenario.comp === '2N') {
      var amount = round2(severance.amount * 2);
      lines.push('赔偿金 = 2 × ' + severance.coefficient + ' × ' + fmtMoney(severance.base) + ' = ' + fmtMoney(amount) + ' 元');
      items.push({ key: 'severance', title: '违法解除赔偿金（2N）', amount: amount, lines: lines, law: scenario.law, note: SCENARIO_NOTES.illegal });
      total += amount;
    } else {
      lines.push('经济补偿金 = ' + severance.coefficient + ' × ' + fmtMoney(severance.base) + ' = ' + fmtMoney(severance.amount) + ' 元');
      items.push({ key: 'severance', title: '经济补偿金（N）', amount: severance.amount, lines: lines, law: scenario.law, note: SCENARIO_NOTES[inputs.scenario] });
      total += severance.amount;
      if (scenario.comp === 'N+1' && !inputs.notified30) {
        var notice = round2(Number(inputs.lastMonthWage));
        items.push({
          key: 'notice',
          title: '代通知金（+1）',
          amount: notice,
          lines: ['未提前30日书面通知解除，额外支付1个月工资', '解除前上一个月工资标准：' + fmtMoney(notice) + ' 元'],
          law: '《劳动合同法》第40条、《劳动合同法实施条例》第20条'
        });
        total += notice;
      }
    }
  } else {
    items.push({
      key: 'none',
      title: '经济补偿 / 赔偿金',
      amount: 0,
      lines: ['按所选情形，通常无需支付经济补偿或赔偿金。'],
      law: scenario.law,
      note: SCENARIO_NOTES[inputs.scenario]
    });
  }

  var claims = inputs.claims || {};

  if (claims.doubleWage && claims.doubleWage.enabled) {
    addEvidence('doubleWage');
    var detail = doubleWageDetail(join, claims.doubleWage.signed ? claims.doubleWage.signDate : null, leave);
    var dwWage = Number(claims.doubleWage.monthlyWage);
    if (dwWage < minWage) {
      dwWage = minWage;
      warnings.push({ level: 'warn', text: '未签期间月工资低于最低工资，二倍工资已按 ' + fmtMoney(minWage) + ' 元/月计算。' });
    }
    var dwAmount = round2(detail.months * dwWage);
    items.push({
      key: 'doubleWage',
      title: '未签书面合同二倍工资差额',
      amount: dwAmount,
      lines: detail.months > 0 ? [
        '二倍工资期间：' + fmtDate(detail.start) + ' 至 ' + fmtDate(detail.end),
        '共 ' + detail.months + ' 个月 × ' + fmtMoney(dwWage) + ' 元/月 = ' + fmtMoney(dwAmount) + ' 元'
      ] : ['用工未满一个月，或已在一个月内及时补签合同，无二倍工资差额。'],
      law: '《劳动合同法》第82条、《劳动合同法实施条例》第6、7条',
      note: '二倍工资差额按自然月计数（不足整月按一个月计，最多11个月）；四川实践中一般适用一年仲裁时效，建议尽快主张。'
    });
    total += dwAmount;
  }

  if (claims.overtime && claims.overtime.enabled) {
    addEvidence('overtime');
    var otBase = Number(claims.overtime.baseWage);
    if (otBase < minWage) {
      otBase = minWage;
      warnings.push({ level: 'warn', text: '加班费计算基数低于最低工资，已按 ' + fmtMoney(minWage) + ' 元/月计算。' });
    }
    var breakdown = overtimePay({
      monthlyWage: otBase,
      weekdayHours: claims.overtime.weekdayHours,
      weekendHours: claims.overtime.weekendHours,
      holidayHours: claims.overtime.holidayHours
    });
    if (breakdown.total > 0) {
      items.push({
        key: 'overtime',
        title: '加班费',
        amount: breakdown.total,
        lines: [
          '日工资 = ' + fmtMoney(otBase) + ' ÷ 21.75 = ' + fmtMoney(breakdown.daily) + ' 元，时薪 = ' + fmtMoney(breakdown.hourly) + ' 元',
          '工作日延时加班 ' + (Number(claims.overtime.weekdayHours) || 0) + ' 小时 × ' + fmtMoney(breakdown.hourly) + ' × 150% = ' + fmtMoney(breakdown.weekday) + ' 元',
          '休息日加班未补休 ' + (Number(claims.overtime.weekendHours) || 0) + ' 小时 × ' + fmtMoney(breakdown.hourly) + ' × 200% = ' + fmtMoney(breakdown.weekend) + ' 元',
          '法定节假日加班 ' + (Number(claims.overtime.holidayHours) || 0) + ' 小时 × ' + fmtMoney(breakdown.hourly) + ' × 300% = ' + fmtMoney(breakdown.holiday) + ' 元'
        ],
        law: '《劳动法》第44条',
        note: '休息日加班可优先安排补休，未补休的支付200%；法定节假日加班不可用补休替代。加班事实由劳动者举证。'
      });
      total += breakdown.total;
    }
  }

  if (claims.annual && claims.annual.enabled) {
    addEvidence('annual');
    var entitled = annualLeaveDays(claims.annual.serviceYears);
    var unpaidDays = Math.min(Number(claims.annual.unpaidDays) || 0, entitled);
    var dailyWage = avgWage / 21.75;
    var annualAmount = round2(unpaidDays * dailyWage * 2);
    items.push({
      key: 'annual',
      title: '未休年休假工资（额外200%）',
      amount: annualAmount,
      lines: [
        '累计工龄 ' + (Number(claims.annual.serviceYears) || 0) + ' 年，全年应休年休假 ' + entitled + ' 天',
        '日工资 = ' + fmtMoney(avgWage) + ' ÷ 21.75 = ' + fmtMoney(dailyWage) + ' 元',
        unpaidDays > 0 ? unpaidDays + ' 天 × ' + fmtMoney(dailyWage) + ' × 200% = ' + fmtMoney(annualAmount) + ' 元' : '无未休天数或累计工龄不满1年，无年休假工资差额。'
      ],
      law: '《职工带薪年休假条例》第3、5条、《企业职工带薪年休假实施办法》第10、11条',
      note: '日工资按支付未休年假工资报酬前12个月剔除加班费后的月平均工资折算。'
    });
    total += annualAmount;
  }

  if (claims.probation && claims.probation.enabled) {
    addEvidence('probation');
    var probationResult = probationPenalty({
      contractMonths: claims.probation.contractMonths,
      openEnded: claims.probation.openEnded,
      agreedMonths: claims.probation.agreedMonths,
      servedMonths: claims.probation.servedMonths,
      postWage: claims.probation.postWage
    });
    items.push({
      key: 'probation',
      title: '违法约定试用期赔偿金',
      amount: probationResult.amount,
      lines: [
        '合同期限：' + (claims.probation.openEnded ? '无固定期限' : claims.probation.contractMonths + ' 个月') + '，法定试用期上限 ' + probationResult.legal + ' 个月',
        probationResult.excess > 0 ? '超出法定上限且已履行 ' + probationResult.excess + ' 个月 × 转正后月工资 ' + fmtMoney(claims.probation.postWage) + ' = ' + fmtMoney(probationResult.amount) + ' 元' : '未超出法定试用期上限，无试用期赔偿。'
      ],
      law: '《劳动合同法》第83条',
      note: '同一用人单位与同一劳动者只能约定一次试用期。'
    });
    total += probationResult.amount;
  }

  var deadline = arbitrationDeadline(leave);
  var evidence = evidenceKeys.map(function (key) {
    return { key: key, title: EVIDENCE_GROUPS[key], list: EVIDENCE[key] };
  });

  return {
    ok: true,
    total: round2(total),
    items: items,
    warnings: warnings,
    evidence: evidence,
    deadline: deadline,
    deadlineText: fmtDate(deadline),
    scenario: scenario,
    generatedAt: new Date()
  };
}

var Calculator = {
  SCENARIOS: SCENARIOS,
  SCENARIO_NOTES: SCENARIO_NOTES,
  calculate: calculate,
  validateInputs: validateInputs,
  coefficientPost2008: coefficientPost2008,
  coefficientPre2008: coefficientPre2008,
  severanceCoefficient: severanceCoefficient,
  severancePay: severancePay,
  doubleWageMonths: doubleWageMonths,
  doubleWageDetail: doubleWageDetail,
  overtimePay: overtimePay,
  annualLeaveDays: annualLeaveDays,
  annualLeavePay: annualLeavePay,
  maxProbationMonths: maxProbationMonths,
  probationPenalty: probationPenalty,
  arbitrationDeadline: arbitrationDeadline,
  fmtDate: fmtDate,
  fmtMoney: fmtMoney
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Calculator;
} else if (typeof window !== 'undefined') {
  window.Calculator = Calculator;
}
