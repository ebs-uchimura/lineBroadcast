/**
 * sql.ts
 *
 * name：SQL
 * function：SQL operation
 **/

// define modules
import * as mysql from 'mysql2';

// SQL class
class SQL {

  static pool: any; // sql pool
  static obj: Object; // result

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
    // result object
    SQL.obj;
  }

  // getter
  get getValue() {
    // empty
    if (SQL.isEmpty(SQL.obj)) {
      // return error
      return "error";

    } else {
      // return result
      return SQL.obj;
    }
  }

  // inquire
  doInquiry = async (sql: string, inserts: string[]) => {
    // make query
    const qry = mysql.format(sql, inserts);
    // connect ot mysql
    const promisePool = SQL.pool.promise(); // spread pool
    const [rows, _] = await promisePool.query(qry); // query name
    // result object
    SQL.obj = rows;
  }

  // empty or not
  static isEmpty(obj: Object) {
    // check whether blank
    return !Object.keys(obj).length;
  }

}

// export module
export default SQL;