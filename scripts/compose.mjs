import { spawnSync } from 'node:child_process';
const plugin=spawnSync('docker',['compose','version'],{stdio:'ignore'});
const command=plugin.status===0?'docker':'docker-compose';
const args=[...(plugin.status===0?['compose']:[]),...process.argv.slice(2)];
const result=spawnSync(command,args,{stdio:'inherit'});
if(result.error)console.error(result.error.message);
process.exit(result.status??1);
