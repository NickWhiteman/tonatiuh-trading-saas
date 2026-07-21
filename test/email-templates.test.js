const assert=require('node:assert/strict');const{describe,it}=require('node:test');
process.env.DATABASE_URL??='postgres://unused';process.env.JWT_SECRET??='email-test-secret-with-more-than-thirty-two-bytes';
const{emailHash}=require('../build/saas/email/delivery');const{renderEmail}=require('../build/saas/email/templates');
describe('transactional email rendering',()=>{
  it('renders localized text and HTML without injecting URL markup',()=>{const rendered=renderEmail('VERIFY_EMAIL','ru','https://example.test/?token=<script>');assert.match(rendered.subject,/email/i);assert.match(rendered.text,/https:\/\//);assert.doesNotMatch(rendered.html,/<script>/);assert.match(rendered.html,/&lt;script&gt;/);});
  it('normalizes recipient identity before suppression hashing',()=>{assert.equal(emailHash(' User@Example.test '),emailHash('user@example.test'));});
});
