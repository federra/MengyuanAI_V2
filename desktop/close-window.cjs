function attachCloseGuard(window, {dialog, log}) {
  window.on('close', () => { void log('Close requested.'); });
  window.webContents.on('will-prevent-unload', event => {
    void log('Page blocked unload: unsaved changes or active batch.');
    const choice = dialog.showMessageBoxSync(window, {
      type: 'question', title: '确认离开工作台',
      message: '有未保存的修改，或批量任务仍在处理。',
      detail: '继续离开可能丢失未保存的修改，并中断本机任务处理。已保存的项目与任务记录会保留。要保存修改，请先选择“返回工作台”。',
      buttons: ['返回工作台', '继续离开'], defaultId: 0, cancelId: 0, noLink: true,
    });
    void log(choice === 1 ? 'User confirmed unload.' : 'User cancelled unload; services remain running.');
    // In Electron, preventing this event accepts the unload that the renderer blocked.
    if (choice === 1) event.preventDefault();
  });
  window.on('closed', () => { void log('Main window closed.'); });
  window.webContents.on('unresponsive', () => { void log('Renderer unresponsive.'); });
  window.webContents.on('render-process-gone', (_event, details) => { void log(`Renderer exited: ${details.reason}.`); });
}
module.exports = {attachCloseGuard};
