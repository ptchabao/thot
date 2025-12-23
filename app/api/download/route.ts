import { NextRequest, NextResponse } from 'next/server';
import { downloadFile } from '@/lib/ssh';
import { downloadFileStream } from '@/lib/ssh-stream';
import { Client } from 'ssh2';

async function getFileSize(config: any, filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let timeoutId: NodeJS.Timeout;
    let completed = false;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (!completed) {
        completed = true;
        conn.end();
      }
    };

    timeoutId = setTimeout(() => {
      if (!completed) {
        cleanup();
        reject(new Error('File size check timeout'));
      }
    }, 30000); // 30 seconds

    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) {
          cleanup();
          return reject(err);
        }

        sftp.stat(filePath, (err, stats) => {
          cleanup();
          if (err) {
            return reject(err);
          }
          resolve(stats.size / (1024 * 1024)); // Return size in MB
        });
      });
    });

    conn.on('error', (err) => {
      cleanup();
      reject(err);
    });

    conn.connect({
      host: config.host,
      username: config.username,
      password: config.password,
      readyTimeout: 15000,
      algorithms: {
        kex: ['diffie-hellman-group14-sha256', 'diffie-hellman-group14-sha1', 'diffie-hellman-group-exchange-sha256'],
        cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr', 'aes128-cbc'],
        serverHostKey: ['ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256', 'ssh-ed25519'],
        hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1', 'hmac-md5']
      },
      hostVerifier: () => true
    });
  });
}

async function createReadableStream(buffer: Buffer): Promise<ReadableStream> {
  return new ReadableStream({
    start(controller) {
      // Stream the buffer in chunks for better memory efficiency
      const chunkSize = 1024 * 1024; // 1MB chunks
      let offset = 0;

      function pushChunk() {
        if (offset >= buffer.length) {
          controller.close();
          return;
        }

        const chunk = buffer.slice(offset, offset + chunkSize);
        controller.enqueue(chunk);
        offset += chunkSize;

        // Use setTimeout to allow event loop processing
        setTimeout(pushChunk, 0);
      }

      pushChunk();
    },
  });
}

async function downloadWithRetry(config: any, filePath: string, maxRetries: number = 3): Promise<Buffer> {
  let lastError: Error = new Error('Unknown error occurred');
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Download attempt ${attempt}/${maxRetries} for: ${filePath}`);
      const fileBuffer = await downloadFile(config, filePath);
      console.log(`Download successful on attempt ${attempt}, size: ${fileBuffer.length} bytes`);
      return fileBuffer;
    } catch (error: any) {
      lastError = error;
      console.error(`Download attempt ${attempt} failed:`, error.message);
      
      // Don't retry on certain errors
      if (error.message.includes('File not found') || 
          error.message.includes('File too large') || 
          error.message.includes('File is empty')) {
        throw error;
      }
      
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const filePath = searchParams.get('path');

    if (!filePath) {
      return NextResponse.json(
        { error: 'File path is required' },
        { status: 400 }
      );
    }

    // Validate file path to prevent directory traversal
    if (filePath.includes('..') || filePath.includes('~')) {
      return NextResponse.json(
        { error: 'Invalid file path' },
        { status: 400 }
      );
    }

    const config = {
      host: process.env.SSH_HOST || '31.207.39.238',
      username: process.env.SSH_USER || 'root',
      password: process.env.SSH_PASSWORD || '',
      basePath: process.env.SSH_BASE_PATH || '/home/DouyinLiveRecorder/downloads/TikTok直播',
    };

    if (!config.password) {
      return NextResponse.json(
        { error: 'SSH_PASSWORD not configured' },
        { status: 500 }
      );
    }

    console.log(`Starting download: ${filePath}`);
    
    // Use streaming for very large files (>200MB), direct download for others
    const fileSizeMB = await getFileSize(config, filePath);
    
    if (fileSizeMB > 200) {
      // Use streaming only for very large files
      console.log(`Using streaming for very large file: ${fileSizeMB}MB`);
      const stream = await downloadFileStream(config, filePath);
      const fileName = filePath.split('/').pop() || 'download.ts';
      const mp4FileName = fileName.replace(/\.ts$/, '.mp4');
      // If we know the file size (from getFileSize) provide Content-Length in bytes
      const contentLengthBytes = Math.round(fileSizeMB * 1024 * 1024);

      return new NextResponse(stream, {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Disposition': `attachment; filename="${mp4FileName}"`,
          'Content-Length': contentLengthBytes.toString(),
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Accept-Ranges': 'bytes',
        },
      });
    } else {
      // Use traditional download for most files to show browser download bar
      console.log(`Using direct download for file: ${fileSizeMB}MB`);
      const fileBuffer = await downloadWithRetry(config, filePath);
      const fileName = filePath.split('/').pop() || 'download.ts';
      const mp4FileName = fileName.replace(/\.ts$/, '.mp4');

      // Validate file buffer
      if (!fileBuffer || fileBuffer.length === 0) {
        return NextResponse.json(
          { error: 'Downloaded file is empty' },
          { status: 500 }
        );
      }

      const downloadTime = Date.now() - startTime;
      console.log(`Download completed: ${fileName} (${fileBuffer.length} bytes) in ${downloadTime}ms`);

      // Return direct file download to trigger browser download bar
      const uint8Array = new Uint8Array(fileBuffer);
      return new NextResponse(uint8Array, {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Disposition': `attachment; filename="${mp4FileName}"`,
          'Content-Length': fileBuffer.length.toString(),
          'Cache-Control': 'no-cache',
          'Connection': 'close',
        },
      });
    }
  } catch (error: any) {
    const downloadTime = Date.now() - startTime;
    console.error(`Download failed after ${downloadTime}ms:`, error.message);
    
    // Return more specific error messages
    let errorMessage = 'Failed to download file';
    let statusCode = 500;
    
    if (error.message.includes('File not found')) {
      errorMessage = 'File not found on server';
      statusCode = 404;
    } else if (error.message.includes('File too large')) {
      errorMessage = error.message;
      statusCode = 413;
    } else if (error.message.includes('timeout')) {
      errorMessage = 'Download timeout - please try again';
      statusCode = 408;
    } else if (error.message.includes('SSH connection')) {
      errorMessage = 'Server connection error - please try again';
      statusCode = 503;
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: statusCode }
    );
  }
}


