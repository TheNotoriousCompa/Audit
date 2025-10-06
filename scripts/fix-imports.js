import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const mainFile = join(__dirname, '..', 'dist', 'main', 'main.js');

try {
  // Read the compiled file
  let content = readFileSync(mainFile, 'utf-8');
  
  // Add the proper import.meta.url handling
  const newContent = `// Electron main process entry point
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

${content}
`;
  
  // Write the fixed content back
  writeFileSync(mainFile, newContent, 'utf-8');
  console.log('Successfully fixed main.js imports');
} catch (error) {
  console.error('Error fixing imports:', error);
  process.exit(1);
}
