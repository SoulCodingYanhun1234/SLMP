import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Dropdown,
  Field,
  FluentProvider,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  Radio,
  RadioGroup,
  Slider,
  Spinner,
  Switch,
  Text,
  Tooltip,
  webDarkTheme,
  webLightTheme,
} from "@fluentui/react-components";
import {
  Add24Regular,
  Album24Regular,
  AppsList24Regular,
  ArrowClockwise24Regular,
  ArrowRepeat124Regular,
  ArrowRepeatAll24Regular,
  ArrowShuffle24Regular,
  Checkmark24Regular,
  ChevronDown24Regular,
  ChevronLeft24Regular,
  DarkTheme24Regular,
  Delete24Regular,
  Dismiss24Regular,
  FullScreenMaximize24Regular,
  Heart24Filled,
  Heart24Regular,
  History24Regular,
  Home24Regular,
  Library24Regular,
  Lightbulb24Regular,
  Link24Regular,
  List24Regular,
  MoreHorizontal24Regular,
  MusicNote224Regular,
  Next24Filled,
  Pause24Filled,
  Play24Filled,
  Previous24Filled,
  ReOrder24Regular,
  Search24Regular,
  Settings24Regular,
  Speaker224Regular,
  SpeakerMute24Regular,
  Timer24Regular,
} from "@fluentui/react-icons";
import { musicApi } from "./api";
import { findActiveLyricIndex, parseLyrics } from "./lyrics";
import type {
  LyricData,
  QualityLevel,
  ResolvedMusic,
  TimedLyricLine,
  Track,
} from "./types";
import { Visualizer } from "./Visualizer";

type PanelMode = "lyrics" | "queue";
type PageMode = "library" | "room";
type PlayMode = "order" | "repeat-one" | "shuffle";
type VisualizerMode = "bars" | "wave";

const QUALITY_OPTIONS: Array<{ value: QualityLevel; label: string }> = [
  { value: "standard", label: "标准音质" },
  { value: "exhigh", label: "极高音质" },
  { value: "lossless", label: "无损音质" },
  { value: "hires", label: "Hi-Res" },
  { value: "jyeffect", label: "高清环绕声" },
  { value: "sky", label: "沉浸环绕声" },
  { value: "jymaster", label: "超清母带" },
];

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2];

const EMPTY_LYRIC: LyricData = {
  lrc: "",
  tlyric: "",
  romalrc: "",
  klyric: "",
};

const QUALITY_VALUES = QUALITY_OPTIONS.map((item) => item.value);
const PLAY_MODE_VALUES: PlayMode[] = ["order", "repeat-one", "shuffle"];
const VISUALIZER_MODE_VALUES: VisualizerMode[] = ["bars", "wave"];

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const remain = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}

function formatDuration(milliseconds?: number | null): string {
  if (!milliseconds) return "--:--";
  return formatClock(milliseconds / 1000);
}

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "发生未知错误";
}

function extractSongId(input: string): number | null {
  const direct = input.trim();
  if (/^\d+$/.test(direct)) return Number(direct);
  const match = direct.match(/(?:id=|\/song\/|song\?id=)(\d+)/i) ?? direct.match(/(\d{5,})/);
  return match ? Number(match[1]) : null;
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (storageError) {
    console.warn(`无法写入本地设置：${key}`, storageError);
  }
}

function readBooleanStorage(key: string, fallback: boolean): boolean {
  const value = readStorage<unknown>(key, fallback);
  return typeof value === "boolean" ? value : fallback;
}

function readNumberStorage(
  key: string,
  fallback: number,
  min: number,
  max: number,
  allowed?: readonly number[],
): number {
  const value = readStorage<unknown>(key, fallback);
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const clamped = Math.min(max, Math.max(min, value));
  if (allowed && !allowed.includes(clamped)) return fallback;
  return clamped;
}

function readEnumStorage<T extends string>(
  key: string,
  fallback: T,
  allowed: readonly T[],
): T {
  const value = readStorage<unknown>(key, fallback);
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function isTrack(value: unknown): value is Track {
  if (!value || typeof value !== "object") return false;
  const track = value as Partial<Track>;
  return (
    typeof track.id === "number" &&
    Number.isSafeInteger(track.id) &&
    track.id > 0 &&
    typeof track.name === "string" &&
    typeof track.artists === "string" &&
    typeof track.album === "string" &&
    typeof track.picUrl === "string" &&
    (track.duration === undefined ||
      track.duration === null ||
      (typeof track.duration === "number" && Number.isFinite(track.duration)))
  );
}

function readTrackListStorage(key: string): Track[] {
  const value = readStorage<unknown>(key, []);
  if (!Array.isArray(value)) return [];
  return uniqueTracks(value.filter(isTrack), 100);
}

function readStringListStorage(key: string, limit = 20): string[] {
  const value = readStorage<unknown>(key, []);
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function uniqueTracks(tracks: Track[], limit = 100): Track[] {
  const seen = new Set<number>();
  return tracks.filter((track) => {
    if (seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  }).slice(0, limit);
}

function playModeLabel(mode: PlayMode): string {
  if (mode === "repeat-one") return "单曲循环";
  if (mode === "shuffle") return "随机播放";
  return "顺序播放";
}

function playModeIcon(mode: PlayMode) {
  if (mode === "repeat-one") return <ArrowRepeat124Regular />;
  if (mode === "shuffle") return <ArrowShuffle24Regular />;
  return <ArrowRepeatAll24Regular />;
}

export default function App() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestSerialRef = useRef(0);
  const lyricLineRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const roomLyricLineRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const dragQueueIndexRef = useRef<number | null>(null);
  const volumeBeforeMuteRef = useRef(0.72);
  const fadeFrameRef = useRef<number | null>(null);
  const playNextRef = useRef<(direction: 1 | -1) => Promise<void>>(async () => undefined);
  const seekRef = useRef<(value: number) => void>(() => undefined);

  const [darkMode, setDarkMode] = useState(() => readBooleanStorage("fluent-music-dark", false));
  const [pageMode, setPageMode] = useState<PageMode>("library");
  const [searchText, setSearchText] = useState("");
  const [quality, setQuality] = useState<QualityLevel>(() =>
    readEnumStorage("fluent-music-quality", "standard" as QualityLevel, QUALITY_VALUES),
  );
  const [results, setResults] = useState<Track[]>([]);
  const [resultTotal, setResultTotal] = useState(0);
  const [resultTitle, setResultTitle] = useState("欢迎回来");
  const [resultSubtitle, setResultSubtitle] = useState("搜索音乐，或打开最近播放与收藏");
  const [activeSearchKeyword, setActiveSearchKeyword] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadingTrackId, setLoadingTrackId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [queue, setQueue] = useState<Track[]>(() => readTrackListStorage("fluent-music-queue"));
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [currentQuality, setCurrentQuality] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => readNumberStorage("fluent-music-volume", 0.72, 0, 1));
  const [playbackRate, setPlaybackRate] = useState(() => readNumberStorage("fluent-music-speed", 1, 0.75, 2, SPEED_OPTIONS));
  const [lyrics, setLyrics] = useState<TimedLyricLine[]>([]);
  const [panelMode, setPanelMode] = useState<PanelMode>("lyrics");
  const [playMode, setPlayMode] = useState<PlayMode>(() =>
    readEnumStorage("fluent-music-play-mode", "order" as PlayMode, PLAY_MODE_VALUES),
  );
  const [visualizerMode, setVisualizerMode] = useState<VisualizerMode>(() =>
    readEnumStorage("fluent-music-visualizer", "bars" as VisualizerMode, VISUALIZER_MODE_VALUES),
  );
  const [smoothTransition, setSmoothTransition] = useState(() =>
    readBooleanStorage("fluent-music-smooth", true),
  );
  const [stabilityMode, setStabilityMode] = useState(() =>
    readBooleanStorage("fluent-music-stability", true),
  );

  const [favoriteTracks, setFavoriteTracks] = useState<Track[]>(() =>
    readTrackListStorage("fluent-music-favorites"),
  );
  const [recentTracks, setRecentTracks] = useState<Track[]>(() =>
    readTrackListStorage("fluent-music-history"),
  );
  const [searchHistory, setSearchHistory] = useState<string[]>(() =>
    readStringListStorage("fluent-music-search-history", 8),
  );

  const [collectionOpen, setCollectionOpen] = useState(false);
  const [collectionKind, setCollectionKind] = useState<"playlist" | "album">("playlist");
  const [collectionId, setCollectionId] = useState("");
  const [collectionLoading, setCollectionLoading] = useState(false);

  const [directOpen, setDirectOpen] = useState(false);
  const [directInput, setDirectInput] = useState("");
  const [directLoading, setDirectLoading] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [sleepEndsAt, setSleepEndsAt] = useState<number | null>(null);
  const [sleepCountdown, setSleepCountdown] = useState(0);
  const [stopAfterCurrent, setStopAfterCurrent] = useState(false);

  const activeLyricIndex = useMemo(
    () => findActiveLyricIndex(lyrics, currentTime),
    [lyrics, currentTime],
  );

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const selectedQualityLabel =
    QUALITY_OPTIONS.find((item) => item.value === quality)?.label ?? "标准音质";
  const currentIsFavorite = currentTrack
    ? favoriteTracks.some((track) => track.id === currentTrack.id)
    : false;
  const canLoadMore = Boolean(activeSearchKeyword && results.length < resultTotal);
  const muted = volume <= 0.001;

  useEffect(() => writeStorage("fluent-music-dark", darkMode), [darkMode]);
  useEffect(() => writeStorage("fluent-music-quality", quality), [quality]);
  useEffect(() => writeStorage("fluent-music-volume", volume), [volume]);
  useEffect(() => writeStorage("fluent-music-speed", playbackRate), [playbackRate]);
  useEffect(() => writeStorage("fluent-music-play-mode", playMode), [playMode]);
  useEffect(() => writeStorage("fluent-music-visualizer", visualizerMode), [visualizerMode]);
  useEffect(() => writeStorage("fluent-music-smooth", smoothTransition), [smoothTransition]);
  useEffect(() => writeStorage("fluent-music-stability", stabilityMode), [stabilityMode]);
  useEffect(() => writeStorage("fluent-music-favorites", favoriteTracks), [favoriteTracks]);
  useEffect(() => writeStorage("fluent-music-history", recentTracks), [recentTracks]);
  useEffect(() => writeStorage("fluent-music-search-history", searchHistory), [searchHistory]);
  useEffect(() => writeStorage("fluent-music-queue", queue), [queue]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (fadeFrameRef.current === null) audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const behavior: ScrollBehavior = stabilityMode ? "auto" : "smooth";
    try {
      lyricLineRefs.current[activeLyricIndex]?.scrollIntoView({ behavior, block: "center" });
      roomLyricLineRefs.current[activeLyricIndex]?.scrollIntoView({ behavior, block: "center" });
    } catch {
      lyricLineRefs.current[activeLyricIndex]?.scrollIntoView();
      roomLyricLineRefs.current[activeLyricIndex]?.scrollIntoView();
    }
  }, [activeLyricIndex, stabilityMode]);

  useEffect(() => {
    if (!sleepEndsAt) {
      setSleepCountdown(0);
      return;
    }

    const update = () => {
      const remain = Math.max(0, sleepEndsAt - Date.now());
      setSleepCountdown(remain);
      if (remain <= 0) {
        audioRef.current?.pause();
        setSleepEndsAt(null);
      }
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [sleepEndsAt]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (event.code === "Space" && !isTyping) {
        event.preventDefault();
        void togglePlayback();
      }
      if (event.key.toLowerCase() === "f" && !isTyping && currentTrack) {
        event.preventDefault();
        setPageMode((mode) => (mode === "room" ? "library" : "room"));
      }
      if (event.key === "Escape" && pageMode === "room") setPageMode("library");
      if (event.key === "ArrowRight" && event.altKey) void playNext(1);
      if (event.key === "ArrowLeft" && event.altKey) void playNext(-1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    if (!currentTrack || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;

    try {
      if (typeof MediaMetadata !== "undefined") {
        session.metadata = new MediaMetadata({
          title: currentTrack.name,
          artist: currentTrack.artists,
          album: currentTrack.album,
          artwork: currentTrack.picUrl
            ? [
                { src: currentTrack.picUrl, sizes: "96x96" },
                { src: currentTrack.picUrl, sizes: "256x256" },
                { src: currentTrack.picUrl, sizes: "512x512" },
              ]
            : [],
        });
      }
    } catch (mediaError) {
      console.warn("当前 WebView 不支持媒体元数据", mediaError);
    }

    const setHandler = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null,
    ) => {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // WebView 可能只实现部分 Media Session action。
      }
    };

    setHandler("play", () => void audioRef.current?.play().catch(() => undefined));
    setHandler("pause", () => audioRef.current?.pause());
    setHandler("previoustrack", () => void playNextRef.current(-1));
    setHandler("nexttrack", () => void playNextRef.current(1));
    setHandler("seekto", (details) => {
      if (typeof details.seekTime === "number") seekRef.current(details.seekTime);
    });
    setHandler("seekbackward", (details) => {
      const audio = audioRef.current;
      if (audio) seekRef.current(Math.max(0, audio.currentTime - (details.seekOffset ?? 10)));
    });
    setHandler("seekforward", (details) => {
      const audio = audioRef.current;
      if (audio) {
        const end = Number.isFinite(audio.duration) ? audio.duration : audio.currentTime + 10;
        seekRef.current(Math.min(end, audio.currentTime + (details.seekOffset ?? 10)));
      }
    });

    return () => {
      (["play", "pause", "previoustrack", "nexttrack", "seekto", "seekbackward", "seekforward"] as MediaSessionAction[])
        .forEach((action) => setHandler(action, null));
    };
  }, [currentTrack]);

  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      !("mediaSession" in navigator) ||
      !navigator.mediaSession ||
      !Number.isFinite(duration) ||
      duration <= 0
    ) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate,
        position: Math.max(0, Math.min(currentTime, duration)),
      });
    } catch {
      // 部分 WebView 不支持 position state，忽略即可。
    }
  }, [currentTime, duration, playbackRate]);

  function animateVolume(target: number, milliseconds = 420) {
    const audio = audioRef.current;
    if (!audio) return;
    if (fadeFrameRef.current !== null) window.cancelAnimationFrame(fadeFrameRef.current);
    const start = performance.now();
    const from = audio.volume;
    const tick = (now: number) => {
      const ratio = Math.min(1, (now - start) / milliseconds);
      audio.volume = from + (target - from) * (1 - Math.pow(1 - ratio, 3));
      if (ratio < 1) fadeFrameRef.current = window.requestAnimationFrame(tick);
      else fadeFrameRef.current = null;
    };
    fadeFrameRef.current = window.requestAnimationFrame(tick);
  }

  function addRecent(track: Track) {
    setRecentTracks((previous) => uniqueTracks([track, ...previous], 60));
  }

  async function submitSearch(keywordOverride?: string) {
    const keyword = (keywordOverride ?? searchText).trim();
    if (!keyword) {
      setError("请输入搜索关键词");
      return;
    }

    setSearchText(keyword);
    setIsSearching(true);
    setError(null);
    try {
      const response = await musicApi.search(keyword, 30, 0);
      setResults(response.songs);
      setResultTotal(response.total);
      setResultTitle(`“${keyword}” 的搜索结果`);
      setResultSubtitle(`找到 ${response.total} 首歌曲，当前显示 ${response.songs.length} 首`);
      setActiveSearchKeyword(keyword);
      setSearchHistory((previous) => [keyword, ...previous.filter((item) => item !== keyword)].slice(0, 8));
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setIsSearching(false);
    }
  }

  async function loadMore() {
    if (!activeSearchKeyword || isLoadingMore) return;
    setIsLoadingMore(true);
    setError(null);
    try {
      const response = await musicApi.search(activeSearchKeyword, 30, results.length);
      setResults((previous) => uniqueTracks([...previous, ...response.songs], resultTotal || 500));
      setResultTotal(response.total || resultTotal);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function playTrack(track: Track, sourceQueue?: Track[], sourceIndex?: number) {
    const serial = ++requestSerialRef.current;
    setLoadingTrackId(track.id);
    setError(null);

    try {
      const [playInfo, lyricInfo, detail] = await Promise.all([
        musicApi.playUrl(track.id, quality),
        musicApi.lyric(track.id).catch(() => EMPTY_LYRIC),
        musicApi.song(track.id).catch(() => null),
      ]);
      if (!playInfo.url) throw new Error("接口没有返回可播放地址");
      if (serial !== requestSerialRef.current) return;

      const mergedTrack: Track = {
        ...track,
        name: detail?.name || track.name,
        artists: detail?.singer || track.artists,
        album: detail?.album || track.album,
        picUrl: detail?.picimg || track.picUrl,
      };

      setCurrentTrack(mergedTrack);
      setCurrentQuality(playInfo.level || quality);
      setLyrics(parseLyrics(lyricInfo.lrc, lyricInfo.tlyric));
      setCurrentTime(0);
      setDuration(track.duration ? track.duration / 1000 : 0);
      addRecent(mergedTrack);

      if (sourceQueue && typeof sourceIndex === "number") {
        setQueue(sourceQueue);
        setCurrentIndex(sourceIndex);
      } else {
        setQueue((previous) => {
          const existingIndex = previous.findIndex((item) => item.id === mergedTrack.id);
          if (existingIndex >= 0) {
            setCurrentIndex(existingIndex);
            return previous.map((item, index) => (index === existingIndex ? mergedTrack : item));
          }
          const next = [...previous, mergedTrack];
          setCurrentIndex(next.length - 1);
          return next;
        });
      }

      const audio = audioRef.current;
      if (!audio) return;
      audio.src = playInfo.url;
      audio.load();
      audio.playbackRate = playbackRate;
      audio.volume = smoothTransition ? 0 : volume;
      await audio.play();
      if (smoothTransition) animateVolume(volume);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      if (serial === requestSerialRef.current) setLoadingTrackId(null);
    }
  }

  async function playResolved(resolved: ResolvedMusic, input: string) {
    if (!resolved.url) throw new Error("综合接口没有返回播放地址");
    const id = extractSongId(input);
    if (!id) throw new Error("无法从输入内容中解析歌曲 ID");

    const track: Track = {
      id,
      name: resolved.name || `歌曲 ${id}`,
      artists: resolved.artist || "未知歌手",
      album: resolved.album || "未知专辑",
      picUrl: resolved.pic,
      duration: null,
    };

    setCurrentTrack(track);
    setCurrentQuality(resolved.level || quality);
    setLyrics(parseLyrics(resolved.lyric, resolved.tlyric));
    setCurrentTime(0);
    setDuration(0);
    addRecent(track);
    setQueue((previous) => {
      const existingIndex = previous.findIndex((item) => item.id === id);
      if (existingIndex >= 0) {
        setCurrentIndex(existingIndex);
        return previous;
      }
      const next = [...previous, track];
      setCurrentIndex(next.length - 1);
      return next;
    });

    const audio = audioRef.current;
    if (!audio) return;
    audio.src = resolved.url;
    audio.load();
    audio.playbackRate = playbackRate;
    audio.volume = smoothTransition ? 0 : volume;
    await audio.play();
    if (smoothTransition) animateVolume(volume);
  }

  async function openDirectMusic() {
    const input = directInput.trim();
    if (!input) {
      setError("请输入歌曲 ID 或网易云音乐链接");
      return;
    }

    setDirectLoading(true);
    setError(null);
    try {
      const resolved = await musicApi.resolve(input, quality);
      await playResolved(resolved, input);
      setDirectOpen(false);
      setDirectInput("");
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setDirectLoading(false);
    }
  }

  async function loadCollection() {
    const id = Number(collectionId.trim());
    if (!Number.isSafeInteger(id) || id <= 0) {
      setError("请输入有效的歌单或专辑 ID");
      return;
    }

    setCollectionLoading(true);
    setError(null);
    try {
      if (collectionKind === "playlist") {
        const playlist = await musicApi.playlist(id);
        setResults(playlist.tracks);
        setResultTotal(playlist.trackCount || playlist.tracks.length);
        setResultTitle(playlist.name || `歌单 ${id}`);
        setResultSubtitle(
          [playlist.creator && `创建者：${playlist.creator}`, playlist.description]
            .filter(Boolean)
            .join(" · ") || `共 ${playlist.tracks.length} 首歌曲`,
        );
      } else {
        const album = await musicApi.album(id);
        setResults(album.songs);
        setResultTotal(album.songs.length);
        setResultTitle(album.name || `专辑 ${id}`);
        setResultSubtitle(
          [album.artist && `歌手：${album.artist}`, album.description]
            .filter(Boolean)
            .join(" · ") || `共 ${album.songs.length} 首歌曲`,
        );
      }
      setActiveSearchKeyword(null);
      setCollectionOpen(false);
      setCollectionId("");
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setCollectionLoading(false);
    }
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    try {
      if (audio.paused) await audio.play();
      else audio.pause();
    } catch (playbackError) {
      setError(errorText(playbackError));
    }
  }

  async function playQueueIndex(index: number) {
    if (queue.length === 0) return;
    const normalized = (index + queue.length) % queue.length;
    await playTrack(queue[normalized], queue, normalized);
  }

  async function playNext(direction: 1 | -1) {
    if (queue.length === 0) return;
    if (playMode === "shuffle" && queue.length > 1) {
      let randomIndex = currentIndex;
      while (randomIndex === currentIndex) randomIndex = Math.floor(Math.random() * queue.length);
      await playQueueIndex(randomIndex);
      return;
    }
    await playQueueIndex(currentIndex + direction);
  }

  async function handleEnded() {
    if (stopAfterCurrent) {
      setStopAfterCurrent(false);
      return;
    }
    if (playMode === "repeat-one") {
      seek(0);
      await audioRef.current?.play();
      return;
    }
    await playNext(1);
  }

  function cyclePlayMode() {
    setPlayMode((mode) => (mode === "order" ? "repeat-one" : mode === "repeat-one" ? "shuffle" : "order"));
  }

  function toggleFavorite(track = currentTrack) {
    if (!track) return;
    setFavoriteTracks((previous) => {
      const exists = previous.some((item) => item.id === track.id);
      return exists ? previous.filter((item) => item.id !== track.id) : uniqueTracks([track, ...previous]);
    });
  }

  function showHome() {
    setResults(recentTracks);
    setResultTotal(recentTracks.length);
    setResultTitle("最近播放");
    setResultSubtitle(recentTracks.length ? `这里保留最近 ${recentTracks.length} 首歌曲` : "播放过的音乐会出现在这里");
    setActiveSearchKeyword(null);
  }

  function showFavorites() {
    setResults(favoriteTracks);
    setResultTotal(favoriteTracks.length);
    setResultTitle("我喜欢的音乐");
    setResultSubtitle(favoriteTracks.length ? `已收藏 ${favoriteTracks.length} 首歌曲` : "还没有收藏歌曲");
    setActiveSearchKeyword(null);
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(value)) return;
    audio.currentTime = value;
    setCurrentTime(value);
  }

  function toggleMute() {
    if (muted) setVolume(Math.max(0.1, volumeBeforeMuteRef.current));
    else {
      volumeBeforeMuteRef.current = volume;
      setVolume(0);
    }
  }

  playNextRef.current = playNext;
  seekRef.current = seek;

  function removeQueueItem(index: number) {
    setQueue((previous) => {
      const next = previous.filter((_, itemIndex) => itemIndex !== index);
      if (index < currentIndex) setCurrentIndex((value) => value - 1);
      else if (index === currentIndex) setCurrentIndex(currentTrack ? next.findIndex((item) => item.id === currentTrack.id) : -1);
      return next;
    });
  }

  function reorderQueue(from: number, to: number) {
    if (from === to) return;
    setQueue((previous) => {
      const next = [...previous];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      setCurrentIndex(currentTrack ? next.findIndex((item) => item.id === currentTrack.id) : -1);
      return next;
    });
  }

  function clearQueue() {
    setQueue(currentTrack ? [currentTrack] : []);
    setCurrentIndex(currentTrack ? 0 : -1);
  }

  function setSleepTimer(minutes: number | null) {
    setSleepEndsAt(minutes ? Date.now() + minutes * 60_000 : null);
    setStopAfterCurrent(false);
    setTimerOpen(false);
  }

  function setStopAtSongEnd() {
    setSleepEndsAt(null);
    setStopAfterCurrent(true);
    setTimerOpen(false);
  }

  function renderLyrics(room = false) {
    const refs = room ? roomLyricLineRefs : lyricLineRefs;
    if (!currentTrack) return <div className="lyrics-placeholder">播放歌曲后将在这里显示同步歌词</div>;
    if (lyrics.length === 0) return <div className="lyrics-placeholder">该歌曲暂无可解析的时间轴歌词</div>;
    return lyrics.map((line, index) => (
      <button
        type="button"
        key={`${room ? "room" : "panel"}-${line.time}-${index}`}
        ref={(node) => {
          refs.current[index] = node;
        }}
        className={`lyric-line ${room ? "room-line" : ""} ${index === activeLyricIndex ? "active" : ""}`}
        onClick={() => seek(line.time)}
      >
        <span>{line.text || "…"}</span>
        {line.translation && <small>{line.translation}</small>}
      </button>
    ));
  }

  function renderQueue(room = false) {
    if (queue.length === 0) return <div className="lyrics-placeholder">播放队列为空</div>;
    return queue.map((track, index) => (
      <div
        className={`queue-row ${room ? "room-queue-row" : ""} ${index === currentIndex ? "active" : ""}`}
        key={`${track.id}-${index}`}
        draggable
        onDragStart={() => {
          dragQueueIndexRef.current = index;
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={() => {
          if (dragQueueIndexRef.current !== null) reorderQueue(dragQueueIndexRef.current, index);
          dragQueueIndexRef.current = null;
        }}
      >
        <button type="button" className="queue-main" onClick={() => void playQueueIndex(index)}>
          <span className="queue-index">
            {index === currentIndex && isPlaying ? <Pause24Filled /> : String(index + 1).padStart(2, "0")}
          </span>
          <span className="queue-cover">
            {track.picUrl ? <img src={track.picUrl} alt="" /> : <MusicNote224Regular />}
          </span>
          <span className="queue-copy">
            <strong>{track.name}</strong>
            <small>{track.artists}</small>
          </span>
        </button>
        <span className="queue-grip" title="拖动排序"><ReOrder24Regular /></span>
        <Button
          size="small"
          appearance="transparent"
          icon={<Dismiss24Regular />}
          aria-label={`从队列移除 ${track.name}`}
          onClick={() => removeQueueItem(index)}
        />
      </div>
    ));
  }

  const sleepLabel = stopAfterCurrent
    ? "本曲结束"
    : sleepCountdown > 0
      ? `${Math.ceil(sleepCountdown / 60_000)} 分钟`
      : "定时关闭";

  return (
    <FluentProvider theme={darkMode ? webDarkTheme : webLightTheme} className="provider-root">
      <div className={`app-shell ${darkMode ? "dark" : "light"} ${pageMode === "room" ? "room-active" : ""} ${stabilityMode ? "stability-mode" : ""}`}>
        <div className="ambient-layer" aria-hidden="true">
          <div className="ambient-blob blob-one" />
          <div className="ambient-blob blob-two" />
          <div
            className="ambient-cover"
            style={currentTrack?.picUrl ? { backgroundImage: `url("${currentTrack.picUrl}")` } : undefined}
          />
          <div className="noise-layer" />
        </div>

        {pageMode === "library" ? (
          <>
            <aside className="navigation-rail">
              <div className="brand-mark" aria-label="Fluent Music">
                <div className="brand-icon"><MusicNote224Regular /></div>
                <span>Fluent Music</span>
              </div>

              <nav className="nav-actions" aria-label="主导航">
                <Button appearance="subtle" icon={<Home24Regular />} onClick={showHome}>最近播放</Button>
                <Button appearance="subtle" icon={<Search24Regular />} onClick={() => document.querySelector<HTMLInputElement>(".search-field input")?.focus()}>搜索</Button>
                <Button appearance="subtle" icon={<Heart24Regular />} onClick={showFavorites}>收藏</Button>
                <Button appearance="subtle" icon={<List24Regular />} onClick={() => setPanelMode("queue")}>播放队列</Button>
                <Button
                  appearance="subtle"
                  icon={<FullScreenMaximize24Regular />}
                  disabled={!currentTrack}
                  onClick={() => setPageMode("room")}
                >
                  独立播放室
                </Button>
              </nav>

              {searchHistory.length > 0 && (
                <div className="search-history-block">
                  <div className="nav-caption"><History24Regular /> 最近搜索</div>
                  <div className="history-chips">
                    {searchHistory.slice(0, 5).map((keyword) => (
                      <button type="button" key={keyword} onClick={() => void submitSearch(keyword)}>{keyword}</button>
                    ))}
                  </div>
                </div>
              )}

              <div className="nav-secondary">
                <Dialog open={collectionOpen} onOpenChange={(_, data) => setCollectionOpen(data.open)}>
                  <DialogTrigger disableButtonEnhancement>
                    <Button appearance="subtle" icon={<Library24Regular />}>载入歌单/专辑</Button>
                  </DialogTrigger>
                  <DialogSurface className="glass-dialog">
                    <DialogBody>
                      <DialogTitle>载入音乐集合</DialogTitle>
                      <DialogContent className="dialog-fields">
                        <Field label="类型">
                          <RadioGroup value={collectionKind} onChange={(_, data) => setCollectionKind(data.value as "playlist" | "album")} layout="horizontal">
                            <Radio value="playlist" label="歌单" />
                            <Radio value="album" label="专辑" />
                          </RadioGroup>
                        </Field>
                        <Field label={`${collectionKind === "playlist" ? "歌单" : "专辑"} ID`}>
                          <Input value={collectionId} onChange={(_, data) => setCollectionId(data.value)} placeholder="例如：12345678" />
                        </Field>
                      </DialogContent>
                      <DialogActions>
                        <DialogTrigger disableButtonEnhancement><Button appearance="secondary">取消</Button></DialogTrigger>
                        <Button appearance="primary" onClick={() => void loadCollection()} disabled={collectionLoading}>
                          {collectionLoading ? "载入中…" : "载入"}
                        </Button>
                      </DialogActions>
                    </DialogBody>
                  </DialogSurface>
                </Dialog>

                <Dialog open={directOpen} onOpenChange={(_, data) => setDirectOpen(data.open)}>
                  <DialogTrigger disableButtonEnhancement>
                    <Button appearance="subtle" icon={<Link24Regular />}>打开链接/ID</Button>
                  </DialogTrigger>
                  <DialogSurface className="glass-dialog">
                    <DialogBody>
                      <DialogTitle>直接打开歌曲</DialogTitle>
                      <DialogContent className="dialog-fields">
                        <Field label="歌曲 ID 或网易云音乐链接">
                          <Input value={directInput} onChange={(_, data) => setDirectInput(data.value)} placeholder="865632948 或 https://music.163.com/song?id=..." />
                        </Field>
                        <Text size={200} className="muted-text">将按当前音质获取详情、播放地址和歌词。</Text>
                      </DialogContent>
                      <DialogActions>
                        <DialogTrigger disableButtonEnhancement><Button appearance="secondary">取消</Button></DialogTrigger>
                        <Button appearance="primary" onClick={() => void openDirectMusic()} disabled={directLoading}>
                          {directLoading ? "解析中…" : "打开并播放"}
                        </Button>
                      </DialogActions>
                    </DialogBody>
                  </DialogSurface>
                </Dialog>

                <Button appearance="subtle" icon={<Settings24Regular />} onClick={() => setSettingsOpen(true)}>播放设置</Button>
              </div>

              <Tooltip content={darkMode ? "切换为浅色模式" : "切换为深色模式"} relationship="label">
                <Button className="theme-button" appearance="subtle" icon={darkMode ? <Lightbulb24Regular /> : <DarkTheme24Regular />} onClick={() => setDarkMode((value) => !value)}>
                  {darkMode ? "浅色模式" : "深色模式"}
                </Button>
              </Tooltip>
            </aside>

            <main className="main-area">
              <header className="top-bar glass-strip">
                <div className="search-field">
                  <Input
                    size="large"
                    value={searchText}
                    onChange={(_, data) => setSearchText(data.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void submitSearch();
                    }}
                    contentBefore={<Search24Regular />}
                    placeholder="搜索歌曲、歌手或专辑"
                    contentAfter={searchText ? <Button size="small" appearance="transparent" icon={<Dismiss24Regular />} aria-label="清空搜索" onClick={() => setSearchText("")} /> : undefined}
                  />
                  <Button size="large" appearance="primary" icon={<Search24Regular />} onClick={() => void submitSearch()} disabled={isSearching}>搜索</Button>
                </div>

                <div className="top-actions">
                  <Dropdown className="quality-dropdown" value={selectedQualityLabel} selectedOptions={[quality]} expandIcon={<ChevronDown24Regular />} onOptionSelect={(_, data) => setQuality(data.optionValue as QualityLevel)} aria-label="播放音质">
                    {QUALITY_OPTIONS.map((option) => <Option key={option.value} value={option.value}>{option.label}</Option>)}
                  </Dropdown>
                  <Tooltip content="独立播放室（快捷键 F）" relationship="label">
                    <Button appearance="subtle" icon={<FullScreenMaximize24Regular />} aria-label="打开独立播放室" disabled={!currentTrack} onClick={() => setPageMode("room")} />
                  </Tooltip>
                </div>
              </header>

              {error && (
                <MessageBar intent="error" className="error-bar">
                  <MessageBarBody><MessageBarTitle>操作未完成</MessageBarTitle>{error}</MessageBarBody>
                  <Button appearance="transparent" icon={<Dismiss24Regular />} aria-label="关闭错误提示" onClick={() => setError(null)} />
                </MessageBar>
              )}

              <div className="content-grid">
                <section className="results-pane glass-card" aria-label="音乐列表">
                  <div className="section-heading">
                    <div>
                      <div className="eyebrow">YOUR MUSIC SPACE</div>
                      <h1>{resultTitle}</h1>
                      <p>{resultSubtitle}</p>
                    </div>
                    <div className="heading-actions">
                      {resultTotal > 0 && <Badge appearance="tint">{resultTotal} 首</Badge>}
                      {results.length > 0 && (
                        <Button appearance="subtle" icon={<Play24Filled />} onClick={() => void playTrack(results[0], results, 0)}>播放全部</Button>
                      )}
                    </div>
                  </div>

                  <div className="results-list">
                    {isSearching ? (
                      <div className="empty-state"><Spinner size="large" label="正在搜索音乐…" /></div>
                    ) : results.length === 0 ? (
                      <div className="home-empty">
                        <div className="hero-glass">
                          <div className="hero-copy">
                            <div className="eyebrow">FLUENT GLASS PLAYER</div>
                            <h2>让音乐成为空间的一部分</h2>
                            <p>搜索歌曲、载入歌单，随后进入独立播放室体验动态封面、沉浸歌词与流动频谱。</p>
                            <div className="hero-buttons">
                              <Button appearance="primary" icon={<Search24Regular />} onClick={() => document.querySelector<HTMLInputElement>(".search-field input")?.focus()}>开始搜索</Button>
                              <Button appearance="secondary" icon={<Link24Regular />} onClick={() => setDirectOpen(true)}>打开歌曲链接</Button>
                            </div>
                          </div>
                          <div className="hero-orbit" aria-hidden="true">
                            <div className="orbit-ring ring-one" />
                            <div className="orbit-ring ring-two" />
                            <div className="orbit-core"><MusicNote224Regular /></div>
                            <Visualizer active mode={visualizerMode} compact stabilityMode={stabilityMode} />
                          </div>
                        </div>
                        <div className="quick-cards">
                          <button type="button" onClick={showHome}><History24Regular /><span><strong>最近播放</strong><small>{recentTracks.length} 首记录</small></span></button>
                          <button type="button" onClick={showFavorites}><Heart24Regular /><span><strong>我的收藏</strong><small>{favoriteTracks.length} 首音乐</small></span></button>
                          <button type="button" onClick={() => setCollectionOpen(true)}><Album24Regular /><span><strong>载入集合</strong><small>歌单与专辑</small></span></button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {results.map((track, index) => {
                          const active = currentTrack?.id === track.id;
                          const loading = loadingTrackId === track.id;
                          const favorite = favoriteTracks.some((item) => item.id === track.id);
                          return (
                            <div className={`track-row ${active ? "active" : ""}`} key={`${track.id}-${index}`}>
                              <button type="button" className="track-main" onDoubleClick={() => void playTrack(track, results, index)} onClick={() => void playTrack(track, results, index)}>
                                <span className="track-index">
                                  {loading ? <Spinner size="tiny" /> : active && isPlaying ? <span className="playing-bars" aria-label="正在播放"><i /><i /><i /></span> : String(index + 1).padStart(2, "0")}
                                </span>
                                <span className="cover-wrap">
                                  {track.picUrl ? <img src={track.picUrl} alt="" loading="lazy" /> : <MusicNote224Regular />}
                                  <span className="row-play-icon"><Play24Filled /></span>
                                </span>
                                <span className="track-primary"><strong>{track.name || "未知歌曲"}</strong><small>{track.artists || "未知歌手"}</small></span>
                                <span className="track-album">{track.album || "未知专辑"}</span>
                                <span className="track-duration">{formatDuration(track.duration)}</span>
                              </button>
                              <div className="row-actions">
                                <Tooltip content={favorite ? "取消收藏" : "收藏"} relationship="label">
                                  <Button size="small" appearance="transparent" icon={favorite ? <Heart24Filled /> : <Heart24Regular />} aria-label={favorite ? "取消收藏" : "收藏"} onClick={() => toggleFavorite(track)} />
                                </Tooltip>
                                <Tooltip content="加入播放队列" relationship="label">
                                  <Button size="small" appearance="transparent" icon={<Add24Regular />} aria-label="加入播放队列" onClick={() => setQueue((previous) => previous.some((item) => item.id === track.id) ? previous : [...previous, track])} />
                                </Tooltip>
                              </div>
                            </div>
                          );
                        })}
                        {canLoadMore && (
                          <div className="load-more-row">
                            <Button appearance="subtle" icon={<MoreHorizontal24Regular />} disabled={isLoadingMore} onClick={() => void loadMore()}>{isLoadingMore ? "加载中…" : "加载更多"}</Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </section>

                <aside className="detail-pane glass-card" aria-label="歌曲详情">
                  <div className="detail-toolbar">
                    <div className="detail-tabs">
                      <Button appearance={panelMode === "lyrics" ? "primary" : "subtle"} icon={<MusicNote224Regular />} onClick={() => setPanelMode("lyrics")}>歌词</Button>
                      <Button appearance={panelMode === "queue" ? "primary" : "subtle"} icon={<List24Regular />} onClick={() => setPanelMode("queue")}>队列 {queue.length ? `(${queue.length})` : ""}</Button>
                    </div>
                    {panelMode === "queue" && queue.length > 0 && <Button size="small" appearance="transparent" icon={<Delete24Regular />} aria-label="清空队列" onClick={clearQueue} />}
                  </div>

                  <div className="now-card glass-inset">
                    <div className={`large-cover ${isPlaying ? "rotating" : ""}`}>
                      {currentTrack?.picUrl ? <img src={currentTrack.picUrl} alt={`${currentTrack.name} 封面`} /> : <MusicNote224Regular />}
                      <span className="record-hole" />
                    </div>
                    <div className="now-card-copy">
                      <Text weight="semibold" size={500} truncate>{currentTrack?.name ?? "尚未播放"}</Text>
                      <Text className="muted-text" truncate>{currentTrack?.artists ?? "选择一首歌曲开始播放"}</Text>
                      <div className="status-badges">
                        {currentQuality && <Badge appearance="outline">{currentQuality}</Badge>}
                        {currentTrack && <Badge appearance="tint">{playbackRate}×</Badge>}
                      </div>
                    </div>
                    <Visualizer active={isPlaying} progress={progress} mode={visualizerMode} compact className="now-visualizer" stabilityMode={stabilityMode} />
                  </div>

                  {panelMode === "lyrics" ? <div className="lyrics-scroll">{renderLyrics()}</div> : <div className="queue-list">{renderQueue()}</div>}
                </aside>
              </div>
            </main>

            <footer className="player-bar glass-player">
              <div className="player-track-info">
                <button type="button" className="mini-cover" onClick={() => currentTrack && setPageMode("room")} aria-label="打开独立播放室">
                  {currentTrack?.picUrl ? <img src={currentTrack.picUrl} alt="" /> : <MusicNote224Regular />}
                  {currentTrack && <span className="mini-room-hint"><FullScreenMaximize24Regular /></span>}
                </button>
                <div className="player-title"><strong>{currentTrack?.name ?? "尚未播放"}</strong><small>{currentTrack?.artists ?? "Fluent Music"}</small></div>
                <Tooltip content={currentIsFavorite ? "取消收藏" : "收藏"} relationship="label">
                  <Button appearance="transparent" icon={currentIsFavorite ? <Heart24Filled /> : <Heart24Regular />} aria-label={currentIsFavorite ? "取消收藏" : "收藏"} onClick={() => toggleFavorite()} disabled={!currentTrack} />
                </Tooltip>
              </div>

              <div className="player-center">
                <div className="transport-controls">
                  <Tooltip content={playModeLabel(playMode)} relationship="label"><Button appearance="transparent" icon={playModeIcon(playMode)} aria-label={playModeLabel(playMode)} onClick={cyclePlayMode} /></Tooltip>
                  <Button appearance="transparent" icon={<Previous24Filled />} aria-label="上一首" onClick={() => void playNext(-1)} disabled={queue.length === 0} />
                  <Button className="primary-play-button" appearance="primary" shape="circular" size="large" icon={isPlaying ? <Pause24Filled /> : <Play24Filled />} aria-label={isPlaying ? "暂停" : "播放"} onClick={() => void togglePlayback()} disabled={!currentTrack} />
                  <Button appearance="transparent" icon={<Next24Filled />} aria-label="下一首" onClick={() => void playNext(1)} disabled={queue.length === 0} />
                  <Tooltip content={sleepLabel} relationship="label"><Button appearance="transparent" icon={<Timer24Regular />} aria-label={sleepLabel} onClick={() => setTimerOpen(true)} /></Tooltip>
                </div>
                <div className="progress-row"><span>{formatClock(currentTime)}</span><Slider min={0} max={Math.max(duration, 1)} step={0.1} value={Math.min(currentTime, Math.max(duration, 1))} onChange={(_, data) => seek(data.value)} aria-label="播放进度" disabled={!currentTrack} /><span>{formatClock(duration)}</span></div>
              </div>

              <div className="player-extras">
                <Button appearance="transparent" icon={muted ? <SpeakerMute24Regular /> : <Speaker224Regular />} aria-label={muted ? "取消静音" : "静音"} onClick={toggleMute} />
                <Slider min={0} max={1} step={0.01} value={volume} onChange={(_, data) => setVolume(data.value)} aria-label="音量" />
                <Dropdown className="speed-dropdown" value={`${playbackRate}×`} selectedOptions={[String(playbackRate)]} onOptionSelect={(_, data) => setPlaybackRate(Number(data.optionValue))} aria-label="播放速度">
                  {SPEED_OPTIONS.map((speed) => <Option key={speed} value={String(speed)} text={`${speed}×`}>{speed}×</Option>)}
                </Dropdown>
                <Tooltip content="按当前音质重新加载" relationship="label"><Button appearance="transparent" icon={<ArrowClockwise24Regular />} aria-label="按当前音质重新加载" onClick={() => currentTrack && void playTrack(currentTrack, queue, currentIndex)} disabled={!currentTrack || loadingTrackId !== null} /></Tooltip>
              </div>
            </footer>
          </>
        ) : (
          <section className="music-room" aria-label="独立音乐播放室">
            <div className="room-backdrop" style={currentTrack?.picUrl ? { backgroundImage: `url("${currentTrack.picUrl}")` } : undefined} />
            <header className="room-header">
              <Button appearance="subtle" icon={<ChevronLeft24Regular />} onClick={() => setPageMode("library")}>返回音乐库</Button>
              <div className="room-title"><span>NOW PLAYING</span><strong>独立音乐播放室</strong></div>
              <div className="room-header-actions">
                <Tooltip content={sleepLabel} relationship="label"><Button appearance="subtle" icon={<Timer24Regular />} aria-label={sleepLabel} onClick={() => setTimerOpen(true)}>{sleepCountdown > 0 || stopAfterCurrent ? sleepLabel : ""}</Button></Tooltip>
                <Button appearance="subtle" icon={darkMode ? <Lightbulb24Regular /> : <DarkTheme24Regular />} aria-label="切换主题" onClick={() => setDarkMode((value) => !value)} />
              </div>
            </header>

            <div className="room-layout">
              <div className="room-art-panel glass-room-card">
                <div className="room-art-stage">
                  <div className={`room-disc ${isPlaying ? "rotating" : ""}`}>
                    {currentTrack?.picUrl ? <img src={currentTrack.picUrl} alt="当前歌曲封面" /> : <MusicNote224Regular />}
                    <span className="room-disc-center" />
                  </div>
                  <div className="room-halo halo-a" />
                  <div className="room-halo halo-b" />
                </div>
                <div className="room-song-copy">
                  <div className="room-song-meta"><Badge appearance="tint">{currentQuality || selectedQualityLabel}</Badge><Badge appearance="outline">{playModeLabel(playMode)}</Badge></div>
                  <h1>{currentTrack?.name ?? "尚未播放"}</h1>
                  <p>{currentTrack?.artists ?? "Fluent Music"}</p>
                  <small>{currentTrack?.album ?? "选择一首歌曲开始播放"}</small>
                </div>
                <Visualizer active={isPlaying} progress={progress} mode={visualizerMode} className="room-visualizer" stabilityMode={stabilityMode} />
              </div>

              <div className="room-lyrics-panel glass-room-card">
                <div className="room-panel-title"><div><span>LYRICS</span><strong>同步歌词</strong></div><Badge appearance="tint">{activeLyricIndex >= 0 ? `${activeLyricIndex + 1} / ${lyrics.length}` : "--"}</Badge></div>
                <div className="room-lyrics-scroll">{renderLyrics(true)}</div>
              </div>

              <div className="room-queue-panel glass-room-card">
                <div className="room-panel-title"><div><span>UP NEXT</span><strong>接下来播放</strong></div><Button size="small" appearance="transparent" icon={<Delete24Regular />} aria-label="清空队列" onClick={clearQueue} disabled={queue.length === 0} /></div>
                <div className="room-queue-scroll">{renderQueue(true)}</div>
              </div>
            </div>

            <div className="room-control-dock glass-room-card">
              <div className="room-progress"><span>{formatClock(currentTime)}</span><Slider min={0} max={Math.max(duration, 1)} step={0.1} value={Math.min(currentTime, Math.max(duration, 1))} onChange={(_, data) => seek(data.value)} aria-label="播放进度" disabled={!currentTrack} /><span>{formatClock(duration)}</span></div>
              <div className="room-controls-row">
                <div className="room-controls-side left">
                  <Button appearance="transparent" icon={currentIsFavorite ? <Heart24Filled /> : <Heart24Regular />} aria-label="收藏" onClick={() => toggleFavorite()} disabled={!currentTrack} />
                  <Tooltip content={playModeLabel(playMode)} relationship="label"><Button appearance="transparent" icon={playModeIcon(playMode)} aria-label={playModeLabel(playMode)} onClick={cyclePlayMode} /></Tooltip>
                </div>
                <div className="room-main-controls">
                  <Button appearance="transparent" size="large" icon={<Previous24Filled />} aria-label="上一首" onClick={() => void playNext(-1)} disabled={queue.length === 0} />
                  <Button className="room-play-button" appearance="primary" shape="circular" size="large" icon={isPlaying ? <Pause24Filled /> : <Play24Filled />} aria-label={isPlaying ? "暂停" : "播放"} onClick={() => void togglePlayback()} disabled={!currentTrack} />
                  <Button appearance="transparent" size="large" icon={<Next24Filled />} aria-label="下一首" onClick={() => void playNext(1)} disabled={queue.length === 0} />
                </div>
                <div className="room-controls-side right">
                  <Button appearance="transparent" icon={muted ? <SpeakerMute24Regular /> : <Speaker224Regular />} aria-label="静音" onClick={toggleMute} />
                  <Slider min={0} max={1} step={0.01} value={volume} onChange={(_, data) => setVolume(data.value)} aria-label="音量" />
                </div>
              </div>
            </div>
          </section>
        )}

        <Dialog open={settingsOpen} onOpenChange={(_, data) => setSettingsOpen(data.open)}>
          <DialogSurface className="glass-dialog">
            <DialogBody>
              <DialogTitle>播放与动态效果</DialogTitle>
              <DialogContent className="settings-grid">
                <Field label="动态频谱样式">
                  <RadioGroup value={visualizerMode} onChange={(_, data) => setVisualizerMode(data.value as VisualizerMode)} layout="horizontal">
                    <Radio value="bars" label="律动柱状" />
                    <Radio value="wave" label="流动波形" />
                  </RadioGroup>
                </Field>
                <Switch checked={smoothTransition} onChange={(_, data) => setSmoothTransition(data.checked)} label="切歌时平滑淡入" />
                <Switch
                  checked={stabilityMode}
                  onChange={(_, data) => setStabilityMode(data.checked)}
                  label="稳定模式（降低模糊与动画开销，减少白屏）"
                />
                <Field label="播放速度">
                  <Dropdown value={`${playbackRate}×`} selectedOptions={[String(playbackRate)]} onOptionSelect={(_, data) => setPlaybackRate(Number(data.optionValue))}>
                    {SPEED_OPTIONS.map((speed) => <Option key={speed} value={String(speed)} text={`${speed}×`}>{speed}×</Option>)}
                  </Dropdown>
                </Field>
                <div className="shortcut-card"><AppsList24Regular /><div><strong>快捷键</strong><small>Space 播放/暂停 · F 播放室 · Alt + ←/→ 切歌 · Esc 返回</small></div></div>
              </DialogContent>
              <DialogActions><DialogTrigger disableButtonEnhancement><Button appearance="primary" icon={<Checkmark24Regular />}>完成</Button></DialogTrigger></DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>

        <Dialog open={timerOpen} onOpenChange={(_, data) => setTimerOpen(data.open)}>
          <DialogSurface className="glass-dialog timer-dialog">
            <DialogBody>
              <DialogTitle>定时关闭</DialogTitle>
              <DialogContent>
                <p className="timer-description">到达设定时间后自动暂停播放，适合睡前或专注场景。</p>
                <div className="timer-options">
                  {[15, 30, 45, 60, 90].map((minutes) => <Button key={minutes} appearance="secondary" onClick={() => setSleepTimer(minutes)}>{minutes} 分钟</Button>)}
                  <Button appearance="secondary" onClick={setStopAtSongEnd}>本曲结束后</Button>
                  <Button appearance="subtle" icon={<Dismiss24Regular />} onClick={() => setSleepTimer(null)}>关闭定时</Button>
                </div>
              </DialogContent>
            </DialogBody>
          </DialogSurface>
        </Dialog>

        <audio
          ref={audioRef}
          preload="metadata"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) => {
            const nextDuration = event.currentTarget.duration;
            if (Number.isFinite(nextDuration)) setDuration(nextDuration);
          }}
          onEnded={() => void handleEnded()}
          onError={() => setError("音频加载失败，播放链接可能已过期或当前网络不可访问")}
        />
      </div>
    </FluentProvider>
  );
}
