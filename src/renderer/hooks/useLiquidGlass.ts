import { useEffect } from 'react';

/**
 * useLiquidGlass - Tracks mouse movement to power dynamic specular highlights 
 * and refractive light effects across the Liquid Glass UI system.
 */
export default function useLiquidGlass() {
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Calculate cursor position relative to window (0 to 1)
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;

      // Update CSS variables on the root element
      document.documentElement.style.setProperty('--mouse-x', x.toFixed(3));
      document.documentElement.style.setProperty('--mouse-y', y.toFixed(3));
      
      // Also calculate a relative offset for faster shimmering effects
      const offsetX = (x - 0.5) * 2; // -1 to 1
      const offsetY = (y - 0.5) * 2; // -1 to 1
      document.documentElement.style.setProperty('--mouse-offset-x', offsetX.toFixed(3));
      document.documentElement.style.setProperty('--mouse-offset-y', offsetY.toFixed(3));
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);
}
