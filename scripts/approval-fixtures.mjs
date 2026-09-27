import {readFileSync,writeFileSync} from 'node:fs';
import {randomBytes,scryptSync} from 'node:crypto';
import pg from 'pg';
const config=JSON.parse(readFileSync('.env.deployment.local','utf8'));
const url=new URL(config.testDirectUrl);
if(url.hostname!=='aws-0-ap-southeast-1.pooler.supabase.com'||url.pathname!=='/iza_eval_test') throw new Error('Acceptance database required');
const client=new pg.Client({connectionString:config.testDirectUrl,ssl:{rejectUnauthorized:false}});
await client.connect();
try {
 if(process.argv.includes('--seed')) {
  const password=randomBytes(24).toString('hex');
  for(const [id,role,name] of [['approval-admin','ADMIN','Approval Admin'],['approval-staff','CASHIER','Approval Staff']]) {
   const salt=randomBytes(16).toString('hex');const hash=`${salt}:${scryptSync(password,salt,64).toString('hex')}`;
   await client.query('INSERT INTO "User" (id,name,email,role,"updatedAt") VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (id) DO NOTHING',[id,name,`${id}@example.test`,role]);
   await client.query('INSERT INTO "Account" (id,"accountId","providerId","userId",password,"updatedAt") VALUES ($1,$1,\'credential\',$1,$2,NOW()) ON CONFLICT (id) DO UPDATE SET password=$2',[id,hash]);
  }
  await client.query('INSERT INTO "ReceiptSeries" (id,name,"nextNumber",active,"updatedAt") VALUES (\'approval-series\',\'APPROVAL\',1,true,NOW()) ON CONFLICT (id) DO NOTHING');
  writeFileSync('.env.approval-test.local',JSON.stringify({password}));
  console.log('Acceptance-only admin and staff fixtures ready. Credentials saved locally, not printed.');
 } else {
  const result=await client.query('SELECT name,sku,stock,active FROM "Product" WHERE sku LIKE \'TEST-APPROVAL-%\'');
  console.log(JSON.stringify(result.rows));
 }
}finally{await client.end();}
