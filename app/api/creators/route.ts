import { NextRequest, NextResponse } from 'next/server';
import { listCreatorsAndFiles } from '@/lib/ssh';

async function fetchCreatorsWithRetry(config: any, maxRetries: number = 3): Promise<any[]> {
  let lastError: Error = new Error('Unknown error occurred');
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Fetching creators attempt ${attempt}/${maxRetries}`);
      const creators = await listCreatorsAndFiles(config);
      console.log(`Successfully fetched ${creators.length} creators on attempt ${attempt}`);
      return creators;
    } catch (error: any) {
      lastError = error;
      console.error(`Creators fetch attempt ${attempt} failed:`, error.message);
      
      // Don't retry on certain errors
      if (error.message.includes('SSH_PASSWORD not configured') || 
          error.message.includes('Authentication failed')) {
        throw error;
      }
      
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 3000);
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

export async function GET(request: NextRequest) {
  try {
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

    const creators = await fetchCreatorsWithRetry(config);
    return NextResponse.json({ creators });
  } catch (error: any) {
    console.error('Error fetching creators:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch creators' },
      { status: 500 }
    );
  }
}


