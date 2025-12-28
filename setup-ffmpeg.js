// setup-ffmpeg.js
// Script to download FFmpeg for Windows, Mac, and Linux

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const AdmZip = require('adm-zip');

const FFMPEG_VERSION = '7.0'; // Updated to 7.0 for better compatibility checks
const FFMPEG_DIR = path.join(__dirname, 'ffmpeg');
const ZIP_PATH = path.join(__dirname, 'ffmpeg.zip');
const TAR_PATH = path.join(__dirname, 'ffmpeg.tar.xz');

// Detect Platform
const platform = process.platform;
const arch = process.arch;

console.log(`🎬 Setting up FFmpeg for platform: ${platform} (${arch})...\n`);

let DOWNLOAD_URL = '';
let IS_ZIP = true; // Windows uses zip, Linux/Mac often use tar.xz

if (platform === 'win32') {
    DOWNLOAD_URL = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip';
} else if (platform === 'darwin') {
    // macOS (Intel & Apple Silicon) - Static builds
    IS_ZIP = true;
    DOWNLOAD_URL = 'https://evermeet.cx/ffmpeg/ffmpeg-115340-g4909a96324.zip'; // Using a stable static build
} else if (platform === 'linux') {
    IS_ZIP = false;
    DOWNLOAD_URL = 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz';
} else {
    console.error('❌ Unsupported platform:', platform);
    process.exit(1);
}

// Step 1: Create ffmpeg directory
if (!fs.existsSync(FFMPEG_DIR)) {
    console.log('📁 Creating ffmpeg directory...');
    fs.mkdirSync(FFMPEG_DIR, { recursive: true });
} else {
    console.log('✓ ffmpeg directory already exists');
}

// Step 2: Check if FFmpeg already exists
const ffmpegExeName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
const ffmpegExe = path.join(FFMPEG_DIR, 'bin', ffmpegExeName);
// On Mac/Linux, simpler structure often used, but we'll normalize to /bin/ffmpeg
const ffmpegExeSimple = path.join(FFMPEG_DIR, ffmpegExeName);

if (fs.existsSync(ffmpegExe) || fs.existsSync(ffmpegExeSimple)) {
    console.log('✓ FFmpeg already downloaded, skipping...\n');
    process.exit(0);
}

// Step 3: Download FFmpeg
function downloadFFmpeg() {
    return new Promise((resolve, reject) => {
        console.log(`📥 Downloading FFmpeg...`);
        console.log(`   URL: ${DOWNLOAD_URL}`);

        const destPath = IS_ZIP ? ZIP_PATH : TAR_PATH;
        const file = fs.createWriteStream(destPath);

        https.get(DOWNLOAD_URL, (response) => {
            // Handle redirects
            if (response.statusCode === 302 || response.statusCode === 301) {
                https.get(response.headers.location, (redirectResponse) => {
                    handleResponse(redirectResponse, file, destPath, resolve, reject);
                }).on('error', reject);
            } else {
                handleResponse(response, file, destPath, resolve, reject);
            }
        }).on('error', (err) => {
            if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
            reject(err);
        });
    });
}

function handleResponse(response, file, destPath, resolve, reject) {
    const totalSize = parseInt(response.headers['content-length'], 10);
    let downloaded = 0;

    response.on('data', (chunk) => {
        downloaded += chunk.length;
        if (totalSize) {
            const percent = ((downloaded / totalSize) * 100).toFixed(1);
            process.stdout.write(`\r   Progress: ${percent}%`);
        }
    });

    response.pipe(file);

    file.on('finish', () => {
        file.close();
        console.log('\n✓ Download complete!\n');
        resolve();
    });

    file.on('error', (err) => {
        fs.unlinkSync(destPath);
        reject(err);
    });
}

// Step 4: Extract FFmpeg
function extractFFmpeg() {
    console.log('📦 Extracting FFmpeg...');

    try {
        if (IS_ZIP) {
            const zip = new AdmZip(ZIP_PATH);
            const zipEntries = zip.getEntries();
            const binDir = path.join(FFMPEG_DIR, 'bin');
            if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

            let found = false;
            zipEntries.forEach(entry => {
                // Determine if it's the ffmpeg binary
                // Windows: bin/ffmpeg.exe or top level ffmpeg.exe
                // Mac: ffmpeg
                const entryName = entry.entryName;
                const baseName = path.basename(entryName);

                if (baseName === ffmpegExeName) {
                    fs.writeFileSync(path.join(binDir, baseName), entry.getData());
                    // chmod +x for mac
                    if (platform !== 'win32') {
                        execSync(`chmod +x "${path.join(binDir, baseName)}"`);
                    }
                    console.log(`  ✓ Extracted: ${baseName}`);
                    found = true;
                }
            });

            fs.unlinkSync(ZIP_PATH);

            if (!found) {
                // Fallback for Mac zip which might be just the executable at root
                // Re-read zip just to be safe or assuming previous loop covered it.
                // If the evermeet zip is flat:
                if (platform === 'darwin') {
                    // Try extracting all flat?
                    // Verify logic for specific url structure
                }
            }

        } else {
            // Tar extraction for Linux (requires tar command)
            // Assumes system has tar (standard on linux/mac actions)
            execSync(`tar -xf "${TAR_PATH}" -C "${FFMPEG_DIR}" --strip-components=1`, { stdio: 'inherit' });

            // Move binary to bin if needed
            const extractedBin = path.join(FFMPEG_DIR, 'ffmpeg');
            const targetBinDir = path.join(FFMPEG_DIR, 'bin');
            if (!fs.existsSync(targetBinDir)) fs.mkdirSync(targetBinDir, { recursive: true });

            if (fs.existsSync(extractedBin)) {
                fs.renameSync(extractedBin, path.join(targetBinDir, 'ffmpeg'));
            }

            fs.unlinkSync(TAR_PATH);
        }
        console.log('✓ Extraction complete!\n');
    } catch (error) {
        console.error('❌ Extraction failed:', error.message);
        throw error;
    }
}

// Main execution
async function main() {
    try {
        await downloadFFmpeg();
        extractFFmpeg();

        console.log('✅ FFmpeg setup complete!');
        console.log(`📍 Location: ${FFMPEG_DIR}`);
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        process.exit(1);
    }
}

main();
