const assert=require('node:assert/strict');const{describe,it}=require('node:test');const{percentile,evaluate}=require('../test-load/run');
describe('load-test acceptance',()=>{
  it('calculates nearest-rank percentiles',()=>{assert.equal(percentile([1,2,3,4,5],.5),3);assert.equal(percentile([1,2,3,4,5],.95),5);});
  it('reports every violated threshold',()=>{const failures=evaluate({errorRate:.02,latencyMs:{p95:1200},requestsPerSecond:50},{maxErrorRate:.01,maxP95Ms:1000,minRps:100});assert.equal(failures.length,3);});
});
