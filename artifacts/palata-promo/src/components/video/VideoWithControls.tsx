import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Maximize2, Play, Repeat, Volume2, VolumeX } from 'lucide-react';
import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';
import { useSceneControls } from './useSceneControls';

const PROGRESS_TICK_MS = 60;

interface ControlBarProps {
  visible: boolean;
  collapsed: boolean;
  locked: boolean;
  muted: boolean;
  sceneKeys: string[];
  activeIndex: number;
  activeDuration: number;
  tick: number;
  onToggleLock: () => void;
  onToggleMuted: () => void;
  onJumpTo: (index: number) => void;
  onToggleCollapsed: () => void;
  onFullscreen: () => void;
}

function ProgressSegments({
  sceneKeys,
  activeIndex,
  activeDuration,
  tick,
  onJumpTo,
}: {
  sceneKeys: string[];
  activeIndex: number;
  activeDuration: number;
  tick: number;
  onJumpTo: (index: number) => void;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const start = performance.now();
    const id = window.setInterval(() => {
      setElapsed(performance.now() - start);
    }, PROGRESS_TICK_MS);
    return () => window.clearInterval(id);
  }, [tick]);

  const progress = activeDuration > 0 ? Math.min(1, elapsed / activeDuration) : 0;

  return (
    <div className="flex-1 flex items-center gap-1.5">
      {sceneKeys.map((key, i) => {
        const isActive = i === activeIndex;
        const fill = isActive ? progress * 100 : i < activeIndex ? 100 : 0;
        return (
          <button
            key={key}
            onClick={() => onJumpTo(i)}
            className="flex-1 h-3 bg-white/20 rounded-full overflow-hidden cursor-pointer hover:h-4 hover:bg-white/25 transition-all relative min-h-[12px]"
            aria-label={`Jump to scene ${i + 1}`}
            aria-current={isActive ? 'true' : undefined}
          >
            <div
              className="absolute inset-y-0 left-0 bg-white/90 rounded-full transition-[width] duration-100"
              style={{ width: `${fill}%` }}
            />
          </button>
        );
      })}
    </div>
  );
}

function ControlBar({
  visible,
  collapsed,
  locked,
  muted,
  sceneKeys,
  activeIndex,
  activeDuration,
  tick,
  onToggleLock,
  onToggleMuted,
  onJumpTo,
  onToggleCollapsed,
  onFullscreen,
}: ControlBarProps) {
  return (
    <div
      className={`flex items-center gap-3 bg-black/50 backdrop-blur-sm px-5 py-4 transition-all duration-200 ease-out ${
        visible
          ? 'translate-y-0 opacity-100 pointer-events-auto'
          : 'translate-y-full opacity-0 pointer-events-none'
      }`}
      aria-hidden={!visible}
    >
      <button
        onClick={onToggleLock}
        className={`w-14 h-14 flex items-center justify-center transition-colors rounded-lg shrink-0 ${
          locked
            ? 'text-white bg-white/15 hover:bg-white/25'
            : 'text-white/60 hover:text-white hover:bg-white/10'
        }`}
        title={locked ? 'Loop current scene: on' : 'Loop current scene: off'}
        aria-label={locked ? 'Loop current scene: on' : 'Loop current scene: off'}
        aria-pressed={locked}
      >
        <Repeat className="w-8 h-8" />
      </button>

      <button
        onClick={onToggleMuted}
        className="w-14 h-14 flex items-center justify-center transition-colors rounded-lg shrink-0 text-white/60 hover:text-white hover:bg-white/10"
        title={muted ? 'Unmute audio' : 'Mute audio'}
        aria-label={muted ? 'Unmute audio' : 'Mute audio'}
        aria-pressed={muted}
      >
        {muted ? <VolumeX className="w-8 h-8" /> : <Volume2 className="w-8 h-8" />}
      </button>

      <div className="w-px self-stretch bg-white/15" aria-hidden="true" />

      <ProgressSegments
        sceneKeys={sceneKeys}
        activeIndex={activeIndex}
        activeDuration={activeDuration}
        tick={tick}
        onJumpTo={onJumpTo}
      />

      <div className="text-xl text-white/60 font-mono tabular-nums shrink-0">
        {activeIndex + 1}/{sceneKeys.length}
      </div>

      <button
        onClick={onFullscreen}
        className="w-14 h-14 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors rounded-lg shrink-0"
        title="Полный экран"
        aria-label="Полный экран"
      >
        <Maximize2 className="w-7 h-7" />
      </button>

      <button
        onClick={onToggleCollapsed}
        className="w-14 h-14 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors rounded-lg shrink-0"
        title={collapsed ? 'Show controls' : 'Hide controls'}
        aria-label={collapsed ? 'Show controls' : 'Hide controls'}
        aria-expanded={!collapsed}
      >
        {collapsed ? <ChevronUp className="w-10 h-10" /> : <ChevronDown className="w-10 h-10" />}
      </button>
    </div>
  );
}

export default function VideoWithControls() {
  const isIframed = typeof window !== 'undefined' && window.self !== window.top;

  const {
    sceneKeys,
    activeIndex,
    locked,
    mountKey,
    tick,
    durations,
    activeDuration,
    onSceneChange,
    jumpTo,
    toggleLock,
  } = useSceneControls(SCENE_DURATIONS);

  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(true);
  const sensorRef = useRef<HTMLDivElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [tapPinned, setTapPinned] = useState(false);

  const handlePlay = useCallback(() => {
    jumpTo(0);
    setStarted(true);
  }, [jumpTo]);

  const handleVideoEnd = useCallback(() => {
    setStarted(false);
  }, []);

  const handleFullscreen = useCallback(() => {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
  }, []);

  const handlePointerEnter = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') setHovering(true);
  }, []);
  const handlePointerLeave = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') setHovering(false);
  }, []);
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return;
    if (collapsed) setTapPinned(true);
  }, [collapsed]);
  const handleToggleCollapsed = useCallback(() => {
    setCollapsed(c => {
      if (!c) { setHovering(false); setTapPinned(false); }
      return !c;
    });
  }, []);

  useEffect(() => {
    if (!(collapsed && tapPinned)) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const sensor = sensorRef.current;
      if (sensor && !sensor.contains(e.target as Node)) setTapPinned(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [collapsed, tapPinned]);

  const barVisible = !collapsed || hovering || tapPinned;

  if (!isIframed) return <VideoTemplate />;

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {started ? (
        <VideoTemplate
          key={mountKey}
          durations={durations}
          loop={false}
          muted={muted}
          onSceneChange={onSceneChange}
          onVideoEnd={handleVideoEnd}
        />
      ) : (
        /* Poster / не запущено */
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-8" style={{ background: 'linear-gradient(135deg, #002B5C 0%, #0F4C9A 60%, #1a6bbf 100%)' }}>
          {/* subtle glow */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute w-[60vw] h-[60vw] rounded-full blur-[120px] opacity-20 -top-1/4 right-0"
              style={{ background: 'radial-gradient(circle, #4A90D9, transparent 70%)' }} />
            <div className="absolute w-[40vw] h-[40vw] rounded-full blur-[80px] opacity-15 bottom-0 left-0"
              style={{ background: 'radial-gradient(circle, #ffffff, transparent 70%)' }} />
          </div>

          {/* Logo */}
          <a
            href="https://xn--80aaaio3ae2acfmjkg3n.xn--p1ai/"
            target="_blank"
            rel="noopener noreferrer"
            className="relative z-10 block hover:scale-105 active:scale-95 transition-transform duration-200"
            aria-label="Палата судебных экспертов — официальный сайт"
          >
            <img
              src={`${import.meta.env.BASE_URL}logo.jpg`}
              alt="Палата судебных экспертов"
              className="h-28 w-auto max-w-[260px] rounded-2xl object-contain bg-white p-2 shadow-2xl"
              style={{ filter: 'contrast(1.05) saturate(1.1)' }}
            />
          </a>

          {/* Play button */}
          <button
            onClick={handlePlay}
            className="relative z-10 flex items-center justify-center w-20 h-20 rounded-full bg-white/15 hover:bg-white/25 border-2 border-white/40 hover:border-white/70 shadow-2xl transition-all duration-200 hover:scale-105 active:scale-95 backdrop-blur-sm"
            aria-label="Смотреть видео"
          >
            <Play className="w-9 h-9 text-white ml-1" fill="white" />
          </button>
        </div>
      )}

      {started && (
        <div
          ref={sensorRef}
          className="absolute bottom-0 left-0 right-0 z-50 flex flex-col justify-end"
          style={{ height: '25%' }}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          onPointerDown={handlePointerDown}
        >
          <div className="flex-1 w-full" aria-hidden="true" />
          <ControlBar
            visible={barVisible}
            collapsed={collapsed}
            locked={locked}
            muted={muted}
            sceneKeys={sceneKeys}
            activeIndex={activeIndex}
            activeDuration={activeDuration}
            tick={tick}
            onToggleLock={toggleLock}
            onToggleMuted={() => setMuted(m => !m)}
            onJumpTo={jumpTo}
            onToggleCollapsed={handleToggleCollapsed}
            onFullscreen={handleFullscreen}
          />
        </div>
      )}
    </div>
  );
}
