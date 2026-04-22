import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, RotateCcw, Loader2, Volume2, VolumeX, Link, Music, ArrowRight } from 'lucide-react';
import { useTrack } from '../context/TrackContext';
import { useNavigate } from 'react-router';

// ── Types ──────────────────────────────────────────────────────────────────
interface Note {
  id: string;
  lane: number;
  time: number;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

// ── Constants ──────────────────────────────────────────────────────────────
const LANES = [
  { id: 0, name: 'Hi-Hat', color: 'var(--neon-cyan)', symbol: 'HH' },
  { id: 1, name: 'Snare',  color: 'var(--neon-pink)', symbol: 'SN' },
  { id: 2, name: 'Kick',   color: 'var(--neon-orange)', symbol: 'KK' },
  { id: 3, name: 'Cymbal', color: 'var(--neon-green)', symbol: 'CY' },
];

// ── YouTube Helpers ────────────────────────────────────────────────────────
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

async function fetchVideoTitle(videoId: string): Promise<string> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    const data = await res.json();
    return data.title || '알 수 없는 곡';
  } catch {
    return '알 수 없는 곡';
  }
}

// ── Beat Pattern ───────────────────────────────────────────────────────────
function generatePattern(): Note[] {
  const pattern: Note[] = [];
  let id = 0;
  for (let bar = 0; bar < 16; bar++) {
    for (let beat = 0; beat < 16; beat++) {
      const time = bar * 16 + beat;
      if (beat % 2 === 0)                              pattern.push({ id: `n${id++}`, lane: 0, time });
      if (beat % 4 === 2)                              pattern.push({ id: `n${id++}`, lane: 1, time });
      if (beat % 4 === 0 || (beat % 8 === 6 && bar % 2)) pattern.push({ id: `n${id++}`, lane: 2, time });
      if (beat === 0 && bar % 4 === 0)                 pattern.push({ id: `n${id++}`, lane: 3, time });
    }
  }
  return pattern;
}

// ── Drum Synth ─────────────────────────────────────────────────────────────
class DrumSynth {
  ctx: AudioContext | null = null;

  unlock() {
    if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    // silent ping to unlock iOS
    const g = this.ctx.createGain(); g.gain.value = 0.0001;
    const o = this.ctx.createOscillator();
    o.connect(g); g.connect(this.ctx.destination);
    o.start(); o.stop(this.ctx.currentTime + 0.01);
  }

  private osc(freq: number, type: OscillatorType, dur: number, vol: number) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, this.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(); o.stop(this.ctx.currentTime + dur);
  }

  private noise(dur: number, vol: number, hp = 2000) {
    if (!this.ctx) return;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(this.ctx.destination); src.start();
  }

  kick()   { this.osc(160, 'sine', 0.25, 1.0); }
  snare()  { this.osc(280, 'triangle', 0.12, 0.6); this.noise(0.18, 0.45, 1200); }
  hihat()  { this.noise(0.06, 0.35, 5500); }
  cymbal() { this.noise(0.9, 0.25, 3500); }
}

const synth = new DrumSynth();

// ══════════════════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════════════════
export default function BeatDrop() {
  const { setCurrentTrack } = useTrack();
  const navigate = useNavigate();

  // ── URL Input State ──
  const [screen, setScreen] = useState<'input' | 'player'>('input');
  const [urlInput, setUrlInput] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState('');
  const [urlError, setUrlError] = useState('');
  const [loadingTitle, setLoadingTitle] = useState(false);

  // ── Player State ──
  const [ytReady, setYtReady] = useState(false);
  const [ytPlaying, setYtPlaying] = useState(false);
  const [drumPlaying, setDrumPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [currentTime, setCurrentTime] = useState(0);
  const [notes] = useState<Note[]>(generatePattern);

  // ── Modal ──
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [finishMood, setFinishMood] = useState<string | null>(null);

  const ytPlayerRef = useRef<any>(null);
  const animRef = useRef<number>();
  const lastTRef = useRef<number>(0);
  const playedRef = useRef<Set<string>>(new Set());

  // ── Load YouTube IFrame API once ───────────────────────────────────────
  useEffect(() => {
    if (window.YT && window.YT.Player) { setYtReady(true); return; }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => setYtReady(true);
  }, []);

  // ── Create YT Player when videoId is set & API ready ──────────────────
  useEffect(() => {
    if (!ytReady || !videoId || screen !== 'player') return;

    // Destroy old player if exists
    if (ytPlayerRef.current) {
      try { ytPlayerRef.current.destroy(); } catch {}
      ytPlayerRef.current = null;
    }

    ytPlayerRef.current = new window.YT.Player('yt-player', {
      videoId,
      playerVars: {
        autoplay: 1,
        controls: 1,
        playsinline: 1,   // iOS inline play
        rel: 0,
        modestbranding: 1,
      },
      events: {
        onStateChange: (e: any) => {
          // YT.PlayerState.PLAYING = 1
          setYtPlaying(e.data === 1);
        },
      },
    });

    return () => {
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy(); } catch {}
        ytPlayerRef.current = null;
      }
    };
  }, [ytReady, videoId, screen]);

  // ── Drum animation loop ────────────────────────────────────────────────
  useEffect(() => {
    if (drumPlaying) {
      const animate = (ts: number) => {
        if (!lastTRef.current) lastTRef.current = ts;
        const delta = ts - lastTRef.current;
        const inc = (delta / 1000) * (bpm / 60) * 4;

        setCurrentTime(prev => {
          const next = prev + inc;
          if (!isMuted) {
            notes.forEach(n => {
              if (n.time <= next && !playedRef.current.has(n.id)) {
                playedRef.current.add(n.id);
                if (n.lane === 0) synth.hihat();
                if (n.lane === 1) synth.snare();
                if (n.lane === 2) synth.kick();
                if (n.lane === 3) synth.cymbal();
              }
            });
          }
          if (next >= 256) {
            playedRef.current.clear(); // 루프 리셋 시 재생 기록 초기화
            return 0;
          }
          return next;
        });

        lastTRef.current = ts;
        animRef.current = requestAnimationFrame(animate);
      };
      animRef.current = requestAnimationFrame(animate);
    } else {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      lastTRef.current = 0;
    }
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [drumPlaying, bpm, isMuted, notes]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleSubmitUrl = useCallback(async () => {
    const id = extractVideoId(urlInput.trim());
    if (!id) { setUrlError('올바른 유튜브 링크를 붙여넣어 주세요!'); return; }
    setUrlError('');
    setLoadingTitle(true);
    const title = await fetchVideoTitle(id);
    setVideoTitle(title);
    setVideoId(id);
    setCurrentTrack({ title, artist: 'YouTube', bpm });
    setLoadingTitle(false);
    setScreen('player');
  }, [urlInput, bpm, setCurrentTrack]);

  const toggleDrum = () => {
    synth.unlock();
    setDrumPlaying(p => !p);
    if (!drumPlaying) playedRef.current.clear();
  };

  const handleReset = () => {
    setCurrentTime(0);
    setDrumPlaying(false);
    playedRef.current.clear();
    if (ytPlayerRef.current) try { ytPlayerRef.current.seekTo(0); } catch {}
  };

  const handleFinish = () => {
    if (!finishMood) return;
    const duration = Math.floor(Math.random() * 30) + 15;
    const todayStr = new Date().toISOString().split('T')[0];
    const log = { date: todayStr, mood: finishMood, duration, notes: `${videoTitle} 연습 완료!`, hasVoiceNote: false };
    const existing = JSON.parse(localStorage.getItem('yuni_practice_logs') || '[]');
    localStorage.setItem('yuni_practice_logs', JSON.stringify([...existing.filter((l: any) => l.date !== todayStr), log]));
    setShowFinishModal(false);
    navigate('/progress');
  };

  const hitLine = 82;

  // ══════════════════════════════════════════════════════════════════════
  // SCREEN 1: URL Input
  // ══════════════════════════════════════════════════════════════════════
  if (screen === 'input') {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-6 gap-8">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: 'linear-gradient(135deg, var(--neon-pink), var(--neon-cyan))', boxShadow: '0 0 30px var(--neon-pink)' }}>
            <Music className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--neon-pink)', textShadow: '0 0 15px var(--neon-pink)' }}>
            Beat Drop
          </h1>
          <p className="text-sm opacity-60">유튜브 링크를 붙여넣으면 음악과 함께 연습할 수 있어요!</p>
        </div>

        {/* Input Card */}
        <div className="w-full max-w-sm space-y-4">
          <div className="relative">
            <Link className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 opacity-40" />
            <input
              type="text"
              value={urlInput}
              onChange={e => { setUrlInput(e.target.value); setUrlError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleSubmitUrl()}
              placeholder="https://youtu.be/..."
              className="w-full pl-12 pr-4 py-4 rounded-2xl text-base outline-none"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: urlError ? '2px solid var(--neon-pink)' : '1px solid rgba(255,255,255,0.15)',
                color: 'white',
              }}
            />
          </div>

          {urlError && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-sm px-2" style={{ color: 'var(--neon-pink)' }}>
              ⚠️ {urlError}
            </motion.p>
          )}

          {/* BPM Selector */}
          <div className="space-y-2 px-1">
            <div className="flex justify-between text-xs opacity-60">
              <span>빠르기 (BPM)</span>
              <span style={{ color: 'var(--neon-pink)' }}>{bpm}</span>
            </div>
            <input type="range" min="60" max="200" value={bpm} onChange={e => setBpm(Number(e.target.value))} className="w-full h-1"
              style={{ background: `linear-gradient(to right, var(--neon-pink) 0%, var(--neon-pink) ${((bpm - 60) / 140) * 100}%, rgba(255,0,255,0.15) ${((bpm - 60) / 140) * 100}%, rgba(255,0,255,0.15) 100%)` }} />
          </div>

          {/* Common BPM buttons */}
          <div className="flex gap-2 flex-wrap">
            {[80, 100, 120, 140, 160].map(b => (
              <button key={b} onClick={() => setBpm(b)}
                className="px-3 py-1 rounded-full text-xs transition-all"
                style={{ background: bpm === b ? 'var(--neon-pink)' : 'rgba(255,255,255,0.08)', color: bpm === b ? 'white' : 'rgba(255,255,255,0.6)' }}>
                {b}
              </button>
            ))}
          </div>

          <motion.button whileTap={{ scale: 0.97 }} onClick={handleSubmitUrl} disabled={!urlInput || loadingTitle}
            className="w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--neon-pink), var(--neon-cyan))', boxShadow: '0 0 20px rgba(255,0,255,0.4)' }}>
            {loadingTitle ? <Loader2 className="w-5 h-5 animate-spin" /> : <><span>연습 시작하기</span><ArrowRight className="w-5 h-5" /></>}
          </motion.button>

          <p className="text-center text-xs opacity-40">
            링크 없이 그냥 시작하고 싶다면?{' '}
            <button className="underline opacity-70" onClick={() => { setVideoId('dQw4w9WgXcQ'); setVideoTitle('자유 연습'); setScreen('player'); }}>
              자유 연습 모드
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // SCREEN 2: Player
  // ══════════════════════════════════════════════════════════════════════
  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--dark-bg)' }}>

      {/* YouTube Player - collapsible mini player at top */}
      <div className="flex-shrink-0 px-4 pt-4 pb-2">
        <div className="relative rounded-2xl overflow-hidden" style={{ background: 'var(--dark-surface)', border: '1px solid rgba(255,255,255,0.1)' }}>
          {/* YouTube iframe */}
          <div id="yt-player" style={{ width: '100%', height: '180px' }} />

          {/* Overlay info bar */}
          <div className="absolute top-2 left-2 right-2 flex items-center justify-between">
            <button onClick={() => { setScreen('input'); setDrumPlaying(false); }} className="text-xs px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm flex items-center gap-1 opacity-70">
              ← 곡 변경
            </button>
            <div className="text-xs px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm" style={{ color: 'var(--neon-cyan)' }}>
              {bpm} BPM
            </div>
          </div>
        </div>
      </div>

      {/* Beat Track Visualizer */}
      <div className="flex-1 relative overflow-hidden mx-4 rounded-2xl" style={{ background: 'var(--dark-surface)', border: '1px solid rgba(255,255,255,0.05)' }}>
        {/* Lane columns */}
        <div className="absolute inset-0 grid grid-cols-4">
          {LANES.map(lane => (
            <div key={lane.id} className="relative flex flex-col" style={{ borderLeft: `1px solid ${lane.color}20` }}>
              {/* Lane label */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold px-2 py-0.5 rounded-full z-10"
                style={{ background: `${lane.color}25`, color: lane.color }}>
                {lane.symbol}
              </div>

              {/* Falling notes */}
              <AnimatePresence>
                {notes.filter(n => n.lane === lane.id && n.time >= currentTime && n.time < currentTime + 32).map(note => {
                  const pct = ((note.time - currentTime) / 32) * 100;
                  return (
                    <motion.div key={note.id}
                      initial={{ opacity: 0, scaleX: 0.8 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      exit={{ opacity: 0, scaleX: 0.5 }}
                      className="absolute left-1/2 -translate-x-1/2 rounded-xl"
                      style={{
                        top: `${hitLine - pct}%`,
                        width: 40, height: 22,
                        background: lane.color,
                        boxShadow: `0 0 12px ${lane.color}, 0 0 24px ${lane.color}60`,
                        border: '2px solid rgba(255,255,255,0.4)',
                      }}
                    />
                  );
                })}
              </AnimatePresence>
            </div>
          ))}
        </div>

        {/* Hit line */}
        <div className="absolute left-0 right-0 h-[2px] z-10 pointer-events-none"
          style={{ top: `${hitLine}%`, background: 'linear-gradient(90deg, transparent, white 20%, white 80%, transparent)', boxShadow: '0 0 15px white, 0 0 30px var(--neon-pink)' }} />

        {/* Drum sound labels */}
        <div className="absolute bottom-0 left-0 right-0 grid grid-cols-4 px-1 pb-2">
          {LANES.map(lane => (
            <div key={lane.id} className="text-center text-[10px] opacity-50" style={{ color: lane.color }}>{lane.name}</div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="flex-shrink-0 px-4 py-4 space-y-3">
        {/* Top controls row */}
        <div className="flex items-center gap-3">
          {/* Play/Pause drum */}
          <motion.button whileTap={{ scale: 0.92 }} onClick={toggleDrum}
            className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{
              background: drumPlaying ? 'linear-gradient(135deg, var(--neon-pink), var(--neon-cyan))' : 'rgba(255,61,143,0.15)',
              border: '2px solid var(--neon-pink)',
              boxShadow: drumPlaying ? '0 0 20px var(--neon-pink)' : 'none',
            }}>
            {drumPlaying ? <Pause className="w-7 h-7 text-white" /> : <Play className="w-7 h-7 text-white" />}
          </motion.button>

          {/* Mute drum sounds */}
          <motion.button whileTap={{ scale: 0.92 }} onClick={() => setIsMuted(p => !p)}
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: isMuted ? 'rgba(255,255,255,0.05)' : 'rgba(95,251,241,0.1)', border: `1px solid ${isMuted ? 'rgba(255,255,255,0.2)' : 'var(--neon-cyan)'}` }}>
            {isMuted ? <VolumeX className="w-5 h-5 opacity-40" /> : <Volume2 className="w-5 h-5" style={{ color: 'var(--neon-cyan)' }} />}
          </motion.button>

          {/* Reset */}
          <motion.button whileTap={{ scale: 0.92 }} onClick={handleReset}
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)' }}>
            <RotateCcw className="w-5 h-5 opacity-50" />
          </motion.button>

          {/* BPM slider */}
          <div className="flex-1 text-right space-y-1">
            <div className="text-[10px] opacity-50">드럼 박자 {bpm} BPM</div>
            <input type="range" min="60" max="200" value={bpm} onChange={e => setBpm(Number(e.target.value))} className="w-full h-1"
              style={{ background: `linear-gradient(to right, var(--neon-pink) 0%, var(--neon-pink) ${((bpm - 60) / 140) * 100}%, rgba(255,0,255,0.15) ${((bpm - 60) / 140) * 100}%, rgba(255,0,255,0.15) 100%)` }} />
          </div>
        </div>

        {/* Tip text */}
        {!drumPlaying && (
          <p className="text-center text-xs opacity-40">▶ 버튼을 눌러 드럼 박자 시각화를 시작하세요</p>
        )}

        {/* Finish button */}
        <motion.button whileTap={{ scale: 0.98 }} onClick={() => setShowFinishModal(true)}
          className="w-full py-3 rounded-xl text-white font-medium"
          style={{ background: 'linear-gradient(135deg, var(--neon-cyan), var(--neon-green))', boxShadow: '0 0 12px rgba(0,255,136,0.3)' }}>
          연습 종료 및 기록하기
        </motion.button>
      </div>

      {/* Finish Modal */}
      <AnimatePresence>
        {showFinishModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm rounded-3xl p-6 space-y-5"
              style={{ background: 'var(--dark-bg)', border: '1px solid var(--neon-pink)', boxShadow: '0 0 30px rgba(255,0,255,0.2)' }}>
              <h3 className="text-2xl font-semibold text-center" style={{ color: 'var(--neon-pink)' }}>오늘 연습 어땠어?</h3>
              <div className="flex justify-center gap-4 text-4xl">
                {['😊', '😎', '🔥', '😅'].map(m => (
                  <button key={m} onClick={() => setFinishMood(m)} className="transition-transform active:scale-90"
                    style={{ filter: finishMood === m ? 'drop-shadow(0 0 8px var(--neon-pink))' : 'grayscale(60%)' }}>
                    {m}
                  </button>
                ))}
              </div>
              <button onClick={handleFinish} disabled={!finishMood}
                className="w-full py-3 rounded-xl text-white font-medium disabled:opacity-40"
                style={{ background: 'var(--neon-pink)' }}>
                저장하기
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
