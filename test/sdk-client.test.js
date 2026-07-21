const assert=require('node:assert/strict');const{describe,it}=require('node:test');
describe('generated TypeScript SDK',()=>{
  it('builds a versioned authenticated request with escaped parameters',async()=>{const{TonatiuhClient}=await import('../sdk/dist/index.js');let captured;
    const client=new TonatiuhClient({baseUrl:'https://api.example.test/',accessToken:async()=>'access-token',fetch:async(url,init)=>{captured={url:String(url),init};return new Response(JSON.stringify({accepted:true}),{status:202,headers:{'content-type':'application/json'}});}});
    const result=await client.operations.startBot({path:{id:'bot/id'},headers:{'Idempotency-Key':'command-123'}});assert.deepEqual(result,{accepted:true});
    assert.equal(captured.url,'https://api.example.test/api/v1/bots/bot%2Fid/start');assert.equal(captured.init.method,'POST');
    assert.equal(captured.init.headers.get('Authorization'),'Bearer access-token');assert.equal(captured.init.headers.get('Idempotency-Key'),'command-123');
  });
  it('exposes stable API error fields',async()=>{const{TonatiuhApiError,TonatiuhClient}=await import('../sdk/dist/index.js');const client=new TonatiuhClient({baseUrl:'https://api.example.test',fetch:async()=>new Response(
      JSON.stringify({error:{code:'QUOTA_EXCEEDED',message:'Quota exceeded.',requestId:'request-1',details:{limit:1}}}),{status:409,headers:{'content-type':'application/json'}})});
    await assert.rejects(client.operations.listExchangeConnections({}),error=>error instanceof TonatiuhApiError&&error.status===409&&error.code==='QUOTA_EXCEEDED'&&error.requestId==='request-1');
  });
});
