import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Mic, Calendar as CalendarIcon, Trash2 } from 'lucide-react';

interface PracticeLog {
  date: string;
  mood: string;
  duration: number;
  notes: string;
  hasVoiceNote: boolean;
}

const MOODS = ['😊', '😎', '🔥', '💪', '😅', '😌', '🎯'];

export default function Progress() {
  const [currentMonth] = useState(new Date());
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [practiceLogs, setPracticeLogs] = useState<PracticeLog[]>([]);

  useEffect(() => {
    const savedLogs = localStorage.getItem('yuni_practice_logs');
    if (savedLogs) {
      setPracticeLogs(JSON.parse(savedLogs));
    }
  }, []);

  const handleClearLogs = () => {
    if (window.confirm('모든 연습 기록을 삭제할까요?')) {
      localStorage.removeItem('yuni_practice_logs');
      setPracticeLogs([]);
    }
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (number | null)[] = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }

    return days;
  };

  const hasPracticeOnDay = (day: number | null) => {
    if (!day) return false;
    const year = currentMonth.getFullYear();
    const month = String(currentMonth.getMonth() + 1).padStart(2, '0');
    const dateString = `${year}-${month}-${String(day).padStart(2, '0')}`;
    return practiceLogs.some((log) => log.date === dateString);
  };

  const days = getDaysInMonth(currentMonth);
  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="min-h-screen px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h2
          className="text-3xl mb-2"
          style={{
            color: 'var(--neon-green)',
            fontWeight: 'var(--font-weight-medium)',
            textShadow: '0 0 10px var(--neon-green)',
          }}
        >
          Progress & Stickers
        </h2>
        <p className="text-sm opacity-70" style={{ color: 'var(--foreground)' }}>
          유니의 성장 일지
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="rounded-3xl p-6 mb-6"
        style={{
          background: 'rgba(0, 255, 136, 0.05)',
          border: '1px solid rgba(0, 255, 136, 0.2)',
        }}
      >
        <div className="flex items-center justify-between mb-6">
          <motion.button whileTap={{ scale: 0.9 }} className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0, 255, 136, 0.1)' }}>
            <ChevronLeft className="w-5 h-5" style={{ color: 'var(--neon-green)' }} />
          </motion.button>
          <div
            className="text-xl"
            style={{
              color: 'var(--neon-green)',
              fontWeight: 'var(--font-weight-medium)',
            }}
          >
            {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </div>
          <motion.button whileTap={{ scale: 0.9 }} className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0, 255, 136, 0.1)' }}>
            <ChevronRight className="w-5 h-5" style={{ color: 'var(--neon-green)' }} />
          </motion.button>
        </div>

        <div className="grid grid-cols-7 gap-2 mb-4">
          {weekDays.map((day) => (
            <div
              key={day}
              className="text-center text-xs opacity-60 pb-2"
              style={{ color: 'var(--neon-green)' }}
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {days.map((day, index) => (
            <div key={index} className="aspect-square">
              {day ? (
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-full h-full rounded-xl flex items-center justify-center relative text-sm"
                  style={{
                    background: hasPracticeOnDay(day)
                      ? 'linear-gradient(135deg, var(--neon-pink), var(--neon-cyan))'
                      : 'rgba(0, 255, 136, 0.05)',
                    border: hasPracticeOnDay(day)
                      ? '2px solid var(--neon-pink)'
                      : '1px solid rgba(0, 255, 136, 0.1)',
                    color: hasPracticeOnDay(day) ? 'white' : 'var(--neon-green)',
                    fontWeight: hasPracticeOnDay(day) ? 'var(--font-weight-medium)' : 'var(--font-weight-normal)',
                    boxShadow: hasPracticeOnDay(day) ? '0 0 20px rgba(255, 0, 255, 0.4)' : 'none',
                  }}
                >
                  {day}
                  {hasPracticeOnDay(day) && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-white" />
                  )}
                </motion.div>
              ) : (
                <div />
              )}
            </div>
          ))}
        </div>
      </motion.div>

      <div className="space-y-4 landscape:grid landscape:grid-cols-2 landscape:gap-6 landscape:space-y-0">
        <div className="flex items-center justify-between landscape:col-span-2">
          <h3 className="text-sm opacity-70" style={{ color: 'var(--neon-pink)' }}>RECENT PRACTICE</h3>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {MOODS.map((mood) => (
                <motion.button key={mood} whileTap={{ scale: 0.9 }}
                  onClick={() => setSelectedMood(selectedMood === mood ? null : mood)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
                  style={{ background: selectedMood === mood ? 'rgba(255, 0, 255, 0.2)' : 'transparent', border: selectedMood === mood ? '1px solid var(--neon-pink)' : 'none' }}>
                  {mood}
                </motion.button>
              ))}
            </div>
            {practiceLogs.length > 0 && (
              <motion.button whileTap={{ scale: 0.9 }} onClick={handleClearLogs}
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(255,61,143,0.1)', border: '1px solid rgba(255,61,143,0.3)' }}
                title="기록 초기화">
                <Trash2 className="w-4 h-4" style={{ color: 'var(--neon-pink)' }} />
              </motion.button>
            )}
          </div>
        </div>

        {practiceLogs.filter((log) => !selectedMood || log.mood === selectedMood).length === 0 && (
          <div className="text-center py-12 opacity-50 col-span-2">
            <div className="text-5xl mb-3">🥁</div>
            <p style={{ color: 'var(--neon-cyan)' }}>아직 연습 기록이 없어요!<br/>Beat Drop에서 연습을 시작해보세요</p>
          </div>
        )}
        {practiceLogs
          .filter((log) => !selectedMood || log.mood === selectedMood)
          .map((log, index) => (
            <motion.div
              key={log.date}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="rounded-2xl p-6"
              style={{
                background: 'rgba(255, 0, 255, 0.05)',
                border: '1px solid rgba(255, 0, 255, 0.2)',
              }}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="text-3xl">{log.mood}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <CalendarIcon className="w-4 h-4" style={{ color: 'var(--neon-cyan)' }} />
                    <span
                      className="text-sm"
                      style={{ color: 'var(--neon-cyan)' }}
                    >
                      {new Date(log.date).toLocaleDateString('ko-KR', {
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                    <span
                      className="text-xs px-2 py-1 rounded-full"
                      style={{
                        background: 'rgba(255, 170, 0, 0.2)',
                        color: 'var(--neon-orange)',
                      }}
                    >
                      {log.duration}분
                    </span>
                  </div>
                  <p
                    className="text-base"
                    style={{
                      color: 'var(--foreground)',
                      fontWeight: 'var(--font-weight-normal)',
                    }}
                  >
                    {log.notes}
                  </p>
                </div>
                {log.hasVoiceNote && (
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{
                      background: 'rgba(255, 0, 255, 0.2)',
                      border: '1px solid var(--neon-pink)',
                    }}
                  >
                    <Mic className="w-5 h-5" style={{ color: 'var(--neon-pink)' }} />
                  </motion.button>
                )}
              </div>
            </motion.div>
          ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-8 rounded-2xl p-6 text-center"
        style={{
          background: 'linear-gradient(135deg, rgba(255, 0, 255, 0.1), rgba(0, 255, 255, 0.1))',
          border: '1px solid rgba(255, 0, 255, 0.2)',
        }}
      >
        <div className="text-4xl mb-3">🏆</div>
        <div
          className="text-xl mb-2"
          style={{
            color: 'var(--neon-pink)',
            fontWeight: 'var(--font-weight-medium)',
          }}
        >
          Keep Going, Yuni!
        </div>
        <p className="text-sm opacity-70" style={{ color: 'var(--foreground)' }}>
          이번 주 4일 연습 완료! 목표까지 3일 남았어요
        </p>
      </motion.div>
    </div>
  );
}
