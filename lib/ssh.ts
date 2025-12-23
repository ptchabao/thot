import { Client } from 'ssh2';

interface SSHConfig {
  host: string;
  username: string;
  password: string;
  basePath: string;
}

export async function listCreatorsAndFiles(config: SSHConfig): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const creators: any[] = [];
    let timeoutId: NodeJS.Timeout;
    let completed = false;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (!completed) {
        completed = true;
        conn.end();
      }
    };

    // Set timeout for entire operation (2 minutes)
    timeoutId = setTimeout(() => {
      if (!completed) {
        cleanup();
        reject(new Error('Directory listing timeout'));
      }
    }, 120000);

    conn.on('ready', () => {
      // Liste tous les dossiers de créateurs
      conn.sftp((err, sftp) => {
        if (err) {
          conn.end();
          return reject(err);
        }

        sftp.readdir(config.basePath, (err, items) => {
          if (err) {
            cleanup();
            return reject(err);
          }

          // Filtrer seulement les dossiers
          const folders = items.filter(item => item.longname.startsWith('d'));

          if (folders.length === 0) {
            cleanup();
            return resolve([]);
          }

          let processed = 0;

          folders.forEach((folder) => {
            const folderPath = `${config.basePath}/${folder.filename}`;

            // Lister les fichiers dans chaque dossier
            sftp.readdir(folderPath, (err, files) => {
              if (err) {
                console.error(`Error reading folder ${folderPath}:`, err);
                processed++;
                if (processed === folders.length) {
                  cleanup();
                  resolve(creators);
                }
                return;
              }

              
              // Filtrer les fichiers vidéo (ts, mp4, avi, mov, mkv, flv, webm)
              const videoFiles = files
                .filter(file => file.longname.startsWith('-') && (
                  file.filename.endsWith('.ts') ||
                  file.filename.endsWith('.mp4') ||
                  file.filename.endsWith('.avi') ||
                  file.filename.endsWith('.mov') ||
                  file.filename.endsWith('.mkv') ||
                  file.filename.endsWith('.flv') ||
                  file.filename.endsWith('.webm')
                ))
                .map(file => ({
                  name: file.filename,
                  path: `${folderPath}/${file.filename}`,
                  size: file.attrs.size,
                  date: file.attrs.mtime ? new Date(file.attrs.mtime * 1000).toISOString() : undefined,
                }))
                .sort((a, b) => {
                  // Sort by date descending (newest first)
                  if (!a.date) return 1;
                  if (!b.date) return -1;
                  return new Date(b.date).getTime() - new Date(a.date).getTime();
                });

              creators.push({
                name: folder.filename.split('-')[0] || folder.filename,
                folderName: folder.filename,
                files: videoFiles,
              });

              processed++;
              if (processed === folders.length) {
                cleanup();
                resolve(creators);
              }
            });
          });
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
      readyTimeout: 15000, // Increased to 15 seconds connection timeout
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

export async function downloadFile(config: SSHConfig, remotePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let timeoutId: NodeJS.Timeout;
    let readTimeoutId: NodeJS.Timeout;
    let completed = false;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (readTimeoutId) clearTimeout(readTimeoutId);
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
      conn.sftp((err, sftp) => {
        if (err) {
          cleanup();
          return reject(err);
        }

        // Check file size first
        sftp.stat(remotePath, (err, stats) => {
          if (err) {
            cleanup();
            return reject(new Error(`File not found or inaccessible: ${remotePath}`));
          }

          // Check if file is too large (>10GB)
          const maxSize = 10 * 1024 * 1024 * 1024; // 10GB
          if (stats.size > maxSize) {
            cleanup();
            return reject(new Error(`File too large: ${(stats.size / 1024 / 1024 / 1024).toFixed(1)}GB (max: 10GB)`));
          }

          // Dynamic read timeout based on file size (60 seconds per GB, max 30 minutes)
          const sizeGB = stats.size / (1024 * 1024 * 1024);
          const sizeBasedTimeout = Math.min(1800000, Math.max(120000, sizeGB * 60000));
          readTimeoutId = setTimeout(() => {
            if (!completed) {
              cleanup();
              reject(new Error('File read timeout'));
            }
          }, sizeBasedTimeout);

          sftp.readFile(remotePath, (err, data) => {
            clearTimeout(readTimeoutId);
            if (err) {
              cleanup();
              return reject(new Error(`Failed to read file: ${err.message}`));
            }
            
            if (!data || data.length === 0) {
              cleanup();
              return reject(new Error('File is empty or corrupted'));
            }

            cleanup();
            resolve(data);
          });
        });
      });
    });

    conn.on('error', (err) => {
      cleanup();
      reject(new Error(`SSH connection error: ${err.message}`));
    });

    // Add connection timeout
    conn.connect({
      host: config.host,
      username: config.username,
      password: config.password,
      readyTimeout: 15000, // Increased to 15 seconds connection timeout
      algorithms: {
        kex: ['diffie-hellman-group14-sha256', 'diffie-hellman-group14-sha1', 'diffie-hellman-group-exchange-sha256'],
        cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr', 'aes128-cbc'],
        serverHostKey: ['ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256', 'ssh-ed25519'],
        hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1', 'hmac-md5']
      },
      // Disable strict host key checking for now
      hostVerifier: () => true
    });
  });
}


