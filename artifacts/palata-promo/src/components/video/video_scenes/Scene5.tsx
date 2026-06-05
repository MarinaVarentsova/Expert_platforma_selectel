import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const EXPERTS = [
  { name: 'Иванов А.С.',   spec: 'Строительно-техническая экспертиза', rating: '5.0', deals: 127, highlight: true },
  { name: 'Петрова Е.В.',  spec: 'Оценочная экспертиза',               rating: '4.9', deals: 98,  highlight: false },
  { name: 'Смирнов Д.А.',  spec: 'Инженерные системы и сети',          rating: '4.8', deals: 86,  highlight: false },
];

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 2500),
      setTimeout(() => setPhase(4), 9000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-10"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: '-100%' }}
      transition={{ duration: 0.8 }}
    >
      <div className="w-full flex items-center justify-center px-[10vw] gap-12">

        {/* ── Mock experts list — white card ── */}
        <motion.div
          className="w-[48%] bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
          initial={{ opacity: 0, y: 40 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{ duration: 0.7, type: 'spring', stiffness: 120, damping: 18 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-[1.6vw] py-[1vw] border-b border-slate-100">
            <span className="text-[1.4vw] font-bold text-[#002B5C]">Лучшие эксперты</span>
            <span className="text-[1vw] text-[#0F4C9A] font-medium">›</span>
          </div>

          {/* Expert rows */}
          {EXPERTS.map((e, i) => (
            <motion.div
              key={e.name}
              className={`flex items-center gap-[1.2vw] px-[1.6vw] py-[1vw] ${
                e.highlight
                  ? 'bg-[#0F4C9A] text-white'
                  : 'bg-white text-slate-800 border-t border-slate-50'
              }`}
              initial={{ opacity: 0, x: -20 }}
              animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
              transition={{ duration: 0.5, delay: 0.1 * i }}
            >
              {/* Avatar */}
              <div className={`w-[3.2vw] h-[3.2vw] rounded-full flex items-center justify-center text-[1.1vw] font-bold flex-shrink-0 ${
                e.highlight ? 'bg-white/20 text-white' : 'bg-slate-100 text-[#0F4C9A]'
              }`}>
                {e.name.split(' ')[0][0]}
              </div>

              {/* Name + spec */}
              <div className="flex-1 min-w-0">
                <div className={`text-[1.2vw] font-semibold leading-tight truncate ${e.highlight ? 'text-white' : 'text-[#002B5C]'}`}>
                  {e.name}
                </div>
                <div className={`text-[0.9vw] mt-[0.1vw] truncate ${e.highlight ? 'text-white/80' : 'text-slate-500'}`}>
                  {e.spec}
                </div>
              </div>

              {/* Rating + deals */}
              <div className={`flex items-center gap-[0.4vw] text-[1vw] flex-shrink-0 ${e.highlight ? 'text-white/90' : 'text-slate-600'}`}>
                <svg className="w-[1.1vw] h-[1.1vw] text-yellow-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                </svg>
                <span className="font-semibold">{e.rating}</span>
                <span className={`${e.highlight ? 'text-white/60' : 'text-slate-400'}`}>{e.deals} дел</span>
              </div>
            </motion.div>
          ))}

          {/* Footer */}
          <div className="px-[1.6vw] py-[0.8vw] border-t border-slate-100">
            <span className="text-[0.95vw] text-[#0F4C9A] font-medium">Смотреть всех экспертов →</span>
          </div>
        </motion.div>

        {/* ── Text block ── */}
        <div className="w-[45%] text-left">
          <motion.h2 
            className="text-[4vw] font-bold text-[var(--color-primary)] leading-tight mb-6"
            initial={{ opacity: 0, x: 50 }}
            animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: 50 }}
            transition={{ duration: 0.6 }}
          >
            Шаг 4.
            <br/>
            <span className="text-[var(--color-secondary)]">Взаимная оценка</span>
          </motion.h2>
          
          <motion.div 
            className="flex items-center gap-2 mb-6"
            initial={{ opacity: 0 }}
            animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
          >
            {[1,2,3,4,5].map(i => (
              <svg key={i} className="w-8 h-8 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
          </motion.div>

          <motion.p 
            className="text-[1.8vw] text-[var(--color-text-muted)] leading-relaxed font-medium"
            initial={{ opacity: 0, y: 20 }}
            animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6 }}
          >
            Честный рейтинг формируется на основе выполненных заказов и открывает доступ к лучшим специалистам.
          </motion.p>
        </div>
      </div>
    </motion.div>
  );
}
