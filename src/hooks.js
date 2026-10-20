import { useEffect, useState } from 'react';

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

/** Live playback position, interpolated from SMTC timeline data (250ms resolution for synced lyrics). */
export function useMediaPosition(media) {
  const [pos, setPos] = useState(0);
  useEffect(() => {
    const calc = () => {
      if (!media?.duration) return setPos(0);
      let p = media.position || 0;
      if (media.status === 'Playing' && media.lastUpdated) p += (Date.now() - media.lastUpdated) / 1000;
      setPos(Math.min(Math.max(p, 0), media.duration));
    };
    calc();
    const id = setInterval(calc, 250);
    return () => clearInterval(id);
  }, [media?.position, media?.lastUpdated, media?.status, media?.duration]);
  return pos;
}

/** Fetches synced LRC lyrics for the current track and computes the active line index. */
export function useLyrics(media, position = 0) {
  const [data, setData] = useState({ status: 'idle', synced: false, lines: [] });
  const title = media?.active ? media.title : '';
  const artist = media?.active ? media.artist : '';
  const duration = media?.active ? media.duration : 0;

  useEffect(() => {
    let cancelled = false;
    if (!title) {
      setData({ status: 'idle', synced: false, lines: [] });
      return undefined;
    }
    setData((prev) => ({ ...prev, status: 'loading', lines: [] }));
    api.media.getLyrics({ title, artist, duration }).then((res) => {
      if (!cancelled && res) setData(res);
    }).catch(() => {
      if (!cancelled) setData({ status: 'error', synced: false, lines: [] });
    });
    return () => { cancelled = true; };
  }, [title, artist, duration]);

  const lines = data.lines || [];
  let activeIndex = -1;
  if (lines.length > 0) {
    if (data.synced) {
      const t = (position || 0) + 0.25;
      for (let i = 0; i < lines.length; i += 1) {
        if (lines[i].time <= t) activeIndex = i;
        else break;
      }
      if (activeIndex === -1) activeIndex = 0;
    } else {
      const ratio = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
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
