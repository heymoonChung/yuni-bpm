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
  { id: 'G8VFOIzkg-M', title: 'Tower of Power - What is Hip? (Live Funk)' },
  { id: 'BKSiGA7fv9M', title: 'Toto - Rosanna (Live Shuffle)' },
  { id: 'r7jkrDBkMGI', title: 'Casiopea - Asayake (Live Classic)' },
  { id: 'Py0FdS-e960', title: 'Steely Dan - Aja (Steve Gadd Session)' },
  { id: 'Nq5LMGtBmis', title: 'Vulfpeck - It Gets Funkier (Louis Cole)' },
  { id: '5jDVZPzfS1c', title: 'Dave Weckl - Festival de Ritmos (Technical)' },
  { id: 'aYYFmp9NBTk', title: 'Dirty Loops - Coffee Break (Modern Funk)' },
  { id: 'Let9P-85z3U', title: 'Harry Styles - Sign of the Times (Drum Cover)' }
];

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

function generatePattern(): Note[] {
  const pattern: Note[] = [];
  let id = 0;
  for (let bar = 0; bar < 16; bar++) {
    for (let beat = 0; beat < 16; beat++) {
      const time = bar * 16 + beat;
      if (beat % 2 === 0) pattern.push({ id: `n${id++}`, lane: 0, time });
      if (beat % 4 === 2) pattern.push({ id: `n${id++}`, lane: 1, time });
      if (beat % 4 === 0 || (beat % 8 === 6 && bar % 2)) pattern.push({ id: `n${id++}`, lane: 2, time });
      if (beat === 0 && bar % 4 === 0) pattern.push({ id: `n${id++}`, lane: 3, time });
    }
  }
  return pattern;
}

class DrumSynth {
  ctx: AudioContext | null = null;
  unlock() {
    if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
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
  kick() { this.osc(160, 'sine', 0.25, 1.0); }
  snare() { this.osc(280, 'triangle', 0.12, 0.6); this.noise(0.18, 0.45, 1200); }
  hihat() { this.noise(0.06, 0.35, 5500); }
  cymbal() { this.noise(0.9, 0.25, 3500); }
}

const synth = new DrumSynth();

export default function BeatDrop() {
  const { currentTrack, setCurrentTrack } = useTrack();
  const navigate = useNavigate();
  const location = useLocation();

  const [screen, setScreen] = useState<'input' | 'player'>('input');
  const [inputMode, setInputMode] = useState<'link' | 'search'>('search');
  const [urlInput, setUrlInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{id: string, title: string, artist: string}[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState('');
  const [urlError, setUrlError] = useState('');
  const [loadingTitle, setLoadingTitle] = useState(false);

  const [ytReady, setYtReady] = useState(false);
  const [ytPlaying, setYtPlaying] = useState(false);
  const [drumPlaying, setDrumPlaying] = useState(false);
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
    if (location.state?.continue && currentTrack?.videoId) {
      setVideoId(currentTrack.videoId);
      setVideoTitle(currentTrack.title);
      setBpm(currentTrack.bpm);
      setScreen('player');
    }
  }, [location.state, currentTrack]);

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
      playerVars: { autoplay: 0, controls: 1, playsinline: 1, rel: 0, modestbranding: 1 },
      events: { onStateChange: (e: any) => setYtPlaying(e.data === 1) }
    });
  }, [ytReady, videoId, screen]);

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
          if (next >= 256) { playedRef.current.clear(); return 0; }
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

  const handleSubmitUrl = async () => {
    const id = extractVideoId(urlInput.trim());
    if (!id) { setUrlError('올바른 유튜브 링크를 입력해주세요.'); return; }
    setLoadingTitle(true);
    const title = await fetchVideoTitle(id);
    setVideoTitle(title);
    setVideoId(id);
    setCurrentTrack({ title, artist: 'YouTube', bpm, videoId: id });
    setLoadingTitle(false);
    setScreen('player');
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setUrlError('');
    try {
      const target = `https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(searchQuery)}&filter=all`;
      const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(target)}`);
      const wrapper = await res.json();
      const data = JSON.parse(wrapper.contents);
      const items = (data.items || []).filter((i: any) => i.type === 'stream');
      if (items.length > 0) {
        setSearchResults(items.slice(0, 8).map((i: any) => ({
          id: i.url.split('v=')[1]?.split('&')[0] || i.url.split('/').pop(),
          title: i.title,
          artist: i.uploaderName || 'YouTube'
        })));
      } else { setUrlError('검색 결과가 없습니다.'); }
    } catch { setUrlError('검색 중 오류가 발생했습니다. 다시 시도해주세요.'); }
    setIsSearching(false);
  };

  const handleSelectSearchResult = (song: {id: string, title: string, artist: string}) => {
    setVideoId(song.id);
    setVideoTitle(song.title);
    setCurrentTrack({ title: song.title, artist: song.artist, bpm, videoId: song.id });
    setScreen('player');
  };

  const toggleDrum = () => { synth.unlock(); setDrumPlaying(!drumPlaying); if (!drumPlaying) playedRef.current.clear(); };
  const toggleYouTube = () => {
    if (!ytPlayerRef.current) return;
    if (ytPlaying) ytPlayerRef.current.pauseVideo();
    else ytPlayerRef.current.playVideo();
  };

  const handleReset = () => { setCurrentTime(0); setDrumPlaying(false); playedRef.current.clear(); if (ytPlayerRef.current) try { ytPlayerRef.current.seekTo(0); } catch {} };

  const handleFinish = () => {
    if (!finishMood) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const log = { date: todayStr, mood: finishMood, duration: 20, notes: `${videoTitle} 연습 완료!`, hasVoiceNote: false };
    const existing = JSON.parse(localStorage.getItem('yuni_practice_logs') || '[]');
    localStorage.setItem('yuni_practice_logs', JSON.stringify([...existing.filter((l: any) => l.date !== todayStr), log]));
    navigate('/progress');
  };

  if (screen === 'input') {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-6 gap-6 overflow-y-auto pt-12">
        <div className="text-center space-y-2">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto" style={{ background: 'linear-gradient(135deg, var(--neon-pink), var(--neon-cyan))', boxShadow: '0 0 30px var(--neon-pink)' }}><Music className="w-10 h-10 text-white" /></div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--neon-pink)' }}>Beat Drop</h1>
          <p className="text-sm opacity-60">곡을 찾아 드럼 연습을 시작하세요!</p>
        </div>
        <div className="w-full max-w-sm space-y-4 pb-10">
          <div className="flex gap-2 p-1 rounded-xl bg-white/5">
            <button className="flex-1 py-2 text-sm rounded-lg" onClick={() => setInputMode('search')} style={{ background: inputMode === 'search' ? 'white/10' : 'transparent', color: inputMode === 'search' ? 'var(--neon-cyan)' : 'white/50' }}>검색</button>
            <button className="flex-1 py-2 text-sm rounded-lg" onClick={() => setInputMode('link')} style={{ background: inputMode === 'link' ? 'white/10' : 'transparent', color: inputMode === 'link' ? 'var(--neon-pink)' : 'white/50' }}>링크</button>
          </div>
          {inputMode === 'link' ? (
            <input type="text" value={urlInput} onChange={e => setUrlInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmitUrl()} placeholder="유튜브 링크 붙여넣기" className="w-full p-4 rounded-2xl bg-white/5 border border-white/10 outline-none" />
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder="곡명 또는 아티스트 검색" className="flex-1 p-4 rounded-2xl bg-white/5 border border-white/10 outline-none" />
                <button onClick={handleSearch} disabled={isSearching} className="p-4 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">{isSearching ? <Loader2 className="animate-spin" /> : <Search />}</button>
              </div>
              {searchResults.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                  {searchResults.map(res => (
                    <button key={res.id} onClick={() => handleSelectSearchResult(res)} className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 text-left">
                      <Youtube className="w-5 h-5 text-red-500" />
                      <div className="overflow-hidden"><div className="text-sm font-medium truncate">{res.title}</div><div className="text-xs opacity-50 truncate">{res.artist}</div></div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {urlError && <p className="text-xs text-red-400 px-2">⚠️ {urlError}</p>}
          <button onClick={inputMode === 'link' ? handleSubmitUrl : handleSearch} className="w-full py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-pink-500 to-cyan-500 shadow-lg shadow-pink-500/20">연습 시작하기</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--dark-bg)' }}>
      <div className="p-4 flex-shrink-0">
        <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-white/5">
          <div ref={ytPlayerContainerRef} />
          <div className="absolute top-2 left-2 flex gap-2">
            <button onClick={() => setScreen('input')} className="text-[10px] px-2 py-1 rounded-full bg-black/60">← 곡 변경</button>
          </div>
        </div>
      </div>

      <div className="flex-1 relative mx-4 rounded-2xl bg-white/5 border border-white/5 overflow-hidden">
        <div className="absolute inset-0 grid grid-cols-4">
          {LANES.map(lane => (
            <div key={lane.id} className="relative border-l border-white/10">
              <AnimatePresence>
                {notes.filter(n => n.lane === lane.id && n.time >= currentTime && n.time < currentTime + 32).map(note => (
                  <motion.div key={note.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute left-1/2 -translate-x-1/2 w-10 h-5 rounded-lg" style={{ top: `${hitLine - ((note.time - currentTime) / 32) * 100}%`, background: lane.color, boxShadow: `0 0 10px ${lane.color}` }} />
                ))}
              </AnimatePresence>
            </div>
          ))}
        </div>
        <div className="absolute left-0 right-0 h-[2px] bg-white shadow-[0_0_10px_white]" style={{ top: `${hitLine}%` }} />
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center gap-1">
              <button onClick={toggleYouTube} className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                {ytPlaying ? <Pause className="text-white" /> : <Play className="text-red-500" />}
              </button>
              <span className="text-[9px] opacity-40 font-bold">YOUTUBE</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <button onClick={toggleDrum} className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: drumPlaying ? 'var(--neon-pink)' : 'white/10', boxShadow: drumPlaying ? '0 0 20px var(--neon-pink)' : 'none' }}>
                {drumPlaying ? <Pause className="text-white" /> : <Play className="text-white" />}
              </button>
              <span className="text-[9px] font-bold text-pink-500">DRUM</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setIsMuted(!isMuted)} className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">{isMuted ? <VolumeX className="opacity-40" /> : <Volume2 className="text-cyan-400" />}</button>
            <button onClick={handleReset} className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center"><RotateCcw className="opacity-40" /></button>
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] opacity-40"><span>속도 조절</span><span>{bpm} BPM</span></div>
          <input type="range" min="60" max="200" value={bpm} onChange={e => setBpm(Number(e.target.value))} className="w-full h-1" />
        </div>
        <button onClick={() => setShowFinishModal(true)} className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-green-500 text-white font-bold">연습 종료</button>
      </div>

      <AnimatePresence>
        {showFinishModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl p-6 bg-zinc-900 border border-pink-500/30 text-center space-y-5">
              <h3 className="text-xl font-bold text-pink-500">연습 완료! 기분은 어때?</h3>
              <div className="flex justify-center gap-4 text-3xl">{['😊', '😎', '🔥', '😅'].map(m => (<button key={m} onClick={() => setFinishMood(m)} style={{ opacity: finishMood === m ? 1 : 0.4 }}>{m}</button>))}</div>
              <button onClick={handleFinish} className="w-full py-3 rounded-xl bg-pink-500 text-white font-bold">기록 저장</button>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
