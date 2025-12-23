import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'ssh2';

interface SSHConfig {
  host: string;
  username: string;
  password: string;
  basePath: string;
}

// Read config file
export async function GET() {
  try {
    const config: SSHConfig = {
      host: process.env.SSH_HOST || '31.207.39.238',
      username: process.env.SSH_USER || 'root',
      password: process.env.SSH_PASSWORD || '',
      basePath: '/home/DouyinLiveRecorder',
    };

    if (!config.password) {
      return NextResponse.json(
        { error: 'SSH_PASSWORD not configured' },
        { status: 500 }
      );
    }

    const configContent = await readConfigFile(config, '/home/DouyinLiveRecorder/config/URL_config.ini');
    return NextResponse.json({ config: configContent });
  } catch (error: any) {
    console.error('Error reading config:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to read config' },
      { status: 500 }
    );
  }
}

// Write new URL to config file
export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    // Validate input
    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // Validate TikTok URL format
    if (!url.includes('tiktok.com/@') || !url.includes('/live')) {
      return NextResponse.json(
        { error: 'Invalid TikTok live URL format' },
        { status: 400 }
      );
    }

    // Extract username from URL
    const urlMatch = url.match(/tiktok\.com\/@([^\/]+)/);
    if (!urlMatch) {
      return NextResponse.json(
        { error: 'Could not extract username from URL' },
        { status: 400 }
      );
    }

    const username = urlMatch[1];
    // Auto-generate display name and identifier from username
    const displayName = username.replace(/[^a-zA-Z0-9_]/g, '_');
    const identifier = username;
    const newLine = `\nhttps://www.tiktok.com/@${username}/live,Animateur: ${displayName}-${identifier}`;

    const config: SSHConfig = {
      host: process.env.SSH_HOST || '31.207.39.238',
      username: process.env.SSH_USER || 'root',
      password: process.env.SSH_PASSWORD || '',
      basePath: '/home/DouyinLiveRecorder',
    };

    if (!config.password) {
      return NextResponse.json(
        { error: 'SSH_PASSWORD not configured' },
        { status: 500 }
      );
    }

    await appendToConfigFile(config, '/home/DouyinLiveRecorder/config/URL_config.ini', newLine);
    
    return NextResponse.json({ 
      success: true, 
      message: 'URL added successfully',
      url: `https://www.tiktok.com/@${username}/live`,
      displayName,
      identifier
    });
  } catch (error: any) {
    console.error('Error writing to config:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to write to config' },
      { status: 500 }
    );
  }
}

async function readConfigFile(config: SSHConfig, filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) {
          conn.end();
          return reject(err);
        }

        sftp.readFile(filePath, (err, data) => {
          conn.end();
          if (err) {
            return reject(err);
          }
          resolve(data.toString());
        });
      });
    });

    conn.on('error', (err) => {
      reject(err);
    });

    conn.connect({
      host: config.host,
      username: config.username,
      password: config.password,
      readyTimeout: 10000,
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

async function appendToConfigFile(config: SSHConfig, filePath: string, content: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn.on('ready', () => {
      conn.exec(`echo "${content}" >> ${filePath}`, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }

        let output = '';
        stream.on('close', (code: number) => {
          conn.end();
          if (code !== 0) {
            return reject(new Error(`Command failed with code ${code}`));
          }
          resolve();
        });

        stream.on('data', (data: Buffer) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data: Buffer) => {
          console.error('stderr:', data.toString());
        });
      });
    });

    conn.on('error', (err) => {
      reject(err);
    });

    conn.connect({
      host: config.host,
      username: config.username,
      password: config.password,
      readyTimeout: 10000,
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
