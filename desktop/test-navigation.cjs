module.exports = `(async () => {
  const pause = () => new Promise(resolve => setTimeout(resolve, 150));
  async function sidebar(name) {
    const button = [...document.querySelectorAll('[data-sidebar="menu-button"]')].find(b => b.textContent.trim() === name);
    if (!button || button.disabled) throw Error('Sidebar unavailable: ' + name);
    button.click(); await pause();
  }
  const rows = () => document.querySelectorAll('.storyboard-row').length;
  const initialRows = rows();
  if (!initialRows) throw Error('Expected initial storyboard');
  const results = [];
  await sidebar('资产中心');
  if (!document.querySelector('.asset-hub')) throw Error('Asset center did not open');
  await sidebar('创作工作台');
  if (!document.querySelector('.shot-sheet-mode') || rows() !== initialRows) throw Error('Failed to restore storyboard from assets');
  results.push('assets → workbench restores storyboard and all rows');
  await sidebar('资产中心'); await sidebar('Skill 中心'); await sidebar('创作工作台');
  if (!document.querySelector('.shot-sheet-mode') || rows() !== initialRows) throw Error('Intermediate menu lost storyboard');
  results.push('assets → skill center → workbench restores storyboard');
  const story = [...document.querySelectorAll('nav.workflow button')].find(b => b.textContent.includes('故事'));
  story.click(); await pause();
  await sidebar('资产中心'); await sidebar('创作工作台');
  if (!document.querySelector('nav.workflow [aria-current="step"]')?.textContent.includes('故事')) throw Error('Lost prior story stage');
  results.push('story → assets → workbench restores story stage');
  return results;
})()`;
