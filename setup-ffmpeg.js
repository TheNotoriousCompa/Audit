// setup-ffmpeg.js
// Script to download FFmpeg for Windows

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const AdmZip = require('adm-zip');

const FFMPEG_VERSION = '7.1';
const FFMPEG_URL = `https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n${FFMPEG_VERSION}-latest-win64-gpl-${FFMPEG_VERSION}.zip`;
const FFMPEG_DIR = path.join(__dirname, 'ffmpeg');
const ZIP_PATH = path.join(__dirname, 'ffmpeg.zip');

console.log('🎬 Setting up FFmpeg...\n');

// Step 1: Create ffmpeg directory
if (!fs.existsSync(FFMPEG_DIR)) {
    console.log('📁 Creating ffmpeg directory...');
    fs.mkdirSync(FFMPEG_DIR, { recursive: true });
} else {
    console.log('✓ ffmpeg directory already exists');
}

// Step 2: Check if FFmpeg already exists
const ffmpegExe = path.join(FFMPEG_DIR, 'bin', 'ffmpeg.exe');
if (fs.existsSync(ffmpegExe)) {
    console.log('✓ FFmpeg already downloaded, skipping...\n');
    process.exit(0);
}

// Step 3: Download FFmpeg
function downloadFFmpeg() {
    return new Promise((resolve, reject) => {
        console.log(`📥 Downloading FFmpeg ${FFMPEG_VERSION}...`);
        console.log(`   URL: ${FFMPEG_URL}`);

        const file = fs.createWriteStream(ZIP_PATH);

        https.get(FFMPEG_URL, (response) => {
            // Handle redirects
            if (response.statusCode === 302 || response.statusCode === 301) {
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

// Step 4: Extract FFmpeg
function extractFFmpeg() {
    console.log('📦 Extracting FFmpeg...');

    try {
        const zip = new AdmZip(ZIP_PATH);
        const zipEntries = zip.getEntries();

        // Find the bin directory in the zip
        const binEntries = zipEntries.filter(entry => entry.entryName.includes('/bin/'));

        if (binEntries.length === 0) {
            throw new Error('No bin directory found in FFmpeg archive');
        }

        // Extract only the bin directory contents
        const binDir = path.join(FFMPEG_DIR, 'bin');
        fs.mkdirSync(binDir, { recursive: true });

        binEntries.forEach(entry => {
            if (!entry.isDirectory) {
                const fileName = path.basename(entry.entryName);
                const targetPath = path.join(binDir, fileName);
                fs.writeFileSync(targetPath, entry.getData());
                console.log(`  ✓ Extracted: ${fileName}`);
            }
        });

        // Clean up zip file
        fs.unlinkSync(ZIP_PATH);
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
        console.log('\nYou can now build your application with: npm run build\n');
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        process.exit(1);
    }
}

main();
