import type { TimedLyricLine } from "./types";

const timestampPattern = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;

function parseRawLrc(raw: string): Array<{ time: number; text: string }> {
  const result: Array<{ time: number; text: string }> = [];

  for (const sourceLine of raw.split(/\r?\n/)) {
    const timestamps = [...sourceLine.matchAll(timestampPattern)];
    if (timestamps.length === 0) continue;

    const text = sourceLine.replace(timestampPattern, "").trim();
    for (const match of timestamps) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fractionText = match[3] ?? "0";
      const fraction = Number(fractionText.padEnd(3, "0").slice(0, 3)) / 1000;
      result.push({ time: minutes * 60 + seconds + fraction, text });
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

export function parseLyrics(lrc: string, translated: string): TimedLyricLine[] {
  const main = parseRawLrc(lrc);
  const translation = parseRawLrc(translated);

  return main.map((line) => {
    const translatedLine = translation.find(
      (candidate) => Math.abs(candidate.time - line.time) < 0.15,
    );
    return {
      ...line,
      translation: translatedLine?.text,
    };
  });
}

export function findActiveLyricIndex(lines: TimedLyricLine[], time: number): number {
  let low = 0;
  let high = lines.length - 1;
  let answer = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (lines[middle].time <= time + 0.08) {
      answer = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return answer;
}
