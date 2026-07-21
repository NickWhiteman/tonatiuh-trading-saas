import {Router} from 'express';
import {authenticate} from '../http/middleware';
import {authContext} from '../http/authorization';
import {saasQuery,saasTransaction} from '../db/pool';
import {booleanValue,objectValue,stringValue} from '../http/validate';
import {SaasHttpError} from '../http/errors';
import {assertCurrentVersions,currentLegalDocuments,recordLegalConsent} from './service';
import {getComplianceConfig} from './config';
import {databaseRateLimit} from '../http/rate-limit';

export const complianceRouter=Router();
complianceRouter.get('/documents',(_req,res,next)=>{try{res.setHeader('Cache-Control','public, max-age=300');res.json({documents:currentLegalDocuments()});}catch(error){next(error);}});
complianceRouter.post('/consents',authenticate,databaseRateLimit('legal-reconsent',10,86400),async(req,res,next)=>{try{const auth=authContext(req);const body=objectValue(req.body,['acceptTerms','acceptPrivacy','termsVersion','privacyVersion']);
  if(!booleanValue(body.acceptTerms,'acceptTerms')||!booleanValue(body.acceptPrivacy,'acceptPrivacy'))throw new SaasHttpError(400,'CONSENT_REQUIRED','Terms and privacy policy consent are required.');
  const termsVersion=stringValue(body.termsVersion,'termsVersion',100);const privacyVersion=stringValue(body.privacyVersion,'privacyVersion',100);assertCurrentVersions(termsVersion,privacyVersion);const config=getComplianceConfig();
  await saasTransaction(async client=>{const user=(await client.query<{id:string;email:string}>('SELECT id,email FROM users WHERE id=$1 FOR UPDATE',[auth.userId])).rows[0];if(!user)throw new SaasHttpError(404,'NOT_FOUND','User was not found.');await recordLegalConsent(client,req,user,'RECONSENT');
    await client.query('UPDATE users SET terms_version=$2,privacy_version=$3,consented_at=now(),updated_at=now() WHERE id=$1',[user.id,config.documents.terms.version,config.documents.privacy.version]);});res.json({accepted:true,documents:currentLegalDocuments()});
}catch(error){next(error);}});
complianceRouter.get('/consents',authenticate,async(req,res,next)=>{try{const auth=authContext(req);const result=await saasQuery(`SELECT document_type,document_version,document_url,document_sha256,source,evidence_key_id,accepted_at FROM consent_events WHERE user_id=$1 ORDER BY accepted_at DESC`,[auth.userId]);res.json({items:result.rows,currentDocuments:currentLegalDocuments()});}catch(error){next(error);}});
