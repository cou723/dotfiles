import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {sdkRoot, fixture} from './helpers.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const host=sdkRoot();
const require=createRequire(path.join(root,'package.json'));
const hostRequire=createRequire(path.join(host,'package.json'));
const aiManifest=hostRequire.resolve.paths('@earendil-works/pi-ai').map(dir=>path.join(dir,'@earendil-works/pi-ai/package.json')).find(p=>fs.existsSync(p));
if(!aiManifest) throw new Error('Host pi-ai package not found');
const aiTypes=path.resolve(path.dirname(aiManifest),JSON.parse(fs.readFileSync(aiManifest,'utf8')).exports['./compat'].types);
const temp=fixture('typecheck-');
try {
 const config={compilerOptions:{target:'ES2022',module:'ESNext',moduleResolution:'bundler',noEmit:true,allowJs:true,checkJs:false,skipLibCheck:true,strict:true,noImplicitAny:false,typeRoots:[path.join(root,'node_modules/@types')],types:['node'],paths:{
 '@earendil-works/pi-coding-agent':[path.join(host,'dist/index.d.ts')],
 '@earendil-works/pi-ai/compat':[aiTypes]
 }},include:['resource-capability-gate','bash-classifier','lsp-readonly'].map(name=>path.join(root,name,'index.ts'))};
 fs.writeFileSync(path.join(temp,'tsconfig.json'),JSON.stringify(config));
 const result=spawnSync(process.execPath,[require.resolve('typescript/bin/tsc'),'-p',path.join(temp,'tsconfig.json')],{stdio:'inherit'});
 if(result.error) throw result.error;
 process.exitCode=result.status??1;
} finally {fs.rmSync(temp,{recursive:true,force:true});}
