import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 3000),
      setTimeout(() => setPhase(4), 4500),
      setTimeout(() => setPhase(5), 9000), // exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-between px-[10vw] z-10"
      initial={{ opacity: 0, y: '100%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="w-[45%] text-left">
        <motion.div 
          className="w-16 h-1 bg-[var(--color-primary)] mb-8"
          initial={{ scaleX: 0, originX: 0 }}
          animate={phase >= 1 ? { scaleX: 1 } : { scaleX: 0 }}
          transition={{ duration: 0.6 }}
        />
        <motion.h2 
          className="text-[4vw] font-bold text-[var(--color-primary)] leading-tight mb-6"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          Шаг 4 & 5.
          <br/>
          <span className="text-[var(--color-secondary)]">Работа над заказом</span>
        </motion.h2>
        <motion.p 
          className="text-[1.8vw] text-[var(--color-text-muted)] leading-relaxed mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
        >
          Эксперт принимает заказ и выполняет работу. Полная прозрачность и контроль на каждом этапе.
        </motion.p>
      </div>

      <div className="w-[45%] flex flex-col gap-6">
        <motion.div 
          className="bg-white rounded-2xl p-6 shadow-lg border-l-8 border-[var(--color-secondary)] flex items-center gap-6"
          initial={{ opacity: 0, x: 50 }}
          animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: 50 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        >
          <div className="w-16 h-16 rounded-full bg-[var(--color-bg-muted)] flex items-center justify-center">
            <svg className="w-8 h-8 text-[var(--color-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <div className="text-[1.5vw] font-bold text-[var(--color-primary)]">Заказ в работе</div>
            <div className="text-[1vw] text-gray-500">Эксперт приступил к выполнению</div>
          </div>
        </motion.div>

        <motion.div 
          className="bg-white rounded-2xl p-6 shadow-lg border-l-8 border-green-500 flex items-center gap-6"
          initial={{ opacity: 0, x: 50 }}
          animate={phase >= 4 ? { opacity: 1, x: 0 } : { opacity: 0, x: 50 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        >
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
             <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <div className="text-[1.5vw] font-bold text-gray-800">Заказ завершен</div>
            <div className="text-[1vw] text-gray-500">Результаты загружены в систему</div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
