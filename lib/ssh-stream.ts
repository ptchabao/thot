import { Client } from 'ssh2';
import { SSHConfig } from './ssh';

export async function downloadFileStream(config: SSHConfig, remotePath: string): Promise<ReadableStream> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let timeoutId: NodeJS.Timeout;
    let completed = false;
    let sftp: any;
    let fileHandle: any;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (fileHandle) {
        sftp?.close(fileHandle, () => {});
      }
      if (!completed) {
        completed = true;
        conn.end();
      }
    };

    // Set timeout for entire operation (45 minutes for very large files)
    timeoutId = setTimeout(() => {
      if (!completed) {
        cleanup();
        reject(new Error('Download timeout - operation took too long'));
      }
    }, 2700000); // 45 minutes

    conn.on('ready', () => {
      conn.sftp((err, sftpClient) => {
        if (err) {
          cleanup();
          return reject(err);
        }
        sftp = sftpClient;

        // Open file for reading
        sftp.open(remotePath, 'r', (err: any, handle: any) => {
          if (err) {
            cleanup();
            return reject(new Error(`Failed to open file: ${err.message}`));
          }
          fileHandle = handle;

          // Get file stats
          sftp.fstat(handle, (err: any, stats: any) => {
            if (err) {
              cleanup();
              return reject(new Error(`Failed to get file stats: ${err.message}`));
            }

            // Check if file is too large (>10GB)
            const maxSize = 10 * 1024 * 1024 * 1024; // 10GB
            if (stats.size > maxSize) {
              cleanup();
              return reject(new Error(`File too large: ${(stats.size / 1024 / 1024 / 1024).toFixed(1)}GB (max: 10GB)`));
            }

            let position = 0;
            const chunkSize = 1024 * 1024; // 1MB chunks

            // Create readable stream
            const stream = new ReadableStream({
              async start(controller) {
                const readChunk = async () => {
                  if (completed || position >= stats.size) {
                    cleanup();
                    controller.close();
                    return;
                  }

                  return new Promise<void>((resolveRead, rejectRead) => {
                    const readTimeout = setTimeout(() => {
                      if (!completed) {
                        cleanup();
                        controller.error(new Error('File read timeout'));
                      }
                      rejectRead(new Error('Read timeout'));
                    }, 60000); // 60 seconds per chunk

                    sftp.read(handle, Buffer.alloc(chunkSize), 0, chunkSize, position, (err: any, bytesRead: any, buffer: any) => {
                      clearTimeout(readTimeout);
                      
                      if (err) {
                        cleanup();
                        controller.error(new Error(`Failed to read chunk: ${err.message}`));
                        rejectRead(err);
                        return;
                      }

                      if (bytesRead === 0) {
                        // End of file
                        cleanup();
                        controller.close();
                        resolveRead();
                        return;
                      }

                      // Enqueue the actual data read
                      const chunk = buffer.slice(0, bytesRead);
                      controller.enqueue(chunk);
                      position += bytesRead;

                      // Continue reading next chunk
                      resolveRead();
                      setTimeout(readChunk, 10); // Small delay to prevent blocking
                    });
                  });
                };

                // Start reading
                readChunk().catch(controller.error);
              }
            });

            resolve(stream);
          });
        });
      });
    });

    conn.on('error', (err) => {
      cleanup();
      reject(new Error(`SSH connection error: ${err.message}`));
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
