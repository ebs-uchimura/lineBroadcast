/**
 * index.ts
 **
 * function：LINE配信用 アプリ
**/

// モジュール
import { config as dotenv } from 'dotenv'; // dotenc
import { BrowserWindow, app, ipcMain, dialog, Tray, Menu, nativeImage } from 'electron'; // electron
import * as path from 'path'; // path
import * as https from 'https'; // https
import * as fs from 'fs'; // fs
import * as cron from 'node-cron'; // cron
import iconv from 'iconv-lite'; // text converter
import ImageSize from 'image-size'; // image-size
import Client from 'ssh2-sftp-client'; // sfpt client
import logger from 'electron-log'; // Logger
import { parse } from 'csv-parse/sync'; // CSV parser
import SQL from './MySql.js'; // sql

// 定数
const CSV_ENCODING: string = 'Shift_JIS'; // エンコーディング
const CHOOSE_FILE: string = '読み込むCSVを選択してください。'; // ファイルダイアログ

// ログ設定
const setLogConfig = () => {
  // 日付取得
  const d: Date = new Date();
  const prefix: string = d.getFullYear() +
    ('00' + (d.getMonth() + 1)).slice(-2) +
    ('00' + (d.getDate())).slice(-2);
  // ログファイル名設定
  logger.transports.file.fileName = 'log.log';
  // 現在のファイル名
  const curr: string = logger.transports.file.fileName;
  // 現在のファイル名
  logger.transports.file.resolvePathFn = () => path.join(__dirname, `../src/logs/${prefix}_${curr}`);
}

// モジュール設定
dotenv({ path: path.join(__dirname, '../.env') });

// db
const myDB: SQL = new SQL(
  process.env.SQL_HOST!, // ホスト名
  process.env.SQL_COMMONUSER!, // ユーザ名
  process.env.SQL_COMMONPASS!, // パスワード
  Number(process.env.SQL_PORTNUMBER), // ポート番号
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

// メッセージ表示
const showmessage = async (type: string, message: string): Promise<void> => {
  try {
    // モード
    let tmpType: 'none' | 'info' | 'error' | 'question' | 'warning' | undefined;
    // タイトル
    let tmpTitle: string | undefined;

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
    }

    // オプション
    const options: Electron.MessageBoxOptions = {
      type: tmpType, // タイプ
      message: tmpTitle, // メッセージタイトル
      detail: message,  // 説明文
    };
    // ダイアログ表示
    dialog.showMessageBox(options);

  } catch (e: unknown) {
    // エラー型
    if (e instanceof Error) {
      // エラー
      logger.error(e.message);
    }
  }
}

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
        preload: path.join(__dirname, 'preload.js'), // プリロード
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

  } catch (e: unknown) {
    // エラー型
    if (e instanceof Error) {
      // エラー
      logger.error(e.message);
    }
  }
};

// 処理開始
app.on('ready', () => {
  // ログ設定
  setLogConfig();
  // ウィンドウを開く
  createWindow();
  // 予約再読み込み
  //initialSheduleCron();

  // アイコン
  const icon: any = nativeImage.createFromPath(path.join(__dirname, '../assets/tray@2x.png'));
  // トレイ
  const mainTray: Electron.Tray = new Tray(icon);
  // コンテキストメニュー
  const contextMenu: Electron.Menu = Menu.buildFromTemplate([
    // 表示
    {
      label: '表示', click: () => {
        mainWindow.show();
      }
    },
    // 閉じる
    {
      label: '閉じる', click: () => {
        isQuiting = true;
        app.quit();
      }
    }
  ]);
  // コンテキストメニューセット
  mainTray.setContextMenu(contextMenu);
  // ダブルクリックで再表示
  mainTray.on('double-click', () => mainWindow.show());
});

// 起動時
app.on('activate', async () => {
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
ipcMain.on('page', async (event, arg) => {
  try {
    logger.info('ipc: page mode');
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
        break;

      // 予約配信モード
      case 'reserve_page':
        // 遷移先
        url = '../src/reserved.html';
        break;

      // ◇ 登録
      // プランモード
      case 'regist_plan_page':
        // 遷移先
        url = '../src/registplan.html';
        break;

      // ジャンルモード
      case 'regist_genre_page':
        // 遷移先
        url = '../src/registgenre.html';
        break;

      // チャネルモード
      case 'regist_channel_page':
        // 遷移先
        url = '../src/registchannel.html';
        break;

      // ◇ 編集
      // 配信編集モード
      case 'edit_broadcast_page':
        // 遷移先
        url = '../src/editbroadcast.html';
        break;

      default:
        // 遷移先
        url = '';
        logger.info('out of scope.');
    }
    logger.info(`url: ${url}`);

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
        logger.info('out of scope.');
    }

    // プランマスタ
    if (planMasterFlg) {
      logger.info('plan master mode');
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
        errOperate('プランがありません', event);

      } else {
        logger.info('plan select success');
        // プラン一覧返し
        event.sender.send('planMasterllist', planData);
      }
    }

    // チャネルマスタ
    if (channelMasterFlg) {
      logger.info('channel master mode');
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
        errOperate('チャンネルがありません', event);

      } else {
        logger.info('channel select success');
        // ジャンル一覧返し
        event.sender.send('channelMasterllist', channelData);
      }
    }

    // ジャンルマスタ
    if (genreMasterFlg) {
      logger.info('genre master mode');
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
        errOperate('ジャンルがありません', event);

      } else {
        logger.info('genre select success');
        // ジャンル一覧返し
        event.sender.send('genreMasterlist', genreData);
      }
    }

    // 配信方法マスタ
    if (typeMethodMasterFlg) {
      logger.info('linemethod master mode');
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
        errOperate('配信方法がありません', event);

      } else {
        logger.info('linemethod select success');
        // 配信方法一覧返し
        event.sender.send('lineMethodMasterlist', linemethodData);
      }
    }

    // 配信編集
    if (broadcastEditFlg) {
      logger.info('broadcast edit mode');
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
        errOperate('配信予約がありません', event);

      } else {
        logger.info('broadcast edits success');
        // 配信方法一覧
        event.sender.send('broadcastMasterllist', broadcastData);
      }
    }

  } catch (e: unknown) {
    // エラー型
    if (e instanceof Error) {
      // エラー処理
      errOperate(e.message, event);
    }
  }
});

/* 登録処理 */
// プラン登録
ipcMain.on('planregister', async (event, arg) => {
  try {
    logger.info('ipc: planregister mode');
    // メイン画像ファイル名
    let mainFilename: string;
    // 画像幅
    let imgWidth: number;
    // 画像高
    let imgHeight: number;
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

    // テキストモード以外
    if (linemethodId != 1) {
      // 画像URLあり
      if (imageurl != '') {
        // 画像アップロード
        const uploadResult: string = await uploadFile(imageurl);

        // アップロード成功
        if (uploadResult == 'success') {
          logger.info('upload success');
          // サイズ計測
          const dimensions: any = ImageSize(imageurl);
          // 画像幅
          imgWidth = dimensions.width;
          // 画像高
          imgHeight = dimensions.height;
          // メイン画像ファイル名
          mainFilename = `${baseHttpUri}${path.basename(arg.imageurl)}`;

        } else {
          // ジャンル一覧返し
          throw new Error('画像登録に失敗しました');
        }

      } else {
        // ジャンル一覧返し
        throw new Error('画像がありません');
      }

    } else {
      // 画像幅
      imgWidth = 0;
      // 画像高
      imgHeight = 0;
      // メイン画像ファイル名
      mainFilename = '';
    }

    logger.info(`filepath: ${mainFilename}`);

    // プラン対象カラム
    const planColumns: string[] = [
      'planname',
      'genre_id',
      'linemethod_id',
      'text',
      'imageurl',
      'imgwidth',
      'imgheight',
      'usable',
    ];
    // プラン対象値
    const planValues: any[] = [
      planname,
      genreId,
      linemethodId,
      text,
      mainFilename,
      imgWidth,
      imgHeight,
      1,
    ];

    // トランザクションDB格納
    const tmpReg: any = await insertDB('plan', planColumns, planValues);

    // エラー
    if (tmpReg == 'error') {
      // ジャンル一覧返し
      errOperate('プラン登録に失敗しました', event);

    } else {
      logger.info('insert to plan success');
      // ジャンル一覧返し
      event.sender.send('register_finish', '');
    }

  } catch (e: unknown) {
    // エラー型
    if (e instanceof Error) {
      // エラー処理
      errOperate(e.message, event);
    }
  }
});

// ジャンル登録
ipcMain.on('genreregister', async (event, arg) => {
  try {
    logger.info('ipc: genreregister mode');
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
      // ジャンル一覧返し
      errOperate('ジャンル登録に失敗しました', event);

    } else {
      logger.info('insert to genre success');
      // ジャンル一覧返し
      event.sender.send('register_finish', '');
    }

  } catch (e: unknown) {
    // エラー型
    if (e instanceof Error) {
      // エラー処理
      errOperate(e.message, event);
    }
  }
});

// チャンネル登録
ipcMain.on('channelregist', async (event, arg) => {
  try {
    logger.info('ipc: channelregist mode');
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
    const tmpReg: any = await insertDB('channel', channelColumns, channelValues);

    // エラー
    if (tmpReg == 'error') {
      // ジャンル一覧返し
      errOperate('チャンネル登録に失敗しました', event);

    } else {
      logger.info('insert to channel success');
      // ジャンル一覧返し
      event.sender.send('register_finish', '');
    }

  } catch (e: unknown) {
    // エラー型
    if (e instanceof Error) {
      // エラー処理
      errOperate(e.message, event);
    }
  }
});

/* 配信処理 */
// 即時配信
ipcMain.on('broadcast', async (event, arg) => {
  try {
    logger.info('ipc: broadcast mode');
    // 全データ登録
    const dbBdResult: string = await dbBroadcastReg(arg, false);

    // 成功
    if (dbBdResult == 'success') {
      logger.info('broadcast regstration success');
      // LINE配信
      const lineResult: any = await sendLineMessage(arg, event);

      // エラーの時は中断
      if (lineResult == 'error') {
        logger.info('line regstration error');
        // エラー返し
        errOperate('ライン送付エラー', event);

      } else {
        logger.info('line regstration success');
        // DB登録
        const dbUserResult: string = await dbTargetuserReg(lineResult);

        // 結果
        if (dbUserResult == 'success') {
          logger.info('targetuser regstration success');
          // 通知送付
          event.sender.send('register_finish', '');

        } else {
          // 通知送付
          errOperate('配信対象登録エラー', event);
        }
      }

    } else {
      // エラー返し
      errOperate('配信登録エラー', event);
    }

  } catch (e: unknown) {
    // エラー型
    if (e instanceof Error) {
      // エラー処理
      errOperate(e.message, event);
    }
  }
});

// 予約配信
ipcMain.on('reserve', async (event, arg) => {
  try {
    logger.info('ipc: reserve mode');
    // 全データ登録
    const dbBdResult: string = await dbBroadcastReg(arg, true);

    // 成功
    if (dbBdResult != 'error') {
      logger.info('reserve regstration success');
      // 予約
      const scheduleResult: string = await singleSheduleCron(dbBdResult);

      if (scheduleResult == 'success') {
        logger.info('scheduling regstration success');
        // 通知送付
        event.sender.send('register_finish', '');

      } else {
        // エラー返し
        errOperate('予約登録に失敗しました', event);
      }

    } else {
      // エラー返し
      errOperate('配信登録に失敗しました', event);
    }

  } catch (e: unknown) {
    // エラー型
    if (e instanceof Error) {
      // エラー処理
      errOperate(e.message, event);
    }
  }
});

// 予約編集
ipcMain.on('broadcastedit', async (event, arg) => {
  try {
    logger.info('ipc: broadcastedit mode');
    // 配信ID
    const broadcastID: number = Number(arg.bdid);
    // 全データ登録
    const dbBdResult: string = await dbBroadcastEdit(arg);
    logger.info(`broadcast edit: ${dbBdResult}`);

    // 成功
    if (dbBdResult == 'success') {
      logger.info('broadcast edit success');
      // DB登録
      const tmpReg: any = await editTargetuserReg(broadcastID, arg.users);

      // エラー
      if (tmpReg == 'success') {
        logger.info('targetuser edit success');
        // 通知送付
        event.sender.send('edit_finish', '');

      } else {
        // エラー送付
        errOperate('ユーザ編集に失敗しました', event);
      }

    } else {
      // エラー送付
      errOperate('配信編集に失敗しました', event);
    }

  } catch (e: unknown) {
    // エラー型
    if (e instanceof Error) {
      // エラー処理
      errOperate(e.message, event);
    }
  }
});

// 削除
ipcMain.on('delete', async (event, arg) => {
  try {
    logger.info('ipc: delete mode');
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
      detail: `${targetname} を削除してよろしいですか？`,  // 説明文
    };
    // ダイアログ表示
    const selected: number = dialog.showMessageBoxSync(options);

    // キャンセルなら離脱
    if (selected == 1 || selected == -1) {
      // 結果返し
      errOperate('キャンセルしました', event);
      return false;

    } else {
      // アップデート処理
      const targetUp: string = await updateDB(targettable, 'usable', 0, 'id', targetId);

      // アップデート失敗
      if (targetUp == 'error') {
        logger.error(`update error for ${targettable}.`);

      } else {
        logger.info(`update completed for ${targettable}.`);
      }

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
          errOperate('配信予約がありません', event);

        } else {
          logger.info('broadcast select success');
          // 結果返し
          event.sender.send('delete_finish', broadcastData);
        }

      } else {
        // 結果返し
        event.sender.send('delete_finish', '');
      }
    }

  } catch (e: unknown) {
    // エラー型
    if (e instanceof Error) {
      // エラー処理
      errOperate(e.message, event);
    }
  }
});

/* 汎用処理 */
// 画像選択
ipcMain.on('upload', async (event, _) => {
  try {
    logger.info('ipc: upload mode');
    // 画像ファイルパス取得
    const filepath: string = await getImageFile();
    // 画像ファイルパス返し
    event.sender.send('image', filepath);

  } catch (e: unknown) {
    // エラー型
    if (e instanceof Error) {
      // エラー処理
      errOperate(e.message, event);
    }
  }
});

// CSV取得
ipcMain.on('csv', async (event, _) => {
  try {
    logger.info('ipc: csv mode');
    // エラーフラグ
    let errFlg: boolean = false;
    // CSVデータ取得
    const result: any = await getCsvData();

    // ユーザID一覧返し
    Promise.allSettled(
      // 結果ループ
      result.record[0].map(async (rec: any): Promise<void> => {
        return new Promise((resolve, reject) => {
          // ユーザIDが33桁でない
          if (rec.length != 33 && rec != '') {
            // 正常
            errFlg = true;
            resolve();

          } else {
            // エラー対象
            reject();
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
        errOperate(errMsg, event);
      }
    });

  } catch (e: unknown) {
    // エラー型
    if (e instanceof Error) {
      // エラー処理
      errOperate(e.message, event);
    }
  }
});

// メッセージ表示
ipcMain.on('showmessage', (event, arg) => {
  try {
    logger.info('ipc: showmessage mode');
    // メッセージ表示
    showmessage(arg.type, arg.message);

  } catch (e: unknown) {
    // エラー型
    if (e instanceof Error) {
      // エラー処理
      errOperate(e.message, event);
    }
  }
});

// エラー
ipcMain.on('error', async (event, arg) => {
  // エラー処理
  errOperate(arg, event);
});

/*
 汎用関数
*/
// broadcastDB登録
const dbBroadcastReg = (arg: any, flg: boolean): Promise<string> => {
  return new Promise(async (resolve1, reject1) => {
    try {
      logger.info('func: dbBroadcastReg mode');
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
        // 初回以外
        throw new Error('配信登録に失敗しました');

      } else {
        logger.info('insert to broadcast success');

        // 対象ID
        const targetBroadcastId: number = tmpBdReg.insertId;

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
            userIdArray.map(async (usr: any): Promise<void> => {
              return new Promise(async (resolve2, reject2) => {
                try {
                  // 格納値
                  const values: string[] = [targetBroadcastId, usr, 1];
                  // 配信対象DB格納
                  const tmpTgReg: any = await insertDB('targetuser', targetColumns, values);

                  // エラー
                  if (tmpTgReg == 'error') {
                    logger.info('targetuser insertion error');
                    reject2();

                  } else {
                    logger.info(`initial insertion to targetuser completed for ${broadcastname}.`);
                    resolve2();
                  }

                } catch (err: unknown) {
                  // エラー型
                  if (err instanceof Error) {
                    // エラー
                    logger.error(err.message);
                    reject2();
                  }
                }
              });
            })
          );
        }

        if (flg) {
          // 戻り値
          resolve1(String(targetBroadcastId));

        } else {
          // 戻り値
          resolve1('success');
        }
      }

    } catch (e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        logger.error(e.message);
        reject1(('error'));
      }
    }
  });
}

// targetuserDB登録
const dbTargetuserReg = (arg: any): Promise<string> => {
  return new Promise(async (resolve1, reject1) => {
    try {
      logger.info('func: dbTargetuserReg mode');
      // データあり
      if (arg) {
        await Promise.allSettled(
          // 結果ループ
          arg.map(async (ln: any): Promise<void> => {
            return new Promise(async (resolve2, reject2) => {
              try {
                // データあり
                if (ln.value.userid) {
                  // 正常データのみ
                  if (ln.value.result == 'success') {
                    // アップデート処理
                    const targetUp1: string = await updateDB('targetuser', 'success', 1, 'id', ln.value.userid);

                    // アップデート失敗
                    if (targetUp1 == 'error') {
                      logger.error('update success error for targetuser');

                    } else {
                      logger.info('update completed for targetuser');
                    }

                  } else {
                    // アップデート処理
                    const targetUp2: string = await updateDB('targetuser', 'success', 0, 'id', ln.value.userid);

                    // アップデート失敗
                    if (targetUp2 == 'error') {
                      logger.error('update fail error for targetuser');

                    } else {
                      logger.info('update fail completed for targetuser');
                    }
                  }

                }
                // 戻り値
                resolve2();

              } catch (err: unknown) {
                // エラー型
                if (err instanceof Error) {
                  // エラー
                  logger.error(err.message);
                  reject2();
                }
              }
            });
          })
        );
        // 戻り値
        resolve1('success');
      }

    } catch (e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        logger.error(e.message);
        reject1(`${e.message}`);
      }
    }
  });
}

// targetuserDB更新
const editTargetuserReg = async (broadcastId: number, userIds: string[]): Promise<string> => {
  return new Promise(async (resolve1, reject1) => {
    try {
      logger.info('func: editTargetuserReg mode');
      // 配信対象カラム
      const targetColumns: string[] = [
        'broadcast_id',
        'userid',
        'usable',
      ];

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
        logger.info('対象ユーザがいません');

      } else {

        // 対象ユーザID
        const allUserLists = targetuserData.map((usr: any) => usr.userid);
        // CSVのみにあるデータ
        const onlyCsvArr = userIds.filter((i: any) => allUserLists.indexOf(i) == -1);
        // DBのみにあるデータs
        const onlyDbArray = allUserLists.filter((j: any) => userIds.indexOf(j) == -1);

        // CSVのみのデータを
        await Promise.allSettled(
          // プロミス返し
          onlyCsvArr.map(async (usr: any): Promise<void> => {
            return new Promise(async (resolve2, reject2) => {
              try {
                // データあり
                if (usr) {
                  // 格納値
                  const values: string[] = [broadcastId, usr, 1];
                  // アップデート処理
                  const tmpTgReg: any = await insertDB('targetuser', targetColumns, values);

                  // エラー
                  if (tmpTgReg == 'error') {
                    logger.info('targetuser insertion error');
                    reject2();

                  } else {
                    logger.info(`initial insertion to targetuser completed for ${broadcastId}.`);
                    resolve2();
                  }

                } else {
                  // エラー返し
                  reject2('error');
                }

              } catch (err: unknown) {
                // エラー型
                if (err instanceof Error) {
                  // エラー
                  logger.error(err.message);
                  reject2();
                }
              }
            });
          })
        );

        // DBのみにあるデータ
        await Promise.allSettled(
          // プロミス返し
          onlyDbArray.map(async (usr: any): Promise<void> => {
            return new Promise(async (resolve3, reject3) => {
              try {
                // データあり
                if (usr) {
                  // 配信対象DB格納
                  const tmpTgUp: any = await updateDoubleDB('targetuser', 'usable', 0, 'broadcast_id', broadcastId, 'userid', usr);

                  // エラー
                  if (tmpTgUp == 'error') {
                    logger.error('targetuser insertion error');
                    reject3();

                  } else {
                    logger.info(`initial insertion to targetuser completed for ${broadcastId}.`);
                    resolve3();
                  }

                } else {
                  // エラー返し
                  reject3('error');
                }
              } catch (err: unknown) {
                // エラー型
                if (err instanceof Error) {
                  // エラー
                  logger.error(err.message);
                  reject3();
                }
              }
            });
          })
        );
        // 値返し
        resolve1('success');
      }

    } catch (e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        logger.error(e.message);
        reject1('error');
      }
    }
  });
}

// broadcastDB編集
const dbBroadcastEdit = (arg: any): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      logger.info('func: dbBroadcastEdit mode');
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
      const broadcastData: any = await selectDB(
        'broadcast',
        'id',
        broadcastID,
        false,
      );

      // エラー
      if (broadcastData == 'error') {
        logger.error('broadcast search error');

      } else {
        logger.info('broadcast select success');
        // プラン不一致
        if (broadcastData.plan_id != planId) {
          // アップデート処理
          const planUp: string = await updateDB('broadcast', 'plan_id', planId, 'id', broadcastID);

          // アップデート失敗
          if (planUp == 'error') {
            logger.error('update error for plan');

          } else {
            logger.info('update completed for plan');
          }
        }
        // チャンネル不一致
        if (broadcastData.channel_id != channelId) {
          // アップデート処理
          const channelUp: string = await updateDB('broadcast', 'channel_id', channelId, 'id', broadcastID);

          // アップデート失敗
          if (channelUp == 'error') {
            logger.error('update error for channel');

          } else {
            logger.info('update completed for channel');
          }
        }
        // 送信時間不一致
        if (broadcastData.sendtime != broadcastTime) {
          // アップデート処理
          const broadcastUp: string = await updateDB('broadcast', 'sendtime', broadcastTime, 'id', broadcastID);

          // アップデート失敗
          if (broadcastUp == 'error') {
            logger.error('update error for broadcast');

          } else {
            logger.info('update completed for broadcast');
          }
        }
        // 更新完了
        logger.info('broadcast update completed for targetuser');
        resolve('success');
      }

    } catch (e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        logger.error(e.message);
        reject('error');
      }
    }
  });
}

// LINE配信
const sendLineMessage = (arg: any, event?: any): Promise<any> => {
  return new Promise(async (resolve1, reject1) => {
    try {
      logger.info('func: sendLineMessage mode');
      // 成功数
      let successCounter: number = 0;
      // 失敗数
      let failCounter: number = 0;
      // プランID
      const planId: number = Number(arg.plan);
      // チャンネルID
      const channelId: number = Number(arg.channel);
      // ユーザID
      const userIdArray: any = arg.users ?? [];
      // 合計数
      const totalUsers: number = userIdArray.length;
      // エラー
      if (totalUsers == 0) {
        reject1('error');

      } else {
        if (event) {
          // 配信方法一覧
          event.sender.send('total', totalUsers);
        }
        logger.info('channel select success');
      }

      // チャンネル抽出
      const channelData: any = await selectDB(
        'channel',
        'id',
        channelId,
        false,
      );
      // エラー
      if (channelData == 'error') {
        reject1('error');

      } else {
        logger.info('channel select success');
      }

      // トークン
      const token: string = channelData[0].token;

      // プラン抽出
      const planData: any = await selectDB(
        'plan',
        'id',
        planId,
        false,
      );

      // エラー
      if (planData == 'error') {
        reject1('error');

      } else {
        logger.info('plan select success');
      }

      // プラン名
      const title: string = planData[0].planname;
      // 本文
      const content: string = planData[0].text;
      // 画像URL
      const imgurl: string = planData[0].imageurl;
      // LINE登録
      const lineMethod: string = String(planData[0].linemethod_id);
      // 画像幅
      const imageWidth: string = String(planData[0].imgwidth);
      // 画像高
      const imageHeight: string = String(planData[0].imgheight);

      // データあり
      if (userIdArray) {
        // 結果
        const res: any = await Promise.allSettled(
          userIdArray.map(async (usr: any): Promise<any> => {
            return new Promise(async (resolve2, reject2) => {
              try {
                // データあり
                if (usr) {
                  // メッセージ
                  const messageResult: string = await makeMessage(usr, token, title, content, imgurl, lineMethod, imageWidth, imageHeight);

                  // 結果あり
                  if (messageResult) {
                    successCounter++;
                    // メッセージ送信
                    resolve2({
                      result: messageResult,
                      userid: usr,
                    });

                  } else {
                    failCounter++;
                    // メッセージ送信
                    resolve2({
                      result: 'error',
                      userid: usr,
                    });
                  }
                }

              } catch (err: unknown) {
                // エラー型
                if (err instanceof Error) {
                  // エラー
                  logger.error(err.message);
                  reject2(resolve2({
                    result: '',
                    userid: '',
                  }));
                }
              }
            });
          })
        );

        if (event) {
          // 成功進捗更新
          event.sender.send('success', successCounter);
          // 失敗進捗更新
          event.sender.send('fail', failCounter);
        }
        // 値返し
        resolve1(res);

      } else {
        reject1('error');
      }


    } catch (e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        logger.error(e.message);
        reject1('error');
      }
    }
  });
}

// メッセージ作成
const makeMessage = (uid: string, token: string, title?: string, contentText?: string, imgurl?: any, planno?: string, width?: string, height?: string): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      logger.info('func: makeMessage mode');
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
          logger.info('1: text mode');
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
          logger.info('2: image mode');
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
                    aspectRatio: `${width}:${height}`, // 画像縦横比
                  }
                }
              }
            ],
          });
          break;

        // 選択肢
        case '3':
          logger.info('3: button mode');
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
          logger.info('4: image_carousel mode');
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
          logger.info(`Sorry, we are out of ${planno}.`);
      }

      // 配信
      broadcastResult = await makeBroadcast(headers, dataString);

      // 可否
      if (broadcastResult == 'success') {
        resolve('success');

      } else {
        reject('error');
      }

    } catch (e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        logger.error(e.message);
        reject('error');
      }
    }
  });
}

// 画像ファイル選択
const getImageFile = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      logger.info('func: getImageFile mode');
      // ファイル選択ダイアログ
      dialog.showOpenDialog({
        properties: ['openFile'], // ファイル
        title: CHOOSE_FILE, // ファイル選択
        defaultPath: '.', // ルートパス
        filters: [
          { name: 'jpg|png', extensions: ['jpg', 'jpeg', 'png'] } // jpg|pngのみ
        ],

      }).then(async (result) => {
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
          // エラー
          logger.error(err.message);
        }
      });

    } catch (e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        logger.error(e.message);
        reject(`${e.message}`);
      }
    }
  });
}

// CSV抽出
const getCsvData = (): Promise<recordType | string> => {
  return new Promise((resolve, reject) => {
    try {
      logger.info('func: getCsvData mode');
      // ファイル選択ダイアログ
      dialog.showOpenDialog({
        properties: ['openFile'], // ファイル
        title: CHOOSE_FILE, // ファイル選択
        defaultPath: '.', // ルートパス
        filters: [
          { name: 'csv(Shif-JIS)', extensions: ['csv'] }, // csvのみ
        ],

      }).then(async (result) => {
        // ファイルパス
        const filenames: string[] = result.filePaths;

        // エラー
        logger.info(`you got csv named ${filenames[0]}.`);

        // ファイルあり
        if (filenames.length) {
          // ファイル読み込み
          fs.readFile(filenames[0], async (_, data) => {
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
          // エラー
          logger.error(err.message);
        }
      });

    } catch (e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        logger.error(e.message);
        reject(`${e.message}`);
      }
    }
  });
}

// LINE配信
const makeBroadcast = (headers: Headers, dataString?: string): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      logger.info('func: makeBroadcast mode');
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

    } catch (e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        logger.error(e.message);
        reject(`${e.message}`);
      }
    }
  });
}

// ファイルアップロード
const uploadFile = async (localpath: string): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      logger.info('func: uploadFile mode');
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
      logger.info('sftp closed');
      // 完了
      resolve('success');

    } catch (e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        logger.error(e.message);
        reject(`${e.message}`);
      }
    }
  });
}

// スケジューリング
const initialSheduleCron = async (): Promise<string> => {
  return new Promise(async (resolve1, reject1) => {
    try {
      logger.info('func: initialSheduleCron mode');
      // 配信抽出
      const broadcastData: any = await selectDB(
        'broadcast',
        'usable',
        1,
        true,
      );

      // エラー
      if (broadcastData != 'error') {
        logger.info('broadcast select success');
        // resolve返し
        await Promise.allSettled(
          // プロミス返し
          broadcastData.map(async (broadcast: any): Promise<void> => {
            return new Promise(async (resolve2, reject2) => {
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

                  logger.info('select from targetuser db');

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
                    logger.info('対象ユーザがいません');

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
                    cron.schedule(`${minute} ${hour} ${day} ${month} *`, async () => {
                      logger.info('reserved broadcast started');
                      // LINE配信
                      const lineResult: any = await sendLineMessage(reserveOption);
                      // 
                      if (lineResult == 'error') {
                        reject2();

                      } else {
                        // DB登録
                        const dbUserResult: string = await dbTargetuserReg(lineResult);
                        // 結果
                        if (dbUserResult == 'success') {
                          // メッセージ
                          const successMessage: string = 'broadcast completed';
                          // 成功
                          logger.info(successMessage);
                          resolve2();


                        } else {
                          // メッセージ
                          const failedMessage: string = 'broadcast failed';
                          // 失敗
                          logger.error(failedMessage);
                          reject2();
                        }
                      }
                    });
                    // 開始日時
                    logger.info(`running on ${month} /${day} ${hour}:${minute}`);
                  }
                }

              } catch (err: unknown) {
                // エラー型
                if (err instanceof Error) {
                  // エラー
                  logger.error(err.message);
                  reject2();
                }
              }
            });
          })
        );
        // 値返し
        resolve1('success');

      } else {
        // 初回以外
        throw new Error('配信予約はありません');
      }

    } catch (e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        logger.error(e.message);
        reject1('error');
      }
    }
  });
}

// スケジューリング
const singleSheduleCron = async (id: string): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      logger.info('func: singleSheduleCron mode');
      // 配信抽出
      const broadcastData: any = await selectDoubleDB(
        'broadcast',
        'id',
        Number(id),
        'usable',
        1,
        true,
      );

      // エラー
      if (broadcastData != 'error') {
        logger.info('broadcast select success');

        // データあり
        if (broadcastData) {
          // 配信ID
          const broadcastId: number = broadcastData[0].id;
          // プランID
          const planId: number = broadcastData[0].plan_id;
          // チャンネルID
          const channelId: number = broadcastData[0].channel_id;
          // 送信日時
          const sendDate: Date = new Date(broadcastData[0].sendtime);
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

          logger.info('select from targetuser db');

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
            logger.info('対象ユーザがいません');

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
            cron.schedule(`${minute} ${hour} ${day} ${month} *`, async () => {
              logger.info('reserved broadcast started');
              // LINE配信
              const lineResult: any = await sendLineMessage(reserveOption);
              // 
              if (lineResult == 'error') {
                reject();

              } else {
                // DB登録
                const dbUserResult: string = await dbTargetuserReg(lineResult);
                // 結果
                if (dbUserResult == 'success') {
                  // メッセージ
                  const completeMessage: string = 'broadcast success';
                  // 成功
                  logger.info(completeMessage);

                } else {
                  // メッセージ
                  const failedMessage: string = 'broadcast failed';
                  // 失敗
                  logger.error(failedMessage);
                }
              }
            });
            resolve('success');
            // 開始日時
            logger.info(`running on ${month} /${day} ${hour}:${minute}`);
          }
        }

      } else {
        logger.error('broadcast select error');
        reject('error');
      }

    } catch (e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        logger.error(e.message);
        reject('error');
      }
    }
  });
}

// - database operation
// * select
// select all from table
const selectDB = (table: string, column: any, value: any, newflg: boolean): Promise<any> => {
  return new Promise(async (resolve, reject) => {
    try {
      logger.info('db: selectDB mode');
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

    } catch (e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        logger.error(e.message);
        reject('error');
      }
    }
  });
}

// select all from table
const selectDoubleDB = (table: string, column1: any, value1: any, column2: any, value2: any, newflg: boolean): Promise<any> => {
  return new Promise(async (resolve, reject) => {
    try {
      logger.info('db: selectDoubleDB mode');
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

    } catch (e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        logger.error(e.message);
        reject('error');
      }
    }
  });
}

// update table
const updateDB = (table: string, setcol: any, setval: any, selcol: any, selval: any): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      logger.info('db: updateDB mode');
      // query
      await myDB.doInquiry('UPDATE ?? SET ?? = ? WHERE ?? = ?', [
        table,
        setcol,
        setval,
        selcol,
        selval,
      ]);
      // resolve
      resolve('success');

    } catch (e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        logger.error(e.message);
        reject('error');
      }
    }
  });
}

// update doubletable
const updateDoubleDB = (table: string, setcol: any, setval: any, selcol1: any, selval1: any, selcol2: any, selval2: any): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      logger.info('db: updateDoubleDB mode');
      // query
      await myDB.doInquiry('UPDATE ?? SET ?? = ? WHERE ?? = ? AND ?? = ?', [
        table,
        setcol,
        setval,
        selcol1,
        selval1,
        selcol2,
        selval2,
      ]);
      // resolve
      resolve('success');

    } catch (e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        logger.error(e.message);
        reject('error');
      }
    }
  });
}

// * insert
const insertDB = (table: string, columns: any, values: any): Promise<any> => {
  return new Promise(async (resolve, reject) => {
    try {
      logger.info('db: insertDB mode');
      // query
      await myDB.doInquiry('INSERT INTO ??(??) VALUES (?)', [table, columns, values]);
      // resolve
      resolve(myDB.getValue);

    } catch (e: unknown) {
      // エラー型
      if (e instanceof Error) {
        // エラー
        logger.error(e.message);
        reject('error');
      }
    }
  });
}

// エラー処理
const errOperate = (e: any, event: any): void => {
  // エラー型
  if (e instanceof Error) {
    // エラー
    logger.error(`${e.message})`);
    // 配信方法一覧返し
    event.sender.send('error', `${e.message})`);
  }
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
