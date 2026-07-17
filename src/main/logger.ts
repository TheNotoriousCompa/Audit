import * as fs from 'fs';
import path from 'path';
import { app } from 'electron';

let auditLogPath: string | null = null;

function getAuditLogPath(): string {
  if (!auditLogPath) {
    try {
      auditLogPath = path.join(app.getPath('userData'), 'audit-main.log');
    } catch {
      auditLogPath = path.join(process.cwd(), 'audit-main.log');
    }
  }
  return auditLogPath;
}

export function logToFile(message: string): void {
  try {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(getAuditLogPath(), `[${timestamp}] ${message}\n`);
  } catch (e) {
    console.error('Failed to write to log file:', e);
  }
}

export function setupCrashHandler(): void {
  process.on('uncaughtException', (error) => {
    logToFile(`[CRITICAL UNCAUGHT EXCEPTION] ${error.stack}`);
    app.quit();
  });
}
