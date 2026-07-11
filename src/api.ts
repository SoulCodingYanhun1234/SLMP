import { invoke } from "@tauri-apps/api/core";
import type {
  AlbumData,
  LyricData,
  PlayUrl,
  PlaylistData,
  QualityLevel,
  ResolvedMusic,
  SearchResult,
  SongDetail,
} from "./types";

export const musicApi = {
  search(keyword: string, limit = 20, offset = 0) {
    return invoke<SearchResult>("search_music", { keyword, limit, offset });
  },

  song(songId: number) {
    return invoke<SongDetail>("get_song", { songId });
  },

  playUrl(songId: number, level: QualityLevel) {
    return invoke<PlayUrl>("get_play_url", { songId, level });
  },

  lyric(songId: number) {
    return invoke<LyricData>("get_lyric", { songId });
  },

  playlist(playlistId: number) {
    return invoke<PlaylistData>("get_playlist", { playlistId });
  },

  album(albumId: number) {
    return invoke<AlbumData>("get_album", { albumId });
  },

  resolve(input: string, level: QualityLevel) {
    return invoke<ResolvedMusic>("resolve_music", { input, level });
  },
};
