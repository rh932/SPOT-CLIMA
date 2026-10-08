import { base32Decode, totpAt, totpStep } from '../src/lib/totp';
const s = process.argv[2].replace(/\s/g, '');
const off = Number(process.argv[3] || 0);
console.log(totpAt(base32Decode(s), totpStep() + off));
