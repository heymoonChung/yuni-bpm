import { createContext, useContext, useState, ReactNode } from 'react';

export interface Track {
  title: string;
  artist: string;
  bpm: number;
  videoId?: string;
}

interface TrackContextType {
  currentTrack: Track | null;
  setCurrentTrack: (track: Track | null) => void;
}

const TrackContext = createContext<TrackContextType | undefined>(undefined);

export function TrackProvider({ children }: { children: ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);

  return (
    <TrackContext.Provider value={{ currentTrack, setCurrentTrack }}>
      {children}
    </TrackContext.Provider>
  );
}

export function useTrack() {
  const context = useContext(TrackContext);
  if (context === undefined) {
    throw new Error('useTrack must be used within a TrackProvider');
  }
  return context;
}
