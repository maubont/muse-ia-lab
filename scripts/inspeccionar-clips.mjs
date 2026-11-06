import ffmpeg from 'ffmpeg-static';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const clips = [
  'creativos-revisar/videos/cand/cineA-sensual1-wan-1.mp4',
  'creativos-revisar/videos/cand/cineB-sensual2-wan-1.mp4',
  'creativos-revisar/videos/cand/ABig-cine-wan-a.mp4',
  'creativos-revisar/videos/cand/ABchat-kling.mp4',
  'avatar/generados/kling-maria.mp4',
  'avatar/generados/generico-1.mp4',
  'next/landing/assets/muestra-glamour.mp4'
];

fs.mkdirSync('creativos-revisar/cand-samples', { recursive: true });

for (const clip of clips) {
  const name = clip.split('/').pop().replace('.mp4', '');
  const res = spawnSync(ffmpeg, ['-i', clip], { encoding: 'utf8' });
  const dur = res.stderr.match(/Duration: ([0-9:.]+)/)?.[1];
  const resMatch = res.stderr.match(/Video:.*?, ([0-9]+x[0-9]+)/)?.[1];
  console.log(name, dur, resMatch);
  
  spawnSync(ffmpeg, ['-y', '-ss', '00:00:01', '-i', clip, '-vframes', '1', `creativos-revisar/cand-samples/${name}.jpg`]);
}
