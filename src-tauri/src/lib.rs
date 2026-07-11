use reqwest::Client;
use serde::{de::DeserializeOwned, Deserialize, Deserializer, Serialize};
use serde_json::Value;
use std::time::Duration;
use tauri::State;
use url::Url;

const DEFAULT_API_BASE: &str = "https://api.bugpk.com/api/163_music";
const ALLOWED_LEVELS: &[&str] = &[
    "standard",
    "exhigh",
    "lossless",
    "hires",
    "jyeffect",
    "sky",
    "jymaster",
];

#[derive(Clone)]
struct AppState {
    client: Client,
    api_base: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchSong {
    #[serde(deserialize_with = "deserialize_u64")]
    pub id: u64,
    #[serde(default)]
    pub name: String,
    #[serde(
        default,
        alias = "singer",
        alias = "artist",
        alias = "ar_name",
        alias = "ar",
        deserialize_with = "deserialize_stringish"
    )]
    pub artists: String,
    #[serde(default, alias = "al_name", alias = "al", deserialize_with = "deserialize_stringish")]
    pub album: String,
    #[serde(
        default,
        rename = "picUrl",
        alias = "picimg",
        alias = "pic",
        alias = "coverImgUrl"
    )]
    pub pic_url: String,
    #[serde(default, deserialize_with = "deserialize_optional_u64")]
    pub duration: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    #[serde(default)]
    pub songs: Vec<SearchSong>,
    #[serde(default, deserialize_with = "deserialize_u64_default")]
    pub total: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SongDetail {
    #[serde(deserialize_with = "deserialize_u64")]
    pub id: u64,
    #[serde(default)]
    pub name: String,
    #[serde(default, alias = "al_name", alias = "al", deserialize_with = "deserialize_stringish")]
    pub album: String,
    #[serde(
        default,
        alias = "artists",
        alias = "ar_name",
        deserialize_with = "deserialize_stringish"
    )]
    pub singer: String,
    #[serde(
        default,
        alias = "picUrl",
        alias = "pic",
        alias = "coverImgUrl"
    )]
    pub picimg: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlayUrl {
    #[serde(deserialize_with = "deserialize_u64")]
    pub id: u64,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default, deserialize_with = "deserialize_u64_default")]
    pub br: u64,
    #[serde(default)]
    pub level: String,
    #[serde(default, deserialize_with = "deserialize_u64_default")]
    pub size: u64,
    #[serde(default)]
    pub md5: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct LyricData {
    #[serde(default)]
    pub lrc: String,
    #[serde(default)]
    pub tlyric: String,
    #[serde(default)]
    pub romalrc: String,
    #[serde(default)]
    pub klyric: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistData {
    #[serde(deserialize_with = "deserialize_u64")]
    pub id: u64,
    #[serde(default)]
    pub name: String,
    #[serde(default, rename = "coverImgUrl", alias = "picUrl", alias = "pic")]
    pub cover_img_url: String,
    #[serde(default, deserialize_with = "deserialize_stringish")]
    pub creator: String,
    #[serde(default, deserialize_with = "deserialize_u64_default")]
    pub track_count: u64,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tracks: Vec<SearchSong>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AlbumData {
    #[serde(deserialize_with = "deserialize_u64")]
    pub id: u64,
    #[serde(default)]
    pub name: String,
    #[serde(default, rename = "coverImgUrl", alias = "picUrl", alias = "pic")]
    pub cover_img_url: String,
    #[serde(default, deserialize_with = "deserialize_stringish")]
    pub artist: String,
    #[serde(default, deserialize_with = "deserialize_u64_default")]
    pub publish_time: u64,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub songs: Vec<SearchSong>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedMusic {
    #[serde(default)]
    pub name: String,
    #[serde(default, alias = "ar_name", alias = "singer", deserialize_with = "deserialize_stringish")]
    pub artist: String,
    #[serde(default, alias = "al_name")]
    pub album: String,
    #[serde(default, alias = "picUrl", alias = "picimg")]
    pub pic: String,
    #[serde(default)]
    pub url: String,
    #[serde(default, deserialize_with = "deserialize_stringish")]
    pub size: String,
    #[serde(default, deserialize_with = "deserialize_stringish")]
    pub level: String,
    #[serde(default)]
    pub lyric: String,
    #[serde(default)]
    pub tlyric: String,
}

impl AppState {
    async fn request<T>(&self, params: &[(&str, String)]) -> Result<T, String>
    where
        T: DeserializeOwned,
    {
        let response = self
            .client
            .get(&self.api_base)
            .query(params)
            .send()
            .await
            .map_err(|error| format!("网络请求失败：{error}"))?;

        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|error| format!("读取接口响应失败：{error}"))?;

        if !status.is_success() {
            return Err(format!("接口返回 HTTP {}：{}", status.as_u16(), body));
        }

        let root: Value = serde_json::from_str(&body)
            .map_err(|error| format!("接口未返回有效 JSON：{error}"))?;

        let code = root
            .get("code")
            .and_then(|value| value.as_i64())
            .unwrap_or(200);

        if code != 200 {
            let message = root
                .get("msg")
                .and_then(|value| value.as_str())
                .unwrap_or("接口请求失败");
            return Err(format!("{message}（code={code}）"));
        }

        let response_message = root
            .get("msg")
            .and_then(|value| value.as_str())
            .unwrap_or("接口未返回数据")
            .to_owned();
        let data = root.get("data").cloned().unwrap_or_else(|| root.clone());
        if data.is_null() {
            return Err(response_message);
        }

        serde_json::from_value(data).map_err(|error| format!("接口数据结构不匹配：{error}"))
    }
}

#[tauri::command]
async fn search_music(
    state: State<'_, AppState>,
    keyword: String,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<SearchResult, String> {
    let keyword = keyword.trim();
    if keyword.is_empty() {
        return Err("请输入搜索关键词".to_owned());
    }

    let limit = limit.unwrap_or(20).clamp(1, 50);
    let offset = offset.unwrap_or(0);
    let params = [
        ("type", "search".to_owned()),
        ("s", keyword.to_owned()),
        ("limit", limit.to_string()),
        ("offset", offset.to_string()),
    ];

    state.request(&params).await
}

#[tauri::command]
async fn get_song(state: State<'_, AppState>, song_id: u64) -> Result<SongDetail, String> {
    validate_song_id(song_id)?;
    let params = [
        ("type", "song".to_owned()),
        ("id", song_id.to_string()),
    ];
    state.request(&params).await
}

#[tauri::command]
async fn get_play_url(
    state: State<'_, AppState>,
    song_id: u64,
    level: Option<String>,
) -> Result<PlayUrl, String> {
    validate_song_id(song_id)?;
    let level = normalize_level(level)?;
    let params = [
        ("type", "url".to_owned()),
        ("id", song_id.to_string()),
        ("level", level),
    ];
    let mut urls: Vec<PlayUrl> = state.request(&params).await?;
    let item = urls
        .drain(..)
        .next()
        .ok_or_else(|| "接口没有返回播放地址".to_owned())?;

    if item.url.as_deref().unwrap_or_default().trim().is_empty() {
        return Err("当前歌曲在所选音质下没有可用播放链接".to_owned());
    }

    Ok(item)
}

#[tauri::command]
async fn get_lyric(state: State<'_, AppState>, song_id: u64) -> Result<LyricData, String> {
    validate_song_id(song_id)?;
    let params = [
        ("type", "lyric".to_owned()),
        ("id", song_id.to_string()),
    ];
    state.request(&params).await
}

#[tauri::command]
async fn get_playlist(
    state: State<'_, AppState>,
    playlist_id: u64,
) -> Result<PlaylistData, String> {
    validate_song_id(playlist_id)?;
    let params = [
        ("type", "playlist".to_owned()),
        ("id", playlist_id.to_string()),
    ];
    state.request(&params).await
}

#[tauri::command]
async fn get_album(state: State<'_, AppState>, album_id: u64) -> Result<AlbumData, String> {
    validate_song_id(album_id)?;
    let params = [
        ("type", "album".to_owned()),
        ("id", album_id.to_string()),
    ];
    state.request(&params).await
}

#[tauri::command]
async fn resolve_music(
    state: State<'_, AppState>,
    input: String,
    level: Option<String>,
) -> Result<ResolvedMusic, String> {
    let input = input.trim();
    if input.is_empty() {
        return Err("请输入歌曲 ID 或网易云音乐链接".to_owned());
    }

    let level = normalize_level(level)?;
    let mut params = vec![("type", "json".to_owned()), ("level", level)];

    if input.chars().all(|character| character.is_ascii_digit()) {
        params.push(("ids", input.to_owned()));
    } else {
        let parsed = Url::parse(input).map_err(|_| "请输入有效的歌曲 ID 或 URL".to_owned())?;
        if parsed.scheme() != "http" && parsed.scheme() != "https" {
            return Err("只支持 http/https 链接".to_owned());
        }
        params.push(("url", input.to_owned()));
    }

    state.request(&params).await
}

fn validate_song_id(id: u64) -> Result<(), String> {
    if id == 0 {
        Err("ID 必须大于 0".to_owned())
    } else {
        Ok(())
    }
}

fn normalize_level(level: Option<String>) -> Result<String, String> {
    let level = level.unwrap_or_else(|| "standard".to_owned());
    if ALLOWED_LEVELS.contains(&level.as_str()) {
        Ok(level)
    } else {
        Err(format!("不支持的音质等级：{level}"))
    }
}

fn deserialize_u64<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Value::deserialize(deserializer)?;
    value_to_u64(&value).ok_or_else(|| serde::de::Error::custom("无法转换为 u64"))
}

fn deserialize_u64_default<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Value::deserialize(deserializer)?;
    Ok(value_to_u64(&value).unwrap_or_default())
}

fn deserialize_optional_u64<'de, D>(deserializer: D) -> Result<Option<u64>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Value::deserialize(deserializer)?;
    Ok(value_to_u64(&value))
}

fn value_to_u64(value: &Value) -> Option<u64> {
    match value {
        Value::Number(number) => number.as_u64(),
        Value::String(text) => text.parse().ok(),
        _ => None,
    }
}

fn deserialize_stringish<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Value::deserialize(deserializer)?;
    Ok(value_to_string(&value))
}

fn value_to_string(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(text) => text.clone(),
        Value::Number(number) => number.to_string(),
        Value::Bool(boolean) => boolean.to_string(),
        Value::Array(items) => items
            .iter()
            .filter_map(|item| match item {
                Value::String(text) => Some(text.clone()),
                Value::Object(object) => object
                    .get("name")
                    .or_else(|| object.get("nickname"))
                    .and_then(Value::as_str)
                    .map(str::to_owned),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join(" / "),
        Value::Object(object) => object
            .get("name")
            .or_else(|| object.get("nickname"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let client = Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("FluentMusicPlayer/0.1")
        .build()
        .expect("failed to create HTTP client");

    let api_base = std::env::var("MUSIC_API_BASE").unwrap_or_else(|_| DEFAULT_API_BASE.to_owned());

    tauri::Builder::default()
        .manage(AppState { client, api_base })
        .invoke_handler(tauri::generate_handler![
            search_music,
            get_song,
            get_play_url,
            get_lyric,
            get_playlist,
            get_album,
            resolve_music
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
