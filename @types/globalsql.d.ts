/**
 * globalsql.d.ts
 **
 * function：グローバル宣言
**/

export { };

declare global {
    // count arguments
    interface countargs {
        table: string;
        columns: string[];
        values: any[];
        fields?: string[];
    }

    // select arguments
    interface selectargs {
        table: string;
        columns: string[];
        values: any[];
        limit?: number;
        offset?: number;
        spancol?: string;
        span?: number;
        order?: string;
        reverse?: boolean;
        fields?: string[];
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
        limit?: number;
        offset?: number;
        spantable: string;
        spancol?: string;
        span?: number;
        order?: string;
        ordertable?: string;
        reverse?: boolean;
        fields?: string[];
    }

    // update arguments
    interface updateargs {
        table: string;
        setcol: string[];
        setval: any;
        selcol: string;
        selval: any;
    }

    // insert arguments
    interface insertargs {
        table: string;
        columns: string[];
        values: any[];
    }
}