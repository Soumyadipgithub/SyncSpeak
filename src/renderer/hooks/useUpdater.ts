import { useState, useEffect } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export function useUpdater() {
  const [updateAvailable, setUpdateAvailable] = useState<Update | null>(null);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'downloading' | 'ready' | 'error'>('idle');
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    async function checkForUpdates() {
      try {
        setUpdateStatus('checking');
        const update = await check();
        if (update) {
          setUpdateAvailable(update);
          setUpdateStatus('downloading');
          
          let downloaded = 0;
          let contentLength = 0;
          
          await update.downloadAndInstall((event) => {
            switch (event.event) {
              case 'Started':
                contentLength = event.data.contentLength || 0;
                break;
              case 'Progress':
                downloaded += event.data.chunkLength;
                if (contentLength > 0) {
                  setDownloadProgress(Math.round((downloaded / contentLength) * 100));
                }
                break;
              case 'Finished':
                setDownloadProgress(100);
                break;
            }
          });
          
          setUpdateStatus('ready');
        } else {
          setUpdateStatus('idle');
        }
      } catch (err) {
        console.error('Failed to check for updates', err);
        setUpdateStatus('error');
      }
    }

    // Delay initial check by a few seconds to let the app load
    const timeout = setTimeout(() => {
      checkForUpdates();
    }, 5000);

    // Check periodically every hour
    const interval = setInterval(checkForUpdates, 60 * 60 * 1000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  const handleRestart = async () => {
    await relaunch();
  };

  return { updateAvailable, updateStatus, downloadProgress, handleRestart };
}
