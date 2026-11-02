// Answer key at the end of the simulado text ("1-E 11-E ..."). usage: node gabarito-sim.mjs <sim.txt>
import fs from 'node:fs';
const t = fs.readFileSync(process.argv[2], 'utf8');
const k = t.slice(t.lastIndexOf('GABARITO'));
const m = {}; for (const [, n, l] of k.matchAll(/(\d{1,3})-([A-E])/g)) m[+n] = l;
const out = []; for (let i = 1; i <= 100; i++) { if (!m[i]) throw new Error('falta ' + i); out.push(m[i]); }
console.log(out.join(','));
