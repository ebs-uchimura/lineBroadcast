/**
 * index.ts
 **
 * function：LINE RICHMESSAGE配信用 アプリ
**/

// モジュール
import { BrowserWindow, app, ipcMain, dialog, Tray, Menu, nativeImage } from 'electron'; // electron
import * as path from 'path'; // path
import * as https from 'https'; // https
import * as fs from 'fs'; // fs
import { parse } from 'csv-parse/sync'; // CSV parser
import iconv from 'iconv-lite'; // text converter
import sqlite3 from 'sqlite3'; // sqlite3
import * as dotenv from 'dotenv'; // dotenv
import ImageSize from 'image-size'; // image-size
import { formatToTimeZone } from 'date-fns-timezone'; // timezone
import { exec } from "child_process"; // shell command
import SSHClient from './class/sshd.js'; // ssh
import SFTPClient from './class/sftp.js'; // sftp

// モジュール設定
dotenv.config();

// 定数
const CSV_ENCODING: string = 'Shift_JIS'; // エンコーディング
const CHOOSE_FILE: string = '読み込むCSVを選択してください。'; // ファイルダイアログ
const DUMMYTOKEN: string = process.env.DUMMY_ACCESS_TOKEN!; // LINEアクセストークン
const EBISUDOTOKEN: string = process.env.EBISUDO_ACCESS_TOKEN!; // LINEアクセストークン
const SUIJINTOKEN: string = process.env.SUIJIN_ACCESS_TOKEN!; // LINEアクセストークン

// DB設定
const db: sqlite3.Database = new sqlite3.Database(path.join(__dirname, '../db/broadcast.db'));

/*
 メイン
*/
// ウィンドウ定義
let mainWindow: Electron.BrowserWindow;

// レコード型
interface recordType {
  record: string[][];
  filename: string;
}

// ウィンドウ作成
const createWindow = (): void => {
  try {
    // ウィンドウ
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 1000,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
      },
    });
    // index.htmlロード
    mainWindow.loadFile(path.join(__dirname, '../src/index.html'));

    // 準備完了
    mainWindow.once('ready-to-show', () => {
      // 開発モード
      mainWindow?.webContents.openDevTools();
    });

    // ウィンドウが閉じたら後片付けする
    mainWindow.on('closed', () => {
      mainWindow.destroy();
    });

  } catch(e: unknown) {
    // エラー
    console.log(e);
  }
};

// 処理開始
app.on('ready', () => {
  createWindow();
  // タスクアイコン
  const img = nativeImage.createFromPath(__dirname + "/assets/tray.png");
  // トレイ
  let tray = new Tray(img);
  // トレイセット
  tray.setToolTip('Tray app');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Quit', role: 'quit' },
  ]));
});

// ウィンドウクローズ
app.on('window-all-closed', () => {
  // apple以外
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 起動時
app.on('activate', () => {
  // 起動ウィンドウなし
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

/*
 IPC
*/
/* ページ表示 */
ipcMain.on('page', async(event, arg) => {
  try {
    console.log('showpage mode');
    // 遷移先
    let url: string;
    /*
    // 配信フラグ
    let broadcastFlg: boolean = false;
    // プランフラグ
    let planFlg: boolean = false;
    // チャンネルフラグ
    let channelFlg: boolean = false;
    // ジャンルフラグ
    let genreFlg: boolean = false;
    // ユーザフラグ
    let userFlg: boolean = false;
    */
    // プランマスタフラグ
    let planMasterFlg: boolean = false;
    // チャネルマスタフラグ
    let channelMasterFlg: boolean = false;
    // ジャンルマスタフラグ
    let genreMasterFlg: boolean = false;
    // 配信タイプフラグ
    let typeMethodMasterFlg: boolean = false;
    
    // ◇ 配信・プラン登録
    // urlセット
    switch (arg) {
      // 終了
      case 'exit_page':
        // apple以外
        if (process.platform !== 'darwin') {
          app.quit();
        }
        url = '';
        break;

      // 即時配信モード
      case 'immediate_page':
        // 遷移先
        url = '../src/immediate.html';
        console.log('immediate_page mode');
        break;
      
      // 予約配信モード
      case 'reserve_page':
        // 遷移先
        url = '../src/reserved.html';
        console.log('reserve_page mode');
        break;

      // プランモード
      case 'regist_plan_page':
        // 遷移先
        url = '../src/registplan.html';
        console.log('regist_plan_page mode');
        break;

      /*
      // ◇ 確認
      // 配信確認モード
      case 'view_broadcast_page':
        // 遷移先
        url = '../src/viewbroadcast.html';
        console.log('view_broadcast_page mode');
        break;

      // プラン確認モード
      case 'view_plan_page':
        // 遷移先
        url = '../src/viewplan.html';
        console.log('view_plan_page mode');
        break;

      // ユーザ確認モード
      case 'view_user_page':
        // 遷移先
        url = '../src/viewuser.html';
        console.log('view_user_page mode');
        break;

      // ジャンル確認モード
      case 'view_genre_page':
        // 遷移先
        url = '../src/viewgenre.html';
        console.log('view_genre_page mode');
        break;
        
      // チャンネル確認モード
      case 'view_channel_page':
        // 遷移先
        url = '../src/viewchannel.html';
        console.log('view_channel_page mode');
        break;

      // ◇ 編集
      // 配信編集モード
      case 'edit_broadcast_page':
        // 遷移先
        url = '../src/editbroadcast.html';
        console.log('edit_broadcast_page mode');
        break;

      // プラン編集モード
      case 'edit_plan_page':
        // 遷移先
        url = '../src/editplan.html';
        console.log('edit_plan_page mode');
        break;

      // ユーザ編集モード
      case 'edit_user_page':
        // 遷移先
        url = '../src/edituser.html';
        console.log('edit_user_page mode');
        break;

      // ジャンル編集モード
      case 'edit_genre_page':
        // 遷移先
        url = '../src/editgenre.html';
        console.log('edit_genre_page mode');
        break;

      // チャネル編集モード
      case 'edit_channel_page':
        // 遷移先
        url = '../src/editchannel.html';
        console.log('edit_channel_page mode');
        break;
      */

      default:
        // 遷移先
        url = '';
        console.log('out of scope.');
        break;
    }

    // ページ遷移
    await mainWindow.loadFile(path.join(__dirname, url));

    // urlセット
    switch (arg) {
      // 即時配信モード
      case 'immediate_page':
      // 予約配信モード
      case 'reserve_page':
        // プラン対象
        planMasterFlg = true;
        // チャンネル対象
        channelMasterFlg = true;
        break;

      // プラン登録モード
      case 'regist_plan_page':
        // ジャンル対象
        genreMasterFlg = true;
        // 配信方法対象
        typeMethodMasterFlg = true;
        break;

      // ◇ 確認
      // 配信確認モード
      /*
      case 'view_broadcast_page':
        // 配信対象
        broadcastFlg = true;
        break;

      // プラン確認モード
      case 'view_plan_page':
        // プラン対象
        planFlg = true;
        break;

      // ユーザ確認モード
      case 'view_user_page':
        // ユーザ対象
        userFlg = true;
        break;

      // ジャンル確認モード
      case 'view_genre_page':
        // ジャンル対象
        genreFlg = true;
        break;
        
      // チャンネル確認モード
      case 'view_channel_page':
        // チャンネル対象
        channelFlg = true;
        break;

      // ◇ 編集
      // 配信編集モード
      case 'edit_broadcast_page':
        // 配信対象
        broadcastFlg = true;
        break;

      // プラン編集モード
      case 'edit_plan_page':
        // プラン対象
        planFlg = true;
        break;

      // ユーザ編集モード
      case 'edit_user_page':
        // ユーザ対象
        userFlg = true;
        break;

      // ジャンル編集モード
      case 'edit_genre_page':
        // ジャンル対象
        genreFlg = true;
        break;

      // チャネル編集モード
      case 'edit_channel_page':
        // チャンネル対象
        channelFlg = true;
        break;
      */

      default:
        // 遷移先
        url = '';
        console.log('out of scope.');
        break;
    }

    /*
    // 配信
    if (broadcastFlg) {
      console.log('select from broadcast db');
      // 配信抽出
      const broadcastObj = await getSelectedArray('broadcast', true);
      // 配信一覧返し
      event.sender.send('broadcastlist', broadcastObj);
    }

    // プラン
    if (planFlg) {
      console.log('select from plan db');
      // 配信抽出
      const planObj = await getSelectedArray('plan', true);
      // プラン一覧返し
      event.sender.send('planlist', planObj);
    }
    
    // チャネル
    if (channelFlg) {
      console.log('select from channel db');
      // チャネル抽出
      const channelObj = await getSelectedArray('channel', true);
      // プラン一覧返し
      event.sender.send('channellist', channelObj);
    }

    // ジャンル
    if (genreFlg) {
      console.log('select from genre db')
      // ジャンル抽出
      const genreObj = await getSelectedArray('genre', true);
      // プラン一覧返し
      event.sender.send('genrelist', planObj);
    }

    // ユーザ
    if (userFlg) {
      console.log('select from user db');
      // ユーザ抽出
      const userObj = await getSelectedArray('user', true);
      // ユーザ一覧返し
      event.sender.send('userlist', userObj);
    }
    */

    // プランマスタ
    if (planMasterFlg) {
      console.log('select from plan db');
      // マスタ抽出
      db.all('SELECT * FROM plan WHERE usable = ?', [1], (_, rows) => {
        // マスタ一覧返し
        event.sender.send('planMasterllist', rows);
      });
    }

   // チャネルマスタ
    if (channelMasterFlg) {
      console.log('select from channel db');
      // チャネル抽出
      db.all('SELECT * FROM channel WHERE usable = ?', [1], (_, rows) => {
        // チャネル一覧返し
        event.sender.send('channelMasterllist', rows);
      });
    }

    // ジャンルマスタ
    if (genreMasterFlg) {
      console.log('select from genre db');
      // ジャンル抽出
      db.all('SELECT * FROM genre WHERE usable = ?', [1], (_, rows) => {
        // ジャンル一覧返し
        event.sender.send('genreMasterlist', rows);
      });
    }

    // 配信方法マスタ
    if (typeMethodMasterFlg) {
      console.log('select from linemethod db');
      // 配信方法抽出
      db.all('SELECT * FROM linemethod WHERE usable = ?', [1], (_, rows) => {
        // 配信方法一覧返し
        event.sender.send('lineMethodMasterlist', rows);
      });
    }

  } catch(e: unknown) {
    // エラー
    console.log(e);
  }
});

/* 処理 */
// プラン登録
ipcMain.on('planregister', async(event, arg) => {
  try {
    console.log('planregist mode');
    // 変更後画像縦横比
    let fixedImageRatio: number;
    // メイン画像ルート
    const baseHttpUri: string = 'https://ebisuan.sakura.ne.jp/assets/image/';
    // メイン画像ファイル名
    const mainFilename: string = `${baseHttpUri}${path.basename(arg.imageurl)}`;

    // 画像あり
    if (arg.imageurl != '') {
      // 画像アップロード
      await uploadFile(arg.imageurl);
      // サイズ計測
      const dimensions: any = ImageSize(arg.imageurl);
      // 画像比率
      const imageRatio: number = dimensions.width / dimensions.height;
      // 小数点以下1位
      fixedImageRatio = parseFloat(imageRatio.toFixed(1));

    } else {
      // 計算不要
      fixedImageRatio = 0;
    }

    // 現在時刻
    const nowFormattedTime: string = getNowTime();
    
    // DB登録
    db.serialize(() => {
      // 全データ登録
      db.run('INSERT INTO plan (planname, genre_id, imageurl, linemethod_id, title, text, imageratio, usable, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [arg.planname, arg.genre, mainFilename, Number(arg.type), arg.title, arg.text, fixedImageRatio, 1, nowFormattedTime, nowFormattedTime]);
    });

    // ジャンル一覧返し
    event.sender.send('plan_register_finish', '');

  } catch(e: unknown) {
    // エラー
    console.log(e);
  }
});

/*
// ジャンル登録
ipcMain.on('genreregister', async(event, arg) => {
  try {
    // 現在時刻
    const nowFormattedTime: string = getNowTime();
    
    // DB登録
    db.serialize(() => {
      // 全データ登録
      db.run('INSERT INTO genre (genrename, usable, created_at, updated_at) VALUES (?, ?, ?, ?)', [arg, 1, nowFormattedTime, nowFormattedTime]);
    });

    // ジャンル一覧返し
    event.sender.send('genre_register_finish', '');

  } catch(e: unknown) {
    // エラー
    console.log(e);
  }
});

// チャンネル登録
ipcMain.on('channelregister', async(event, arg) => {
  try {
    // 現在時刻
    const nowFormattedTime: string = getNowTime();
    
    // DB登録
    db.serialize(() => {
      // 全データ登録
      db.run('INSERT INTO channel (channelname, development, usable, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [arg, 0, 1, nowFormattedTime, nowFormattedTime]);
    });

    // ジャンル一覧返し
    event.sender.send('channel_register_finish', '');

  } catch(e: unknown) {
    // エラー
    console.log(e);
  }
});
*/

// 配信
ipcMain.on('broadcast', async(event, arg) => {
  try {
    console.log('broadcast mode');
    // 現在時刻
    const nowFormattedTime: string = getNowTime();
    // プランID
    const planId = Number(arg.plan);
    // 抽出
    db.all('SELECT * FROM plan WHERE id = ?', [planId], (_, rows: any) => {
      // トークン
      let token: string;
      // タイトル
      const title: string = rows[0].title;
      // 本文
      const content: string = rows[0].text;
      // 画像URL
      const imgurl: string = rows[0].imageurl;
      // LINE登録
      const lineMethod: string = String(rows[0].linemethod_id);
      // 画像比率
      const imageRatio: number = Number(rows[0].imageratio); // 小数点第１位

      // トークン設定
      switch (arg.channel) {
        // 恵比寿堂ダミー
        case '1':
          token = DUMMYTOKEN;
          break;

        // 恵比寿堂
        case '2':
          token = EBISUDOTOKEN;
          break;
        
        // 酔神くらぶ
        case '3':
          // 遷移先
          token = SUIJINTOKEN;
          break;
      }

      // チャネル一覧返し
      arg.users.forEach(async(usr: any) => {
        // メッセージ送信
        await makeMessage(usr, token, title, content, imgurl, lineMethod, imageRatio);
      });
    });

    // DB登録
    db.serialize(() => {
      // 配信準備
      const stmt: sqlite3.Statement = db.prepare("INSERT INTO broadcast (plan_id, channel_id, userid, sendtime, usable, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
      // 一斉登録
      arg.users.forEach((usr: any) => {
          stmt.run([arg.plan, arg.channel, usr, nowFormattedTime, 0, nowFormattedTime, nowFormattedTime]);
      });
      // 登録完了
      stmt.finalize();
    });

    // ジャンル一覧返し
    event.sender.send('broadcast_register_finish', '');

  } catch(e: unknown) {
    // エラー
    console.log(e);
  }
});

// 配信
ipcMain.on('reserve', async(event, arg) => {
  try {
    console.log('broadcast mode');
    // シェルコマンド実行
    await execAsync("node server/timer.js '*/5 * * * *'").catch(() => "");
    // ジャンル一覧返し
    event.sender.send('reserve_register_finish', '');   

  } catch(e: unknown) {
    // エラー
    console.log(e);
  }
});

// 画像選択
ipcMain.on('upload', async(event, arg) => {
  try {
    console.log('upload mode');
    // 画像ファイルパス取得
    const filepath: string = await getImageFile();

    // 画像ファイルパス返し
    event.sender.send(arg, filepath);

  } catch(e: unknown) {
    // エラー
    console.log(e);
  }
});

// CSV取得
ipcMain.on('csv', async(event, _) => {
  try {
    console.log('csv mode');
    // CSVデータ取得
    const result: recordType = await getCsvData();
    // エラーフラグ
    let errFlg: boolean;

    // ユーザID一覧返し
    Promise.all(
      result.record[0].map(async(rec: any) => {
        return new Promise((resolve, _) => {
          // ユーザIDが33桁でない
          if (rec.length != 33 && rec != "") {
            errFlg = true;
          }
          // フラグオン
          resolve(errFlg);
        });
      })

    ).then(() => {
      // エラーなし
      if (!errFlg) {
        // 配信ユーザ一覧返し
        event.sender.send('usersCsvlist', result);

      } else {
        // エラーメッセージ
        const errMsg: string = 'CSVデータの形式が不正です（33桁が正常)';
        // クライアントに送信
        event.sender.send('error', errMsg);
        // エラー発生
        throw new Error(errMsg);
      }
    });
        
  } catch(e: unknown) {
    // エラー
    console.log(e);
  }
});

// エラー表示
ipcMain.on('showmessage', async(_, arg) => {
  try {
    console.log('showmessage mode');
    // モード
    let tmpType: 'none' | 'info' | 'error' | 'question' | 'warning' | undefined;
    // タイトル
    let tmpTitle: string | undefined;

    // urlセット
    switch (arg.type) {
      // 通常モード
      case 'info':
        tmpType = 'info';
        tmpTitle = '情報';
        break;
      
      // エラーモード
      case 'error':
        tmpType = 'error';
        tmpTitle = 'エラー';
        break;

      // 警告モード
      case 'warning':
        tmpType = 'warning';
        tmpTitle = '警告';
        break;

      // それ以外
      default:
        tmpType = 'none';
        tmpTitle = '';
        console.log('out of scope.');
        break;
    }
    // オプション
    const options: Electron.MessageBoxOptions = {
      type: tmpType, // タイプ
      title: tmpTitle, // ヘッダ
      message: arg.title.toString(), // メッセージタイトル
      detail: arg.message  // 説明文
    };
    // ダイアログ表示
    dialog.showMessageBox(options);

  } catch(e: unknown) {
    // エラー
    console.log(e);
  }
});

/*
 汎用関数
*/
// WEBHOOK
const makeMessage = (uid: string, token: string, title?: string, contentText?: string, imgurl?: any, planno?: string, ratio?: number): Promise<void> => {
  return new Promise(async (resolve, reject) => {
    try {
      // ヘッダ
      const headers: any = {
        'Content-Type': 'application/json', // Content-type
        Authorization: 'Bearer ' + token, // 認証トークン
      };
      // 配信内容
      let dataString: string;

      // 配信内容により条件分岐
      switch (planno) {
        // テキスト
        case '1':
          console.log('1: text mode');
          // 配信内容
          dataString = JSON.stringify({
            to: uid, // 返信トークン
            messages: [
              {
                "type": "text",
                "text": "Hello, world"
            }
            ],
          });
          // 配信
          await makeBroadcaster(headers, dataString);
          resolve();
          break;
        
        // 画像
        case '2':
          console.log('2: image mode');
          // 配信内容
          dataString = JSON.stringify({
            to: uid, // 返信トークン
            messages: [
              {
                type: "flex",
                altText: "テスト",
                contents: {
                  type: "bubble",
                  size: "giga",
                  hero: {
                    type: "image",
                    url: imgurl,
                    size: "full",
                    aspectRatio: `${ratio}:13`,
                  }
                }
              }
            ],
          });
          // 配信
          await makeBroadcaster(headers, dataString);
          resolve();
          break;
        
        // 選択肢
        case '3':
          console.log('3: button mode');
          // 配信内容
          dataString = JSON.stringify({
            to: uid, // 返信トークン
            messages: [{
              type: 'template',
              altText: '前回の注文商品から選択してください。',
              template: {
                  type: 'buttons',
                  thumbnailImageUrl: imgurl,
                  imageSize: 'cover',
                  title: title,
                  text: contentText,
              },
            }],
          });
          // 配信
          await makeBroadcaster(headers, dataString);
          resolve();
          break;
        
        // カルーセル
        case '4':
          console.log('4: image_carousel mode');
          // 配信内容
          dataString = JSON.stringify({
            to: uid, // 返信トークン
            messages: [{
              type: "template",
              altText: title,
              template: {
                type: "image_carousel",
                columns: [
                  {
                    imageUrl: imgurl[0],
                    action: {
                      type: "postback",
                      label: "Buy",
                      data: "action=buy&itemid=111"
                    }
                  },
                  {
                    imageUrl: imgurl[1],
                    action: {
                      type: "message",
                      label: "Yes",
                      text: "yes"
                    }
                  },
                  {
                    imageUrl: imgurl[2],
                    action: {
                      type: "uri",
                      label: "View detail",
                      uri: "http://example.com/page/222"
                    }
                  }
                ]
              }
            }]
          });
          // 配信
          await makeBroadcaster(headers, dataString);
          resolve();
          break;

        default:
          console.log(`Sorry, we are out of ${planno}.`);
      }

    } catch(e: unknown) {
      // エラー
      console.log(e);
      reject(e);
    }
  });
}

// 画像ファイル選択
const getImageFile = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      // ファイル選択ダイアログ
      dialog.showOpenDialog({
        properties: ['openFile'], // ファイル
        title: CHOOSE_FILE, // ファイル選択
        defaultPath: '.', // ルートパス
        filters: [
          {name: 'jpg|png', extensions: ['jpg', 'jpeg', 'png']} // jpg|pngのみ
        ],

      }).then(async(result) => {
        // ファイルパス
        const filenames: string[] = result.filePaths;

        // ファイルあり
        if (filenames.length) {
          // 値返し
          resolve(filenames[0]);

        // ファイルなし
        } else {
          reject('no file');
        }

      }).catch((e: unknown) => {
        // エラー
        console.log(e);
      });

    } catch(e: unknown) {
      // エラー
      console.log(e);
      reject(e);
    }
  });
}

// CSV抽出
const getCsvData = (): Promise<recordType> => {
  return new Promise((resolve, reject) => {
    try {
      // ファイル選択ダイアログ
      dialog.showOpenDialog({
        properties: ['openFile'], // ファイル
        title: CHOOSE_FILE, // ファイル選択
        defaultPath: '.', // ルートパス
        filters: [
          {name: 'csv(Shif-JIS)', extensions: ['csv']} // csvのみ
        ],

      }).then(async(result) => {
        // ファイルパス
        const filenames: string[] = result.filePaths;

        // ファイルあり
        if (filenames.length) {
          // ファイル読み込み
          fs.readFile(filenames[0], async(_, data) => {
            // デコード
            const str: string = iconv.decode(data, CSV_ENCODING);
            // csvパース
            const tmpRecords: string[][] = parse(str, {
              columns: false, // カラム設定なし
              from_line: 2, // 開始行無視
              skip_empty_lines: true, // 空白セル無視
            });
            // 値返し
            resolve({
              record: tmpRecords,
              filename: filenames[0],
            });
          });

        // ファイルなし
        } else {
          reject(result.canceled);
        }

      }).catch((e: unknown) => {
        // エラー
        console.log(e);
      });

    } catch(e: unknown) {
      // エラー
      console.log(e);
      reject(String(e));
    }
  });
}

// LINE配信
const makeBroadcaster = (headers: Headers, dataString?: string): Promise<void> => {
  return new Promise(async(resolve, reject) => {
    try {
      // WEBHOOKオプション
      const webhookOptions: any = {
        hostname: 'api.line.me', // ホスト名
        path: '/v2/bot/message/push', // 送信パス
        method: 'POST', // 認証方式
        headers: headers, // ヘッダ
        body: dataString, // data
      };

      // リクエスト
      const request = https.request(webhookOptions, res => {
        res.on('data', _ => {
          resolve();
        });
      });

      // データ送信
      request.write(dataString);
      // コネクションクローズ
      request.end();

    } catch(e: unknown) {
      reject(e);
    }
  });
}

// SSH接続
const sshCommand = async(date: string): Promise<void> => {
  return new Promise(async(resolve, reject) => {
    try {
      // ホスト名
      const host: string = process.env.SSH_HOST ?? '';
      // ポート番号
      const port: number = Number(process.env.SSH_PORT) ?? 22;
      // ユーザ名
      const username: string = process.env.SSH_USERNAME ?? 'root';
      // 鍵パスワード
      const userpassword: string = process.env.SSH_KEYPASS ?? '';
      // SSHクライアント
      const client: any = new SSHClient();
      // SSH接続
      const connectResult: string = await client.connect({ host, port, username, userpassword });
      console.log(connectResult);
      // コマンド実行
      const commandResult:string = await client.doCommand('');
      console.log(commandResult);
      // 切断
      await client.disconnect();
      console.log('ssh closed');
      // 完了
      resolve();

    } catch (e: unknown) {
      // エラー
      console.error('ssh command failed:', e);
      reject();
    }
  });
}

// ファイルアップロード
const uploadFile = async(localpath: string): Promise<void> => {
  return new Promise(async(resolve, reject) => {
    try {
      // アップロード先ファイルパス
      const uploadPath = `/home/ebisuan/www/assets/image/${path.basename(localpath)}`;
      // SFTP用
      const sftpurl: string = process.env.SFTPTOGO_URL!;
      // URLパース
      const parsedURL: URL = new URL(sftpurl);
      // ポート番号
      const port: number = 22;
      // SFTP情報取得
      const { host, username, password } = parsedURL;
      // SFTPクライアント
      const client: any = new SFTPClient();
      // SFTP接続
      const connectResult: string = await client.connect({ host, port, username, password });
      console.log(connectResult);
      // 画像ファイルをアップロード
      const cuploadResult: string = await client.uploadFile(localpath, uploadPath);
      console.log(cuploadResult);
      // 切断
      await client.disconnect();
      console.log('sftp closed');
      // 完了
      resolve();

    } catch (e: unknown) {
      // エラー
      console.error('Uploading failed:', e);
      reject();
    }
  });
}

// 現在時刻返還関数
const getNowTime = (): string => {
  // フォーマット形式
  const FORMAT: string = 'YYYY-MM-DD HH:mm:ss';
  // 東京
  const TIME_ZONE_TOKYO: string = 'Asia/Tokyo';
  // 現在時刻
  const now: Date = new Date();
  // フォーマット済み現在時刻
  return formatToTimeZone(now, FORMAT, {timeZone: TIME_ZONE_TOKYO});
}

// 配信内容抽出
const getSelectedArray = (type: string, usableFlg: boolean): any => {
  return new Promise(async(resolve, reject) => {
    try {
      console.log(`select from ${type} db`);
      // クエリ
      let query: string;

      // 利用可能フラグあり
      if (usableFlg) {
        query = `SELECT * FROM ${type} WHERE usable = 1`;

      } else {
        query = `SELECT * FROM ${type}`;
      }

      // 配信抽出
      db.all(query, (_, rows) => {
        // 格納用配列
        let headerArray: any = [];
        let contentsArray: any = [];
        // 結果ループ
        rows.forEach((rw: any, index: number) => {
          // キー抽出
          if (index == 0) {
            headerArray = Object.keys(rw);
          }
          // 値抽出
          contentsArray.push(Object.values(rw));
        });
        // 受渡し用
        const targetObj: any = {
          key: headerArray, // ヘッダ
          content: contentsArray, // コンテンツ
        }
        // オブジェクト返し
        resolve(targetObj);
      });

    } catch (e: unknown) {
      // エラー
      console.error('Uploading failed:', e);
      reject(e);
    }
  });
}

// シェルコマンド実行
const execAsync = (command: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      if (stderr) reject(stderr);
      resolve(stdout);
    });
  });
};