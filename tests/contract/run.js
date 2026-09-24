#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { runScenario, runCoreScenario } = require('./harness');
const scenarios = require('./scenarios');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tool') out.tool = argv[++i];
    else if (a === '--compare') out.compare = argv[++i];
    else if (a === '--update-snapshots') out.update = true;
    else if (a === '--scenario') out.scenario = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

function resolveTarget(input) {
  const base = input ? path.resolve(input) : path.resolve(__dirname, '..', '..');
  if (fs.statSync(base).isFile()) {
    return { type: base.includes('.core.') ? 'core' : 'legacy', path: base };
  }
  for (const name of ['Gadget%20page%20tool.core.js', 'Gadget page tool.core.js']) {
    const f = path.join(base, name);
    if (fs.existsSync(f)) return { type: 'core', path: f };
  }
  for (const name of ['Gadget%20page%20tool.js', 'Gadget page tool.js']) {
    const f = path.join(base, name);
    if (fs.existsSync(f)) return { type: 'legacy', path: f };
  }
  throw new Error(`Tool/core file not found under: ${base}`);
}

function snapshotPath(id) {
  return path.join(__dirname, 'snapshots', `${id}.json`);
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function assertScenarioIntent(scenario, actual) {
  const e = scenario.expect || {};
  const fail = (msg) => { throw new Error(`Scenario intent failed [${scenario.id}]: ${msg}`); };
  if (e.terminal && actual.terminal !== e.terminal) fail(`terminal ${actual.terminal} != ${e.terminal}`);
  if (e.delivery && actual.delivery !== e.delivery) fail(`delivery ${actual.delivery} != ${e.delivery}`);
  if (Object.prototype.hasOwnProperty.call(e, 'localStateMatched') && actual.localStateMatched !== e.localStateMatched) {
    fail(`envelope localStateMatched ${actual.localStateMatched} != ${e.localStateMatched}`);
  }
  if (e.errorKind && actual.error?.kind !== e.errorKind) fail(`error kind ${actual.error?.kind} != ${e.errorKind}`);
  if (e.status && actual.result?.status !== e.status) fail(`status ${actual.result?.status} != ${e.status}`);
  for (const key of ['from', 'title', 'via', 'resolvedStatus', 'target', 'targetFragment']) {
    if (Object.prototype.hasOwnProperty.call(e, key) && actual.result?.[key] !== e[key]) {
      fail(`${key} ${actual.result?.[key]} != ${e[key]}`);
    }
  }
  for (const key of ['revidDeletedNotice', 'targetIsDisambig']) {
    if (Object.prototype.hasOwnProperty.call(e, key) && !!actual.result?.[key] !== e[key]) {
      fail(`${key} ${!!actual.result?.[key]} != ${e[key]}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(e, 'resultLocalStateMatched') && !!actual.result?.localStateMatched !== e.resultLocalStateMatched) {
    fail(`result.localStateMatched ${!!actual.result?.localStateMatched} != ${e.resultLocalStateMatched}`);
  }
  if (e.sourceFailures) {
    const got = (actual.result?.sourceFailures || []).map((x) => x.sourceKey);
    if (JSON.stringify(got) !== JSON.stringify(e.sourceFailures)) fail(`sourceFailures ${JSON.stringify(got)} != ${JSON.stringify(e.sourceFailures)}`);
  }
  if (e.olderLogEvidenceMin != null && (actual.result?.olderLogEvidence || []).length < e.olderLogEvidenceMin) {
    fail(`olderLogEvidence length ${(actual.result?.olderLogEvidence || []).length} < ${e.olderLogEvidenceMin}`);
  }
  if (e.baselineTargetFailureKind && actual.result?.baselineTargetFailure?.kind !== e.baselineTargetFailureKind) {
    fail(`baselineTargetFailure kind ${actual.result?.baselineTargetFailure?.kind} != ${e.baselineTargetFailureKind}`);
  }
  if (e.stageCallCount) {
    for (const [stage, count] of Object.entries(e.stageCallCount)) {
      const got = actual.calls.filter((g) => g.stage === stage).reduce((n, g) => n + g.calls.length, 0);
      if (got !== count) fail(`stage ${stage} count ${got} != ${count}`);
    }
  }
}

async function collect(target, selected) {
  const outputs = new Map();
  const errors = [];
  for (const scenario of selected) {
    try {
      const result = target.type === 'core'
        ? await runCoreScenario(target.path, scenario)
        : await runScenario(target.path, scenario);
      outputs.set(scenario.id, result);
      try {
        assertScenarioIntent(scenario, result);
      } catch (err) {
        errors.push({ scenario: scenario.id, error: err });
      }
    } catch (err) {
      outputs.set(scenario.id, null);
      errors.push({ scenario: scenario.id, error: err });
    }
  }
  return { outputs, errors };
}

function printCollectErrors(label, collected) {
  if (!collected.errors.length) return 0;
  console.error(`\n${label}: ${collected.errors.length} scenario error(s)`);
  for (const item of collected.errors) {
    console.error(`- ${item.scenario}: ${item.error && item.error.message ? item.error.message : item.error}`);
  }
  return collected.errors.length;
}

function printCompare(selected, a, b, labelA, labelB) {
  const rows = [];
  let diffs = 0;
  for (const scenario of selected) {
    const sameResult = same(a.get(scenario.id), b.get(scenario.id));
    if (!sameResult) diffs++;
    rows.push({ scenario: scenario.id, [labelA]: 'ok', [labelB]: sameResult ? 'same' : 'DIFF' });
  }
  console.table(rows);
  return diffs;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log('Usage: node tests/contract/run.js [--tool DIR|FILE] [--compare DIR|FILE] [--update-snapshots] [--scenario ID]');
    return;
  }

  const selected = args.scenario ? scenarios.filter((s) => s.id === args.scenario) : scenarios;
  if (!selected.length) throw new Error(`Unknown scenario: ${args.scenario}`);

  const toolTarget = resolveTarget(args.tool);
  const collected = await collect(toolTarget, selected);
  const actual = collected.outputs;
  if (printCollectErrors('Baseline intent/run errors', collected)) process.exitCode = 1;

  if (args.update) {
    fs.mkdirSync(path.join(__dirname, 'snapshots'), { recursive: true });
    for (const scenario of selected) {
      fs.writeFileSync(snapshotPath(scenario.id), JSON.stringify(actual.get(scenario.id), null, 2) + '\n');
    }
    console.log(`Updated ${selected.length} snapshots from ${toolTarget.path}`);
  } else {
    let failed = 0;
    for (const scenario of selected) {
      const sp = snapshotPath(scenario.id);
      if (!fs.existsSync(sp)) {
        console.error(`MISSING SNAPSHOT ${scenario.id}`);
        failed++;
        continue;
      }
      const expected = JSON.parse(fs.readFileSync(sp, 'utf8'));
      if (!same(actual.get(scenario.id), expected)) {
        console.error(`DIFF ${scenario.id}`);
        console.error('Expected:', JSON.stringify(expected, null, 2));
        console.error('Actual:', JSON.stringify(actual.get(scenario.id), null, 2));
        failed++;
      } else {
        console.log(`PASS ${scenario.id}`);
      }
    }
    if (failed) process.exitCode = 1;
  }

  if (args.compare) {
    const compareTarget = resolveTarget(args.compare);
    const compared = await collect(compareTarget, selected);
    const other = compared.outputs;
    if (printCollectErrors('Compare intent/run errors', compared)) process.exitCode = 1;
    const diffs = printCompare(selected, actual, other, 'baseline', 'compare');
    if (diffs) process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
