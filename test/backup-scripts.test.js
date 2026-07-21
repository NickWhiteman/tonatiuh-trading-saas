const assert=require('node:assert/strict');
const{execFileSync}=require('node:child_process');
const{readFile}=require('node:fs/promises');
const{describe,it}=require('node:test');

const scripts=['ops/postgres/backup.sh','ops/postgres/restore.sh','ops/postgres/verify-restore.sh','ops/postgres/ci-drill.sh'];
describe('backup and disaster recovery tooling',()=>{
  it('ships syntactically valid POSIX shell scripts',()=>{for(const script of scripts)execFileSync('sh',['-n',script]);});
  it('encrypts archives and verifies mandatory checksums before restore',async()=>{const backup=await readFile(scripts[0],'utf8');const restore=await readFile(scripts[1],'utf8');assert.match(backup,/age --encrypt/);assert.match(backup,/pg_restore --list/);assert.match(restore,/sha256sum -c/);assert.match(restore,/age --decrypt/);assert.match(restore,/pg_restore --list/);});
  it('binds destructive restore confirmation to target and mode',async()=>{const restore=await readFile(scripts[1],'utf8');assert.match(restore,/restore-tonatiuh:\$EXPECTED_DATABASE_NAME:\$RESTORE_MODE/);assert.match(restore,/actual_database.*EXPECTED_DATABASE_NAME/s);});
  it('runs an encrypted restore drill in CI',async()=>{const workflow=await readFile('.github/workflows/ci.yml','utf8');assert.match(workflow,/Encrypted backup restore drill/);assert.match(workflow,/ci-drill\.sh/);});
  it('publishes the immutable backup tools image',async()=>{const workflow=await readFile('.github/workflows/docker-publish.yml','utf8');assert.match(workflow,/context: ops\/postgres/);assert.match(workflow,/build-postgres-tools\.outputs\.digest/);});
});
