// setup-python.js
// Script to download Python embeddable and install dependencies

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const AdmZip = require('adm-zip');

const PYTHON_VERSION = '3.13.0'; // Latest 3.13.x embeddable available
const PYTHON_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;
const RUNTIME_DIR = path.join(__dirname, 'python-runtime');
const ZIP_PATH = path.join(__dirname, 'python-embed.zip');

console.log('🐍 Setting up Python embeddable runtime...\n');

// Step 1: Create runtime directory
if (!fs.existsSync(RUNTIME_DIR)) {
    console.log('📁 Creating python-runtime directory...');
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
} else {
    console.log('✓ python-runtime directory already exists');
}

// Step 2: Download Python embeddable
function downloadPython() {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(path.join(RUNTIME_DIR, 'python.exe'))) {
            console.log('✓ Python already downloaded, skipping...\n');
            resolve();
            return;
        }

        console.log(`📥 Downloading Python ${PYTHON_VERSION} embeddable...`);
        console.log(`   URL: ${PYTHON_URL}`);

        const file = fs.createWriteStream(ZIP_PATH);

        https.get(PYTHON_URL, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // Follow redirect
                https.get(response.headers.location, (redirectResponse) => {
                    const totalSize = parseInt(redirectResponse.headers['content-length'], 10);
                    let downloaded = 0;

                    redirectResponse.on('data', (chunk) => {
                        downloaded += chunk.length;
                        const percent = ((downloaded / totalSize) * 100).toFixed(1);
                        process.stdout.write(`\r   Progress: ${percent}%`);
                    });

                    redirectResponse.pipe(file);

                    file.on('finish', () => {
                        file.close();
                        console.log('\n✓ Download complete!\n');
                        resolve();
                    });
                }).on('error', reject);
            } else {
                const totalSize = parseInt(response.headers['content-length'], 10);
                let downloaded = 0;

                response.on('data', (chunk) => {
                    downloaded += chunk.length;
                    const percent = ((downloaded / totalSize) * 100).toFixed(1);
                    process.stdout.write(`\r   Progress: ${percent}%`);
                });

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    console.log('\n✓ Download complete!\n');
                    resolve();
                });
            }
        }).on('error', (err) => {
            fs.unlinkSync(ZIP_PATH);
            reject(err);
        });
    });
}

// Step 3: Extract Python
function extractPython() {
    if (fs.existsSync(path.join(RUNTIME_DIR, 'python.exe'))) {
        console.log('✓ Python already extracted, skipping...\n');
        return;
    }

    console.log('📦 Extracting Python...');
    const zip = new AdmZip(ZIP_PATH);
    zip.extractAllTo(RUNTIME_DIR, true);

    // Clean up zip file
    fs.unlinkSync(ZIP_PATH);
    console.log('✓ Extraction complete!\n');
}

// Step 4: Configure Python paths
function configurePython() {
    console.log('⚙️  Configuring Python paths...');

    const pthFile = path.join(RUNTIME_DIR, `python${PYTHON_VERSION.replace('.', '').substring(0, 3)}._pth`);

    if (fs.existsSync(pthFile)) {
        let content = fs.readFileSync(pthFile, 'utf8');

        // Uncomment import site to enable site-packages
        content = content.replace('#import site', 'import site');

        // Add Lib/site-packages to path
        if (!content.includes('Lib/site-packages')) {
            content += '\nLib/site-packages\n';
        }

        fs.writeFileSync(pthFile, content);
        console.log('✓ Python paths configured!\n');
    }
}

// Step 5: Install get-pip
function installPip() {
    console.log('📦 Installing pip...');

    const pipPath = path.join(RUNTIME_DIR, 'Scripts', 'pip.exe');
    if (fs.existsSync(pipPath)) {
        console.log('✓ pip already installed, skipping...\n');
        return;
    }

    const getPipUrl = 'https://bootstrap.pypa.io/get-pip.py';
    const getPipPath = path.join(RUNTIME_DIR, 'get-pip.py');

    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(getPipPath);

        https.get(getPipUrl, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();

                // Run get-pip.py
                const pythonExe = path.join(RUNTIME_DIR, 'python.exe');
                try {
                    execSync(`"${pythonExe}" "${getPipPath}"`, {
                        stdio: 'inherit',
                        cwd: RUNTIME_DIR
                    });
                    fs.unlinkSync(getPipPath);
                    console.log('✓ pip installed!\n');
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', reject);
    });
}

// Step 6: Install dependencies
function installDependencies() {
    console.log('📦 Installing Python dependencies from requirements.txt...');

    const requirementsPath = path.join(__dirname, 'requirements.txt');
    if (!fs.existsSync(requirementsPath)) {
        console.log('⚠️  requirements.txt not found, skipping...\n');
        return;
    }

    const pythonExe = path.join(RUNTIME_DIR, 'python.exe');
    const pipExe = path.join(RUNTIME_DIR, 'Scripts', 'pip.exe');

    try {
        execSync(`"${pipExe}" install -r "${requirementsPath}" --target "${path.join(RUNTIME_DIR, 'Lib', 'site-packages')}"`, {
            stdio: 'inherit'
        });
        console.log('✓ Dependencies installed!\n');
    } catch (error) {
        console.error('❌ Failed to install dependencies:', error.message);
        throw error;
    }
}

// Main execution
async function main() {
    try {
        await downloadPython();
        extractPython();
        configurePython();
        await installPip();
        installDependencies();

        console.log('✅ Python runtime setup complete!');
        console.log(`📍 Location: ${RUNTIME_DIR}`);
        console.log('\nYou can now build your application with: npm run build\n');
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        process.exit(1);
    }
}

main();
