import { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';
import path from 'path';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { url, outputFolder } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing URL parameter' });
  }

  // Percorso al tuo script Python
  const scriptPath = path.join(process.cwd(), 'python', 'youtube_to_mp3_converter.py');

  // Compose the command with output folder if provided
  let command = `python "${scriptPath}" "${url}"`;
  if (outputFolder && typeof outputFolder === 'string') {
    command += ` "${outputFolder}"`;
  }

  // Esegui lo script Python
  exec(command, (err, stdout, stderr) => {
    if (err) {
      console.error(stderr);
      return res.status(500).json({ error: 'Python script failed', details: stderr });
    }

    // Ritorna il risultato dallo script Python
    res.status(200).json({ output: stdout });
  });
}
