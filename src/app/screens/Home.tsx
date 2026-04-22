import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Heart, Play, Clock, Award, Drum } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useTrack } from '../context/TrackContext';

const CHEERING_MESSAGES = [
  "Yuni's Personal Drum Practice App 🥁",
  "Your dedicated drum training companion 🎵",
  "Keep the beat going, Yuni! ✨",
  "Every great drummer started just like you! 💪",
  "One beat at a time — you've got this! 🌟"
];

export default function Home() {
  const navigate = useNavigate();
  const { currentTrack } = useTrack();
  const [dailyMessage, setDailyMessage] = useState("");

  useEffect(() => {
    // Select message based on current date to keep it consistent for the day
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24);
    const messageIndex = dayOfYear % CHEERING_MESSAGES.length;
    setDailyMessage(CHEERING_MESSAGES[messageIndex]);
  }, []);

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="landscape:grid landscape:grid-cols-2 landscape:gap-8 items-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8 landscape:mb-0 text-center"
        >
          {/* Animated YUNI.BPM Title */}
          <style>{`
            @keyframes rainbowShift {
              0%   { color: #ff3d8f; text-shadow: 0 0 20px #ff3d8f, 0 0 50px #ff3d8f; }
              25%  { color: #5ffbf1; text-shadow: 0 0 20px #5ffbf1, 0 0 50px #5ffbf1; }
              50%  { color: #bf5fff; text-shadow: 0 0 20px #bf5fff, 0 0 50px #bf5fff; }
              75%  { color: #5ffbf1; text-shadow: 0 0 20px #5ffbf1, 0 0 50px #5ffbf1; }
              100% { color: #ff3d8f; text-shadow: 0 0 20px #ff3d8f, 0 0 50px #ff3d8f; }
            }
            @keyframes pulse-glow {
              0%, 100% { filter: drop-shadow(0 0 8px #ff3d8f); }
              50%       { filter: drop-shadow(0 0 20px #5ffbf1); }
            }
            @keyframes spin-border {
              0%   { background-position: 0% 50%; }
              50%  { background-position: 100% 50%; }
              100% { background-position: 0% 50%; }
            }
            .yuni-title {
              animation: rainbowShift 3s ease-in-out infinite;
              font-size: 3rem;
              letter-spacing: 0.1em;
              font-weight: 700;
              cursor: default;
              user-select: none;
            }
            .yuni-heart {
              animation: pulse-glow 1.5s ease-in-out infinite;
            }
            .insta-ring {
              background: linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888, #5ffbf1, #ff3d8f);
              background-size: 300% 300%;
              animation: spin-border 3s ease infinite;
              border-radius: 50%;
              padding: 3px;
            }
            .insta-inner {
              background: var(--dark-bg);
              border-radius: 50%;
              padding: 2px;
            }
          `}</style>

          {/* Profile + Title row */}
          <div className="flex items-center gap-4 mb-3">
            {/* Instagram-style circular photo */}
            <div className="insta-ring flex-shrink-0">
              <div className="insta-inner">
                <video
                  src="/yuni.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-16 h-16 rounded-full object-cover"
                />
              </div>
            </div>

            {/* Title */}
            <div className="text-left">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="yuni-title" style={{ fontSize: '2.2rem' }}>YUNI.BPM</h1>
                <Drum className="yuni-heart w-7 h-7" style={{ color: 'var(--neon-cyan)' }} />
              </div>
              <p className="text-xs opacity-80" style={{ color: 'var(--neon-pink)' }}>
                Mom loves your drumming the most! 💖
              </p>
            </div>
          </div>

          <p className="text-xs mb-2 text-center opacity-70" style={{ color: 'var(--neon-cyan)' }}>
            {dailyMessage || "Yuni's Personal Drum Practice App 🥁"}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="space-y-6"
        >
        <h3
          className="text-sm opacity-70"
          style={{ color: 'var(--neon-cyan)' }}
        >
          최근 연습한 곡
        </h3>

        <div
          className="rounded-3xl p-6"
          style={{
            background: 'rgba(255, 0, 255, 0.05)',
            border: '2px solid rgba(255, 0, 255, 0.3)',
            boxShadow: '0 0 30px rgba(255, 0, 255, 0.1)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs opacity-60 mb-1" style={{ color: 'var(--neon-green)' }}>
                Last Practice
              </div>
              <div className="text-xl" style={{ color: 'var(--neon-pink)', fontWeight: 'var(--font-weight-medium)' }}>
                {currentTrack?.title || '아직 없음'}
              </div>
              <div className="text-sm opacity-70 mt-1" style={{ color: 'var(--foreground)' }}>
                {currentTrack?.artist || 'Beat Drop에서 곡을 선택해 주세요'}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" style={{ color: 'var(--neon-cyan)' }} />
                <span className="text-sm" style={{ color: 'var(--neon-cyan)' }}>
                  45min
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Award className="w-4 h-4" style={{ color: 'var(--neon-orange)' }} />
                <span className="text-sm" style={{ color: 'var(--neon-orange)' }}>
                  95%
                </span>
              </div>
            </div>
          </div>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/beat-drop')}
            className="w-full h-16 rounded-2xl flex items-center justify-center gap-2"
            style={{
              background: 'linear-gradient(135deg, var(--neon-pink), var(--neon-cyan))',
              boxShadow: '0 0 20px var(--neon-pink)',
            }}
          >
            <Play className="w-5 h-5 text-white" fill="white" />
            <span className="text-lg text-white" style={{ fontWeight: 'var(--font-weight-medium)' }}>
              이어서 연습하기
            </span>
          </motion.button>
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate('/beat-drop')}
          className="w-full h-16 rounded-2xl flex items-center justify-center gap-2"
          style={{
            background: 'rgba(0, 255, 255, 0.1)',
            border: '2px solid var(--neon-cyan)',
            boxShadow: '0 0 20px rgba(0, 255, 255, 0.1)',
          }}
        >
          <span
            className="text-lg"
            style={{
              color: 'var(--neon-cyan)',
              fontWeight: 'var(--font-weight-medium)',
            }}
          >
            새로운 악보 만들기
          </span>
        </motion.button>
      </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-8 grid grid-cols-2 gap-4"
      >
        <div
          className="rounded-3xl p-6 text-center"
          style={{
            background: 'rgba(0, 255, 136, 0.05)',
            border: '2px solid rgba(0, 255, 136, 0.2)',
          }}
        >
          <div
            className="text-3xl mb-2"
            style={{
              color: 'var(--neon-green)',
              fontWeight: 'var(--font-weight-medium)',
            }}
          >
            12
          </div>
          <div className="text-xs opacity-70" style={{ color: 'var(--neon-green)' }}>
            Days Streak
          </div>
        </div>

        <div
          className="rounded-3xl p-6 text-center"
          style={{
            background: 'rgba(255, 170, 0, 0.05)',
            border: '2px solid rgba(255, 170, 0, 0.2)',
          }}
        >
          <div
            className="text-3xl mb-2"
            style={{
              color: 'var(--neon-orange)',
              fontWeight: 'var(--font-weight-medium)',
            }}
          >
            847
          </div>
          <div className="text-xs opacity-70" style={{ color: 'var(--neon-orange)' }}>
            Total Minutes
          </div>
        </div>
      </motion.div>
    </div>
  );
}
