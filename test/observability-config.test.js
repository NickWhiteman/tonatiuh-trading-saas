const assert=require('node:assert/strict');
const {readFile}=require('node:fs/promises');
const {describe,it}=require('node:test');
const {parse}=require('yaml');

describe('observability configuration',()=>{
  it('defines unique actionable alerts',async()=>{const config=parse(await readFile('ops/prometheus/rules/tonatiuh.yml','utf8'));const rules=config.groups.flatMap(group=>group.rules);const names=rules.map(rule=>rule.alert);
    assert.equal(new Set(names).size,names.length);assert.ok(names.length>=8);for(const rule of rules){assert.ok(rule.expr);assert.ok(rule.for);assert.ok(rule.labels?.severity);assert.match(rule.annotations?.runbook??'',/^docs\/incidents\//);}});
  it('ships a valid provisioned dashboard',async()=>{const dashboard=JSON.parse(await readFile('ops/grafana/dashboards/overview.json','utf8'));assert.equal(dashboard.uid,'tonatiuh-overview');assert.ok(dashboard.panels.length>=7);
    const ids=dashboard.panels.map(panel=>panel.id);assert.equal(new Set(ids).size,ids.length);});
});
