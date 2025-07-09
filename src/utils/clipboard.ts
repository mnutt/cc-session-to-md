import { ClipboardResult } from '../types/index.js';

/**
 * Copy text to clipboard using system clipboard
 */
export async function copyToClipboard(text: string): Promise<ClipboardResult> {
  try {
    // Try to use clipboardy module
    const clipboardy = await import('clipboardy');
    await clipboardy.default.write(text);
    return { success: true };
  } catch (error) {
    // If clipboardy fails, try using child_process with pbcopy (macOS)
    try {
      const { spawn } = await import('child_process');
      const pbcopy = spawn('pbcopy');
      
      return new Promise((resolve) => {
        pbcopy.stdin.write(text);
        pbcopy.stdin.end();
        
        pbcopy.on('close', (code) => {
          if (code === 0) {
            resolve({ success: true });
          } else {
            resolve({ 
              success: false, 
              error: `pbcopy exited with code ${code}` 
            });
          }
        });
        
        pbcopy.on('error', (err) => {
          resolve({ 
            success: false, 
            error: `pbcopy error: ${err.message}` 
          });
        });
      });
    } catch (pbcopyError) {
      // If pbcopy fails, try xclip (Linux)
      try {
        const { spawn } = await import('child_process');
        const xclip = spawn('xclip', ['-selection', 'clipboard']);
        
        return new Promise((resolve) => {
          xclip.stdin.write(text);
          xclip.stdin.end();
          
          xclip.on('close', (code) => {
            if (code === 0) {
              resolve({ success: true });
            } else {
              resolve({ 
                success: false, 
                error: `xclip exited with code ${code}` 
              });
            }
          });
          
          xclip.on('error', (err) => {
            resolve({ 
              success: false, 
              error: `xclip error: ${err.message}` 
            });
          });
        });
      } catch (xclipError) {
        // If all clipboard methods fail, return error
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { 
          success: false, 
          error: `Unable to copy to clipboard: ${errorMessage}` 
        };
      }
    }
  }
}

/**
 * Check if clipboard functionality is available
 */
export async function isClipboardAvailable(): Promise<boolean> {
  try {
    // Try clipboardy
    await import('clipboardy');
    return true;
  } catch {
    // Try pbcopy (macOS)
    try {
      const { spawn } = await import('child_process');
      const pbcopy = spawn('which', ['pbcopy']);
      
      return new Promise((resolve) => {
        pbcopy.on('close', (code) => {
          if (code === 0) {
            resolve(true);
          } else {
            // Try xclip (Linux)
            const xclip = spawn('which', ['xclip']);
            xclip.on('close', (code) => {
              resolve(code === 0);
            });
            xclip.on('error', () => {
              resolve(false);
            });
          }
        });
        
        pbcopy.on('error', () => {
          resolve(false);
        });
      });
    } catch {
      return false;
    }
  }
}

/**
 * Get system clipboard type
 */
export function getClipboardType(): 'clipboardy' | 'pbcopy' | 'xclip' | 'none' {
  try {
    require('clipboardy');
    return 'clipboardy';
  } catch {
    // Check for pbcopy (macOS)
    if (process.platform === 'darwin') {
      return 'pbcopy';
    }
    
    // Check for xclip (Linux)
    if (process.platform === 'linux') {
      return 'xclip';
    }
    
    return 'none';
  }
}

/**
 * Copy text to clipboard with fallback to console output
 */
export async function copyToClipboardWithFallback(text: string): Promise<void> {
  const result = await copyToClipboard(text);
  
  if (!result.success) {
    console.warn(`Warning: Could not copy to clipboard: ${result.error}`);
    console.log('\nOutput (since clipboard is not available):');
    console.log('---');
    console.log(text);
  }
}

/**
 * Write text to a file as a fallback to clipboard
 */
export async function writeToFile(text: string, filename: string): Promise<void> {
  const fs = await import('fs');
  const path = await import('path');
  
  const outputPath = path.resolve(filename);
  fs.writeFileSync(outputPath, text, 'utf8');
  console.log(`Output written to: ${outputPath}`);
}

/**
 * Smart clipboard copy that chooses the best method
 */
export async function smartCopy(text: string, fallbackFile?: string): Promise<void> {
  const clipboardResult = await copyToClipboard(text);
  
  if (clipboardResult.success) {
    console.log('📋 Copied to clipboard');
    return;
  }
  
  // If clipboard failed and we have a fallback file, write to it
  if (fallbackFile) {
    await writeToFile(text, fallbackFile);
    return;
  }
  
  // Otherwise, just output to console
  console.warn(`Warning: Could not copy to clipboard: ${clipboardResult.error}`);
  console.log('\nOutput:');
  console.log('---');
  console.log(text);
}