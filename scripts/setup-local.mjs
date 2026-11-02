import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const password=randomBytes(18).toString('base64url');
const tokenEncryptionKey=randomBytes(32).toString('base64');
for(const path of ['.env','apps/api/.env']){
 if(existsSync(path)){console.log(`${path} already exists; preserved.`);continue;}
 const template=readFileSync(`${path}.example`,'utf8');
 writeFileSync(path,template.replace('ChangeThisLocalPassword123!',password).replace('OAUTH_TOKEN_ENCRYPTION_KEY=',`OAUTH_TOKEN_ENCRYPTION_KEY=${tokenEncryptionKey}`),{mode:0o600});
 console.log(`Created ${path}; administrator password is stored in BOOTSTRAP_PASSWORD.`);
}
