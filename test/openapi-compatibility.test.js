const assert=require('node:assert/strict');const{describe,it}=require('node:test');
const{compatibilityIssues}=require('../scripts/check-openapi-compatibility');
const operation={method:'post',path:'/api/v1/widgets',parameters:[],requestBody:{required:true,schema:{$ref:'#/components/schemas/Input'}},responses:{'200':{$ref:'#/components/schemas/Output'}}};
const baseline={operations:{createWidget:operation},schemas:{Input:{type:'object',required:['name'],properties:{name:{type:'string'}}},Output:{type:'object',required:['id'],properties:{id:{type:'string'}}}}};
describe('OpenAPI compatibility policy',()=>{
  it('accepts additive response properties',()=>{const current=structuredClone(baseline);current.schemas.Output.properties.label={type:'string'};assert.deepEqual(compatibilityIssues(baseline,current),[]);});
  it('rejects removed operations and newly required input',()=>{const removed={operations:{},schemas:baseline.schemas};assert.match(compatibilityIssues(baseline,removed)[0],/operation was removed/);
    const required=structuredClone(baseline);required.schemas.Input.required.push('mode');required.schemas.Input.properties.mode={type:'string'};assert.ok(compatibilityIssues(baseline,required).some(issue=>issue.includes('new required input')));});
  it('rejects removed required response fields',()=>{const current=structuredClone(baseline);delete current.schemas.Output.properties.id;current.schemas.Output.required=[];assert.ok(compatibilityIssues(baseline,current).some(issue=>issue.includes('property was removed')));});
});
