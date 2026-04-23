import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, RotateCcw, Loader2, Volume2, VolumeX, Link, Music, ArrowRight, Search, Youtube } from 'lucide-react';
import { useTrack } from '../context/TrackContext';
import { useNavigate, useLocation } from 'react-router';

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

const RANDOM_SONGS = [
  { id: '8mXjNqPZ0pE', title: '아기 다람쥐 또미 (Drum Ver.)', artist: '유니 전용' },
  { id: '3f_v8L7mSms', title: '산토끼 (Rock Style)', artist: '유니 전용' },
  { id: 'BKSiGA7fv9M', title: 'Toto - Rosanna', artist: 'Classic' },
  { id: 'G8VFOIzkg-M', title: 'Tower of Power - What is Hip?', artist: 'Funk' }
];

// ── YouTube Helpers ────────────────────────────────────────────────────────
function extractVideoId(url: string): string | null {
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : null;
}

async function fetchVideoTitle(videoId: string): Promise<string> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    const data = await res.json();
    return data.title || '알 수 없는 곡';
  } catch { return '알 수 없는 곡'; }
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
    const g = this.ctx.createGain(); g.gain.value = 0.0001;
    const o = this.ctx.createOscillator();
    o.connect(g); g.connect(this.ctx.destination);
    o.start(); o.stop(this.ctx.currentTime + 0.01);
  }
  private osc(freq: number, type: OscillatorType, dur: number, vol: number) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, this.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + dur);
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
  const { currentTrack, setCurrentTrack } = useTrack();
  const navigate = useNavigate();
  const location = useLocation();

  const [screen, setScreen] = useState<'input' | 'player'>('input');
  const [inputMode, setInputMode] = useState<'search' | 'link'>('search');
  const [urlInput, setUrlInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{id: string, title: string, artist: string}[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState('');
  const [urlError, setUrlError] = useState('');
  const [loadingTitle, setLoadingTitle] = useState(false);
  const [ytReady, setYtReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [currentTime, setCurrentTime] = useState(0);
  const [notes] = useState<Note[]>(generatePattern);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [finishMood, setFinishMood] = useState<string | null>(null);

  const ytPlayerRef = useRef<any>(null);
  const ytPlayerContainerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>();
  const lastTRef = useRef<number>(0);
  const playedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (window.YT && window.YT.Player) { setYtReady(true); return; }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => setYtReady(true);
  }, []);

  useEffect(() => {
    if (!ytReady || !videoId || screen !== 'player' || !ytPlayerContainerRef.current) return;
    if (ytPlayerRef.current) { try { ytPlayerRef.current.destroy(); } catch {} ytPlayerRef.current = null; }
    ytPlayerContainerRef.current.innerHTML = '';
    const playerDiv = document.createElement('div');
    playerDiv.style.width = '100%'; playerDiv.style.height = '180px';
    ytPlayerContainerRef.current.appendChild(playerDiv);
    ytPlayerRef.current = new window.YT.Player(playerDiv, {
      videoId,
      playerVars: { autoplay: 1, controls: 1, playsinline: 1, rel: 0, modestbranding: 1 },
      events: { 
        onStateChange: (e: any) => {
          // 1: PLAYING, 3: BUFFERING
          const isActuallyPlaying = e.data === 1 || e.data === 3;
          setPlaying(isActuallyPlaying);
        }
      }
    });
  }, [ytReady, videoId, screen]);

  const lastBeatRef = useRef<number>(0);
  useEffect(() => {
    if (playing) {
      const animate = () => {
        if (!ytPlayerRef.current || typeof ytPlayerRef.current.getCurrentTime !== 'function') {
          animRef.current = requestAnimationFrame(animate);
          return;
        }

        const videoTime = ytPlayerRef.current.getCurrentTime() || 0;
        const targetBeat = videoTime * (bpm / 60) * 4;
        const loopedBeat = targetBeat % 256;

        // Sound triggers: check range between lastBeatRef and loopedBeat
        if (!isMuted) {
          notes.forEach(n => {
            // Trigger if note falls between last beat and current beat
            // Or if we just looped back
            const hasLooped = loopedBeat < lastBeatRef.current;
            const shouldTrigger = hasLooped 
              ? (n.time > lastBeatRef.current || n.time <= loopedBeat)
              : (n.time > lastBeatRef.current && n.time <= loopedBeat);

            if (shouldTrigger && !playedRef.current.has(n.id)) {
              if (n.lane === 0) synth.hihat();
              else if (n.lane === 1) synth.snare();
              else if (n.lane === 2) synth.kick();
              else if (n.lane === 3) synth.cymbal();
              playedRef.current.add(n.id);
            }
          });
        }

        // Clean up played set periodically or on loop
        if (loopedBeat < lastBeatRef.current) playedRef.current.clear();
        
        setCurrentTime(loopedBeat);
        lastBeatRef.current = loopedBeat;
        animRef.current = requestAnimationFrame(animate);
      };
      animRef.current = requestAnimationFrame(animate);
    } else {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    }
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [playing, bpm, isMuted, notes]);

  const handleSelectSearchResult = (song: {id: string, title: string, artist: string}) => {
    synth.unlock();
    setVideoId(song.id); setVideoTitle(song.title);
    setCurrentTrack({ title: song.title, artist: song.artist, bpm, videoId: song.id });
    setScreen('player'); setPlaying(true);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true); setUrlError(''); synth.unlock();
    const searchPromise = (async () => {
      const query = encodeURIComponent(searchQuery);
      const apiBases = [
        'http://localhost:8000/api/search?q=',
        'https://pipedapi.kavin.rocks/search?filter=all&q=', 
        'https://piped-api.lunar.icu/search?filter=all&q=',
        'https://api-piped.mha.fi/search?filter=all&q=',
        'https://pipedapi.rivo.cc/search?filter=all&q='
      ];

      // Try all APIs in parallel and take the first one that succeeds
      return Promise.any(apiBases.map(async (base) => {
        try {
          const res = await fetch(`${base}${query}`, { signal: AbortSignal.timeout(5000) });
          if (res.ok) {
            const data = await res.json();
            // Handle local backend format (array of {id, title, artist})
            if (Array.isArray(data) && data.length > 0 && data[0].id) {
              return data.slice(0, 8);
            }
            // Handle Piped API format
            if (data.items) {
              const items = data.items.filter((i: any) => i.type === 'stream').slice(0, 8).map((i: any) => ({
                id: i.url.split('v=')[1]?.split('&')[0] || i.url.split('/').pop(),
                title: i.title, artist: i.uploaderName || 'YouTube'
              })).filter((r: any) => r.id && r.id.length === 11);
              if (items.length > 0) return items;
            }
          }
        } catch (e) {}
        throw new Error('Failed');
      }));
    })();

    try {
      const result: any = await Promise.race([
        searchPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
      ]);
      setSearchResults(result);
    } catch (e) {
      setUrlError('검색 결과를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmitUrl = async () => {
    synth.unlock();
    const id = extractVideoId(urlInput.trim());
    if (!id) { setUrlError('올바른 유튜브 링크를 넣어주세요!'); return; }
    setUrlError(''); setLoadingTitle(true);
    const title = await fetchVideoTitle(id);
    setVideoTitle(title); setVideoId(id);
    setCurrentTrack({ title, artist: 'YouTube', bpm, videoId: id });
    setLoadingTitle(false); setScreen('player'); setPlaying(true);
  };

  const togglePlay = () => {
    synth.unlock();
    if (playing) { ytPlayerRef.current?.pauseVideo(); setPlaying(false); }
    else { ytPlayerRef.current?.playVideo(); setPlaying(true); }
  };

  const handleReset = () => {
    setCurrentTime(0); setPlaying(false); playedRef.current.clear();
    ytPlayerRef.current?.seekTo(0); ytPlayerRef.current?.pauseVideo();
  };

  const handleFinish = () => {
    if (!finishMood) return;
    const log = { date: new Date().toISOString().split('T')[0], mood: finishMood, duration: 15, notes: `${videoTitle} 완료!`, hasVoiceNote: false };
    const ex = JSON.parse(localStorage.getItem('yuni_practice_logs') || '[]');
    localStorage.setItem('yuni_practice_logs', JSON.stringify([...ex, log]));
    setShowFinishModal(false); navigate('/progress');
  };

  const hitLine = 82;

  if (screen === 'input') {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-6 gap-8 bg-[#0D0D0D]">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 rounded-[24px] flex items-center justify-center mx-auto"
            style={{ 
              background: 'linear-gradient(135deg, #60A5FA, #A855F7)', 
              boxShadow: '0 0 30px rgba(255, 0, 255, 0.4)' 
            }}>
            <Music className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-black text-[#FF00FF]" style={{ textShadow: '0 0 20px rgba(255, 0, 255, 0.5)' }}>Beat Drop</h1>
          <p className="text-sm opacity-70 text-white">원하는 곡에 맞춰 드럼을 연습해보세요!</p>
        </div>

        <div className="w-full max-w-sm space-y-6">
          <div className="flex gap-1 p-1 rounded-2xl bg-[#1A1C22]">
            <button onClick={() => setInputMode('search')} className="flex-1 py-3 text-sm font-bold rounded-xl transition-all"
              style={{ background: inputMode === 'search' ? '#2A2D35' : 'transparent', color: inputMode === 'search' ? '#5FFBF1' : '#FFFFFF' }}>유튜브 검색</button>
            <button onClick={() => setInputMode('link')} className="flex-1 py-3 text-sm font-bold rounded-xl transition-all"
              style={{ background: inputMode === 'link' ? '#2A2D35' : 'transparent', color: inputMode === 'link' ? '#5FFBF1' : '#FFFFFF' }}>링크 붙여넣기</button>
          </div>

          {inputMode === 'search' ? (
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 opacity-40 text-white" />
                  <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder="곡명, 아티스트 검색" className="w-full pl-12 pr-4 py-4 rounded-2xl bg-[#16181D] text-white outline-none border border-white/5" />
                </div>
                <button onClick={handleSearch} className="w-14 h-14 rounded-2xl flex items-center justify-center border-2 border-[#00FFFF] bg-[#00FFFF]/5 text-[#00FFFF]">
                  {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-6 h-6" />}
                </button>
              </div>
              {searchResults.length > 0 && (
                <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                  {searchResults.map(res => (
                    <button key={res.id} onClick={() => handleSelectSearchResult(res)} className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 text-left hover:bg-white/10">
                      <Youtube className="w-5 h-5 text-pink-500" />
                      <div className="flex-1 overflow-hidden"><div className="text-sm font-medium truncate text-white">{res.title}</div></div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="relative">
              <Link className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 opacity-40 text-white" />
              <input type="text" value={urlInput} onChange={e => setUrlInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmitUrl()}
                placeholder="https://youtu.be/..." className="w-full pl-12 pr-4 py-4 rounded-2xl bg-[#16181D] text-white outline-none border border-white/5" />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold"><span className="text-white opacity-60">빠르기 (BPM)</span><span className="text-pink-500">{bpm}</span></div>
            <input type="range" min="60" max="200" value={bpm} onChange={e => setBpm(Number(e.target.value))} className="w-full h-1 accent-[#FF00FF]" />
          </div>

          <button onClick={inputMode === 'search' ? handleSearch : handleSubmitUrl} className="w-full py-5 rounded-2xl font-bold text-xl text-white flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{ background: 'linear-gradient(90deg, #FF00FF, #48A9FE)', boxShadow: '0 0 25px rgba(255,0,255,0.4)' }}>
            검색하기 <ArrowRight className="w-6 h-6" />
          </button>

          <div className="text-center">
            <button 
              onClick={() => {
                const random = RANDOM_SONGS[Math.floor(Math.random() * RANDOM_SONGS.length)];
                handleSelectSearchResult({ ...random, artist: 'Random Practice' });
              }}
              className="text-sm text-white/40 hover:text-white/60 transition-colors"
            >
              어떤 곡을 칠지 모르겠다면? <span className="underline decoration-white/20 underline-offset-4">최신곡 랜덤 재생 (자유 연습)</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#0A0A0A] text-white">
      <div className="p-4 flex-shrink-0">
        <div className="relative rounded-3xl overflow-hidden bg-black/40 border border-white/10">
          <div ref={ytPlayerContainerRef} style={{ width: '100%', height: '180px' }} />
          <div className="absolute top-3 left-3 flex gap-2">
            <button onClick={() => { setScreen('input'); setPlaying(false); }} className="text-xs px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 font-bold">← BACK</button>
            <div className="text-xs px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[#00FFFF] font-bold">{bpm} BPM</div>
          </div>
        </div>
      </div>
      <div className="flex-1 relative overflow-hidden mx-4 rounded-3xl bg-black/40 border border-white/5">
        <div className="absolute inset-0 grid grid-cols-4">
          {LANES.map(lane => (
            <div key={lane.id} className="relative flex flex-col border-l border-white/5">
              <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[11px] font-bold px-2 py-0.5 rounded-full z-10" style={{ background: `${lane.color}25`, color: lane.color }}>{lane.symbol}</div>
              <AnimatePresence>
                {notes.filter(n => n.lane === lane.id && n.time >= currentTime && n.time < currentTime + 32).map(note => {
                  const pct = ((note.time - currentTime) / 32) * 100;
                  return (
                    <motion.div key={note.id} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                      className="absolute left-1/2 -translate-x-1/2 rounded-full"
                      style={{ top: `${hitLine - pct}%`, width: 36, height: 12, background: lane.color, boxShadow: `0 0 15px ${lane.color}`, border: '1.5px solid rgba(255,255,255,0.5)' }} />
                  );
                })}
              </AnimatePresence>
            </div>
          ))}
        </div>
        <div className="absolute left-0 right-0 h-[3px] bg-white z-10" style={{ top: `${hitLine}%`, boxShadow: '0 0 20px white' }} />
      </div>
      <div className="p-8 flex-shrink-0 space-y-8">
        <div className="flex items-center justify-center gap-10">
          <motion.button whileTap={{ scale: 0.9 }} onClick={handleReset} className="w-16 h-16 rounded-full flex items-center justify-center bg-white/5 border border-white/10"><RotateCcw className="w-8 h-8 opacity-60" /></motion.button>
          <motion.button whileTap={{ scale: 0.9 }} onClick={togglePlay} className="w-24 h-24 rounded-full flex items-center justify-center"
            style={{ background: '#FF00FF', boxShadow: '0 0 40px rgba(255,0,255,0.6)' }}>
            {playing ? <Pause className="w-12 h-12 text-white" /> : <Play className="w-12 h-12 text-white pl-1" />}
          </motion.button>
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => setIsMuted(p => !p)} className="w-16 h-16 rounded-full flex items-center justify-center bg-white/5 border border-white/10">
            {isMuted ? <VolumeX className="w-8 h-8 opacity-40" /> : <Volume2 className="w-8 h-8 text-[#00FFFF]" />}
          </motion.button>
        </div>
        <div className="flex items-center gap-4">
          <input type="range" min="60" max="200" value={bpm} onChange={e => setBpm(Number(e.target.value))} className="flex-1 h-1 accent-[#FF00FF]" />
          <div className="text-sm font-bold text-[#FF00FF] w-16">{bpm} BPM</div>
        </div>
        <button onClick={() => setShowFinishModal(true)} className="w-full py-4 rounded-2xl font-bold text-white" style={{ background: 'linear-gradient(90deg, #00FFFF, #00FF88)', boxShadow: '0 0 20px rgba(0,255,255,0.3)' }}>연습 종료 및 기록하기</button>
      </div>

      <AnimatePresence>
        {showFinishModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl">
            <div className="w-full max-w-sm rounded-[40px] p-10 space-y-8 bg-[#15171C] border border-white/10">
              <h3 className="text-2xl font-bold text-center text-[#FF00FF]">오늘 연습 어땠어?</h3>
              <div className="flex justify-center gap-4 text-5xl">
                {['😊', '😎', '🔥', '😅'].map(m => (<button key={m} onClick={() => setFinishMood(m)} className="active:scale-75" style={{ filter: finishMood === m ? 'none' : 'grayscale(100%) opacity(40%)' }}>{m}</button>))}
              </div>
              <button onClick={handleFinish} disabled={!finishMood} className="w-full py-5 rounded-2xl font-bold text-xl text-white disabled:opacity-40" style={{ background: '#FF00FF', boxShadow: '0 0 25px rgba(255,0,255,0.4)' }}>저장하기</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
