export interface Creator {
  name: string;
  folderName: string;
  files: VideoFile[];
}

export interface VideoFile {
  name: string;
  path: string;
  size?: number;
  date?: string;
}


