import {getStore} from '@netlify/blobs';
import {runGroqProbe} from '../../src/groq-probe.mts';
export default (request:Request) => runGroqProbe(request, key=>Netlify.env.get(key) ?? '', getStore('mahotels-groq-probe-20261121'), fetch);
