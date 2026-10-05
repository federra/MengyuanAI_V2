import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Use independent modules so this test never overwrites another test's transpiled files.
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'director-dialogue-speakers-'));
try {
  for (const name of ['studio', 'dialogue', 'dialogue-timeline', 'assets']) {
    const source = await fs.readFile(`lib/${name}.ts`, 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText.replaceAll("'./studio'", "'./studio.mjs'")
      .replaceAll("'./dialogue'", "'./dialogue.mjs'")
      .replaceAll("'./dialogue-timeline'", "'./dialogue-timeline.mjs'");
    await fs.writeFile(path.join(directory, `${name}.mjs`), compiled);
  }
  const { dialogueLines, newLine } = await import(pathToFileURL(path.join(directory, 'dialogue.mjs')));
  const { newShot } = await import(pathToFileURL(path.join(directory, 'studio.mjs')));
  const { matchShotAssets } = await import(pathToFileURL(path.join(directory, 'assets.mjs')));
  const characters = [
    { id: 'role-master', kind: '人物', name: '师傅', description: '', attributes: { 别名: '老李、李师傅' } },
    { id: 'role-apprentice', kind: '人物', name: '徒弟', description: '', attributes: { 别名: '小周' } },
  ];
  const line = { ...newLine(), text: '师傅（低声）：先把速度降下来。', start: 0, end: 3 };
  const shot = { ...newShot(), character: '师傅、徒弟', dialogue: line.text, lines: [line] };
  assert.equal(dialogueLines(shot, ['师傅', '徒弟'])[0].speaker, '师傅', 'explicit prefix must restore a missing stored speaker');
  const recovered = dialogueLines(shot, characters)[0];
  assert.equal(recovered.speaker, '师傅');
  assert.equal(recovered.id, line.id);
  assert.equal(recovered.text, line.text, 'speaker recovery must preserve exact existing text');
  assert.equal(recovered.end, 3);
  assert.equal(line.speaker, '', 'reading must not mutate project data');
  const storedAlias = { ...shot, lines: [{ ...line, speaker: '老李' }] };
  assert.equal(dialogueLines(storedAlias, characters)[0].speaker, '师傅', 'an explicitly declared unique alias resolves to the project character');
  const storedId = { ...shot, lines: [{ ...line, speaker: 'role-master' }] };
  assert.equal(dialogueLines(storedId, characters)[0].speaker, '师傅', 'a known character asset ID resolves to its display name');
  const aliasText = { ...newShot(), dialogue: '小周：“不是更危险吗？”' };
  assert.equal(dialogueLines(aliasText, characters)[0].speaker, '徒弟');
  assert.equal(dialogueLines(aliasText, characters)[0].text, '不是更危险吗？');
  assert.deepEqual(matchShotAssets(aliasText, characters).references, ['role-apprentice'], 'the resolved speaker must also bind the matching character asset');
  const ambiguous = characters.map(character => ({ ...character, attributes: { 别名: '老板' } }));
  const unknown = { ...line, text: '老板：稍等一下。' };
  assert.equal(dialogueLines({ ...shot, dialogue: unknown.text, lines: [unknown] }, ambiguous)[0].speaker, '', 'a shared alias cannot choose a character');
  const unlabelled = { ...line, text: '先把速度降下来。' };
  assert.equal(dialogueLines({ ...shot, character: '师傅', dialogue: unlabelled.text, lines: [unlabelled] }, characters)[0].speaker, '', 'one visible character is not proof of who speaks');
  const narrator = { ...line, kind: '旁白', text: '很久以前……' };
  assert.equal(dialogueLines({ ...shot, dialogue: narrator.text, lines: [narrator] }, characters)[0].speaker, '');
  const explicit = { ...line, speaker: '徒弟' };
  assert.equal(dialogueLines({ ...shot, lines: [explicit] }, characters)[0].speaker, '徒弟', 'an explicit stored speaker takes precedence over text');
  const legacyMixed = { ...newShot(), character: '师傅、徒弟', dialogue: '师傅（小声）：慢一点。 徒弟（急切）：来不及了。' };
  assert.equal(dialogueLines(legacyMixed, characters)[0].speaker, '', 'a legacy line containing two speakers must not attribute everything to the first');
  assert.equal(dialogueLines(legacyMixed, characters)[0].text, legacyMixed.dialogue, 'an unresolved legacy mixed line must retain both explicit speaker labels');
  for (const [text, want] of [
    ['药片碰撞声，老王：维生素C，八毛一瓶。', '老王'],
    ['婴儿微弱啼哭，风铃声余韵。妈妈（声音发颤）：王老板，我生的是女儿……', '妈妈'],
    ['钞票散落声，小刘（小声）：哥…… 老王（咬牙）：退！', ''],
  ]) {
    const mixed = { ...newLine(), text, audio: { id: 'audio', name: 'speech.wav', type: 'audio/wav', url: '/audio' } };
    const rendered = dialogueLines({ ...newShot(), character: '老王、小刘、年轻妈妈', dialogue: text, lines: [mixed] }, ['老王', '小刘', '年轻妈妈'])[0];
    assert.equal(rendered.speaker, want, 'recover an explicit speaker after sound effects, without assigning a mixed two-person line');
    assert.equal(rendered.id, mixed.id);
    assert.equal(rendered.text, text);
    assert.equal(rendered.audio, mixed.audio);
  }
  console.log('PASS: missing speaker recovery, unique asset names/IDs/aliases, text and timing preservation, explicit speaker priority, ambiguous and unlabelled dialogue');
} finally {
  await fs.rm(directory, { recursive: true, force: true });
}
