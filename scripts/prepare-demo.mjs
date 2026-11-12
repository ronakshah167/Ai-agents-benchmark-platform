import {cp,mkdir} from 'node:fs/promises';
await mkdir('public',{recursive:true});
await cp('dist','public/demo',{recursive:true});
