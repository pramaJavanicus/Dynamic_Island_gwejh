import { useEffect, useRef, useState } from 'react';

const api = window.island;

export function useMedia() {
  const [media, setMedia] = useState({ active: false });
  useEffect(() => {
    api.media.get().then(setMedia);
    return api.media.onUpdate(setMedia);
  }, []);
  return media;
}

export function useSysInfo() {
  const [info, setInfo] = useState({
    temp: null, cpu: null, bluetooth: [], volume: 50, muted: false, netDown: 0, netUp: 0,
  });
  useEffect(() => {
    api.sysinfo.get().then((d) => d && setInfo(d));
    return api.sysinfo.onUpdate(setInfo);
  }, []);
  return info;
}

export function useClipboard() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    api.clipboard.list().then((d) => d && setItems(d));
    return api.clipboard.onUpdate(setItems);
  }, []);
  const actions = {
    copy: async (text) => setItems(await api.clipboard.copy(text)),
    remove: async (id) => setItems(await api.clipboard.remove(id)),
    clear: async () => setItems(await api.clipboard.clear()),
  };
  return [items, actions];
}

export function useStash() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    api.stash.list().then(setItems);
    return api.stash.onChange(setItems);
  }, []);
  const actions = {
    add: async (files) => setItems(await api.stash.add(files)),
    remove: async (name) => setItems(await api.stash.remove(name)),
    clear: async () => setItems(await api.stash.clear()),
  };
  return [items, actions];
}

export function useConfig() {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    api.config.get().then(setConfig);
    return api.config.onChange(setConfig);
  }, []);
  return config;
}

export function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function useBattery() {
  const [battery, setBattery] = useState(null);
  useEffect(() => {
    let b;
    const update = () => setBattery({ level: Math.round(b.level * 100), charging: b.charging });
    navigator.getBattery?.().then((bat) => {
      b = bat;
      update();
      b.addEventListener('levelchange', update);
      b.addEventListener('chargingchange', update);
    });
    return () => {
      b?.removeEventListener('levelchange', update);
      b?.removeEventListener('chargingchange', update);
    };
  }, []);
  return battery;
}

/** Live playback position, interpolated from SMTC timeline data (180ms resolution for 1-by-1 synced lyrics). */
export function useMediaPosition(media) {
  const [pos, setPos] = useState(0);
  const anchorRef = useRef({ trackKey: '', basePos: 0, baseTime: Date.now(), lastRawPos: -1 });

  useEffect(() => {
    if (!media?.active) {
      anchorRef.current = { trackKey: '', basePos: 0, baseTime: Date.now(), lastRawPos: -1 };
      setPos(0);
      return undefined;
    }

    const trackKey = `${media.title || ''}|${media.artist || ''}`;
    const rawPos = Math.max(0, Number(media.position) || 0);
    const now = Date.now();
    const validLastUpdated = (
      media.lastUpdated
      && media.lastUpdated > 1700000000000
      && Math.abs(now - media.lastUpdated) < 600000
    )
      ? media.lastUpdated
      : now;

    if (anchorRef.current.trackKey !== trackKey) {
      anchorRef.current = {
        trackKey,
        basePos: rawPos,
        baseTime: validLastUpdated,
        lastRawPos: rawPos,
      };
    } else if (rawPos > 0 || anchorRef.current.lastRawPos <= 0) {
      anchorRef.current = {
        trackKey,
        basePos: rawPos,
        baseTime: validLastUpdated,
        lastRawPos: rawPos,
      };
    }

    const calc = () => {
      const a = anchorRef.current;
      let p = a.basePos;
      if (media.status === 'Playing') {
        p += Math.max(0, (Date.now() - a.baseTime) / 1000);
      }
      const dur = Number(media.duration) || 0;
      setPos(dur > 0 ? Math.min(Math.max(p, 0), dur) : Math.max(p, 0));
    };

    calc();
    const id = setInterval(calc, 180);
    return () => clearInterval(id);
  }, [media?.active, media?.title, media?.artist, media?.position, media?.lastUpdated, media?.status, media?.duration]);

  return pos;
}

/** Fetches synced LRC lyrics for the current Spotify track and computes the active line index 1-by-1. */
export function useLyrics(media, position = 0) {
  const [data, setData] = useState({ status: 'idle', synced: false, lines: [], duration: 0 });
  const isSpotifyTrack = !!(media?.active && media?.isSpotify);
  const title = isSpotifyTrack ? media.title : '';
  const artist = isSpotifyTrack ? media.artist : '';
  const duration = isSpotifyTrack ? media.duration : 0;

  useEffect(() => {
    let cancelled = false;
    if (!title) {
      setData({ status: 'idle', synced: false, lines: [], duration: 0 });
      return undefined;
    }
    setData((prev) => ({ ...prev, status: 'loading', lines: [] }));
    api.media.getLyrics({ title, artist, duration }).then((res) => {
      if (!cancelled && res) setData(res);
    }).catch(() => {
      if (!cancelled) setData({ status: 'error', synced: false, lines: [], duration: 0 });
    });
    return () => { cancelled = true; };
  }, [title, artist, duration]);

  const lines = data.lines || [];
  const effectiveDuration = (Number(duration) > 0 ? Number(duration) : Number(data.duration)) || 0;
  let activeIndex = -1;
  if (lines.length > 0) {
    if (data.synced) {
      const t = (position || 0) + 0.35;
      for (let i = 0; i < lines.length; i += 1) {
        if (lines[i].time <= t) activeIndex = i;
        else break;
      }
      if (activeIndex === -1) activeIndex = 0;
    } else {
      const totalDur = effectiveDuration > 0 ? effectiveDuration : Math.max(120, lines.length * 3.8);
      const ratio = Math.min(0.999, Math.max(0, (position || 0) / totalDur));
      activeIndex = Math.min(lines.length - 1, Math.floor(ratio * lines.length));
    }
  }

  return {
    ...data,
    lines,
    activeIndex,
    currentLine: activeIndex >= 0 ? lines[activeIndex]?.text : null,
  };
}

export const formatTime = (s) => {
  const t = Math.floor(s || 0);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export const formatNetSpeed = (bps) => {
  const v = Math.max(0, Number(bps) || 0);
  if (v >= 1024 * 1024) {
    return `${(v / (1024 * 1024)).toFixed(1)} MB/s`;
  }
  if (v >= 1024) {
    return `${Math.round(v / 1024)} KB/s`;
  }
  return '0 KB/s';
};
