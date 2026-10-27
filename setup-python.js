// setup-python.js
// Script to download Python for Windows (Embeddable) or Mac/Linux (Standalone)

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const AdmZip = require('adm-zip');
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);

const RUNTIME_DIR = path.join(__dirname, 'python-runtime');
const platform = process.platform;
const arch = process.arch; // 'x64' or 'arm64'

// URLs
const WIN_PYTHON_VERSION = '3.13.0';
const WIN_URL = `https://www.python.org/ftp/python/${WIN_PYTHON_VERSION}/python-${WIN_PYTHON_VERSION}-embed-amd64.zip`;

// Standalone Python builds (Indygreg) for Mac/Linux
// Using a fixed recent version
const STANDALONE_TAG = '20241016';
const STANDALONE_VERSION = '3.12.7';

let DOWNLOAD_URL = '';
let DOWNLOAD_FILE = 'python-runtime.zip'; // or .tar.gz
let IS_WINDOWS = false;

if (platform === 'win32') {
    IS_WINDOWS = true;
    DOWNLOAD_URL = WIN_URL;
    DOWNLOAD_FILE = 'python-embed.zip';
} else if (platform === 'darwin') {
    // macOS
    // x86_64 or aarch64
    const macArch = arch === 'arm64' ? 'aarch64' : 'x86_64';
    // Using a build that supports generally 10.9+ or 11+
    DOWNLOAD_URL = `https://github.com/indygreg/python-build-standalone/releases/download/${STANDALONE_TAG}/cpython-${STANDALONE_VERSION}+${STANDALONE_TAG}-${macArch}-apple-darwin-install_only.tar.gz`;
    DOWNLOAD_FILE = 'python-runtime.tar.gz';
} else {
    // Assume Linux x64
    DOWNLOAD_URL = `https://github.com/indygreg/python-build-standalone/releases/download/${STANDALONE_TAG}/cpython-${STANDALONE_VERSION}+${STANDALONE_TAG}-x86_64-unknown-linux-gnu-install_only.tar.gz`;
    DOWNLOAD_FILE = 'python-runtime.tar.gz';
}

const FILE_PATH = path.join(__dirname, DOWNLOAD_FILE);

console.log(`🐍 Setting up Python runtime for ${platform} (${arch})...\n`);

// Step 1: Create runtime directory
if (!fs.existsSync(RUNTIME_DIR)) {
    console.log('📁 Creating python-runtime directory...');
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
} else {
    // We might want to clean it if switching platforms, but usually this runs in clean CI
    console.log('✓ python-runtime directory already exists');
}

// Step 2: Download
async function downloadPython() {
    if (IS_WINDOWS && fs.existsSync(path.join(RUNTIME_DIR, 'python.exe'))) {
        console.log('✓ Python already downloaded (Windows), skipping...\n');
        return;
    }
    // For Mac/Linux check specific bin
    if (!IS_WINDOWS && fs.existsSync(path.join(RUNTIME_DIR, 'bin', 'python3'))) {
        console.log('✓ Python already downloaded (Unix), skipping...\n');
        return;
    }

    console.log(`📥 Downloading Python...`);
    console.log(`   URL: ${DOWNLOAD_URL}`);

    // Use curl for robust download handling
    // -L: Follow redirects
    // -f: Fail on HTTP errors (404, etc)
    // --retry 3: Retry on transient errors
    try {
        console.log('   Running curl...');
        execSync(`curl -L -f --retry 3 -o "${FILE_PATH}" "${DOWNLOAD_URL}"`, { stdio: 'inherit' });
        console.log('\n✓ Download complete!\n');
    } catch (e) {
        console.error('❌ Download failed:', e.message);
        throw e;
    }
}

// Step 3: Extract
async function extractPython() {
    const stats = fs.statSync(FILE_PATH);
    console.log(`📦 Archive size: ${stats.size} bytes`);
    if (stats.size < 1000) {
        throw new Error('Downloaded file is too small, likely an error page.');
    }

    console.log('📦 Extracting Python...');

    if (IS_WINDOWS) {
        const zip = new AdmZip(FILE_PATH);
        zip.extractAllTo(RUNTIME_DIR, true);
        fs.unlinkSync(FILE_PATH);
    } else {
        try {
            // Extract fully with verbose output to see what's happening
            console.log('   Running tar -xvf...');
            execSync(`tar -xvf "${FILE_PATH}" -C "${RUNTIME_DIR}"`, { stdio: 'inherit' });
            fs.unlinkSync(FILE_PATH);

            // Debug: List full structure again to be sure
            console.log('📂 Extraction Results (ls -R):');
            try { execSync(`ls -R "${RUNTIME_DIR}"`, { stdio: 'inherit' }); } catch (e) { }

        } catch (e) {
            console.error(e);
            throw new Error('Failed to extract tar.gz');
        }
    }
    console.log('✓ Extraction complete!\n');
}

// Step 4: Configure (Windows only mainly)
function configurePython() {
    if (!IS_WINDOWS) {
        return;
    }
    // ... Windows config ...

    console.log('⚙️  Configuring Python paths (Windows)...');
    // ... existing windows pth logic ...
    const pthFile = path.join(RUNTIME_DIR, `python${WIN_PYTHON_VERSION.replace('.', '').substring(0, 3)}._pth`);
    if (fs.existsSync(pthFile)) {
        let content = fs.readFileSync(pthFile, 'utf8');
        content = content.replace('#import site', 'import site');
        if (!content.includes('Lib/site-packages')) {
            content += '\nLib/site-packages\n';
        }
        fs.writeFileSync(pthFile, content);
    }
}

// Step 5: Install pip/Utils
async function postInstall() {
    console.log('⚙️  Running post-install setup...');

    let pythonBin = IS_WINDOWS
        ? path.join(RUNTIME_DIR, 'python.exe')
        : path.join(RUNTIME_DIR, 'bin', 'python3');

    // Check for nested 'python' directory (common in standalone builds)
    if (!IS_WINDOWS && !fs.existsSync(pythonBin)) {
        const nestedBin = path.join(RUNTIME_DIR, 'python', 'bin', 'python3');
        if (fs.existsSync(nestedBin)) {
            pythonBin = nestedBin;
            console.log(`✓ Found python3 in nested directory: ${pythonBin}`);
        }
    }

    // Dynamic search for Unix binary if standard path fails
    if (!IS_WINDOWS && !fs.existsSync(pythonBin)) {
        console.log('⚠️  Standard python3 path not found, searching...');
        const findCmd = `find "${RUNTIME_DIR}" -name "python3" -type f`;
        try {
            const found = execSync(findCmd, { encoding: 'utf-8' }).trim().split('\n')[0];
            if (found) {
                console.log(`✓ Found python3 at: ${found}`);
                pythonBin = found;
            }
        } catch (e) {
            console.log('Could not find python3 binary');
        }
    }

    // Ensure executable on Unix
    if (!IS_WINDOWS) {
        if (fs.existsSync(pythonBin)) {
            execSync(`chmod +x "${pythonBin}"`);
        } else {
            console.error(`❌ Python binary not found at ${pythonBin}`);
            // Don't exit yet, let it fail at next step or print more info
        }
    }

    // Install Pip for Windows (Unix builds usually have it or ensurepip)
    if (IS_WINDOWS) {
        // ... existing pip install logic ...
        const getPipUrl = 'https://bootstrap.pypa.io/get-pip.py';
        const getPipPath = path.join(RUNTIME_DIR, 'get-pip.py');

        const pipeC = fs.createWriteStream(getPipPath);
        await new Promise((resolve, reject) => {
            https.get(getPipUrl, res => {
                res.pipe(pipeC);
                pipeC.on('finish', resolve);
            }).on('error', reject);
        });

        execSync(`"${pythonBin}" "${getPipPath}"`, { stdio: 'inherit', cwd: RUNTIME_DIR });
        fs.unlinkSync(getPipPath);
    }

    // Install requirements
    const reqPath = path.join(__dirname, 'requirements.txt');
    if (fs.existsSync(reqPath)) {
        console.log('📦 Installing requirements...');
        const pipArgs = IS_WINDOWS
            ? ['install', '-r', reqPath, '--target', path.join(RUNTIME_DIR, 'Lib', 'site-packages')]
            : ['install', '-r', reqPath]; // Standalone python handles site-packages automatically if we use its pip

        if (IS_WINDOWS) {
            const pipExe = path.join(RUNTIME_DIR, 'Scripts', 'pip.exe');
            execSync(`"${pipExe}" ${pipArgs.join(' ')}`, { stdio: 'inherit' });
        } else {
            // Unix: use python -m pip
            execSync(`"${pythonBin}" -m pip ${pipArgs.join(' ')}`, { stdio: 'inherit' });
        }
    }

    pruneRuntime();
}

/** Remove stdlib pieces the app never uses (tests, Tk, pip) to keep the bundle lean. */
function pruneRuntime() {
    const winLib = path.join(RUNTIME_DIR, 'Lib');
    const unixLibRoot = path.join(RUNTIME_DIR, 'lib');
    const candidates = ['test', 'idlelib', 'tkinter', 'turtledemo', 'ensurepip', 'lib2to3'];

    const targets = candidates.map((name) => path.join(winLib, name));
    if (fs.existsSync(unixLibRoot)) {
        for (const version of fs.readdirSync(unixLibRoot)) {
            for (const name of candidates) targets.push(path.join(unixLibRoot, version, name));
        }
    }
    // pip is only needed at build time.
    const sitePackages = path.join(winLib, 'site-packages');
    if (fs.existsSync(sitePackages)) {
        for (const entry of fs.readdirSync(sitePackages)) {
            if (/^(pip|pip-|wheel|wheel-|_distutils_hack)/.test(entry)) {
                targets.push(path.join(sitePackages, entry));
            }
        }
    }

    const dirSize = (dir) => {
        let total = 0;
        try {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) total += dirSize(full);
                else total += fs.statSync(full).size;
            }
        } catch { /* ignore */ }
        return total;
    };

    let saved = 0;
    for (const target of targets) {
        if (!fs.existsSync(target)) continue;
        const size = dirSize(target);
        try {
            fs.rmSync(target, { recursive: true, force: true });
            saved += size;
        } catch { /* keep it */ }
    }
    if (saved > 0) console.log(`🧹 Pruned ${(saved / 1048576).toFixed(1)} MB of unused Python stdlib`);
}

async function main() {
    try {
        await downloadPython();
        // Check if we need to extract (if we detected it wasn't already there)
        // For simplicity if we downloaded, we extract.
        if (fs.existsSync(FILE_PATH)) {
            await extractPython();
        }

        configurePython();
        await postInstall();

        console.log('✅ Python setup complete!');
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        process.exit(1);
    }
}

main();
