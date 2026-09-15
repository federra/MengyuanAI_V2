const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('directorDesktop', {
  admin: (action,input) => ipcRenderer.invoke('director:admin',action,input),
  auth: (action,input) => ipcRenderer.invoke('director:auth',action,input),
  onAuthState: callback => {const listener=(_event,state)=>callback(state);ipcRenderer.on('director:auth-state',listener);return ()=>ipcRenderer.removeListener('director:auth-state',listener);},
  updates: action => ipcRenderer.invoke('director:updates', action),
  onUpdateState: callback => {const listener=(_event,state)=>callback(state);ipcRenderer.on('director:update-state',listener);return ()=>ipcRenderer.removeListener('director:update-state',listener);},
  getVersion: () => ipcRenderer.invoke('director:version'),
  directories: (action,input) => ipcRenderer.invoke('director:directories',action,input),
  exportJianying: (input) => ipcRenderer.invoke('director:export-jianying',input),
  onOpenSettings: (callback) => {const listener=()=>callback();ipcRenderer.on('director:open-settings',listener);return ()=>ipcRenderer.removeListener('director:open-settings',listener);},
  doubao: (action, data) => ipcRenderer.invoke('director:doubao', action, data),
  revealVideo: (input) => ipcRenderer.invoke('director:reveal-video', {
    projectId: input.projectId, mediaId: input.mediaId, name: input.name,
  }),
  openDoubao: () => ipcRenderer.invoke('director:open-doubao'),
  openDoubaoExtension: () => ipcRenderer.invoke('director:open-doubao-extension'),
  revealImage: (input) => ipcRenderer.invoke('director:reveal-image', {
    projectId: input.projectId, mediaId: input.mediaId, name: input.name,
  }),
});
