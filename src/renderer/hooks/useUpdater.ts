import { useState, useEffect, useRef } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

type UpdateStatus = 'idle' | 'checking' | 'downloading' | 'ready' | 'error';

export function useUpdater() {
  const [updateAvailable, setUpdateAvailable] = useState<Update | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  
  const statusRef = useRef<UpdateStatus>('idle');
  const isCheckingRef = useRef<boolean>(false);

  useEffect(() => {
    statusRef.current = updateStatus;
  }, [updateStatus]);

  useEffect(() => {
    async function checkForUpdates() {
      if (isCheckingRef.current) return;
      if (statusRef.current === 'ready' || statusRef.current === 'downloading') return;

      try {
        isCheckingRef.current = true;
        setUpdateStatus('checking');
        const update = await check();
        if (update) {
          setUpdateAvailable(update);
          setUpdateStatus('downloading');
          
          await update.downloadAndInstall();
          
          setUpdateStatus('ready');
        } else {
          setUpdateStatus('idle');
        }
      } catch (err) {
        console.error('Failed to check for updates', err);
        setUpdateStatus('error');
        // Reset to idle after a while so it can retry in the future
        setTimeout(() => {
          if (statusRef.current === 'error') {
            setUpdateStatus('idle');
          }
        }, 10000);
      } finally {
        isCheckingRef.current = false;
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

  return { updateAvailable, updateStatus, handleRestart };
}
