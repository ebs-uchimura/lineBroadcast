/**
 * index.ts
 **
 * function：LINE配信用 アプリ
**/

// モジュール
import { BrowserWindow, app, ipcMain, dialog, Tray, Menu, nativeImage } from 'electron'; // electron
import * as path from 'path'; // path
import * as https from 'https'; // https
import * as fs from 'fs'; // fs
import * as cron from 'node-cron'; // cron
import iconv from 'iconv-lite'; // text converter
import sqlite3 from 'sqlite3'; // sqlite3
import * as dotenv from 'dotenv'; // dotenv
import ImageSize from 'image-size'; // image-size
import Client from 'ssh2-sftp-client'; // sfpt client
import { parse } from 'csv-parse/sync'; // CSV parser
import { formatToTimeZone } from 'date-fns-timezone'; // timezone

// 定数
const CSV_ENCODING: string = 'Shift_JIS'; // エンコーディング
const CHOOSE_FILE: string = '読み込むCSVを選択してください。'; // ファイルダイアログ

// モジュール設定
dotenv.config();

// DB設定
sqlite3.verbose();
const db: sqlite3.Database = new sqlite3.Database(':memory:');
/*
 メイン
*/
// ウィンドウ定義
let mainWindow: Electron.BrowserWindow;
// 起動確認フラグ
let isQuiting: boolean;

// レコード型
type recordType = {
  record: string[][]; // CSVデータ
  filename: string; // ファイル名
};

// 結果型
type resultType = {
  result: string; // CSVデータ
  userid: string; // ファイル名
};

// ウィンドウ作成
const createWindow = (): void => {
  try {
    // ウィンドウ
    mainWindow = new BrowserWindow({
      width: 1200, // 幅
      height: 1000, // 高さ
      webPreferences: {
        nodeIntegration: false, // Node.js利用不可
        contextIsolation: true, // コンテキスト分離
        preload: path.join(__dirname, 'preload.js'),
      },
    });

    // メニューバー非表示
    mainWindow.setMenuBarVisibility(false);
    // index.htmlロード
    mainWindow.loadFile(path.join(__dirname, '../src/index.html'));
    // 準備完了
    mainWindow.once('ready-to-show', () => {
      // 開発モード
      mainWindow.webContents.openDevTools();
    });

    // 最小化のときはトレイ常駐
    mainWindow.on('minimize', (event: any) => {
      // キャンセル
      event.preventDefault();
      // ウィンドウを隠す
      mainWindow.hide();
      event.returnValue = false;
    });

    // 閉じる
    mainWindow.on('close', (event: any) => {
      // 起動中
      if (!isQuiting) {
        // キャンセル
        event.preventDefault();
        // ウィンドウを隠す
        mainWindow.hide();
        event.returnValue = false;
      }
    });

    // ウィンドウが閉じたら後片付けする
    mainWindow.on('closed', () => {
      // mainWindow.destroy();
    });

  } catch(e: unknown) {
    // エラー
    console.log(e);
  }
};

// 処理開始
app.on('ready', () => {
  // ウィンドウを開く
  createWindow();
  // DBがなければ作成
  db.serialize(function () {
    // broadcast
    db.run(`create table if not exists broadcast (
      id int primary key,
      broadcastname text, 
      plan_id int, 
      channel_id int,
      sendtime text not null default CURRENT_TIMESTAMP,
      usable int default 0,
      created_at not null default CURRENT_TIMESTAMP,
      updated_at not null default CURRENT_TIMESTAMP);`
    );
    // targetuser
    db.run(`create table if not exists targetuser (
      id int primary key,
      broadcast_id int, 
      userid text,
      success int default 0,
      usable int default 0,
      created_at not null default CURRENT_TIMESTAMP,
      updated_at not null default CURRENT_TIMESTAMP);`
    );
    // plan
    db.run(`create table if not exists plan (
      id int primary key,
      planname text, 
      genre_id int,
      linemethod_id int,
      imageurl text,
      title text,
      text text,
      imageratio int default 1,
      usable int default 0,
      created_at not null default CURRENT_TIMESTAMP,
      updated_at not null default CURRENT_TIMESTAMP);`
    );
    // channel
    db.run(`create table if not exists channel (
      id int primary key,
      channelname text,
      token text,
      usable int default 0,
      created_at not null default CURRENT_TIMESTAMP,
      updated_at not null default CURRENT_TIMESTAMP);`
    );
    // genre
    db.run(`create table if not exists genre (
      id int primary key,
      genrename text,
      usable int default 0,
      created_at not null default CURRENT_TIMESTAMP,
      updated_at not null default CURRENT_TIMESTAMP);`
    );
    // linemethod
    db.run(`create table if not exists linemethod (
      id int primary key,
      linemethodname text,
      usable int default 0,
      created_at not null default CURRENT_TIMESTAMP,
      updated_at not null default CURRENT_TIMESTAMP);`
    );
  });
  // アイコン
  const icon = nativeImage.createFromPath(path.join(__dirname, '../assets/tray@2x.png'));
  // トレイ
  const mainTray = new Tray(icon);
  // コンテキストメニュー
  const contextMenu = Menu.buildFromTemplate([
    // 表示
    { label: '表示', click: () => {
        mainWindow.show();
    }},
    // 閉じる
    { label: '閉じる', click: () => {
        isQuiting = true;
        app.quit();
    }}
  ]);
  // コンテキストメニューセット
  mainTray.setContextMenu(contextMenu);
  // ダブルクリックで再表示
  mainTray.on("double-click", () => mainWindow.show());
});

// 起動時
app.on('activate', () => {
  // 起動ウィンドウなし
  if (BrowserWindow.getAllWindows().length === 0) {
    // 再起動
    createWindow();
  }
});

// 閉じるボタン
app.on('before-quit', _ => {
  isQuiting = true;
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
    // 配信編集フラグ
    let broadcastEditFlg: boolean = false;
    // プランマスタフラグ
    let planMasterFlg: boolean = false;
    // ジャンルマスタフラグ
    let genreMasterFlg: boolean = false;
    // チャネルマスタフラグ
    let channelMasterFlg: boolean = false;
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
          return false;
        }
        // 遷移先
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
      
      // ◇ 登録
      // プランモード
      case 'regist_plan_page':
        // 遷移先
        url = '../src/registplan.html';
        console.log('regist_plan_page mode');
        break;

        // ジャンルモード
      case 'regist_genre_page':
        // 遷移先
        url = '../src/registgenre.html';
        console.log('regist_genre_page mode');
        break;

      // チャネルモード
      case 'regist_channel_page':
        // 遷移先
        url = '../src/registchannel.html';
        console.log('regist_channel_page mode');
        break;

      // ◇ 編集
      // 配信編集モード
      case 'edit_broadcast_page':
        // 遷移先
        url = '../src/editbroadcast.html';
        console.log('edit_broadcast_page mode');
        break;

      default:
        // 遷移先
        url = '';
        console.log('out of scope.');
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
        // プラン対象
        planMasterFlg = true;
        // ジャンル対象
        genreMasterFlg = true;
        // 配信方法対象
        typeMethodMasterFlg = true;
        break;

      // ジャンル登録モード
      case 'genre_plan_page':
        // ジャンル対象
        genreMasterFlg = true;
        break;

      // チャンネル登録モード
      case 'channel_plan_page':
        // チャンネル対象
        channelMasterFlg = true;
        break;

      // 配信編集モード
      case 'edit_broadcast_page':
        // 配信方法対象
        broadcastEditFlg = true;
        // プラン対象
        planMasterFlg = true;
        // チャンネル対象
        channelMasterFlg = true;
        break;

      default:
        // 遷移先
        url = '';
        console.log('out of scope.');
    }

    // プランマスタ
    if (planMasterFlg) {
      console.log('select from plan db');
      // マスタ抽出
      db.all('SELECT * FROM plan WHERE usable = ?', [1], (_, rows1) => {
        // マスタ一覧返し
        event.sender.send('planMasterllist', rows1);
      });
    }

   // チャネルマスタ
    if (channelMasterFlg) {
      console.log('select from channel db');
      // チャネル抽出
      db.all('SELECT * FROM channel WHERE usable = ?', [1], (_, rows2) => {
        // チャネル一覧返し
        event.sender.send('channelMasterllist', rows2);
      });
    }

    // ジャンルマスタ
    if (genreMasterFlg) {
      console.log('select from genre db');
      // ジャンル抽出
      db.all('SELECT * FROM genre WHERE usable = ?', [1], (_, rows3) => {
        // ジャンル一覧返し
        event.sender.send('genreMasterlist', rows3);
      });
    }

    // 配信方法マスタ
    if (typeMethodMasterFlg) {
      console.log('select from linemethod db');
      // 配信方法抽出
      db.all('SELECT * FROM linemethod WHERE usable = ?', [1], (_, rows4) => {
        // 配信方法一覧返し
        event.sender.send('lineMethodMasterlist', rows4);
      });
    }

    // 配信編集
    if (broadcastEditFlg) {
      console.log('select from broadcast db');
      // 配信方法抽出
      db.all('SELECT * FROM broadcast WHERE usable = ?', [1], (_, rows5) => {
        // 配信方法一覧返し
        event.sender.send('broadcastMasterlist', rows5);
      });
    }

  } catch(e: unknown) {
    // エラー処理
    errOperate(e, event);
  }
});

/* 登録処理 */
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
      console.log(await uploadFile(arg.imageurl));
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
    
    // 抽出
    db.serialize(() => {
      // DB登録
      db.run('INSERT INTO plan (planname, genre_id, imageurl, linemethod_id, title, text, imageratio, usable, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [arg.planname, arg.genre, mainFilename, Number(arg.type), arg.title, arg.text, fixedImageRatio, 1, nowFormattedTime, nowFormattedTime]);
    });

    // ジャンル一覧返し
    event.sender.send('register_finish', '');

  } catch(e: unknown) {
    // エラー処理
    errOperate(e, event);
  }
});

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
    event.sender.send('register_finish', '');

  } catch(e: unknown) {
    // エラー
    console.log(e);
  }
});

// チャンネル登録
ipcMain.on('channelregist', async(event, arg) => {
  try {
    // 現在時刻
    const nowFormattedTime: string = getNowTime();
    
    // DB登録
    db.serialize(() => {
      // 全データ登録
      db.run('INSERT INTO channel (channelname, token, usable, created_at, updated_at) VALUES (?, ?, ?, ?)', [arg, 1, nowFormattedTime, nowFormattedTime]);
    });
    // ジャンル一覧返し
    event.sender.send('register_finish', '');

  } catch(e: unknown) {
    // エラー
    console.log(e);
  }
});

/* 配信処理 */
// 即時配信
ipcMain.on('broadcast', async(event, arg) => {
  try {
    console.log('broadcast mode');
    // 全データ登録
    const dbBdResult: string = await dbBroadcastReg(arg, false);

    // 成功
    if (dbBdResult == 'success') {
      // LINE配信
      const lineResult: resultType[] = await sendLineMessage(arg);
      // DB登録
      const dbUserResult: string = await dbTargetuserReg(lineResult);

      // 結果
      if (dbUserResult == 'success') {
        // 通知送付
        event.sender.send('register_finish', '');

      } else {
        // 通知送付
        event.sender.send('error', dbUserResult);
      }
      
    } else {
      // エラー返し
      event.sender.send('error', dbBdResult);
    }
    
  } catch(e: unknown) {
    // エラー処理
    errOperate(e, event);
  }
});

// 予約配信
ipcMain.on('reserve', async(event, arg) => {
  try {
    console.log('reserve mode');
    // 全データ登録
    const dbBdResult: string = await dbBroadcastReg(arg, false);

    // 成功
    if (dbBdResult == 'success') {
      // 日付用
      const dateArray: string[] = arg.date.split('-');
      // 時間用
      const timeArray: string[] = arg.time.split(':');
      // 月
      const month: string = isNaN(Number(dateArray[1])) ? '*' : String(Number(dateArray[1]));
      // 日
      const day: string = isNaN(Number(dateArray[2])) ? '*' : String(Number(dateArray[2]));
      // 時
      const hour: string = isNaN(Number(timeArray[0])) ? '*' : String(Number(timeArray[0]));
      // 分
      const minute: string = isNaN(Number(timeArray[1])) ? '*' : String(Number(timeArray[1]));

      // スケジュール予約
      cron.schedule(`${minute} ${hour} ${day} ${month} *`, async() => {
        // LINE配信
        const lineResult: resultType[] = await sendLineMessage(arg);
        // DB登録
        const dbUserResult: string = await dbTargetuserReg(lineResult);

        // 結果
        if (dbUserResult == 'success') {
          // 通知送付
          event.sender.send('register_finish', '');
          console.log(`running on ${month}/${day} ${hour}:${minute}`);

        } else {
          // 通知送付
          event.sender.send('error', dbUserResult);
        }
      });
      
    } else {
      // エラー返し
      event.sender.send('error', dbBdResult);
    }

  } catch(e: unknown) {
    // エラー処理
    errOperate(e, event);
  }
});

// 削除
ipcMain.on('delete', async(event, arg) => {
  try {
    console.log('delete mode');
    // オプション
    const options: Electron.MessageBoxSyncOptions = {
      type: 'warning', // タイプ
      message: '警告', // メッセージタイトル
      buttons: ['OK', 'Cancel'], // ボタン
      cancelId: -1,  // Esc で閉じられたときの戻り値
      detail: `${arg.name}を削除してよろしいですか？`,  // 説明文
    };
    // ダイアログ表示
    const selected: number = dialog.showMessageBoxSync(options);
    console.log(selected);
    // キャンセルなら離脱
    if (selected == 1 || selected == -1) {
      // 結果返し
      event.sender.send('error', '');
      return false;

    } else {
      // 対象を使用不可に
      db.run('UPDATE ? SET usable = ? WHERE id = ?', [arg.table, 0, arg.id]);
      // 結果返し
      event.sender.send('delete_finish', '');
    }
    

  } catch(e: unknown) {
    // エラー処理
    errOperate(e, event);
  }
});

/* 汎用処理 */
// 画像選択
ipcMain.on('upload', async(event, arg) => {
  try {
    console.log('upload mode');
    // 画像ファイルパス取得
    const filepath: string = await getImageFile();
    // 画像ファイルパス返し
    event.sender.send(arg, filepath);

  } catch(e: unknown) {
    // エラー処理
    errOperate(e, event);
  }
});

// CSV取得
ipcMain.on('csv', async(event, _) => {
  try {
    console.log('csv mode');
    // エラーフラグ
    let errFlg: boolean;
    // CSVデータ取得
    const result: any = await getCsvData();

    // ユーザID一覧返し
    Promise.all(
      // 結果ループ
      result.record[0].map(async (rec: any) => {
        return new Promise((resolve, _) => {
          // ユーザIDが33桁でない
          if (rec.length != 33 && rec != "") {
            // エラー対象
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
        const errMsg: string = 'CSVデータの形式が不正です(33桁が正常)';
        // クライアントに送信
        event.sender.send('error', errMsg);
        // エラー発生
        throw new Error(errMsg);
      }
    });
        
  } catch(e: unknown) {
    // エラー処理
    errOperate(e, event);
  }
});

// メッセージ表示
ipcMain.on('showmessage', async(event, arg) => {
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
    }
    // オプション
    const options: Electron.MessageBoxOptions = {
      type: tmpType, // タイプ
      message: tmpTitle, // メッセージタイトル
      detail: arg.message,  // 説明文
    };
    // ダイアログ表示
    dialog.showMessageBox(options);

  } catch(e: unknown) {
    // エラー処理
    errOperate(e, event);
  }
});

/*
 汎用関数
*/
// broadcastDB登録
const dbBroadcastReg = (arg: any, flg: boolean): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      // 配信時間
      let broadcastTime: string;
      // 配信名
      const broadcastname = Number(arg.bdname);
      // プランID
      const planId = Number(arg.plan);
      // チャンネルID
      const channelId = Number(arg.channel);
      // 現在時刻
      const nowFormattedTime: string = getNowTime();

      // 予約時のみ
      if (flg) {
        // 配信日時
        const date: string = arg.date;
        // 配信時刻
        const time: string = arg.time;
        // 配信時間
        broadcastTime = `${date} ${time}`;

      } else {
        // 現在時刻
        broadcastTime = nowFormattedTime;
      }
      
      db.serialize(() => {
        // 全データ登録
        db.run('INSERT INTO broadcast (broadcastname, plan_id, channel_id, sendtime, usable, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [broadcastname, planId, channelId, broadcastTime, 0, nowFormattedTime, nowFormattedTime]);
        // 直近にINSERTしたデータを取得
        db.get('SELECT * FROM broadcast WHERE rowid = last_insert_rowid()', (_, rows: any)  => {
          // 配信準備
          const stmt: sqlite3.Statement = db.prepare("INSERT INTO targetuser (broadcast_id, userid, usable, created_at, updated_at) VALUES (?, ?, ?, ?, ?)");

          // データあり
          if (arg.users) {
            // 一斉登録
            arg.users.forEach((usr: any) => {
              // データあり
              if (usr) {
                stmt.run([rows.id, usr, 0, nowFormattedTime, nowFormattedTime]);
              }
            });
          }
          // 登録完了
          stmt.finalize();
          console.log('broadcast registration finished');
        });
      });
      // 戻り値
      resolve('success');

    } catch(e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        console.log(e);
        reject(`${e.message}`);
      }
    }
  });
}

// userDB登録
const dbTargetuserReg = (arg: any): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      db.serialize(() => {
        // 配信準備
        const stmt: sqlite3.Statement = db.prepare("UPDATE targetuser SET success = ? WHERE userid = ?");
        // データあり
        if (arg) {
          // 結果ループ
          arg.forEach((ln: any) => {
            // データあり
            if (ln) {
              // 正常データのみ
              if (ln.result == 'success') {
                // アップデート処理
                stmt.run([1, ln.userid]);

              } else {
                // アップデート処理
                stmt.run([0, ln.userid]);
              }
            }
          });
        }
        // 登録完了
        stmt.finalize();
      });
      // 戻り値
      resolve('success');

    } catch(e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        console.log(e);
        reject(`${e.message}`);
      }
    }
  });
}

// LINE配信
const sendLineMessage = (arg: any): Promise<resultType[]> => {
  return new Promise(async (resolve, reject) => {
    try {
      // プランID
      const planId = Number(arg.plan);
      // チャンネルID
      const channelId = Number(arg.channel);

      // DB抽出
      db.serialize(() => {
        // トークン
        let token: string;

        // 抽出
        db.all('SELECT * FROM channel WHERE id = ?', [channelId], (_, rows1: any) => {
          // トークン
          token = rows1[0].token;
        });

        // 抽出
        db.all('SELECT * FROM plan WHERE id = ?', [planId], (_, rows2: any) => {
          // タイトル
          const title: string = rows2[0].title;
          // 本文
          const content: string = rows2[0].text;
          // 画像URL
          const imgurl: string = rows2[0].imageurl;
          // LINE登録
          const lineMethod: string = String(rows2[0].linemethod_id);
          // 画像比率(小数点第１位)
          const imageRatio: number = Number(rows2[0].imageratio);

          // データあり
          if (arg.users) {
            resolve(Promise.all(
              arg.users.map(async(usr: any) => {
                // データあり
                if (usr) {
                  return new Promise(async(resolve, _) => {
                    // メッセージ
                    const messageResult: string = await makeMessage(usr, token, title, content, imgurl, lineMethod, imageRatio);
                    // 結果あり
                    if (messageResult) {
                      resolve({
                        result: messageResult,
                        userid: usr,
                      });

                    } else {
                      // メッセージ送信
                      resolve({
                        result: 'error',
                        userid: usr,
                      });
                    }
                  });
                }
              })
            ));
          }
        });
      });
      
    } catch(e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        console.log(e);
        reject(`${e.message}`);
      }
    }
  });
}

// メッセージ作成
const makeMessage = (uid: string, token: string, title?: string, contentText?: string, imgurl?: any, planno?: string, ratio?: number): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      // 配信内容
      let dataString: string;
      // 配信結果
      let broadcastResult: string;
      // ヘッダ
      const headers: any = {
        'Content-Type': 'application/json', // Content-type
        Authorization: 'Bearer ' + token, // 認証トークン
      };
     
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
                "type": "text", // テキスト
                "text": contentText, // 本文
            }
            ],
          });
          break;
        
        // 画像
        case '2':
          console.log('2: image mode');
          // 配信内容
          dataString = JSON.stringify({
            to: uid, // 返信トークン
            messages: [
              {
                type: "flex", // flex
                altText: title, // 代替タイトル
                contents: {
                  type: "bubble", // 吹き出し
                  size: "giga", // フルサイズ
                  hero: {
                    type: "image", // 画像
                    url: imgurl, // 画像url
                    size: "full", // フル
                    aspectRatio: `${ratio}:1`, // 画像縦横比
                  }
                }
              }
            ],
          });
          break;
        
        // 選択肢
        case '3':
          console.log('3: button mode');
          // 配信内容
          dataString = JSON.stringify({
            to: uid, // 返信トークン
            messages: [{
              type: 'template', // テンプレート
              altText: title, // 代替タイトル
              template: {
                  type: 'buttons', // 吹き出し
                  thumbnailImageUrl: imgurl, // 画像url
                  imageSize: 'cover', // 切り取り
                  title: title, // タイトル
                  text: contentText, // 本文
              },
            }],
          });
          break;
        
        // カルーセル
        case '4':
          console.log('4: image_carousel mode');
          // 配信内容
          dataString = JSON.stringify({
            to: uid, // 返信トークン
            messages: [{
              type: "template", // テンプレート
              altText: title, // タイトル
              template: {
                type: "image_carousel", // カルーセル
                columns: [
                  {
                    imageUrl: imgurl[0], // 画像
                    action: {
                      type: "message", // メッセージ
                      label: title, // タイトル
                      text: contentText, // 本文
                    }
                  },
                  {
                    imageUrl: imgurl[1],
                    action: {
                      type: "message",
                      label: title,
                      text: contentText,
                    }
                  },
                  {
                    imageUrl: imgurl[2],
                    action: {
                      type: "message",
                      label: title,
                      text: contentText,
                    }
                  }
                ]
              }
            }]
          });
          break;

        default:
          dataString = '';
          console.log(`Sorry, we are out of ${planno}.`);
      }
      // 配信
      broadcastResult = await makeBroadcast(headers, dataString);
      
      // 可否
      if (broadcastResult == 'success') {
        resolve('success');
        
      } else {
        reject('error');
      }

    } catch(e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        console.log(e);
        reject('error');
      }
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

      }).catch((err: unknown) => {
        // エラー型
        if (err instanceof Error) {
          // エラー発生
          throw new Error(`${err.message}`);
        }
      });

    } catch(e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        console.log(e);
        reject(`${e.message}`);
      }
    }
  });
}

// CSV抽出
const getCsvData = (): Promise<recordType | string> => {
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
              record: tmpRecords, // データ
              filename: filenames[0], // ファイル名
            });
          });

        // ファイルなし
        } else {
          reject(result.canceled);
        }

      }).catch((err: unknown) => {
        // エラー型
        if (err instanceof Error) {
          // エラー発生
          throw new Error(`${err.message}`);
        }
      });

    } catch(e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        console.log(e);
        reject(`${e.message}`);
      }
    }
  });
}

// LINE配信
const makeBroadcast = (headers: Headers, dataString?: string): Promise<string> => {
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
          resolve('success');
        });
      });

      // データ送信
      request.write(dataString);
      // コネクションクローズ
      request.end();

    } catch(e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        console.log(e);
        reject(`${e.message}`);
      }
    }
  });
}

// ファイルアップロード
const uploadFile = async(localpath: string): Promise<string> => {
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
      const sftpClient = new Client();
      // SFTP接続
      await sftpClient.connect({ host, port, username, password });
      // 画像ファイルをアップロード
      await sftpClient.put(localpath, uploadPath);
      // 切断
      await sftpClient.end();
      console.log('sftp closed');
      // 完了
      resolve('upload success');

    } catch (e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        console.log(e);
        reject(`${e.message}`);
      }
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

// エラー処理
const errOperate = (e: unknown, event: any) => {
  // エラー型
  if (e instanceof Error) {
    // エラー
    console.log(e);
    // 配信方法一覧返し
    event.sender.send('error', `${e.message})`);
  }
}