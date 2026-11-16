/**
 * Generator for NBU payment QR links (https://bank.gov.ua/qr/...).
 *
 * The link is the URL-safe base64 (unpadded) of a UTF-8, EPC069-12-style
 * payload that NBU adapted for hryvnia transfers (UCT = Ukrainian Credit
 * Transfer) — see NBU Resolution No. 97 of 19.08.2025:
 *
 *   BCD            1: service tag
 *   002            2: version
 *   1              3: character set (UTF-8)
 *   UCT            4: transfer type
 *   (empty)        5: BIC placeholder, unused
 *   {name}         6: recipient (отримувач)
 *   {iban}         7: recipient IBAN, UA + 27 digits
 *   UAH{amount}    8: currency + amount with 2 decimals, e.g. UAH4985.00
 *   {code}         9: recipient tax code (ЄДРПОУ/РНОКПП), 8 or 10 digits
 *   (empty)       10: reference, unused
 *   (empty)       11: reference, unused
 *   {purpose}     12: payment purpose (призначення платежу)
 *   (empty)       13: trailing line
 *
 * No dependencies. Works in browsers (<script src="nbu-qr.js"></script>)
 * and in Node >= 16 (const { buildNbuQrUrl } = require('./nbu-qr.js')).
 * Run `node nbu-qr.js` for a self-test.
 */
'use strict';

const NBU_QR_BASE = 'https://bank.gov.ua/qr/';

const b64encode = typeof btoa === 'function'
  ? btoa
  : (s) => Buffer.from(s, 'binary').toString('base64');
const b64decode = typeof atob === 'function'
  ? atob
  : (s) => Buffer.from(s, 'base64').toString('binary');

function utf8ToBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return b64encode(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUtf8(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = b64decode(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isValidIban(iban) {
  if (!/^UA\d{27}$/.test(iban)) return false;
  const numeric = iban.slice(4) + '3010' + iban.slice(2, 4); // U=30, A=10
  let rem = 0;
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1;
}

/**
 * Build an NBU payment QR link.
 *
 * @param {object} data
 * @param {string} data.name     recipient name, e.g. 'ТОВ "Моя компанія"'
 * @param {string} data.iban     recipient IBAN (UA + 27 digits, spaces ok)
 * @param {number|null} [data.amount] UAH amount; null/undefined for an empty
 *        amount line (payer decides — useful for donation-style codes)
 * @param {string} data.code     recipient tax code (ЄДРПОУ/РНОКПП), 8 or 10 digits
 * @param {string} data.purpose  payment purpose (призначення платежу)
 * @returns {string} https://bank.gov.ua/qr/...
 */
function buildNbuQrUrl({ name, iban, amount = null, code, purpose }) {
  name = typeof name === 'string' ? name.trim() : '';
  purpose = typeof purpose === 'string' ? purpose.trim() : '';
  const ibanNorm = typeof iban === 'string' ? iban.replace(/\s+/g, '').toUpperCase() : '';
  const codeNorm = String(code == null ? '' : code).trim();

  if (!name) throw new Error('name (отримувач) is required');
  if (!purpose) throw new Error('purpose (призначення платежу) is required');
  if (!isValidIban(ibanNorm)) {
    throw new Error('iban must be a valid Ukrainian IBAN: UA + 2 check digits + 25 digits');
  }
  if (!/^\d{8}$|^\d{10}$/.test(codeNorm)) {
    throw new Error('code (ЄДРПОУ/РНОКПП) must be 8 or 10 digits');
  }
  for (const [field, value] of [['name', name], ['purpose', purpose]]) {
    if (/[\r\n]/.test(value)) throw new Error(field + ' must not contain line breaks');
  }
  let amountLine = '';
  if (amount !== null && amount !== undefined && amount !== '') {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0) throw new Error('amount must be a non-negative number');
    amountLine = 'UAH' + amt.toFixed(2);
  }

  const payload = [
    'BCD',        // 1
    '002',        // 2
    '1',          // 3
    'UCT',        // 4
    '',           // 5
    name,         // 6
    ibanNorm,     // 7
    amountLine,   // 8
    codeNorm,     // 9
    '',           // 10
    '',           // 11
    purpose,      // 12
  ].join('\n') + '\n\n';

  return NBU_QR_BASE + utf8ToBase64Url(payload);
}

/**
 * Decode an NBU QR link (or bare base64 payload) back into its fields.
 *
 * @param {string} urlOrB64 full https://bank.gov.ua/qr/... link or just the base64 part
 * @returns {{name:string, iban:string, amount:number|null, currency:string, code:string, purpose:string}}
 */
function decodeNbuQrUrl(urlOrB64) {
  const b64url = String(urlOrB64).replace(/^.*\/qr\//, '');
  const lines = base64UrlToUtf8(b64url).split('\n');
  const amountLine = lines[7] || '';
  return {
    name: lines[5] || '',
    iban: lines[6] || '',
    currency: amountLine.slice(0, 3) || null,
    amount: amountLine ? Number(amountLine.slice(3)) : null,
    code: lines[8] || '',
    purpose: lines[11] || '',
  };
}

/* ------------------------------- self-test ------------------------------- */

const ORIGINAL_URL =
  'https://bank.gov.ua/qr/QkNECjAwMgoxClVDVAoK0KTQntCfINCf0L7RgdGC0ZbQu9GM0LPQsCDQhtGA0LjQvdCwIN' +
  'CS0L7Qu9C-0LTQuNC80LjRgNGW0LLQvdCwClVBNjIzMDUyOTkwMDAwMDI2MDA0MDIzOTAzNzI5ClVBSDQ5ODUuMDAKMzIyNz' +
  'cwNDgwNQoKCtC30LAg0LrQvtC90LTQuNGC0LXRgNGB0YzQutGWINCy0LjRgNC-0LHQuAoK';

function runSelfTest() {
  const sample = {
    name: 'ТОВ "Прикарпатський Оберіг"',
    iban: 'UA623052990000026004023903729',
    amount: 4985.0,
    code: '3227704805',
    purpose: 'За кондитерські вироби',
  };

  const rebuilt = buildNbuQrUrl(sample);
  const ok = (cond, msg) => {
    if (!cond) {
      console.error('FAIL: ' + msg);
      process.exitCode = 1;
    } else {
      console.log('ok: ' + msg);
    }
  };

  ok(rebuilt === ORIGINAL_URL, 'rebuilds the original URL byte-for-byte');
  if (rebuilt !== ORIGINAL_URL) {
    console.error('  expected: ' + ORIGINAL_URL);
    console.error('  actual:   ' + rebuilt);
  }

  const decoded = decodeNbuQrUrl(ORIGINAL_URL);
  ok(decoded.name === sample.name, 'decode: name');
  ok(decoded.iban === sample.iban, 'decode: iban');
  ok(decoded.amount === 4985 && decoded.currency === 'UAH', 'decode: amount 4985 UAH');
  ok(decoded.code === sample.code, 'decode: code');
  ok(decoded.purpose === sample.purpose, 'decode: purpose');

  const demo = buildNbuQrUrl({
    name: 'ФОП Іваненко Іван Іванович',
    iban: 'UA39 3052 9900 0000 0000 0001 2345', // spaces are stripped
    amount: 250.5,
    code: '3012345678',
    purpose: 'За каву та десерти',
  });
  const demoDecoded = decodeNbuQrUrl(demo);
  ok(demoDecoded.amount === 250.5 && demoDecoded.purpose === 'За каву та десерти',
    'demo link round-trips');
  console.log('\ndemo link:\n' + demo);

  if (process.exitCode !== 1) console.log('\nAll tests passed.');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildNbuQrUrl, decodeNbuQrUrl };
  if (require.main === module) runSelfTest();
}
