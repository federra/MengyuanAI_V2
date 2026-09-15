module.exports=`(async()=>{
  const api=window.directorDesktop;
  const version=await api.getVersion();
  if(!document.querySelector('.brand')?.textContent.includes('v'+version))throw Error('Sidebar version missing');
  if(![...document.querySelectorAll('[data-sidebar="menu-button"]')].some(b=>b.textContent.trim()==='系统设置'))throw Error('Settings sidebar entry missing');
  if(typeof api?.directories!=='function'||typeof api?.exportJianying!=='function')throw Error('Missing native export/directory bridge');
  const settings=await api.directories('get');
  if(!settings.workspaceDir||!settings.jianyingDraftDir.endsWith('com.lveditor.draft'))throw Error('Missing default directories');
  const saved=await api.directories('save',{workspaceDir:settings.workspaceDir,jianyingDraftDir:settings.jianyingDraftDir});
  if(saved.workspaceDir!==settings.workspaceDir||saved.pendingWorkspaceDir)throw Error('Unchanged settings scheduled a migration');
  await new Promise(r=>setTimeout(r,300));
  const dialog=[...document.querySelectorAll('[role="dialog"]')].find(d=>d.textContent.includes('系统设置'));
  if(!dialog?.textContent.includes(settings.workspaceDir)||!dialog.textContent.includes(settings.jianyingDraftDir))throw Error('Directory dialog failed to render saved paths');
  return {version,sidebarVersion:true,sidebarSettings:true,bridge:true,dialog:true,defaultDraftDirectory:true,settingsPersistence:true};
})()`;
