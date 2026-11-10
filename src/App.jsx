import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import CompactView from './components/CompactView.jsx';
import ExpandedView from './components/ExpandedView.jsx';
import PeekView, { BluetoothToastView, HiddenLipView } from './components/PeekView.jsx';
import { AutomationToastView, useAdaptiveAccent } from './components/AutomationOverlay.jsx';
import { CyberNotchEars } from './components/CyberMascot.jsx';
import {
  useClipboard, useConfig, useLyrics, useMedia, useMediaPosition, useStash, useSysInfo,
} from './hooks.js';
import { useClockTools } from './clockStore.js';
import { useJarvis } from './jarvis.js';
import { useAutomation } from './automation.js';

const api = window.island;

function playBtConnectChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = [587.33, 880.0]; // D5 -> A5
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

// Snappy, critically-damped spring — ultra-responsive open & close
const SPRING = {
  type: 'spring',
  stiffness: 420,
  damping: 36,
  mass: 0.62,
  restDelta: 0.25,
};

// Compact, sleek Expanded Notch
const EXPANDED = {
  width: 556,
  height: 236,
  borderTopLeftRadius: 0,
  borderTopRightRadius: 0,
  borderBottomLeftRadius: 30,
  borderBottomRightRadius: 30,
  y: 0,
};

const EXPANDED_PREVIEW = {
  width: 620,
  height: 340,
  borderTopLeftRadius: 0,
  borderTopRightRadius: 0,
  borderBottomLeftRadius: 32,
  borderBottomRightRadius: 32,
  y: 0,
};

export default function App() {
  const config = useConfig();
  const media = useMedia();
  const mediaPos = useMediaPosition(media);
  const lyrics = useLyrics(media, mediaPos);
  const sysinfo = useSysInfo();
  const [stashItems, stashActions] = useStash();
  const [clipboardItems, clipboardActions] = useClipboard();
  const automation = useAutomation();

  // mode: 'hidden' | 'peek' | 'compact' | 'bt-toast' | 'auto-toast' | 'expanded'
  const [mode, setMode] = useState('hidden');
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
  const hasPreviewRef = useRef(false);
  const browserActive = !!sysinfo?.browserActive;
  const browserActiveRef = useRef(browserActive);

  useEffect(() => {
    browserActiveRef.current = browserActive;
    if (browserActive && modeRef.current === 'peek' && !hovered.current && !pinnedRef.current && !automation.status?.active) {
      setMode('hidden');
    }
  }, [browserActive, automation.status]);

  useEffect(() => {
    pinnedRef.current = pinned;
  }, [pinned]);

  useEffect(() => {
    modeRef.current = mode;
    api.setExpanded(mode === 'expanded' || mode === 'compact' || mode === 'auto-toast');
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
    automation,
    onVoiceChatTurn: (user, reply) => {
      setVoiceTurn({ id: Date.now(), user, reply });
    },
  });

  const jarvisBusyRef = useRef(false);
  useEffect(() => {
    jarvisBusyRef.current = jarvis.status !== 'idle';
  }, [jarvis.status]);

  // Auto-expand and keep open while a Google Form preview is awaiting confirmation
  useEffect(() => {
    hasPreviewRef.current = !!automation.formPreview;
    if (automation.formPreview) {
      expand();
      setPinned(true);
      pinnedRef.current = true;
    }
  }, [automation.formPreview, expand]);

  // Show capsule status in Peek mode when Jarvis is actively controlling Browser / Form / Code
  useEffect(() => {
    if (automation.status?.active && modeRef.current === 'hidden') {
      setMode('peek');
    }
  }, [automation.status]);

  // Show Automation Toast pill when a code/form/browser toast arrives while not expanded
  useEffect(() => {
    if (!automation.toast) {
      setMode((m) => (m === 'auto-toast' ? 'hidden' : m));
      return;
    }
    if (modeRef.current !== 'expanded') {
      clearTimeout(peekTimer.current);
      setMode('auto-toast');
    }
  }, [automation.toast]);

  // --- Press "Ctrl + 0" anywhere to activate Jarvis voice ---
  const jarvisToggleRef = useRef(jarvis.toggleListening);
  useEffect(() => {
    jarvisToggleRef.current = jarvis.toggleListening;
  }, [jarvis.toggleListening]);

  useEffect(() => api.jarvis?.onHotkey?.(() => {
    if (inputFocused.current) return;
    if (modeRef.current !== 'expanded') expand();
    jarvisToggleRef.current?.();
  }), [expand]);

  // --- Bluetooth Connection Auto-Popup Notification ---
  const [btAlert, setBtAlert] = useState(null);
  const knownBtRef = useRef(null);
  const btTimerRef = useRef(null);

  useEffect(() => {
    if (!sysinfo?.ts) return;
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
        setMode((m) => (m === 'bt-toast' ? 'hidden' : m));
      }, 4500);
    }
  }, [sysinfo?.bluetooth, sysinfo?.ts, jarvis]);

  const activeClock = !!(clock?.timer?.running || clock?.stopwatch?.running);
  const activeAutomation = !!(automation.status && automation.status.active !== false);
  const activeClockRef = useRef(activeClock);
  useEffect(() => {
    activeClockRef.current = activeClock || activeAutomation;
    if ((activeClock || activeAutomation) && modeRef.current === 'hidden' && !browserActiveRef.current) {
      setMode('peek');
    } else if (!activeClock && !activeAutomation && modeRef.current === 'peek' && !hovered.current && !pinnedRef.current) {
      clearTimeout(peekTimer.current);
      peekTimer.current = setTimeout(() => {
        if (!activeClockRef.current) setMode((m) => (m === 'peek' ? 'hidden' : m));
      }, 2500);
    }
  }, [activeClock, activeAutomation]);

  const musicPlaying = !!(media?.active && media?.status === 'Playing');
  const currentLyric = musicPlaying && lyrics?.currentLine ? String(lyrics.currentLine).trim() : null;

  const useMinimalBrowserLip = browserActive && !activeAutomation;

  const dynamicIdleWidth = useMinimalBrowserLip
    ? 106
    : currentLyric
      ? Math.min(440, Math.max(170, Math.round(currentLyric.length * 6.5 + 52)))
      : 112;

  const dynamicIdleHeight = useMinimalBrowserLip
    ? 9
    : currentLyric
      ? 24
      : 22;

  const compactWidth = media.active ? 320 : stashItems.length ? 250 : 220;
  const peekWidth = Math.min(
    460,
    210
      + (activeClock ? 68 : 0)
      + (musicPlaying ? 115 : 0)
      + (activeAutomation ? 140 : 0),
  );

  const expandedBox = automation.formPreview ? EXPANDED_PREVIEW : EXPANDED;

  const targetBox = (() => {
    switch (mode) {
      case 'expanded':
        return expandedBox;
      case 'auto-toast':
        return {
          width: 400,
          height: 54,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderBottomLeftRadius: 22,
          borderBottomRightRadius: 22,
          y: 0,
        };
      case 'bt-toast':
        return {
          width: 360,
          height: 50,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderBottomLeftRadius: 22,
          borderBottomRightRadius: 22,
          y: 0,
        };
      case 'compact':
        return {
          width: compactWidth,
          height: 32,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderBottomLeftRadius: 16,
          borderBottomRightRadius: 16,
          y: 0,
        };
      case 'peek':
        return {
          width: peekWidth,
          height: 30,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderBottomLeftRadius: 16,
          borderBottomRightRadius: 16,
          y: 0,
        };
      case 'hidden':
      default:
        return {
          width: dynamicIdleWidth,
          height: dynamicIdleHeight,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderBottomLeftRadius: useMinimalBrowserLip ? 7 : 13,
          borderBottomRightRadius: useMinimalBrowserLip ? 7 : 13,
          y: 0,
        };
    }
  })();

  const hideToLip = useCallback((force = false) => {
    if (!force && (pinnedRef.current || jarvisBusyRef.current || hasPreviewRef.current)) return;
    clearTimeout(hoverTimer.current);
    clearTimeout(leaveTimer.current);
    clearTimeout(peekTimer.current);
    setMode(!force && activeClockRef.current && !browserActiveRef.current ? 'peek' : 'hidden');
    if (force) {
      setPinned(false);
      pinnedRef.current = false;
    }
    inputFocused.current = false;
    document.activeElement?.blur?.();
  }, []);

  // Fast, responsive 90ms collapse when cursor leaves the island
  const scheduleHide = useCallback(() => {
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => {
      if (
        !pinnedRef.current
        && !jarvisBusyRef.current
        && !hasPreviewRef.current
        && dragDepth.current === 0
        && !hovered.current
      ) {
        hideToLip();
      }
    }, 90);
  }, [hideToLip]);

  // --- Periodic 30-second status peek (paused when Browser/Google is open) ---
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
      if (
        browserActiveRef.current
        || hovered.current
        || pinnedRef.current
        || jarvisBusyRef.current
        || hasPreviewRef.current
        || inputFocused.current
        || dragDepth.current > 0
      ) return;
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
    setFocusToken((t) => t + 1);
  }), [expand, hideToLip]);

  useEffect(() => api.onEdgeHover(() => {
    hovered.current = true;
    clearTimeout(leaveTimer.current);
    if (modeRef.current !== 'expanded') {
      expand();
    }
  }), [expand]);

  useEffect(() => api.onCursorOutside(() => {
    hovered.current = false;
    clearTimeout(hoverTimer.current);
    if (!pinnedRef.current && !jarvisBusyRef.current && !hasPreviewRef.current && dragDepth.current === 0) {
      inputFocused.current = false;
      document.activeElement?.blur?.();
      scheduleHide();
    }
  }), [scheduleHide]);

  useEffect(() => api.onBlur(() => {
    if (!pinnedRef.current && !jarvisBusyRef.current && !hasPreviewRef.current && !internalDrag.current && dragDepth.current === 0 && !hovered.current) {
      hideToLip();
    }
  }), [hideToLip]);

  useEffect(() => api.stash.onDragEnd(() => { internalDrag.current = false; }), []);
  useEffect(() => { inputFocused.current = false; }, [tab]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && hideToLip(true);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hideToLip]);

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
    if (!pinnedRef.current && !jarvisBusyRef.current && !hasPreviewRef.current && dragDepth.current === 0) {
      inputFocused.current = false;
      document.activeElement?.blur?.();
      scheduleHide();
    }
  };

  const onClick = () => {
    if (mode !== 'expanded') {
      clearTimeout(hoverTimer.current);
      expand();
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
      if (modeRef.current !== 'expanded') {
        expand(tab === 'media' || tab === 'clock' || tab === 'gemini' ? 'home' : undefined);
      }
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
    if (internalDrag.current) return;

    const droppedFiles = Array.from(e.dataTransfer?.files || []);
    if (tab === 'stash') {
      stashActions.add(droppedFiles);
    } else {
      setTab('home');
      api.shortcuts.add(droppedFiles);
    }
  };

  const startDragOut = (name) => {
    internalDrag.current = true;
    api.stash.startDrag(name);
  };

  const accentRgb = useAdaptiveAccent({
    media,
    jarvisStatus: jarvis.status,
    automationStatus: automation.status,
    formPreview: automation.formPreview,
  });

  const isExpanded = mode === 'expanded';
  const isAutoToast = mode === 'auto-toast';
  const isBtToast = mode === 'bt-toast';
  const isCompact = mode === 'compact';
  const isPeek = mode === 'peek';
  const isHidden = mode === 'hidden';

  const earSize = isExpanded ? 14 : (isHidden && useMinimalBrowserLip ? 5 : 10);

  return (
    <div
      className="flex h-full w-full justify-center"
      style={{ '--island-accent-rgb': accentRgb }}
    >
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
        className={`island-glass-surface relative overflow-visible text-white transform-gpu ${isExpanded ? 'cursor-default' : 'cursor-pointer'}`}
        style={{
          willChange: 'width, height, transform',
          backfaceVisibility: 'hidden',
          boxShadow: isExpanded
            ? `0 18px 44px -10px rgba(0,0,0,.82), 0 4px 24px -6px rgba(${accentRgb}, 0.25)`
            : isHidden && useMinimalBrowserLip
              ? '0 1px 4px rgba(0,0,0,0.45)'
              : `0 8px 22px -4px rgba(0,0,0,.72), 0 2px 14px -3px rgba(${accentRgb}, 0.28)`,
        }}
      >
        {/* Concave Top-Edge Shoulder Fillets ("Notch Ears") */}
        <CyberNotchEars size={earSize} color="#030306" />

        {/* Inner clipped content container */}
        <div
          className="relative h-full w-full overflow-hidden"
          style={{
            borderBottomLeftRadius: targetBox.borderBottomLeftRadius,
            borderBottomRightRadius: targetBox.borderBottomRightRadius,
          }}
        >
          {/* Subtle Nusa x Cyberpunk Bottom Horizon Glow */}
          {!(isHidden && useMinimalBrowserLip) && (
            <div
              className={`nusa-bottom-glow pointer-events-none absolute inset-x-4 bottom-0 transition-all duration-300 ${
                isExpanded ? 'h-[2px] opacity-55' : 'h-[3.5px] opacity-85'
              }`}
            />
          )}

          {/* Pre-mounted ExpandedView */}
          <motion.div
            initial={false}
            animate={
              isExpanded
                ? { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }
                : { opacity: 0, scale: 0.94, y: -6, filter: 'blur(4px)' }
            }
            transition={
              isExpanded
                ? { duration: 0.2, delay: 0.01, ease: [0.22, 1, 0.36, 1] }
                : { duration: 0.12, ease: [0.4, 0, 1, 1] }
            }
            className="absolute top-0 transform-gpu"
            style={{
              left: '50%',
              marginLeft: -expandedBox.width / 2,
              width: expandedBox.width,
              height: expandedBox.height,
              pointerEvents: isExpanded ? 'auto' : 'none',
              willChange: 'transform, opacity, filter',
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
              automation={automation}
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
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 transform-gpu"
            style={{ pointerEvents: isCompact ? 'auto' : 'none', willChange: 'transform, opacity' }}
          >
            <CompactView
              media={media}
              clock={clock}
              sysinfo={sysinfo}
              stashCount={stashItems.length}
              automationStatus={automation.status}
              jarvisStatus={jarvis.status}
            />
          </motion.div>

          {/* Automation Toast */}
          <motion.div
            initial={false}
            animate={{ opacity: isAutoToast ? 1 : 0, scale: isAutoToast ? 1 : 0.92 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 transform-gpu"
            style={{ pointerEvents: isAutoToast ? 'auto' : 'none', willChange: 'transform, opacity' }}
          >
            <AutomationToastView toast={automation.toast} onDismiss={automation.dismissToast} />
          </motion.div>

          {/* Bluetooth Connected Toast layer */}
          <motion.div
            initial={false}
            animate={{ opacity: isBtToast ? 1 : 0, scale: isBtToast ? 1 : 0.92 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 transform-gpu"
            style={{ pointerEvents: 'none', willChange: 'transform, opacity' }}
          >
            <BluetoothToastView device={btAlert} />
          </motion.div>

          {/* Status Peek view layer */}
          <motion.div
            initial={false}
            animate={{ opacity: isPeek ? 1 : 0, scale: isPeek ? 1 : 0.92 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 transform-gpu"
            style={{ pointerEvents: 'none', willChange: 'transform, opacity' }}
          >
            <PeekView
              sysinfo={sysinfo}
              clock={clock}
              media={media}
              automationStatus={automation.status}
              jarvisStatus={jarvis.status}
            />
          </motion.div>

          {/* Hidden Lip / Mascot / Dynamic Lyrics Notch layer */}
          <motion.div
            initial={false}
            animate={{ opacity: isHidden ? 1 : 0 }}
            transition={{ duration: 0.12 }}
            className="absolute inset-0"
            style={{ pointerEvents: 'none' }}
          >
            <HiddenLipView
              mediaPlaying={musicPlaying}
              timerRunning={activeClock}
              jarvisStatus={jarvis.status}
              currentLyric={currentLyric}
              minimalLip={useMinimalBrowserLip}
            />
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
