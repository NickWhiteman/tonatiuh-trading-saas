const assert=require('node:assert/strict');
const{after,before,describe,it}=require('node:test');
const{Pool}=require('pg');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:5000});
before(async()=>{await pool.query('SELECT 1');});after(async()=>{await pool.end();});

describe('worker resilience',()=>{
  it('allows exactly one leader and permits immediate failover',async()=>{const first=await pool.connect();const second=await pool.connect();const key=`tonatiuh-test-${process.pid}`;
    try{assert.equal((await first.query('SELECT pg_try_advisory_lock(hashtext($1)) locked',[key])).rows[0].locked,true);
      assert.equal((await second.query('SELECT pg_try_advisory_lock(hashtext($1)) locked',[key])).rows[0].locked,false);
      await first.query('SELECT pg_advisory_unlock(hashtext($1))',[key]);
      assert.equal((await second.query('SELECT pg_try_advisory_lock(hashtext($1)) locked',[key])).rows[0].locked,true);
      await second.query('SELECT pg_advisory_unlock(hashtext($1))',[key]);
    }finally{first.release();second.release();}});
});
