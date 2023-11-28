/**
 * sshd.ts
 **
 * function：SSH接続クラス
**/

// モジュール
import * as path from 'path'; // path
import { NodeSSH } from 'node-ssh'; // ssh client
import * as dotenv from 'dotenv'; // dotenv
// モジュール設定
dotenv.config();

// SSHクラス
export default class SSHClient {

  // sshクライアント
  static client: any; 

  // コンストラクタ
  constructor() {
    SSHClient.client = new NodeSSH();
  }

  // 接続
  async connect(options: any): Promise<string> {
    console.log(`Connecting to ${options.host}:${options.port}`);
    return new Promise(async (resolve, reject) => {
      try {
        // ホームディレクトリ
        const userHomeDir: string = process.env[process.platform == "win32" ? "USERPROFILE" : "HOME"] ?? '';
        // 秘密鍵パス
        const privateKeyPath: string = path.join(userHomeDir, `.ssh\\${process.env.SSH_KEYNAME}`);
        // SSH接続
        await SSHClient.client.connect({
          host: options.host,
          port: options.port,
          username: options.username,
          privateKeyPath: privateKeyPath,
          passphrase: options.userpassword,
        })
        .then(async () => {
          resolve('connection success');
        });

      } catch (err: unknown) {
        reject(`Failed to connect: ${err}`); 
      }
    });
  }

  // コマンド実行
  async doCommand(): Promise<string> {
    console.log(`do command ...`);
    return new Promise(async (resolve, reject) => {
      try {
        // ホームディレクトリ
        const res = await SSHClient.client.execCommand('ls -al', {options: {pty: true}});
        resolve(res);

      } catch (err: unknown) {
        reject(`Uploading failed: ${err}`);
      }
    });
  }

  // 切断
  async disconnect() {
    await SSHClient.client.dispose();
  }
}
