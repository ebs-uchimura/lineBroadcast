/**
 * preload.ts
 **
 * function：ipc受渡し用
**/

// モジュール
import { contextBridge, ipcRenderer } from 'electron'; // electron

// contextBridge
contextBridge.exposeInMainWorld(
    "api", {
        // send to ipcMain
        send: (channel: string, data: any) => { // send to ipcMain
            try {
                ipcRenderer.send(channel, data);

            } catch (e) {     
                console.log(e);
            }    
        },
        // recieve from ipcMain
        on: (channel: string, func: any) => { //from ipcMain
            try {
                ipcRenderer.on(channel, (_, ...args) => func(...args));

            } catch (e) {    
                console.log(e);
            }    
        }
    }
);
