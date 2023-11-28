/**
 * sftp.ts
 **
 * function：SFTPクラス
**/

// モジュール
import Client from 'ssh2-sftp-client'; // sfpt client

// SFTPクラス
export default class SFTPClient {

  // sftpクライアント
  static client: any; 

  // コンストラクタ
  constructor() {
    SFTPClient.client = new Client();
  }

  // sftp接続
  async connect(options: any): Promise<string> {
    console.log(`Connecting to ${options.host}:${options.port}`);
    return new Promise(async (resolve, reject) => {
      try {
        // 接続
        await SFTPClient.client.connect(
          {
            host: options.host, // ホスト
            port: options.port, // ポート
            username: options.username, // ユーザ名
            password: options.password, // パスワード
          })
          .then(async () => {
            resolve('connection success');
          })

      } catch (err: unknown) {
        reject(`Failed to connect: ${err}`); 
      }
    });
  }

  // 接続
  async uploadFile(localFile: string, remoteFile: string): Promise<string> {
    console.log(`Uploading ${localFile} to ${remoteFile} ...`);
    return new Promise(async (resolve, reject) => {
      try {
        await SFTPClient.client.put(localFile, remoteFile);
        resolve('Uploaded successfully');
        
      } catch (err: unknown) {
        reject(`Uploading failed: ${err}`);
      }
    });
  }

  // 切断
  async disconnect() {
    await SFTPClient.client.end();
  }
}
