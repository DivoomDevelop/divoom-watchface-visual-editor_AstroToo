export function animationFrameDurations(frames, fallbackMs = 100) {
  return (Array.isArray(frames) ? frames : []).map((frame) => {
    const durationMs = Number(frame?.duration) / 1000;
    return Number.isFinite(durationMs) && durationMs >= 10
      ? Math.min(durationMs, 60_000)
      : fallbackMs;
  });
}

export function animationFrameIndex(durations, elapsedMs) {
  if (!durations.length) return 0;
  const totalMs = durations.reduce((total, ms) => total + ms, 0);
  if (totalMs <= 0) return 0;
  let offset = Math.max(0, elapsedMs) % totalMs;
  for (let i = 0; i < durations.length; i += 1) {
    if (offset < durations[i]) return i;
    offset -= durations[i];
  }
  return durations.length - 1;
}
