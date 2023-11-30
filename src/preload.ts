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
        // ipcMainに送る
        send: (channel: string, data: any) => {
            try {
                ipcRenderer.send(channel, data);

            } catch (e) {     
                console.log(e);
            }    
        },
        // ipcMainから受け取り
        on: (channel: string, func: any) => {
            try {
                ipcRenderer.on(channel, (_, ...args) => func(...args));

            } catch (e) {    
                console.log(e);
            }    
        }
    }
);
