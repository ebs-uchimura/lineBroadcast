/**
 * sql.ts
 *
 * name：SQL
 * function：SQL operation
 **/

// define modules
import * as mysql from 'mysql2'; // mysql
import * as path from 'path'; // path
import logger from 'electron-log'; // Logger

// set logger
const setLogConfig = (): void => {
    // get now date
    const prefix: string = getNowDate(0);
    // set logger filename
    logger.transports.file.fileName = 'log.log';
    // filename
    const curr: string = logger.transports.file.fileName;
    // log file path
    logger.transports.file.resolvePathFn = () => path.join(__dirname, `../public/logs/${prefix}_${curr}`);
}

// select arguments
interface selectargs {
    table: string;
    columns: string[];
    values: any[];
    limit: null | string;
    offset: null | string;
    spantable: null | string;
    spancol: null | string;
    span: null | string;
}

// join arguments
interface joinargs {
    table: string;
    columns: string[];
    values: any[];
    jointable: string;
    joincolumns: string[];
    joinvalues: any[];
    joinid1: string;
    joinid2: string;
    limit: null | string;
    offset: null | string;
    spantable: null | string;
    spancol: null | string;
    span: null | string;
}

// update arguments
interface uploadargs {
    table: string;
    setcol: string;
    setval: string;
    selcol: string;
    selval: string;
}

// insert arguments
interface insertargs {
    table: string;
    columns: string[];
    values: any[];
}

// SQL class
class SQL {

    static pool: any; // sql pool

    // construnctor
    constructor(host: string, user: string, pass: string, port: number, db: string) {
        // DB config
        SQL.pool = mysql.createPool({
            host: host, // host
            user: user, // username
            password: pass, // password
            database: db, // db name
            port: port, // port number
            waitForConnections: true, // wait for conn
            idleTimeout: 1000000, // timeout(ms)
            insecureAuth: true // allow insecure
        });
        // initialize logger
        setLogConfig();
    }

    // inquire
    doInquiry = async (sql: string, inserts: string[]): Promise<string | Object[]> => {
        return new Promise(async (resolve, reject) => {
            try {
                // make query
                const qry = mysql.format(sql, inserts);
                // connect ot mysql
                const promisePool = SQL.pool.promise(); // spread pool
                const [rows, _] = await promisePool.query(qry); // query name

                // empty
                if (SQL.isEmpty(rows)) {
                    // return error
                    reject('error');

                } else {
                    // result object
                    resolve(rows);
                }

            } catch (e: unknown) {
                // error
                if (e instanceof Error) {
                    // error
                    logger.error(e.message);
                    reject('error');
                }
            }
        });
    }

    // select db
    selectDB = async (arg: selectargs): Promise<string | Object[]> => {
        return new Promise(async (resolve, reject) => {
            try {
                // query string
                let queryString: string;
                // array
                let placeholder: any[];

                // query
                queryString = 'SELECT * FROM ??';
                // placeholder
                placeholder = [arg.table];


                // if column not null
                if (arg.columns.length > 0 && arg.values.length > 0) {
                    // add where phrase
                    queryString += ' WHERE';

                    // loop for array
                    for (let i: number = 0; i < arg.columns.length; i++) {
                        // add in phrase
                        queryString += ' ?? IN (?)';
                        // push column
                        placeholder.push(arg.columns[i]);
                        // push value
                        placeholder.push(arg.values[i]);

                        // other than last one
                        if (i < arg.columns.length - 1) {
                            // add and phrase
                            queryString += ' AND';
                        }
                    }
                }

                // if column not null
                if (arg.spantable && arg.spancol && arg.span) {
                    // query
                    queryString += ' AND ??.?? > date(current_timestamp - interval ? day)';
                    // push column
                    placeholder.push(arg.spantable);
                    // push column
                    placeholder.push(arg.spancol);
                    // push limit
                    placeholder.push(arg.span);
                }

                // if limit exists
                if (arg.limit) {
                    // query
                    queryString += ' LIMIT ?';
                    // push limit
                    placeholder.push(arg.limit);
                }

                // if offset exists
                if (arg.offset) {
                    // query
                    queryString += ' OFFSET ?';
                    // push offset
                    placeholder.push(arg.offset);
                }

                // do query
                await this.doInquiry(queryString, placeholder).then((result: any) => {
                    resolve(result);

                }).catch((err) => {
                    // error
                    if (err instanceof Error) {
                        // error
                        logger.error(err.message);
                        reject(err);
                    }
                });

            } catch (e: unknown) {
                // error
                if (e instanceof Error) {
                    // error
                    logger.error(e.message);
                    reject('error');
                }
            }
        });
    }

    // select db with join
    selectJoinDB = async (arg: joinargs): Promise<string | Object[]> => {
        return new Promise(async (resolve, reject) => {
            try {
                // query string
                let queryString: string;
                // array
                let placeholder: any[];

                // query
                queryString = 'SELECT * FROM ??';
                // placeholder
                placeholder = [arg.table];


                // if column not null
                if (arg.columns.length > 0 && arg.values.length > 0) {
                    // add where phrase
                    queryString += ' WHERE';

                    // loop for array
                    for (let i: number = 0; i < arg.columns.length; i++) {
                        // add in phrase
                        queryString += ' ?? IN (?)';
                        // push column
                        placeholder.push(arg.columns[i]);
                        // push value
                        placeholder.push(arg.values[i]);

                        // other than last one
                        if (i < arg.columns.length - 1) {
                            // add and phrase
                            queryString += ' AND';
                        }
                    }
                }

                // if column not null
                if (arg.spantable && arg.spancol && arg.span) {
                    // query
                    queryString += ' AND ??.?? > date(current_timestamp - interval ? day)';
                    // push column
                    placeholder.push(arg.spantable);
                    // push column
                    placeholder.push(arg.spancol);
                    // push limit
                    placeholder.push(arg.span);
                }

                // if limit exists
                if (arg.limit) {
                    // query
                    queryString += ' LIMIT ?';
                    // push limit
                    placeholder.push(arg.limit);
                }

                // if offset exists
                if (arg.offset) {
                    // query
                    queryString += ' OFFSET ?';
                    // push offset
                    placeholder.push(arg.offset);
                }

                // do query
                await this.doInquiry(queryString, placeholder).then((result: any) => {
                    resolve(result);

                }).catch((err) => {
                    // error
                    if (err instanceof Error) {
                        // error
                        logger.error(err.message);
                        reject(err);
                    }
                });

            } catch (e: unknown) {
                // error
                if (e instanceof Error) {
                    // error
                    logger.error(e.message);
                    reject('error');
                }
            }
        });
    }

    // update
    updateDB = async (args: uploadargs): Promise<string | Object[]> => {
        return new Promise(async (resolve, reject) => {
            try {
                logger.info('db: updateDB mode');

                // query string
                const queryString: string = 'UPDATE ?? SET ?? = ? WHERE ?? = ?';
                // array
                const placeholder: any[] = [
                    args.table,
                    args.setcol,
                    args.setval,
                    args.selcol,
                    args.selval,
                ];

                // do query
                await this.doInquiry(queryString, placeholder).then((result: any) => {
                    resolve(result);

                }).catch((err) => {
                    // error
                    if (err instanceof Error) {
                        // error
                        logger.error(err.message);
                        reject(err);
                    }
                });

            } catch (e: unknown) {
                // error
                if (e instanceof Error) {
                    // error
                    logger.error(e.message);
                    reject('error');
                }
            }
        });
    }

    // insert
    insertDB = async (args: insertargs): Promise<string | Object[]> => {
        return new Promise(async (resolve, reject) => {
            try {
                logger.info('db: insertDB mode');
                // query string
                const queryString: string = 'INSERT INTO ??(??) VALUES (?)';
                // array
                const placeholder: any[] = [args.table, args.columns, args.values];
                // do query
                await this.doInquiry(queryString, placeholder).then((result: any) => {
                    resolve(result);

                }).catch((err) => {
                    // error
                    if (err instanceof Error) {
                        // error
                        logger.error(err.message);
                        reject(err);
                    }
                });

            } catch (e: unknown) {
                // error
                if (e instanceof Error) {
                    // error
                    logger.error(e.message);
                    reject('error');
                }
            }
        });
    }

    // empty or not
    static isEmpty(obj: Object) {
        // check whether blank
        return !Object.keys(obj).length;
    }

}

// get now date
const getNowDate = (diff: number): string => {
    // now
    const d: Date = new Date();
    // combine date string
    const prefix: string = d.getFullYear() +
        ('00' + (d.getMonth() + 1)).slice(-2) +
        ('00' + (d.getDate() + diff)).slice(-2);
    return prefix;
}

// export module
export default SQL;