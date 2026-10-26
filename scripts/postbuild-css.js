// Post-build CSS fixup.
//
// Next's CSS minifier collapses `backdrop-filter` into the `-webkit-` prefixed
// form only. Chromium (Electron) ignores that alias, so the packaged renderer
// lost every frosted-glass blur while dev was fine. Re-inject the standard
// property next to each prefixed declaration.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'dist', 'renderer');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.css')) out.push(full);
  }
  return out;
}

let updated = 0;
if (fs.existsSync(ROOT)) {
  for (const file of walk(ROOT)) {
    const css = fs.readFileSync(file, 'utf8');
    if (!css.includes('-webkit-backdrop-filter')) continue;
    // Drop any existing standard declaration, then duplicate each prefixed one.
    const stripped = css.replace(/(?<!-webkit-)backdrop-filter:[^;}]+;?/g, '');
    const fixed = stripped.replace(
      /-webkit-backdrop-filter:([^;}]+)/g,
      (_m, value) => `backdrop-filter:${value};-webkit-backdrop-filter:${value}`
    );
    if (fixed !== css) {
      fs.writeFileSync(file, fixed);
      updated++;
    }
  }
}

console.log(`[postbuild-css] backdrop-filter restored in ${updated} file(s)`);
