export type SoftwareUpdateState = {
  currentVersion: string;
  availableVersion: string | null;
  releaseNotes: string;
  canInstall: boolean;
  status:
    | 'idle'
    | 'checking'
    | 'available'
    | 'current'
    | 'unpublished'
    | 'downloading'
    | 'downloaded'
    | 'installing'
    | 'error';
  progress: number;
  downloaded: boolean;
  message: string;
};
