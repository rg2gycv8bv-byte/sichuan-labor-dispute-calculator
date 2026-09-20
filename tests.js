/*
 * 川赔通 · 测试用例（浏览器 test.html 与 Node.js run-tests.js 共用）
 */
'use strict';

function baseInput(overrides) {
  var input = {
    scenario: 'negotiate',
    joinDate: '2020-01-01',
    leaveDate: '2024-01-01',
    avgWage: 8000,
    lastMonthWage: 0,
    notified30: false,
    localAvgWage: 8000,
    minWage: 2100,
    split2008: false,
    claims: {
      doubleWage: { enabled: false, signed: false, signDate: '', monthlyWage: 0 },
      overtime: { enabled: false, baseWage: 0, weekdayHours: 0, weekendHours: 0, holidayHours: 0 },
      annual: { enabled: false, serviceYears: 0, unpaidDays: 0 },
      probation: { enabled: false, contractMonths: 0, openEnded: false, agreedMonths: 0, servedMonths: 0, postWage: 0 }
    }
  };
  var extra = overrides || {};
  Object.keys(extra).forEach(function (key) {
    if (key === 'claims') {
      Object.keys(extra.claims).forEach(function (claimKey) {
        input.claims[claimKey] = Object.assign({}, input.claims[claimKey], extra.claims[claimKey]);
      });
    } else {
      input[key] = extra[key];
    }
  });
  return input;
}

var TEST_CASES = [
  {
    name: '案例1 · 违法解除赔偿金（2N）',
    input: baseInput({ scenario: 'illegal', joinDate: '2020-03-01', leaveDate: '2024-08-15', avgWage: 9000 }),
    expect: { total: 81000, items: { severance: 81000 } }
  },
  {
    name: '案例2 · 合法解除 + 代通知金（N+1）',
    input: baseInput({ scenario: 'incompetent', joinDate: '2019-07-10', leaveDate: '2024-10-31', avgWage: 8000, lastMonthWage: 8500 }),
    expect: { total: 52500, items: { severance: 44000, notice: 8500 } }
  },
  {
    name: '案例3 · 高收入按社平工资3倍封顶',
    input: baseInput({ joinDate: '2015-01-01', leaveDate: '2024-12-31', avgWage: 45000 }),
    expect: { total: 240000, items: { severance: 240000 } }
  },
  {
    name: '案例4 · 未签书面合同二倍工资',
    input: baseInput({ scenario: 'resign', joinDate: '2024-02-01', leaveDate: '2024-12-31', avgWage: 7000, claims: { doubleWage: { enabled: true, signed: false, monthlyWage: 7000 } } }),
    expect: { total: 70000, items: { doubleWage: 70000 } }
  },
  {
    name: '案例5 · 加班费组合',
    input: baseInput({ scenario: 'resign', joinDate: '2024-01-01', leaveDate: '2024-12-31', avgWage: 6525, claims: { overtime: { enabled: true, baseWage: 6525, weekdayHours: 40, weekendHours: 64, holidayHours: 8 } } }),
    expect: { total: 7950, items: { overtime: 7950 } }
  },
  {
    name: '案例6 · 未休年休假工资',
    input: baseInput({ scenario: 'resign', joinDate: '2012-01-01', leaveDate: '2024-12-31', avgWage: 8700, claims: { annual: { enabled: true, serviceYears: 12, unpaidDays: 6 } } }),
    expect: { total: 4800, items: { annual: 4800 } }
  },
  {
    name: '边界 · 工龄恰好6个月按1年计',
    input: baseInput({ joinDate: '2024-01-01', leaveDate: '2024-07-01', avgWage: 6000 }),
    expect: { total: 6000, items: { severance: 6000 } }
  },
  {
    name: '边界 · 工龄5个月29天按半个月计',
    input: baseInput({ joinDate: '2024-01-01', leaveDate: '2024-06-30', avgWage: 6000 }),
    expect: { total: 3000, items: { severance: 3000 } }
  },
  {
    name: '边界 · 二倍工资最多11个月',
    input: baseInput({ scenario: 'resign', joinDate: '2023-01-01', leaveDate: '2025-06-30', avgWage: 8000, claims: { doubleWage: { enabled: true, signed: false, monthlyWage: 8000 } } }),
    expect: { total: 88000, items: { doubleWage: 88000 } }
  },
  {
    name: '进阶 · 跨2008年工龄分段计算',
    input: baseInput({ joinDate: '2007-06-01', leaveDate: '2024-06-01', avgWage: 8000, split2008: true }),
    expect: { total: 140000, items: { severance: 140000 } }
  },
  {
    name: '边界 · 月工资低于最低工资按最低工资计',
    input: baseInput({ joinDate: '2023-01-01', leaveDate: '2024-01-01', avgWage: 1500 }),
    expect: { total: 2100, items: { severance: 2100 } }
  },
  {
    name: '边界 · 违法约定试用期（2年合同约定4个月）',
    input: baseInput({ scenario: 'resign', joinDate: '2024-01-01', leaveDate: '2024-12-31', avgWage: 9000, claims: { probation: { enabled: true, contractMonths: 24, agreedMonths: 4, servedMonths: 4, postWage: 9000 } } }),
    expect: { total: 18000, items: { probation: 18000 } }
  },
  {
    name: '边界 · 试用期未超法定上限（1年合同2个月）',
    input: baseInput({ scenario: 'resign', joinDate: '2024-01-01', leaveDate: '2024-12-31', avgWage: 8000, claims: { probation: { enabled: true, contractMonths: 12, agreedMonths: 2, servedMonths: 2, postWage: 8000 } } }),
    expect: { total: 0, items: { probation: 0 } }
  },
  {
    name: '边界 · 3年合同法定试用期上限6个月',
    input: baseInput({ scenario: 'resign', joinDate: '2021-06-01', leaveDate: '2024-12-31', avgWage: 8000, claims: { probation: { enabled: true, contractMonths: 36, agreedMonths: 7, servedMonths: 7, postWage: 8000 } } }),
    expect: { total: 8000, items: { probation: 8000 } }
  },
  {
    name: '综合 · 违法解除 + 加班 + 年假',
    input: baseInput({ scenario: 'illegal', joinDate: '2021-05-10', leaveDate: '2024-09-20', avgWage: 8700, claims: { overtime: { enabled: true, baseWage: 8700, weekdayHours: 60, weekendHours: 32, holidayHours: 8 }, annual: { enabled: true, serviceYears: 8, unpaidDays: 3 } } }),
    expect: { total: 72200, items: { severance: 60900, overtime: 8900, annual: 2400 } }
  },
  {
    name: '边界 · N+1已提前30日通知则无代通知金',
    input: baseInput({ scenario: 'objective', joinDate: '2019-07-10', leaveDate: '2024-10-31', avgWage: 8000, notified30: true }),
    expect: { total: 44000, items: { severance: 44000 } }
  },
  {
    name: '边界 · 个人原因辞职无经济补偿',
    input: baseInput({ scenario: 'resign' }),
    expect: { total: 0, items: { none: 0 } }
  },
  {
    name: '校验 · 离职日期早于入职日期应报错',
    input: baseInput({ joinDate: '2024-06-01', leaveDate: '2024-01-01' }),
    expectError: true
  },
  {
    name: '校验 · 未选情形应报错',
    input: baseInput({ scenario: 'unknown' }),
    expectError: true
  }
];

var UNIT_TESTS = [
  { name: '单元 · 年限系数 4年5个月15天 = 4.5', run: function (C) { return { expected: 4.5, actual: C.coefficientPost2008('2020-03-01', '2024-08-15') }; } },
  { name: '单元 · 年限系数 5年3个月21天 = 5.5', run: function (C) { return { expected: 5.5, actual: C.coefficientPost2008('2019-07-10', '2024-10-31') }; } },
  { name: '单元 · 年限系数 9年11个月30天 = 10', run: function (C) { return { expected: 10, actual: C.coefficientPost2008('2015-01-01', '2024-12-31') }; } },
  { name: '单元 · 年限系数 恰好6个月 = 1', run: function (C) { return { expected: 1, actual: C.coefficientPost2008('2024-01-01', '2024-07-01') }; } },
  { name: '单元 · 年限系数 5个月29天 = 0.5', run: function (C) { return { expected: 0.5, actual: C.coefficientPost2008('2024-01-01', '2024-06-30') }; } },
  { name: '单元 · 年限系数 恰好整1年 = 1', run: function (C) { return { expected: 1, actual: C.coefficientPost2008('2023-01-01', '2024-01-01') }; } },
  { name: '单元 · 年限系数 同日 = 0', run: function (C) { return { expected: 0, actual: C.coefficientPost2008('2024-01-01', '2024-01-01') }; } },
  { name: '单元 · 二倍工资 2024-02-01入职至2024-12-31 = 10个月', run: function (C) { return { expected: 10, actual: C.doubleWageMonths('2024-02-01', null, '2024-12-31') }; } },
  { name: '单元 · 二倍工资满一年封顶 = 11个月', run: function (C) { return { expected: 11, actual: C.doubleWageMonths('2023-01-01', null, '2025-06-30') }; } },
  { name: '单元 · 一个月内补签无二倍工资', run: function (C) { return { expected: 0, actual: C.doubleWageMonths('2024-02-01', '2024-02-20', '2024-12-31') }; } },
  { name: '单元 · 试用期上限 合同不满3个月 = 0', run: function (C) { return { expected: 0, actual: C.maxProbationMonths(2, false) }; } },
  { name: '单元 · 试用期上限 合同3个月 = 1', run: function (C) { return { expected: 1, actual: C.maxProbationMonths(3, false) }; } },
  { name: '单元 · 试用期上限 合同11个月 = 1', run: function (C) { return { expected: 1, actual: C.maxProbationMonths(11, false) }; } },
  { name: '单元 · 试用期上限 合同12个月 = 2', run: function (C) { return { expected: 2, actual: C.maxProbationMonths(12, false) }; } },
  { name: '单元 · 试用期上限 合同35个月 = 2', run: function (C) { return { expected: 2, actual: C.maxProbationMonths(35, false) }; } },
  { name: '单元 · 试用期上限 合同36个月 = 6', run: function (C) { return { expected: 6, actual: C.maxProbationMonths(36, false) }; } },
  { name: '单元 · 试用期上限 无固定期限 = 6', run: function (C) { return { expected: 6, actual: C.maxProbationMonths(0, true) }; } },
  { name: '单元 · 年假档位 工龄0.5年 = 0天', run: function (C) { return { expected: 0, actual: C.annualLeaveDays(0.5) }; } },
  { name: '单元 · 年假档位 工龄1年 = 5天', run: function (C) { return { expected: 5, actual: C.annualLeaveDays(1) }; } },
  { name: '单元 · 年假档位 工龄9.9年 = 5天', run: function (C) { return { expected: 5, actual: C.annualLeaveDays(9.9) }; } },
  { name: '单元 · 年假档位 工龄10年 = 10天', run: function (C) { return { expected: 10, actual: C.annualLeaveDays(10) }; } },
  { name: '单元 · 年假档位 工龄19.9年 = 10天', run: function (C) { return { expected: 10, actual: C.annualLeaveDays(19.9) }; } },
  { name: '单元 · 年假档位 工龄20年 = 15天', run: function (C) { return { expected: 15, actual: C.annualLeaveDays(20) }; } },
  { name: '单元 · 2008分段系数 2007-06-01至2024-06-01 = 17.5', run: function (C) { return { expected: 17.5, actual: C.severanceCoefficient('2007-06-01', '2024-06-01', true) }; } },
  { name: '单元 · 仲裁时效截止日加1年', run: function (C) { return { expected: '2025-08-15', actual: C.fmtDate(C.arbitrationDeadline('2024-08-15')) }; } }
];

function approx(a, b) {
  return Math.abs(Number(a) - Number(b)) < 0.005;
}

function runTests(Calculator) {
  var results = [];
  TEST_CASES.forEach(function (testCase) {
    var result = Calculator.calculate(testCase.input);
    var pass;
    var actual;
    if (testCase.expectError) {
      pass = result && result.ok === false && result.errors && result.errors.length > 0;
      actual = pass ? '已按预期报错' : JSON.stringify(result);
    } else {
      var itemsOk = Object.keys(testCase.expect.items).every(function (key) {
        return result.items.some(function (item) {
          return item.key === key && approx(item.amount, testCase.expect.items[key]);
        });
      });
      pass = !!result.ok && approx(result.total, testCase.expect.total) && itemsOk;
      actual = result.ok ? result.total : (result.errors || []).join('；');
    }
    results.push({ category: '业务案例', name: testCase.name, pass: pass, expected: testCase.expectError ? '报错' : testCase.expect.total, actual: actual });
  });
  UNIT_TESTS.forEach(function (unitTest) {
    var out = unitTest.run(Calculator);
    var pass = typeof out.expected === 'string' || typeof out.actual === 'string'
      ? String(out.expected) === String(out.actual)
      : approx(out.actual, out.expected);
    results.push({ category: '单元测试', name: unitTest.name, pass: pass, expected: out.expected, actual: out.actual });
  });
  return results;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TEST_CASES: TEST_CASES, UNIT_TESTS: UNIT_TESTS, runTests: runTests };
}
