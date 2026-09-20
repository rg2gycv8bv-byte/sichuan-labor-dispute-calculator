/*
 * 川赔通 · Node.js 命令行测试入口
 * 用法：node run-tests.js
 */
'use strict';

var Calculator = require('./calculator.js');
var tests = require('./tests.js');

var results = tests.runTests(Calculator);
var passed = 0;
var failed = 0;

results.forEach(function (result) {
  if (result.pass) {
    passed += 1;
    console.log('  [通过] ' + result.name);
  } else {
    failed += 1;
    console.log('  [失败] ' + result.name);
    console.log('         期望: ' + result.expected + ' | 实际: ' + result.actual);
  }
});

console.log('');
console.log('测试完成：通过 ' + passed + ' / ' + results.length + (failed ? '，失败 ' + failed : ''));
process.exitCode = failed ? 1 : 0;
