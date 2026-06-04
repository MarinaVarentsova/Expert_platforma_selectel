import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 2500),
      setTimeout(() => setPhase(4), 4000),
      setTimeout(() => setPhase(5), 7000), // exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-between px-[10vw] z-10"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '-100%', opacity: 0 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="w-[40%] text-left">
        <motion.div 
          className="w-16 h-1 bg-[var(--color-secondary)] mb-8"
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
          Шаг 1.
          <br/>
          <span className="text-[var(--color-secondary)]">Размещение заказа</span>
        </motion.h2>
        <motion.p 
          className="text-[1.8vw] text-[var(--color-text-muted)] leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
        >
          Заказчик создает заявку. Удобный личный кабинет позволяет всегда отследить статус заказа.
        </motion.p>
      </div>

      <div className="w-[50%] relative h-[60vh]">
        {/* Mock UI for placing an order */}
        <motion.div 
          className="absolute inset-0 bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col"
          initial={{ opacity: 0, y: 50, rotateX: 20 }}
          animate={phase >= 3 ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: 50, rotateX: 20 }}
          transition={{ duration: 0.8, type: 'spring', stiffness: 100 }}
          style={{ transformPerspective: 1000 }}
        >
          <div className="h-12 bg-gray-50 border-b border-gray-100 flex items-center px-6">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-amber-400" />
              <div className="w-3 h-3 rounded-full bg-green-400" />
            </div>
            <div className="ml-6 text-sm font-medium text-gray-500">Личный кабинет заказчика</div>
          </div>
          <div className="p-8 flex-1 flex flex-col gap-6">
            <div className="w-1/3 h-8 bg-gray-200 rounded animate-pulse" />
            <div className="space-y-4">
              <div className="w-full h-12 border border-gray-200 rounded bg-gray-50" />
              <div className="w-full h-32 border border-gray-200 rounded bg-gray-50" />
              <div className="w-2/3 h-12 border border-gray-200 rounded bg-gray-50" />
            </div>
            <motion.div 
              className="mt-auto self-end w-40 h-12 bg-[var(--color-secondary)] rounded-lg"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={phase >= 4 ? { scale: 1, opacity: 1 } : { scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            />
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
