import assert from 'node:assert/strict';
import {
  newProject,
  newShot,
  id,
  validateProject,
} from '../work/test/studio.mjs';
import { lastFrameTime, bindFrame } from '../work/test/frame-reference.mjs';
const p = newProject();
const videoId = id(),
  frameId = id();
p.shots = [
  {
    ...newShot(),
    video: {
      id: videoId,
      url: '/api/media/' + videoId,
      name: 'source.mp4',
      type: 'video/mp4',
    },
  },
  newShot(),
  newShot(),
];
const target = {
  projectId: p.id,
  sourceShotId: p.shots[0].id,
  sourceVideoId: videoId,
  targetShotId: p.shots[1].id,
  previousFrameId: '',
  time: 9.999,
};
const frame = {
  id: frameId,
  url: '/api/media/' + frameId,
  name: 'last.png',
  type: 'image/png',
};
const updated = bindFrame(p, target, frame);
assert.deepEqual(updated.shots[1].firstFrame, frame);
assert.equal(updated.shots[0].firstFrame, undefined);
assert.equal(updated.shots[2].firstFrame, undefined);
assert.equal(updated.shots[1].firstFrameSource.time, 9.999);
validateProject(JSON.parse(JSON.stringify(updated)));
assert.throws(() => bindFrame(updated, target, frame));
assert.throws(() =>
  bindFrame(
    { ...p, shots: [p.shots[0], p.shots[2], p.shots[1]] },
    target,
    frame,
  ),
);
assert.throws(() =>
  bindFrame(
    {
      ...p,
      shots: [
        { ...p.shots[0], video: { ...p.shots[0].video, id: id() } },
        ...p.shots.slice(1),
      ],
    },
    target,
    frame,
  ),
);
assert.throws(() => bindFrame({ ...p, id: id() }, target, frame));
assert.equal(lastFrameTime(10), 9.999);
assert.ok(lastFrameTime(0.0001) >= 0);
assert.throws(() => lastFrameTime(Infinity));
assert.throws(() => lastFrameTime(0));
assert.throws(() =>
  validateProject({
    ...updated,
    shots: [
      { ...updated.shots[1], firstFrame: { ...frame, type: 'video/mp4' } },
    ],
  }),
);
console.log(
  'PASS: adjacent-shot binding, first-frame persistence, overwrite/reorder/source-video guards, seek-end boundary, image type validation',
);
