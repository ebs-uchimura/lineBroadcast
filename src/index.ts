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
import * as dotenv from 'dotenv'; // dotenv
import iconv from 'iconv-lite'; // text converter
import ImageSize from 'image-size'; // image-size
import Client from 'ssh2-sftp-client'; // sfpt client
import { parse } from 'csv-parse/sync'; // CSV parser
import SQL from './MySql.js'; // sql

// 定数d
const CSV_ENCODING: string = 'Shift_JIS'; // エンコーディング
const CHOOSE_FILE: string = '読み込むCSVを選択してください。'; // ファイルダイアログ

// モジュール設定
dotenv.config();

// db
const myDB = new SQL(
  process.env.SQL_HOST!, // ホスト名
  process.env.SQL_COMMONUSER!, // ユーザ名
  process.env.SQL_COMMONPASS!, // パスワード
  process.env.SQL_DBNAME! // DB名
);

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
  // 予約再読み込み
  sheduleCron();

  // アイコン
  const icon: any = nativeImage.createFromPath(path.join(__dirname, '../assets/tray@2x.png'));
  // トレイ
  const mainTray: Electron.Tray = new Tray(icon);
  // コンテキストメニュー
  const contextMenu: Electron.Menu = Menu.buildFromTemplate([
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
  mainTray.on('double-click', () => mainWindow.show());
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
      case 'regist_genre_page':
        // ジャンル対象
        genreMasterFlg = true;
        break;

      // チャンネル登録モード
      case 'regist_channel_page':
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
      // プラン抽出
      const planData: any = await selectDB(
        'plan',
        'usable',
        1,
        false,
      );
      // エラー
      if (planData == 'error') {
        // エラー返し
        event.sender.send('error', 'プランがありません');
      }
      // プラン一覧返し
      event.sender.send('planMasterllist', planData);
    }

   // チャネルマスタ
    if (channelMasterFlg) {
      console.log('select from channel db');
      // チャネル抽出
      const channelData: any = await selectDB(
        'channel',
        'usable',
        1,
        false,
      );
      // エラー
      if (channelData == 'error') {
        // エラー返し
        event.sender.send('error', 'チャンネルがありません');
      }
      // ジャンル一覧返し
      event.sender.send('channelMasterllist', channelData);
    }

    // ジャンルマスタ
    if (genreMasterFlg) {
      console.log('select from genre db');
      // ジャンル抽出
      const genreData: any = await selectDB(
        'genre',
        'usable',
        1,
        false,
      );
      // エラー
      if (genreData == 'error') {
        // エラー返し
        event.sender.send('error', 'ジャンルがありません');
      }
      // ジャンル一覧返し
      event.sender.send('genreMasterlist', genreData);
    }

    // 配信方法マスタ
    if (typeMethodMasterFlg) {
      console.log('select from linemethod db');
      // 配信方法抽出
      const linemethodData: any = await selectDB(
        'linemethod',
        'usable',
        1,
        false,
      );
      // エラー
      if (linemethodData == 'error') {
        // エラー返し
        event.sender.send('error', '配信方法がありません');
      }
      // 配信方法一覧返し
      event.sender.send('lineMethodMasterlist', linemethodData);
    }

    // 配信編集
    if (broadcastEditFlg) {
      console.log('select newone from broadcast db');
      // 配信抽出
      const broadcastData: any = await selectDB(
        'broadcast',
        'usable',
        1,
        true,
      );
      // エラー
      if (broadcastData == 'error') {
        // エラー返し
        event.sender.send('notexists', '配信予約がありません');
        
      } else {
        // 配信方法一覧
        event.sender.send('broadcastMasterllist', broadcastData);
      }
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
    // メイン画像ファイル名
    let mainFilename: string;
    // プラン名
    const planname: string = arg.planname;
    // ジャンルID
    const genreId: number = Number(arg.genre);
    // 配信ID
    const linemethodId: number = Number(arg.linemethod);
    // 本文
    const text: string = arg.text;
    // 画像URL
    const imageurl: string = arg.imageurl;
    // メイン画像ルート
    const baseHttpUri: string = 'https://ebisuan.sakura.ne.jp/assets/image/';
    

    // 画像URLあり
    if (imageurl != '') {
      // 画像アップロード
      await uploadFile(imageurl);
      // サイズ計測
      const dimensions: any = ImageSize(imageurl);
      // 画像比率
      const imageRatio: number = dimensions.width / dimensions.height;
      // 小数点以下1位
      fixedImageRatio = parseFloat(imageRatio.toFixed(1));
      // メイン画像ファイル名
      mainFilename = `${baseHttpUri}${path.basename(arg.imageurl)}`;

    } else {
      // 計算不要
      fixedImageRatio = 0;
      // メイン画像ファイル名
      mainFilename = '';
    }
    
    // プラン対象カラム
    const planColumns: string[] = [
      'planname',
      'genre_id',
      'linemethod_id',
      'text',
      'imageurl',
      'imageratio',
      'usable',
    ];
    // プラン対象値
    const planValues: any[] = [
      planname,
      genreId,
      linemethodId,
      text,
      mainFilename,
      fixedImageRatio,
      1,
    ];

    // トランザクションDB格納
    const tmpReg: any = await insertDB('plan', planColumns, planValues);
    // エラー
    if (tmpReg == 'error') {
      console.log('plan insertion error');

    } else {
      console.log(
        `initial insertion to plan completed for ${planname}.`
      );
    }

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
    // ジャンル名
    const genrename: string = arg;
    // ジャンル対象カラム
    const genreColumns: string[] = [
      'genrename',
      'usable',
    ];
    // ジャンル対象値
    const genreValues: any[] = [
      genrename,
      1,
    ];

    // トランザクションDB格納
    const tmpReg: any = await insertDB('genre', genreColumns, genreValues);
    // エラー
    if (tmpReg == 'error') {
      console.log('genre insertion error');

    } else {
      console.log(
        `initial insertion to genre completed for ${genrename}.`
      );
    }

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
    // チャンネル名
    const channelname: string = arg.channelname;
    // トークン
    const token: string = arg.token;
    // チャンネル対象カラム
    const channelColumns: string[] = [
      'channelname',
      'token',
      'usable',
    ];
    // チャンネル対象値
    const channelValues: any = [
      channelname,
      token,
      1,
    ];

    // チャンネルDB格納
    const tmpReg = await insertDB('channel', channelColumns, channelValues);

    // エラー
    if (tmpReg == 'error') {
      console.log('channel insertion error');

    } else {
      console.log(
        `initial insertion to channel completed for ${channelname}.`
      );
    }
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
    const dbBdResult: string = await dbBroadcastReg(arg, true);

    // 成功
    if (dbBdResult == 'success') {
      // 予約
      sheduleCron();
      // 通知送付
      event.sender.send('register_finish', '');
      
    } else {
      // エラー返し
      event.sender.send('error', dbBdResult);
    }

  } catch(e: unknown) {
    // エラー処理
    errOperate(e, event);
  }
});

// 予約編集
ipcMain.on('broadcastedit', async(event, arg) => {
  try {
    console.log('broadcastedit mode');
    // 配信ID
    const broadcastID: number = Number(arg.bdid);
    // 全データ登録
    const dbBdResult: string = await dbBroadcastEdit(arg);

    // 成功
    if (dbBdResult == 'success') {
      // DB登録
      await editTargetuserReg(broadcastID, arg.users);
      // 通知送付
      event.sender.send('edit_finish', '');
      
    } else {
      // 通知送付
      event.sender.send('error', '編集エラー');
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
    // 対象ID
    const targetId: number = Number(arg.id);
    // 対象テーブル
    const targetname: string = arg.name;
    // 対象テーブル
    const targettable: string = arg.table;
    // オプション
    const options: Electron.MessageBoxSyncOptions = {
      type: 'warning', // タイプ
      message: '警告', // メッセージタイトル
      buttons: ['OK', 'Cancel'], // ボタン
      cancelId: -1,  // Esc で閉じられたときの戻り値
      detail: `${targetname}を削除してよろしいですか？`,  // 説明文
    };
    // ダイアログ表示
    const selected: number = dialog.showMessageBoxSync(options);

    // キャンセルなら離脱
    if (selected == 1 || selected == -1) {
      // 結果返し
      event.sender.send('error', 'キャンセルしました');
      return false;

    } else {
      // アップデート処理
      await updateDB(targettable, 'usable', 0, 'id', targetId);
      console.log(`update completed for ${targettable}.`);

      // 配信編集の場合のみ
      if (targettable == 'broadcast') {
        // 配信抽出
        const broadcastData: any = await selectDB(
          'broadcast',
          'usable',
          1,
          true,
        );
        // エラー
        if (broadcastData == 'error') {
          // エラー返し
          event.sender.send('notexists', '配信予約がありません');

        } else {
          // 結果返し
          event.sender.send('delete_finish', broadcastData);
        }

      } else {
        // 結果返し
        event.sender.send('delete_finish', '');
      } 
    }

  } catch(e: unknown) {
    // エラー処理
    errOperate(e, event);
  }
});

/* 汎用処理 */
// 画像選択
ipcMain.on('upload', async(event, _) => {
  try {
    console.log('upload mode');
    // 画像ファイルパス取得
    const filepath: string = await getImageFile();
    // 画像ファイルパス返し
    event.sender.send('image', filepath);

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
    Promise.allSettled(
      // 結果ループ
      result.record[0].map(async (rec: any) => {
        return new Promise((resolve, reject) => {
          try {
            // ユーザIDが33桁でない
            if (rec.length != 33 && rec != '') {
              // エラー対象
              errFlg = true;
            }
            // フラグオン
            resolve(errFlg);

          } catch(e: unknown) {
            // エラー処理
            reject(e);
            errOperate(e, event);
          }
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
    // タイプ
    const type: string = arg.type;
    // メッセージ
    const message: string = arg.message;

    // urlセット
    switch (type) {
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
      detail: message,  // 説明文
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
  return new Promise(async (resolve1, reject1) => {
    try {
      // 配信時間
      let broadcastTime: string;
      // 配信名
      const broadcastname: string = arg.bdname;
      // プランID
      const planId: number = arg.plan;
      // チャンネルID
      const channelId: number = arg.channel;
      // ユーザID
      const userIdArray: string[] = arg.users;

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
        const nowDate: Date = new Date();
        // 配信時間
        broadcastTime = formatDateInYyyymmdd(nowDate);
      }

      // 配信カラム
      const broadcastColumns: string[] = [
        'broadcastname',
        'plan_id',
        'channel_id',
        'sendtime',
        'usable',
      ];

      // 配信値
      const broadcastValues: any[] = [
        broadcastname,
        planId,
        channelId,
        broadcastTime,
        1,
      ];

      // 配信DB格納
      const tmpBdReg: any = await insertDB('broadcast', broadcastColumns, broadcastValues);

      // エラー
      if (tmpBdReg == 'error') {
        console.log('broadcast insertion error');

      } else {
        console.log(`initial insertion to broadcast completed for ${broadcastname}.`);
      }

      // 対象ID
      const targetBroadcastId: number = tmpBdReg.insertId;

      // 配信抽出
      const broadcastData: any = await selectOneDB(
        'broadcast',
        'id',
        targetBroadcastId,
      );
      // エラー
      if (broadcastData == 'error') {
        console.log('broadcast search error');
      }

      // データあり
      if (userIdArray.length > 0) {
         // 配信対象カラム
         const targetColumns: string[] = [
          'broadcast_id',
          'userid',
          'usable',
        ];
        // 一斉登録
        await Promise.allSettled(
          // ユーザループ
          userIdArray.map(async(usr: any): Promise<void> => {
            return new Promise(async(resolve2, reject2) => {
              try {
                // 格納値
                const values: string[] = [targetBroadcastId, usr, 1];
                // 配信対象DB格納
                const tmpTgReg: any = await insertDB('targetuser', targetColumns, values);
                // エラー
                if (tmpTgReg == 'error') {
                    console.log('targetuser insertion error');
                    reject2();

                } else {
                    console.log(`initial insertion to targetuser completed for ${broadcastname}.`);
                    resolve2();
                }

              } catch(e: unknown) {
                // エラー型
                if (e instanceof Error) {
                  // エラー
                  console.log(e);
                  reject2();
                }
              }
            });
          })
        );
      }
      // 戻り値
      resolve1('success');

    } catch(e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        console.log(e);
        reject1(`${e.message}`);
      }
    }
  });
}

// targetuserDB登録
const dbTargetuserReg = (arg: any): Promise<string> => {
  return new Promise(async (resolve1, reject1) => {
    try {
      // データあり
      if (arg) {
        await Promise.allSettled(
          // 結果ループ
          arg.map(async (ln: any): Promise<void> => {
            return new Promise(async(resolve2, reject2) => {
              try {
                // データあり
                if (ln.userid) {
                  // 正常データのみ
                  if (ln.result == 'success') {
                    // アップデート処理
                    await updateDB('targetuser', 'success', 1, 'id', ln.userid.id);

                  } else {
                    // アップデート処理
                    await updateDB('targetuser', 'success', 0, 'id', ln.userid.id);
                  }
                  console.log('update completed for targetuser');
                }
                // 戻り値
                resolve2();

              } catch(e: unknown) {
                // エラー型
                if (e instanceof Error) {
                  // エラー
                  console.log(e);
                  reject2();
                }
              }
            });
          })
        );
        // 戻り値
        resolve1('success');
      }

    } catch(e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        console.log(e);
        reject1(`${e.message}`);
      }
    }
  });
}

// targetuserDB更新
const editTargetuserReg = async(broadcastId: number, userIds: string[]): Promise<void> => {
  return new Promise(async (resolve1, reject1) => {
    try {
      // 配信対象カラム
      const targetColumns: string[] = [
        'broadcast_id',
        'userid',
        'usable',
      ];
      // 結果
      await Promise.allSettled(
        // プロミス返し
        userIds.map(async(usr: any): Promise<void> => {
          return new Promise(async (resolve2, reject2) => {
            // データあり
            if (usr) {
              // 対象ユーザ抽出
              const targetuserData: any = await selectTripleDB(
                'targetuser',
                'broadcast_id',
                broadcastId,
                'userid',
                usr,
                'usable',
                1,
                false,
              );

              // ユーザIDが存在しない場合登録
              if (targetuserData == 'error') {
                // 格納値
                const values: string[] = [broadcastId, usr, 1];
                // 配信対象DB格納
                const tmpTgReg: any = await insertDB('targetuser', targetColumns, values);
                // エラー
                if (tmpTgReg == 'error') {
                    console.log('targetuser insertion error');
                    reject2();

                } else {
                    console.log(`initial insertion to targetuser completed for ${broadcastId}.`);
                    resolve2();
                }

              } else {
                // エラー返し
                reject2('error');
              }
            }
          });
        })
      );
      // 値返し
      resolve1();

    } catch(e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        console.log(e);
        reject1();
      }
    }
  });
}

// broadcastDB編集
const dbBroadcastEdit = (arg: any): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      // 配信時間
      const broadcastID: number = arg.bdid;
      // プランID
      const planId: number = arg.plan;
      // チャンネルID
      const channelId: number = arg.channel;
      // 配信日時
      const date: string = arg.date;
      // 配信時刻
      const time: string = arg.time;
      // 配信時間
      const broadcastTime: string = `${date} ${time}`;
      // 配信抽出
      const broadcastData: any = await selectOneDB(
        'broadcast',
        'id',
        broadcastID,
      );

      // エラー
      if (broadcastData == 'error') {
        console.log('broadcast search error');

      } else {
        // プラン不一致
        if (broadcastData.plan_id != planId) {
          // アップデート処理
          await updateDB('broadcast', 'plan_id', planId, 'id', broadcastID);
        }
        // チャンネル不一致
        if (broadcastData.channel_id != channelId) {
          // アップデート処理
          await updateDB('broadcast', 'channel_id', channelId, 'id', broadcastID);
        }
        // 送信時間不一致
        if (broadcastData.sendtime != broadcastTime) {
          // アップデート処理
          await updateDB('broadcast', 'sendtime', broadcastTime, 'id', broadcastID);
        }
        // 更新完了
        console.log('broadcast update completed for targetuser');
        resolve('success');
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

// LINE配信
const sendLineMessage = (arg: any): Promise<any> => {
  return new Promise(async (resolve1, reject1) => {
    try {
      // プランID
      const planId: number = Number(arg.plan);
      // チャンネルID
      const channelId: number = Number(arg.channel);
      // ユーザID
      const userIdArray: any = arg.users;

      // チャンネル抽出
      const channelData: any = await selectOneDB(
        'channel',
        'id',
        channelId,
      );
      // エラー
      if (channelData == 'error') {
        console.log('channel search error');
      }
      
      // トークン
      const token: string = channelData[0].token;

      // プラン抽出
      const planData: any = await selectOneDB(
        'plan',
        'id',
        planId,
      );
      // エラー
      if (planData == 'error') {
        console.log('plan search error');
      }

      // タイトル
      const title: string = planData[0].title;
      // 本文
      const content: string = planData[0].text;
      // 画像URL
      const imgurl: string = planData[0].imageurl;
      // LINE登録
      const lineMethod: string = String(planData[0].linemethod_id);
      // 画像比率(小数点第１位)
      const imageRatio: number = Number(planData[0].imageratio);

      // データあり
      if (userIdArray) {
        // 結果
        const res: any = await Promise.allSettled(
          userIdArray.map(async(usr: any): Promise<any> => {
            return new Promise(async(resolve2, reject2) => {
              try {
                // データあり
                if (usr) {
                  // メッセージ
                  const messageResult: string = await makeMessage(usr, token, title, content, imgurl, lineMethod, imageRatio);
                  // 結果あり
                  if (messageResult) {
                    resolve2({
                      result: messageResult,
                      userid: usr,
                    });

                  } else {
                    // メッセージ送信
                    resolve2({
                      result: 'error',
                      userid: usr,
                    });
                  }
                }

              } catch(e: unknown) {
                // エラー型
                if (e instanceof Error) {
                  // エラー
                  console.log(e);
                  reject2(`${e.message}`);
                }
              }
            });
          })
        );
        // 値返し
        resolve1(res);

      } else {
        reject1();
      }
      
      
    } catch(e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        console.log(e);
        reject1(`${e.message}`);
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
                'type': 'text', // テキスト
                'text': contentText, // 本文
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
                type: 'flex', // flex
                altText: title, // 代替タイトル
                contents: {
                  type: 'bubble', // 吹き出し
                  size: 'giga', // フルサイズ
                  hero: {
                    type: 'image', // 画像
                    url: imgurl, // 画像url
                    size: 'full', // フル
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
              type: 'template', // テンプレート
              altText: title, // タイトル
              template: {
                type: 'image_carousel', // カルーセル
                columns: [
                  {
                    imageUrl: imgurl[0], // 画像
                    action: {
                      type: 'message', // メッセージ
                      label: title, // タイトル
                      text: contentText, // 本文
                    }
                  },
                  {
                    imageUrl: imgurl[1],
                    action: {
                      type: 'message',
                      label: title,
                      text: contentText,
                    }
                  },
                  {
                    imageUrl: imgurl[2],
                    action: {
                      type: 'message',
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
          console.log(`${err.message}`);
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
          {name: 'csv(Shif-JIS)', extensions: ['csv']}, // csvのみ
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
          console.log(`${err.message}`);
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
      const request: any = https.request(webhookOptions, res => {
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
      const uploadPath: string = `/home/ebisuan/www/assets/image/${path.basename(localpath)}`;
      // SFTP用
      const sftpurl: string = process.env.SFTPTOGO_URL!;
      // URLパース
      const parsedURL: URL = new URL(sftpurl);
      // ポート番号
      const port: number = 22;
      // SFTP情報取得
      const { host, username, password } = parsedURL;
      // SFTPクライアント
      const sftpClient: any = new Client();
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

// エラー処理
const errOperate = (e: unknown, event: any): void => {
  // エラー型
  if (e instanceof Error) {
    // エラー
    console.log(e);
    // 配信方法一覧返し
    event.sender.send('error', `${e.message})`);
  }
}

// スケジューリング
const sheduleCron = async(): Promise<any> => {
  return new Promise(async (resolve1, reject1) => {
    try {
      // 配信抽出
      const broadcastData: any = await selectDB(
        'broadcast',
        'usable',
        1,
        true,
      );
      // エラー
      if (broadcastData == 'error') {
        // エラー返し
        console.log('配信予約がありません');

      } else {
        // resolve返し
        const res: any = await Promise.allSettled(
          // プロミス返し
          broadcastData.map(async(broadcast: any): Promise<void> => {
            return new Promise(async(resolve2, reject2) => {
              try {
                // データあり
                if (broadcast) {
                  // 配信ID
                  const broadcastId: number = broadcast.id;
                  // プランID
                  const planId: number = broadcast.plan_id;
                  // チャンネルID
                  const channelId: number = broadcast.channel_id;
                  // 送信日時
                  const sendDate: Date = new Date(broadcast.sendtime);
                  const sendtime: string = formatDateInYyyymmdd(sendDate);
                  // 送信日分割
                  const sendArray: string[] = sendtime.split(' ');
                  // 送信日
                  const senddateArray: string[] = sendArray[0].split('-');
                  // 送信時間
                  const sendtimeArray: string[] = sendArray[1].split(':');
                  // 月
                  const month: string = isNaN(Number(senddateArray[1])) ? '*' : String(Number(senddateArray[1]));
                  // 日
                  const day: string = isNaN(Number(senddateArray[2])) ? '*' : String(Number(senddateArray[2]));
                  // 時
                  const hour: string = isNaN(Number(sendtimeArray[0])) ? '*' : String(Number(sendtimeArray[0]));
                  // 分
                  const minute: string = isNaN(Number(sendtimeArray[1])) ? '*' : String(Number(sendtimeArray[1]));
                  
                  console.log('select from targetuser db');
                  // 対象ユーザ抽出
                  const targetuserData: any = await selectDoubleDB(
                    'targetuser',
                    'broadcast_id',
                    broadcastId,
                    'usable',
                    1,
                    false,
                  );
                  // エラー
                  if (targetuserData == 'error') {
                    // エラー返し
                    console.log('対象ユーザがいません');
    
                  } else {
                    // ユーザ一覧
                    const allUserLists = targetuserData.map((usr: any) => usr.userid);
                    // 予約オプション
                    const reserveOption: any = {
                      channel: channelId, // 選択チャンネル
                      plan: planId, // 選択プラン
                      users: allUserLists, // ユーザ一覧
                    }
      
                    // スケジュール予約
                    cron.schedule(`${minute} ${hour} ${day} ${month} *`, async() => {
                      console.log("reserved broadcast started");
                      // LINE配信
                      const lineResult: resultType[] = await sendLineMessage(reserveOption);
                      // DB登録
                      const dbUserResult: string = await dbTargetuserReg(lineResult);
                      // 結果
                      if (dbUserResult == 'success') {
                        // 成功
                        console.log('broadcast completed');
                        resolve2();
      
                      } else {
                        // 失敗
                        console.log('broadcast failed');
                        reject2();
                      }
                    });
                    console.log(`running on ${month}/${day} ${hour}:${minute}`);
                  }
                }

              } catch (e: unknown) {
                // エラー型
                if (e instanceof Error) {
                  // エラー
                  console.log(e);
                  reject2();
                }
              }
            });
          })
        );
        // 値返し
        resolve1(res);
      }

    } catch (e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        console.log(e);
        reject1(`${e.message}`);
      }
    }
  });
}

// - database operation
// * select
const selectOneDB = (table: string, column: string, value: any) => {
  return new Promise(async (resolve, reject) => {
      try {
          // query string
          let queryString: string;
          // array
          let placeholder: any;
          // query
          queryString = 'SELECT * FROM ?? WHERE ?? IN (?) LIMIT 0, 1';
          // place holder
          placeholder = [table, column, value];
          
          // do query
          await myDB.doInquiry(queryString, placeholder);
          // resolve
          resolve(myDB.getValue);

      } catch(e) {
          // error
          reject(e);
      }
  });
}

// select all from table
const selectDB = (table: string, column: any, value: any, newflg: boolean): Promise<any> => {
  return new Promise(async (resolve, reject) => {
      try {
          // query string
          let queryString: string;
          // array
          let placeholder: any;
          // conjunction
          let conjunction: string;

          // if column not null
          if (column) {
              // query
              queryString = 'SELECT * FROM ?? WHERE ?? IN (?)';
              // placeholder
              placeholder = [table, column, value];
              // conjunction
              conjunction = 'AND';

          // if column null
          } else {
              // query
              queryString = 'SELECT * FROM ??';
              // placeholder
              placeholder = [table];
              // conjunction
              conjunction = 'WHERE';
          }

          // later only
          if (newflg) {
            // query
            queryString += ` ${conjunction} ?? > CURRENT_TIME`;
            // push 'sendtime'
            placeholder.push('sendtime');
          }
          
          // do query
          await myDB.doInquiry(queryString, placeholder);
          // resolve
          resolve(myDB.getValue);
          
      } catch (e) {
          // error
          reject(e);
      }
  });
}

// select all from table
const selectDoubleDB = (table: string, column1: any, value1: any, column2: any, value2: any, newflg: boolean) => {
  return new Promise(async (resolve, reject) => {
    try {
        // query string
        let queryString: string;
        // placeholder
        let placeholder: any;

        // query
        queryString = 'SELECT * FROM ?? WHERE ?? IN (?) AND ?? IN (?)';
        // placeholder
        placeholder = [table, column1, value1, column2, value2];

        // later only
        if (newflg) {
          // query
          queryString += ' AND ?? > CURRENT_TIME';
          // push 'sendtime'
          placeholder.push('sendtime');
        }
        
        // do query
        await myDB.doInquiry(queryString, placeholder);
        // resolve
        resolve(myDB.getValue);
        
    } catch (e) {
        // error
        reject(e);
    }
  });
}

// select all from table
const selectTripleDB = (table: string, column1: any, value1: any, column2: any, value2: any, column3: any, value3: any,newflg: boolean) => {
  return new Promise(async (resolve, reject) => {
    try {
        // query string
        let queryString: string;
        // placeholder
        let placeholder: any;

        // query
        queryString = 'SELECT * FROM ?? WHERE ?? IN (?) AND ?? IN (?) AND ?? IN (?)';
        // placeholder
        placeholder = [table, column1, value1, column2, value2, column3, value3];

        // later only
        if (newflg) {
          // query
          queryString += ' AND ?? > CURRENT_TIME';
          // push 'sendtime'
          placeholder.push('sendtime');
        }
        
        // do query
        await myDB.doInquiry(queryString, placeholder);
        // resolve
        resolve(myDB.getValue);
        
    } catch (e) {
        // error
        reject(e);
    }
  });
}

// update table
const updateDB = (table: string, setcol: any, setval: any, selcol: any, selval: any): Promise<void> => {
  return new Promise(async (resolve, reject) => {
      try {
          // query
          await myDB.doInquiry('UPDATE ?? SET ?? = ? WHERE ?? = ?', [
              table,
              setcol,
              setval,
              selcol,
              selval,
          ]);
          // resolve
          resolve();

      } catch (e) {
          // error
          reject(e);
      }
  });
}

// * insert
const insertDB = (table: string, columns: any, values: any): Promise<any> => {
  return new Promise(async (resolve, reject) => {
      try {
          // query
          await myDB.doInquiry('INSERT INTO ??(??) VALUES (?)', [table, columns, values]);
          // resolve
          resolve(myDB.getValue);

      } catch (e) {
          // error
          reject(e);
      }
  });
}

// 「yyyymmdd」形式の日付文字列に変換する関数
const formatDateInYyyymmdd = (date: Date) => {
  const y = date.getFullYear();
  const mh = date.getMonth() + 1;
  const d = date.getDate();
  const h = date.getHours();
  const m = date.getMinutes();
  const s = date.getSeconds();

  const yyyy = y.toString();
  const mhmh = ('00' + mh).slice(-2);
  const dd = ('00' + d).slice(-2);
  const hh = ('00' + h).slice(-2);
  const mm = ('00' + m).slice(-2);
  const ss = ('00' + s).slice(-2);

  return `${yyyy}-${mhmh}-${dd} ${hh}:${mm}:${ss}`;
}
