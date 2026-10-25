// Fetch headphone correction data from the upstream AutoEq project
// (https://github.com/jaakkopasanen/AutoEq, MIT license) and convert it
// to Audit's 10-band EQ preset format (see src/components/player/eq-presets.ts).
//
// Why upstream instead of the APK blob: Poweramp ships its headphone
// presets as a proprietary binary blob (auto_eq.db, table eq_presets,
// 17k rows, "PaP" binary records). Decoding that blob would tie us to a
// vendor format, so we pull the same underlying open data from its
// public source and resample it onto our 10 fixed bands.
//
// Usage:
//   node scripts/fetch-autoeq.js "7Hz Salnotes Zero" --target Harman --out src/components/player/autoeq.custom.json
//
// Output: { "<preset name>": [g31, g62, ..., g16000], ... } in dB.
// Values are resampled from the parametric filters by evaluating the
// biquad cascade at each band centre (RBJ cookbook, Q as published).

const https = require('https');

const BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const BASE = 'https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results';

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function slug(name) {
  return name.trim().replace(/\s+/g, '_');
}

// Evaluate one peaking/low/high-shelf filter at frequency f (RBJ cookbook).
function filterGainDb(type, f0, Q, gainDb, f) {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * f0) / 48000;
  const w = (2 * Math.PI * f) / 48000;
  const alpha = Math.sin(w0) / (2 * Q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'PK') {
    b0 = 1 + alpha * A; b1 = -2 * Math.cos(w0); b2 = 1 - alpha * A;
    a0 = 1 + alpha / A; a1 = -2 * Math.cos(w0); a2 = 1 - alpha / A;
  } else if (type === 'LSC') {
    const s = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 - (A - 1) * Math.cos(w0) + s);
    b1 = 2 * A * (A - 1 - (A + 1) * Math.cos(w0));
    b2 = A * (A + 1 - (A - 1) * Math.cos(w0) - s);
    a0 = A + 1 + (A - 1) * Math.cos(w0) + s;
    a1 = -2 * (A - 1 + (A + 1) * Math.cos(w0));
    a2 = A + 1 + (A - 1) * Math.cos(w0) - s;
  } else if (type === 'HSC') {
    const s = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 + (A - 1) * Math.cos(w0) + s);
    b1 = -2 * A * (A - 1 + (A + 1) * Math.cos(w0));
    b2 = A * (A + 1 + (A - 1) * Math.cos(w0) - s);
    a0 = A + 1 - (A - 1) * Math.cos(w0) + s;
    a1 = 2 * (A - 1 - (A + 1) * Math.cos(w0));
    a2 = A + 1 - (A - 1) * Math.cos(w0) - s;
  } else {
    return 0;
  }
  const cw = Math.cos(w), cw2 = Math.cos(2 * w);
  const sw = Math.sin(w), sw2 = Math.sin(2 * w);
  const numRe = b0 + b1 * cw + b2 * cw2, numIm = -(b1 * sw + b2 * sw2);
  const denRe = a0 + a1 * cw + a2 * cw2, denIm = -(a1 * sw + a2 * sw2);
  const mag = Math.sqrt(numRe * numRe + numIm * numIm) / Math.sqrt(denRe * denRe + denIm * denIm);
  return 20 * Math.log10(Math.max(1e-9, mag));
}

function clamp(v) {
  return Math.max(-12, Math.min(12, Math.round(v * 2) / 2));
}

async function main() {
  const [name, ...rest] = process.argv.slice(2);
  if (!name) {
    console.error('Usage: node scripts/fetch-autoeq.js "<Headphone Name>" [--target <Target>] [--out <file>]');
    process.exit(2);
  }
  const ti = rest.indexOf('--target');
  const target = ti >= 0 && rest[ti + 1] ? rest[ti + 1] : 'Harman in-ear 2019v2';
  const oi = rest.indexOf('--out');
  const out = oi >= 0 && rest[oi + 1] ? rest[oi + 1] : null;

  const dir = `${BASE}/${encodeURIComponent(target)}/${encodeURIComponent(slug(name))}`;
  const files = await get(`${dir}/${encodeURIComponent(slug(name))}_ParametricEQ.txt`).catch(() => null);
  if (!files) {
    console.error(`No ParametricEQ.txt at ${dir} — check the model name and target on the AutoEq repo.`);
    process.exit(1);
  }
  const filters = files.split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('Preamp'))
    .map((l) => {
      const m = l.match(/Filter\s*\d+:\s*ON\s+(PK|LSC|HSC)\s+Fc\s*([\d.]+)\s*Hz\s+Gain\s*([+-]?[\d.]+)\s*dB\s+Q\s*([\d.]+)/);
      return m ? { type: m[1], f0: Number(m[2]), gain: Number(m[3]), q: Number(m[4]) } : null;
    })
    .filter(Boolean);

  const gains = BANDS.map((f) => clamp(filters.reduce((s, flt) => s + filterGainDb(flt.type, flt.f0, flt.q, flt.gain, f), 0)));
  const preset = { [name]: gains };
  const json = JSON.stringify(preset, null, 2);
  if (out) {
    require('fs').writeFileSync(out, json);
    console.log(`Wrote ${out}`);
  } else {
    console.log(json);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
