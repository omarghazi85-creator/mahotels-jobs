import { collectAccor, collectRadisson, collectRotana } from '../src/sources.mts';
import { collectMarriott } from '../src/marriott.mts';

const sources = [
  ['accor', collectAccor], ['radisson', collectRadisson],
  ['rotana', collectRotana], ['marriott', collectMarriott]
];
let valid = 0;
let failedSources = 0;
for (const [name, collect] of sources) {
  try {
    const rows = await collect(1);
    const safe = rows.filter(x => x.originalId && x.title && x.country && x.city &&
      x.description && x.applyUrl.startsWith('https://'));
    valid += safe.length;
    if (safe.length === 0) failedSources++;
    console.log(JSON.stringify({ source: name, extracted: safe.length, distinctIds: new Set(safe.map(x => x.originalId)).size }));
  } catch (error) {
    failedSources++;
    console.error(JSON.stringify({source:name, error:String(error)}));
  }
}
console.log(JSON.stringify({sourceCount:sources.length,valid,failedSources,liveSmoke:true,wordpressWrites:0,groqCalls:0}));
if (failedSources !== 0 || valid !== sources.length) process.exitCode = 1;
