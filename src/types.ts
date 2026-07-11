export type QualityLevel =
  | "standard"
  | "exhigh"
  | "lossless"
  | "hires"
  | "jyeffect"
  | "sky"
  | "jymaster";

export interface Track {
  id: number;
  name: string;
  artists: string;
  album: string;
  picUrl: string;
  duration?: number | null;
}

export interface SearchResult {
  songs: Track[];
  total: number;
}

export interface SongDetail {
  id: number;
  name: string;
  album: string;
  singer: string;
  picimg: string;
}

export interface PlayUrl {
  id: number;
  url: string | null;
  br: number;
  level: string;
  size: number;
  md5: string;
}

export interface LyricData {
  lrc: string;
  tlyric: string;
  romalrc: string;
  klyric: string;
}

export interface PlaylistData {
  id: number;
  name: string;
  coverImgUrl: string;
  creator: string;
  trackCount: number;
  description: string;
  tracks: Track[];
}

export interface AlbumData {
  id: number;
  name: string;
  coverImgUrl: string;
  artist: string;
  publishTime: number;
  description: string;
  songs: Track[];
}

export interface ResolvedMusic {
  name: string;
  artist: string;
  album: string;
  pic: string;
  url: string;
  size: string;
  level: string;
  lyric: string;
  tlyric: string;
}

export interface TimedLyricLine {
  time: number;
  text: string;
  translation?: string;
}
