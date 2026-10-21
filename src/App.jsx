import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import CompactView from './components/CompactView.jsx';
import ExpandedView from './components/ExpandedView.jsx';
import PeekView, { BluetoothToastView, HiddenLipView } from './components/PeekView.jsx';
import { useClipboard, useConfig, useMedia, useStash, useSysInfo } from './hooks.js';
import { useClockTools } from './clockStore.js';
import { useJarvis } from './jarvis.js';

const api = window.island;

function playBtConnectChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = [587.33, 880.0]; // D5 -> A5 (clean AirPods-like connect tone)
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.11);
      gain.gain.setValueAtTime(0.001, ctx.currentTime + i * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + i * 0.11 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.11 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.11);
      osc.stop(ctx.currentTime + i * 0.11 + 0.3);
    });
    setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch { /* ignore */ }
}

// Critically damped spring — zero jitter, 120fps fluid open & close
const SPRING = {
  type: 'spring',
  stiffness: 330,
  damping: 32,
  mass: 0.72,
  restDelta: 0.5,
};
const EXPANDED = { width: 740, height: 340, borderRadius: 38, y: 8 };

export default function App() {
  const config = useConfig();
  const media = useMedia();
  const sysinfo = useSysInfo();
  const [stashItems, stashActions] = useStash();
  const [clipboardItems, clipboardActions] = useClipboard();

  // mode: 'hidden' (tiny top lip) | 'peek' (status pill) | 'compact' | 'expanded'
  const [mode, setMode] = useState('peek');
  const [pinned, setPinned] = useState(false);
  const [tab, setTab] = useState('home');
  const [dragOver, setDragOver] = useState(false);
  const [focusToken, setFocusToken] = useState(0);
  const [voiceTurn, setVoiceTurn] = useState(null);

  const islandRef = useRef(null);
  const hoverTimer = useRef();
  const leaveTimer = useRef();
  const peekTimer = useRef();
  const dragDepth = useRef(0);
  const inputFocused = useRef(false);
  const internalDrag = useRef(false);
  const hovered = useRef(false);
  const pinnedRef = useRef(false);
  const modeRef = useRef(mode);

  useEffect(() => {
    pinnedRef.current = pinned;
  }, [pinned]);

  useEffect(() => {
    modeRef.current = mode;
    api.setExpanded(mode === 'expanded' || mode === 'compact');
  }, [mode]);

  const expand = useCallback((nextTab) => {
    clearTimeout(hoverTimer.current);
    clearTimeout(leaveTimer.current);
    clearTimeout(peekTimer.current);
    api.setIgnoreMouse(false);
    if (nextTab) setTab(nextTab);
    setMode('expanded');
  }, []);

  const clock = useClockTools({
    onRing: () => {
      expand('clock');
      setPinned(true);
      pinnedRef.current = true;
    },
  });

  const jarvis = useJarvis({
    setTab,
    setPinned: (val) => {
      setPinned(val);
      pinnedRef.current = typeof val === 'function' ? val(pinnedRef.current) : val;
    },
    expand,
    clock,
    sysinfo,
    config,
    onVoiceChatTurn: (user, reply) => {
      setVoiceTurn({ id: Date.now(), user, reply });
    },
  });

  const jarvisBusyRef = useRef(false);
  useEffect(() => {
    jarvisBusyRef.current = jarvis.status !== 'idle';
  }, [jarvis.status]);

  // --- Bluetooth Connection Auto-Popup Notification ---
  const [btAlert, setBtAlert] = useState(null);
  const knownBtRef = useRef(null);
  const btTimerRef = useRef(null);

  useEffect(() => {
    if (!sysinfo?.ts) return; // wait for first real sample from sysinfo.ps1
    const currentList = Array.isArray(sysinfo.bluetooth) ? sysinfo.bluetooth : [];
    const currentNames = new Set(currentList.map((d) => d.name).filter(Boolean));

    if (knownBtRef.current === null) {
      knownBtRef.current = currentNames;
      return;
    }

    const newlyConnected = currentList.find((d) => d.name && !knownBtRef.current.has(d.name));
    knownBtRef.current = currentNames;

    if (newlyConnected) {
      setBtAlert(newlyConnected);
      playBtConnectChime();
      if (modeRef.current !== 'expanded') {
        clearTimeout(peekTimer.current);
        setMode('bt-toast');
      }
      jarvis.speak(`Bluetooth connected to ${newlyConnected.name}, sir.`);

      clearTimeout(btTimerRef.current);
      btTimerRef.current = setTimeout(() => {
        setBtAlert(null);
        setMode((m) => (m === 'bt-toast' ? (activeClockRef.current ? 'peek' : 'hidden') : m));
      }, 4500);
    }
  }, [sysinfo?.bluetooth, sysinfo?.ts, jarvis]);

  const activeClock = !!(clock?.timer?.running || clock?.stopwatch?.running);
  const activeClockRef = useRef(activeClock);
  useEffect(() => {
    activeClockRef.current = activeClock;
    if (activeClock && modeRef.current === 'hidden') {
      setMode('peek');
    } else if (!activeClock && modeRef.current === 'peek' && !hovered.current && !pinnedRef.current) {
      clearTimeout(peekTimer.current);
      peekTimer.current = setTimeout(() => {
        if (!activeClockRef.current) setMode((m) => (m === 'peek' ? 'hidden' : m));
      }, 2500);
    }
  }, [activeClock]);

  const musicPlaying = !!(media?.active && media?.status === 'Playing');
  const compactWidth = media.active ? 320 : stashItems.length ? 260 : 230;
  const peekWidth = Math.min(
    540,
    (sysinfo?.bluetooth?.length ? 360 : 295)
      + (activeClock ? 72 : 0)
      + (musicPlaying ? 115 : 0),
  );

  const targetBox = (() => {
    switch (mode) {
      case 'expanded':
        return EXPANDED;
      case 'bt-toast':
        return { width: 390, height: 56, borderRadius: 28, y: 8 };
      case 'compact':
        return { width: compactWidth, height: 36, borderRadius: 18, y: 6 };
      case 'peek':
        return { width: peekWidth, height: 32, borderRadius: 16, y: 6 };
      case 'hidden':
      default:
        return { width: 116, height: 7, borderRadius: 10, y: 0 };
    }
  })();

  const hideToLip = useCallback((force = false) => {
    if (!force && (pinnedRef.current || jarvisBusyRef.current)) return; // stay open when pinned or talking to Jarvis!
    clearTimeout(hoverTimer.current);
    clearTimeout(leaveTimer.current);
    clearTimeout(peekTimer.current);
    setMode(!force && activeClockRef.current ? 'peek' : 'hidden');
    if (force) {
      setPinned(false);
      pinnedRef.current = false;
    }
    inputFocused.current = false;
    document.activeElement?.blur?.();
  }, []);

  const scheduleHide = useCallback(() => {
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => {
      if (!pinnedRef.current && !jarvisBusyRef.current && !inputFocused.current && dragDepth.current === 0 && !hovered.current) {
        hideToLip();
      }
    }, config?.collapseDelay ?? 380);
  }, [hideToLip, config]);

  // --- Periodic 30-second status peek ---
  useEffect(() => {
    if (config?.peekEnabled === false) return undefined;
    const intervalMs = config?.peekInterval ?? 30000;
    const durationMs = config?.peekDuration ?? 3000;

    if (mode === 'peek' && !hovered.current && !pinnedRef.current && !activeClockRef.current) {
      clearTimeout(peekTimer.current);
      peekTimer.current = setTimeout(() => {
        if (!activeClockRef.current) {
          setMode((m) => (m === 'peek' ? 'hidden' : m));
        }
      }, durationMs);
    }

    const id = setInterval(() => {
      if (hovered.current || pinnedRef.current || jarvisBusyRef.current || inputFocused.current || dragDepth.current > 0) return;
      setMode((current) => {
        if (current !== 'hidden') return current;
        api.sysinfo.refresh();
        clearTimeout(peekTimer.current);
        peekTimer.current = setTimeout(() => {
          if (!activeClockRef.current) {
            setMode((m) => (m === 'peek' ? 'hidden' : m));
          }
        }, durationMs);
        return 'peek';
      });
    }, intervalMs);

    return () => clearInterval(id);
  }, [config?.peekEnabled, config?.peekInterval, config?.peekDuration, mode]);

  // --- global events from main process ---
  useEffect(() => api.onToggle(() => {
    if (modeRef.current === 'expanded') return hideToLip(true);
    expand('home');
    setPinned(true);
    pinnedRef.current = true;
    setFocusToken((t) => t + 1);
  }), [expand, hideToLip]);

  // Wake up when cursor touches the top lip (detected by main process or renderer)
  useEffect(() => api.onEdgeHover(() => {
    hovered.current = true;
    clearTimeout(leaveTimer.current);
    if (modeRef.current !== 'expanded') {
      expand();
    }
  }), [expand]);

  // Guaranteed close trigger even on ultra-fast mouse flicks out of the overlay window
  useEffect(() => api.onCursorOutside(() => {
    hovered.current = false;
    clearTimeout(hoverTimer.current);
    if (!pinnedRef.current && !jarvisBusyRef.current && dragDepth.current === 0) {
      scheduleHide();
    }
  }), [scheduleHide]);

  // Only hide on window blur if NOT pinned
  useEffect(() => api.onBlur(() => {
    if (!pinnedRef.current && !jarvisBusyRef.current && !internalDrag.current && dragDepth.current === 0 && !hovered.current) {
      hideToLip();
    }
  }), [hideToLip]);

  useEffect(() => api.stash.onDragEnd(() => { internalDrag.current = false; }), []);

  // The search input unmounts when switching tabs - reset its focus flag
  useEffect(() => { inputFocused.current = false; }, [tab]);

  // Escape key to unpin & hide
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && hideToLip(true);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hideToLip]);

  // --- hover / click ---
  const onMouseEnter = () => {
    hovered.current = true;
    clearTimeout(leaveTimer.current);
    clearTimeout(peekTimer.current);
    if (mode !== 'expanded') {
      expand();
    }
  };

  const onMouseLeave = () => {
    hovered.current = false;
    clearTimeout(hoverTimer.current);
    if (!pinnedRef.current && !jarvisBusyRef.current && dragDepth.current === 0) {
      scheduleHide();
    }
  };

  const onClick = () => {
    if (mode !== 'expanded') {
      clearTimeout(hoverTimer.current);
      expand();
      setPinned(true);
      pinnedRef.current = true;
    }
  };

  // --- drag & drop from Explorer ---
  const isFileDrag = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
  const onDragEnter = (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    if (dragDepth.current === 1) {
      setDragOver(true);
      expand(tab === 'media' ? 'home' : undefined);
    }
  };
  const onDragOver = (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = internalDrag.current ? 'none' : 'copy';
  };
  const onDragLeave = (e) => {
    if (!isFileDrag(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) {
      setDragOver(false);
      if (!pinnedRef.current && !hovered.current) scheduleHide();
    }
  };
  const onDrop = (e) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    if (internalDrag.current || !e.dataTransfer.files.length) return;

    if (tab === 'stash') {
      stashActions.add(e.dataTransfer.files);
    } else {
      setTab('home');
      api.shortcuts.add(e.dataTransfer.files);
    }
    setPinned(true);
    pinnedRef.current = true;
  };

  const startDragOut = (name) => {
    internalDrag.current = true;
    api.stash.startDrag(name);
  };

  const isExpanded = mode === 'expanded';
  const isBtToast = mode === 'bt-toast';
  const isCompact = mode === 'compact';
  const isPeek = mode === 'peek';
  const isHidden = mode === 'hidden';

  return (
    <div className="flex h-full w-full justify-center">
      <motion.div
        ref={islandRef}
        initial={false}
        animate={targetBox}
        transition={SPRING}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`relative overflow-hidden bg-black text-white transform-gpu ${isExpanded ? 'cursor-default' : 'cursor-pointer'}`}
        style={{
          willChange: 'width, height, transform, border-radius',
          backfaceVisibility: 'hidden',
          borderTopLeftRadius: isHidden ? 0 : targetBox.borderRadius,
          borderTopRightRadius: isHidden ? 0 : targetBox.borderRadius,
          boxShadow: isExpanded
            ? '0 18px 46px -10px rgba(0,0,0,.68), inset 0 0 0 1px rgba(255,255,255,.09)'
            : isHidden
              ? '0 2px 8px rgba(0,0,0,.45), inset 0 -1px 0 rgba(255,255,255,.2)'
              : '0 6px 18px -4px rgba(0,0,0,.55), inset 0 0 0 1px rgba(255,255,255,.08)',
        }}
      >
        {/* Pre-mounted ExpandedView: zero DOM mount/unmount cost during open/close! */}
        <motion.div
          initial={false}
          animate={
            isExpanded
              ? { opacity: 1, scale: 1, y: 0 }
              : { opacity: 0, scale: 0.92, y: -10 }
          }
          transition={
            isExpanded
              ? { duration: 0.22, delay: 0.03, ease: [0.22, 1, 0.36, 1] }
              : { duration: 0.12, ease: [0.4, 0, 1, 1] }
          }
          className="absolute top-0 transform-gpu"
          style={{
            left: '50%',
            marginLeft: -EXPANDED.width / 2,
            width: EXPANDED.width,
            height: EXPANDED.height,
            pointerEvents: isExpanded ? 'auto' : 'none',
            willChange: 'transform, opacity',
          }}
        >
          <ExpandedView
            tab={tab}
            setTab={setTab}
            pinned={pinned}
            setPinned={setPinned}
            config={config}
            media={media}
            sysinfo={sysinfo}
            clock={clock}
            stashItems={stashItems}
            stashActions={stashActions}
            clipboardItems={clipboardItems}
            clipboardActions={clipboardActions}
            jarvis={jarvis}
            voiceTurn={voiceTurn}
            dragOver={dragOver}
            focusToken={focusToken}
            onInputFocus={(v) => { inputFocused.current = v; }}
            onDragOut={startDragOut}
          />
        </motion.div>

        {/* Compact view layer */}
        <motion.div
          initial={false}
          animate={{ opacity: isCompact ? 1 : 0, scale: isCompact ? 1 : 0.92 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 transform-gpu"
          style={{ pointerEvents: isCompact ? 'auto' : 'none', willChange: 'transform, opacity' }}
        >
          <CompactView media={media} clock={clock} sysinfo={sysinfo} stashCount={stashItems.length} />
        </motion.div>

        {/* Bluetooth Connected Toast layer */}
        <motion.div
          initial={false}
          animate={{ opacity: isBtToast ? 1 : 0, scale: isBtToast ? 1 : 0.92 }}
          transition={{ duration: 0.18 }}
          className="absolute inset-0 transform-gpu"
          style={{ pointerEvents: 'none', willChange: 'transform, opacity' }}
        >
          <BluetoothToastView device={btAlert} />
        </motion.div>

        {/* Status Peek view layer */}
        <motion.div
          initial={false}
          animate={{ opacity: isPeek ? 1 : 0, scale: isPeek ? 1 : 0.92 }}
          transition={{ duration: 0.16 }}
          className="absolute inset-0 transform-gpu"
          style={{ pointerEvents: 'none', willChange: 'transform, opacity' }}
        >
          <PeekView sysinfo={sysinfo} clock={clock} media={media} />
        </motion.div>

        {/* Hidden top lip layer */}
        <motion.div
          initial={false}
          animate={{ opacity: isHidden ? 1 : 0 }}
          transition={{ duration: 0.14 }}
          className="absolute inset-0"
          style={{ pointerEvents: 'none' }}
        >
          <HiddenLipView
            mediaPlaying={media.status === 'Playing'}
            timerRunning={activeClock}
            stashCount={stashItems.length}
          />
        </motion.div>
      </motion.div>
    </div>
  );
}
