import {createHmac} from 'crypto';
import {Request,RequestHandler} from 'express';
import {PoolClient} from 'pg';
import {saasQuery} from '../db/pool';
import {authContext} from '../http/authorization';
import {SaasHttpError} from '../http/errors';
import {getComplianceConfig,LegalDocument} from './config';

export const evidenceHash=(value:string,secret:string)=>createHmac('sha256',secret).update(value).digest('hex');
export function currentLegalDocuments():LegalDocument[]{const config=getComplianceConfig();return[config.documents.terms,config.documents.privacy];}
export function assertCurrentVersions(termsVersion:unknown,privacyVersion:unknown):void{const c=getComplianceConfig();if(termsVersion!==undefined&&termsVersion!==c.documents.terms.version)throw new SaasHttpError(409,'LEGAL_DOCUMENT_VERSION_CHANGED','Terms changed before consent was recorded.',{documents:currentLegalDocuments()});
  if(privacyVersion!==undefined&&privacyVersion!==c.documents.privacy.version)throw new SaasHttpError(409,'LEGAL_DOCUMENT_VERSION_CHANGED','Privacy policy changed before consent was recorded.',{documents:currentLegalDocuments()});}

export async function recordLegalConsent(client:PoolClient,req:Request,user:{id:string;email:string},source:'REGISTRATION'|'RECONSENT'):Promise<void>{const config=getComplianceConfig();const subjectHash=evidenceHash(user.email.trim().toLowerCase(),config.evidenceSecret);
  const ipHash=req.ip?evidenceHash(req.ip,config.evidenceSecret):null;const agent=req.header('user-agent');const agentHash=agent?evidenceHash(agent,config.evidenceSecret):null;
  for(const document of Object.values(config.documents))await client.query(`INSERT INTO consent_events(user_id,subject_hash,document_type,document_version,document_url,document_sha256,source,request_id,ip_hash,user_agent_hash,evidence_key_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(user_id,document_type,document_version) DO NOTHING`,[user.id,subjectHash,document.type,document.version,document.url,document.sha256,source,req.requestId??null,ipHash,agentHash,config.evidenceKeyId]);}

export const requireCurrentLegalConsent:RequestHandler=async(req,_res,next)=>{try{const auth=authContext(req);const config=getComplianceConfig();const row=(await saasQuery<{terms_version:string;privacy_version:string}>('SELECT terms_version,privacy_version FROM users WHERE id=$1',[auth.userId])).rows[0];
  if(!row||row.terms_version!==config.documents.terms.version||row.privacy_version!==config.documents.privacy.version)throw new SaasHttpError(428,'LEGAL_CONSENT_REQUIRED','Current terms and privacy policy must be accepted.',{documents:currentLegalDocuments()});next();
}catch(error){next(error);}};
