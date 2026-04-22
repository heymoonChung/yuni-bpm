import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, RotateCcw, Repeat, Loader2, Volume2, VolumeX, Info } from 'lucide-react';
import { useTrack } from '../context/TrackContext';
import { useNavigate } from 'react-router';

interface Note {
  id: string;
  lane: number;
  time: number;
}

const LANES = [
  { id: 0, name: 'Hi-Hat', color: 'var(--neon-cyan)', symbol: 'HH' },
  { id: 1, name: 'Snare', color: 'var(--neon-pink)', symbol: 'SN' },
  { id: 2, name: 'Kick', color: 'var(--neon-orange)', symbol: 'KK' },
  { id: 3, name: 'Cymbal', color: 'var(--neon-green)', symbol: 'CY' },
];

class DrumAudio {
  private ctx: AudioContext | null = null;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private createOscillator(freq: number, type: OscillatorType, duration: number, volume: number) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  private createNoise(duration: number, volume: number, highPass: number = 1000) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = highPass;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    source.start();
  }

  playKick() { this.createOscillator(160, 'sine', 0.2, 1.0); }
  playSnare() { 
    this.createOscillator(280, 'triangle', 0.1, 0.6); 
    this.createNoise(0.2, 0.4, 1000);
  }
  playHiHat() { this.createNoise(0.05, 0.3, 5000); }
  playCymbal() { this.createNoise(0.8, 0.2, 3000); }
}

const drum = new DrumAudio();

const generatePattern = (): Note[] => {
  const pattern: Note[] = [];
  let noteId = 0;
  for (let bar = 0; bar < 8; bar++) {
    for (let beat = 0; beat < 16; beat++) {
      const time = bar * 16 + beat;
      if (beat % 2 === 0) pattern.push({ id: `note-${noteId++}`, lane: 0, time });
      if (beat % 4 === 2) pattern.push({ id: `note-${noteId++}`, lane: 1, time });
      if (beat % 4 === 0 || (beat % 8 === 6 && bar % 2 === 1)) pattern.push({ id: `note-${noteId++}`, lane: 2, time });
      if (beat === 0 && bar % 4 === 0) pattern.push({ id: `note-${noteId++}`, lane: 3, time });
    }
  }
  return pattern;
};

export default function BeatDrop() {
  const { currentTrack } = useTrack();
  const navigate = useNavigate();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [bpm, setBpm] = useState(currentTrack?.bpm || 120);
  const [currentTime, setCurrentTime] = useState(0);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [showGuide, setShowGuide] = useState(true);
  
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [finishMood, setFinishMood] = useState<string | null>(null);

  const animationRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);
  const playedNotesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const fetchOnsetSimulation = async () => {
      setIsAnalyzing(true);
      setTimeout(() => {
        setNotes(generatePattern());
        setBpm(currentTrack?.bpm || 120);
        setIsAnalyzing(false);
      }, 1000);
    };
    fetchOnsetSimulation();
  }, [currentTrack]);

  // Combined Animation and Sound Triggering for Mobile Robustness
  useEffect(() => {
    if (isPlaying) {
      drum.init();
      const animate = (timestamp: number) => {
        if (!lastTimeRef.current) lastTimeRef.current = timestamp;
        const deltaTime = timestamp - lastTimeRef.current;
        const beatsPerSecond = bpm / 60;
        const increment = (deltaTime / 1000) * beatsPerSecond * 4;

        setCurrentTime((prev) => {
          const newTime = prev + increment;
          
          // Trigger sounds within the loop for frame-perfect sync
          if (!isMuted) {
            notes.forEach(note => {
              if (note.time <= newTime && !playedNotesRef.current.has(note.id)) {
                playedNotesRef.current.add(note.id);
                if (note.lane === 0) drum.playHiHat();
                if (note.lane === 1) drum.playSnare();
                if (note.lane === 2) drum.playKick();
                if (note.lane === 3) drum.playCymbal();
              }
            });
          }

          if (newTime >= 128) {
            playedNotesRef.current.clear();
            return loopEnabled ? 0 : 128;
          }
          return newTime;
        });

        lastTimeRef.current = timestamp;
        animationRef.current = requestAnimationFrame(animate);
      };
      animationRef.current = requestAnimationFrame(animate);
    } else {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      lastTimeRef.current = 0;
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, bpm, loopEnabled, isMuted, notes]);

  const togglePlay = () => {
    drum.init();
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    setCurrentTime(0);
    setIsPlaying(false);
    playedNotesRef.current.clear();
  };

  const handleFinishPractice = () => {
    if (!finishMood) return;
    const duration = Math.floor(Math.random() * 30) + 15;
    const todayStr = new Date().toISOString().split('T')[0];
    const newLog = {
      date: todayStr, mood: finishMood, duration,
      notes: `${currentTrack?.title || '기본 연습'} 템포 ${bpm}에서 비트 드롭 완료!`,
      hasVoiceNote: false
    };
    const existingLogs = JSON.parse(localStorage.getItem('yuni_practice_logs') || '[]');
    const updatedLogs = [...existingLogs.filter((log: any) => log.date !== todayStr), newLog];
    localStorage.setItem('yuni_practice_logs', JSON.stringify(updatedLogs));
    setShowFinishModal(false);
    navigate('/progress');
  };

  const hitLinePosition = 85;

  if (isAnalyzing) {
    return (
      <div className="h-screen flex flex-col items-center justify-center space-y-6">
        <Loader2 className="w-16 h-16 animate-spin" style={{ color: 'var(--neon-pink)' }} />
        <div className="text-xl" style={{ color: 'var(--neon-pink)', fontWeight: 'var(--font-weight-medium)' }}>
          박자 분석 중... 🥁
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col landscape:flex-row relative">
      <AnimatePresence>
        {showGuide && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center p-6"
            onClick={() => { drum.init(); setShowGuide(false); }}>
            <div className="max-w-md space-y-6 text-center">
              <div className="w-20 h-20 bg-pink-500/20 rounded-full flex items-center justify-center mx-auto border-2 border-pink-500 shadow-[0_0_20px_var(--neon-pink)]">
                <Volume2 className="w-10 h-10 text-pink-500" />
              </div>
              <h3 className="text-3xl font-bold" style={{ color: 'var(--neon-pink)' }}>Beat Drop 가이드</h3>
              <p className="text-lg leading-relaxed opacity-90">선에 맞춰 떨어지는 노트를 <br/> 드럼 소리와 함께 연습해보세요! 🥁</p>
              <button className="px-8 py-3 rounded-full bg-pink-500 font-bold text-lg shadow-lg">시작하기</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-4 py-6 flex-shrink-0 landscape:w-1/3 landscape:flex landscape:flex-col landscape:justify-center">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl" style={{ color: 'var(--neon-pink)', fontWeight: 'var(--font-weight-medium)', textShadow: '0 0 10px var(--neon-pink)' }}>Beat Drop</h2>
          <button onClick={() => setShowGuide(true)} className="opacity-50 hover:opacity-100 transition-opacity"><Info className="w-5 h-5" /></button>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-sm opacity-70" style={{ color: 'var(--neon-cyan)' }}>
            {currentTrack?.title ? `${currentTrack.title} - ${currentTrack.artist}` : '연습할 곡을 선택해주세요'}
          </div>
          <div className="text-sm px-3 py-1 rounded-full" style={{ background: 'rgba(255, 0, 255, 0.2)', color: 'var(--neon-pink)' }}>{bpm} BPM</div>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden" style={{ background: 'var(--dark-surface)' }}>
        <div className="absolute inset-0 grid grid-cols-4 gap-px">
          {LANES.map((lane) => (
            <div key={lane.id} className="relative" style={{ background: `linear-gradient(180deg, transparent, ${lane.color}05)`, borderLeft: `1px solid ${lane.color}20` }}>
              <div className="absolute top-4 left-1/2 -translate-x-1/2 text-xs px-2 py-1 rounded-lg" style={{ background: `${lane.color}30`, color: lane.color, fontWeight: 'var(--font-weight-medium)' }}>{lane.symbol}</div>
              <AnimatePresence>
                {notes.filter(n => n.lane === lane.id && n.time >= currentTime && n.time < currentTime + 32).map((note) => {
                  const progress = ((note.time - currentTime) / 32) * 100;
                  const yPosition = hitLinePosition - progress;
                  return (
                    <motion.div key={note.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute left-1/2 -translate-x-1/2 w-12 h-6 rounded-lg"
                      style={{ top: `${yPosition}%`, background: lane.color, boxShadow: `0 0 15px ${lane.color}`, border: `2px solid white` }} />
                  );
                })}
              </AnimatePresence>
            </div>
          ))}
        </div>
        <div className="absolute left-0 right-0 h-1" style={{ top: `${hitLinePosition}%`, background: 'linear-gradient(90deg, transparent, white, transparent)', boxShadow: '0 0 20px white, 0 0 40px var(--neon-pink)', zIndex: 10 }} />
      </div>

      <div className="px-4 py-6 flex-shrink-0 space-y-4">
        <div className="flex items-center gap-3">
          <motion.button whileTap={{ scale: 0.95 }} onClick={togglePlay} className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: isPlaying ? 'linear-gradient(135deg, var(--neon-pink), var(--neon-cyan))' : 'rgba(255, 61, 143, 0.2)', border: '2px solid var(--neon-pink)', boxShadow: isPlaying ? '0 0 20px var(--neon-pink)' : 'none' }}>
            {isPlaying ? <Pause className="w-7 h-7 text-white" /> : <Play className="w-7 h-7 text-white" />}
          </motion.button>
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => setIsMuted(!isMuted)} className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: isMuted ? 'rgba(255,255,255,0.05)' : 'rgba(95, 251, 241, 0.1)', border: '1px solid var(--neon-cyan)' }}>
            {isMuted ? <VolumeX className="w-5 h-5 text-gray-500" /> : <Volume2 className="w-5 h-5" style={{ color: 'var(--neon-cyan)' }} />}
          </motion.button>
          <motion.button whileTap={{ scale: 0.95 }} onClick={handleReset} className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)' }}><RotateCcw className="w-5 h-5 opacity-60" /></motion.button>
          <div className="flex-1 text-right">
            <div className="text-[10px] opacity-60 mb-1" style={{ color: 'var(--neon-cyan)' }}>Tempo {bpm}</div>
            <input type="range" min="60" max="180" value={bpm} onChange={(e) => setBpm(Number(e.target.value))} className="w-full h-1"
              style={{ background: `linear-gradient(to right, var(--neon-pink) 0%, var(--neon-pink) ${((bpm - 60) / 120) * 100}%, rgba(255, 0, 255, 0.2) ${((bpm - 60) / 120) * 100}%, rgba(255, 0, 255, 0.2) 100%)` }} />
          </div>
        </div>
        <motion.button whileTap={{ scale: 0.98 }} onClick={() => setShowFinishModal(true)} className="w-full py-4 rounded-xl text-white font-medium"
          style={{ background: 'linear-gradient(135deg, var(--neon-cyan), var(--neon-green))', boxShadow: '0 0 15px rgba(0, 255, 136, 0.4)' }}>연습 종료 및 기록하기</motion.button>
      </div>

      <AnimatePresence>
        {showFinishModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="w-full max-w-sm rounded-3xl p-6 space-y-6"
              style={{ background: 'var(--dark-bg)', border: '1px solid var(--neon-pink)', boxShadow: '0 0 30px rgba(255, 0, 255, 0.2)' }}>
              <h3 className="text-2xl font-medium text-center" style={{ color: 'var(--neon-pink)' }}>오늘 연습 어땠어?</h3>
              <div className="flex justify-center gap-3 text-3xl">
                {['😊', '😎', '🔥', '😅'].map(mood => (
                  <button key={mood} onClick={() => setFinishMood(mood)} className="p-2 rounded-full hover:bg-white/10 transition-colors"
                    style={{ background: finishMood === mood ? 'rgba(255, 0, 255, 0.3)' : 'transparent' }}>{mood}</button>
                ))}
              </div>
              <button onClick={handleFinishPractice} disabled={!finishMood} className="w-full py-3 rounded-xl text-white font-medium disabled:opacity-50"
                style={{ background: 'var(--neon-pink)' }}>저장하기</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
