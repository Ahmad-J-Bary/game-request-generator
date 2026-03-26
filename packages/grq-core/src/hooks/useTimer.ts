import { useState, useEffect } from 'react';

/**
 * A hook that returns the current timestamp, updated every second.
 * Use this locally in components that need to tick (like TaskItem) 
 * to prevent parent components from re-rendering.
 * 
 * @param interval The update interval in milliseconds. Defaults to 1000ms.
 * @returns The current timestamp in milliseconds.
 */
export const useTimer = (interval: number = 1000): number => {
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, interval);

    return () => clearInterval(timer);
  }, [interval]);

  return currentTime;
};
