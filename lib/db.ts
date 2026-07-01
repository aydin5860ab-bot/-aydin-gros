import fs from 'fs';
import path from 'path';

const BASE_DIR = 'c:/AYDIN GROS';

function readJsonFallback<T>(coll: string, tenantId: string): T[] {
  const dbFile = path.join(BASE_DIR, `db_${coll}.json`);
  if (fs.existsSync(dbFile)) {
    try {
      const fileContent = fs.readFileSync(dbFile, 'utf8');
      const parsed = JSON.parse(fileContent);
      if (Array.isArray(parsed)) {
        return parsed.filter((item: any) => item && item.tenant_id === tenantId);
      }
    } catch (e) {
      console.error(`[DB Fallback Read Error] File: ${dbFile}`, e);
    }
  }
  return [];
}

function writeJsonFallback<T>(coll: string, data: T[], tenantId: string): void {
  const dbFile = path.join(BASE_DIR, `db_${coll}.json`);
  try {
    let allData: any[] = [];
    if (fs.existsSync(dbFile)) {
      try {
        allData = JSON.parse(fs.readFileSync(dbFile, 'utf8')) || [];
      } catch (_) {
        allData = [];
      }
    }
    
    allData = allData.filter((item: any) => item && item.tenant_id !== tenantId);
    allData.push(...data);

    fs.writeFileSync(dbFile, JSON.stringify(allData, null, 2), 'utf8');
  } catch (e: any) {
    console.error(`[DB Fallback Write Error] File: ${dbFile}`, e.message);
  }
}

export async function readCollection<T>(coll: string, tenantId: string, supabase: any): Promise<T[]> {
  // FORCE_JSON_DB is an explicit operator opt-in (store node / offline mode) and is
  // honored in every NODE_ENV — same policy as the mock client guard in app/api/db/route.ts.
  // Only the *implicit* fallback below (Supabase error path) stays disabled in production.
  if (process.env.FORCE_JSON_DB === 'true') {
    return readJsonFallback<T>(coll, tenantId);
  }

  try {
    const { data, error } = await supabase
      .from(coll)
      .select('*')
      .eq('tenant_id', tenantId);

    if (error) {
      throw error;
    }
    return data || [];
  } catch (err: any) {
    if (process.env.NODE_ENV === 'production') {
      throw err;
    }
    return readJsonFallback<T>(coll, tenantId);
  }
}

export async function writeCollection<T>(coll: string, data: T[], tenantId: string, supabase: any): Promise<void> {
  // Explicit operator opt-in — honored in every NODE_ENV (see readCollection note).
  if (process.env.FORCE_JSON_DB === 'true') {
    writeJsonFallback<T>(coll, data, tenantId);
    return;
  }

  try {
    const { error } = await supabase
      .from(coll)
      .upsert(data, { onConflict: 'id' });

    if (error) {
      throw error;
    }
  } catch (err: any) {
    if (process.env.NODE_ENV === 'production') {
      throw err;
    }
    writeJsonFallback<T>(coll, data, tenantId);
  }
}

export function createMockSupabaseClient(tenantId: string) {
  return {
    from: (coll: string) => {
      const dbFile = path.join(BASE_DIR, `db_${coll}.json`);
      let data: any[] = [];
      const readData = () => {
        if (fs.existsSync(dbFile)) {
          try {
            data = JSON.parse(fs.readFileSync(dbFile, 'utf8')) || [];
          } catch (_) {
            data = [];
          }
        }
      };
      readData();
      const tenantData = data.filter((x: any) => x && x.tenant_id === tenantId);

      let lastResult: any = tenantData;
      let pendingOp: { type: 'insert' | 'update'; fields?: any; rows?: any } | null = null;

      const builder: any = {
        then: (onfulfilled: any) => {
          const op = pendingOp;
          if (op) {
            if (op.type === 'insert') {
              const arr = Array.isArray(op.rows) ? op.rows : [op.rows];
              const nowStr = new Date().toISOString();
              const newRows = arr.map(r => ({
                id: r.id || require('crypto').randomUUID(),
                created_at: r.created_at || nowStr,
                updated_at: r.updated_at || nowStr,
                ...r,
                tenant_id: tenantId
              }));
              if (fs.existsSync(dbFile)) {
                const raw = JSON.parse(fs.readFileSync(dbFile, 'utf8')) || [];
                raw.push(...newRows);
                fs.writeFileSync(dbFile, JSON.stringify(raw, null, 2), 'utf8');
              } else {
                fs.writeFileSync(dbFile, JSON.stringify(newRows, null, 2), 'utf8');
              }
              lastResult = newRows[0];
            } else if (op.type === 'update') {
              if (fs.existsSync(dbFile)) {
                const raw = JSON.parse(fs.readFileSync(dbFile, 'utf8')) || [];
                const lrArr = Array.isArray(lastResult) ? lastResult : [lastResult];
                raw.forEach((row: any) => {
                  const match = lrArr.some((lr: any) => {
                    if (lr && lr.id && row.id && lr.id === row.id) return true;
                    if (lr && lr.product_legacy_id && row.product_legacy_id && lr.product_legacy_id === row.product_legacy_id && lr.branch_id === row.branch_id) return true;
                    return false;
                  });
                  if (match) {
                    Object.assign(row, op.fields);
                  }
                });
                fs.writeFileSync(dbFile, JSON.stringify(raw, null, 2), 'utf8');
              }
            }
            pendingOp = null;
          }
          return Promise.resolve(onfulfilled({ data: lastResult, error: null }));
        },
        select: () => builder,
        eq: (col: string, val: any) => {
          if (Array.isArray(lastResult)) {
            lastResult = lastResult.filter((x: any) => {
              if (!x) return false;
              const val1 = x[col];
              const val2 = x[col.replace(/([A-Z])/g, "_$1").toLowerCase()];
              return String(val1 !== undefined ? val1 : val2) === String(val);
            });
          }
          return builder;
        },
        is: () => builder,
        not: () => builder,
        in: (col: string, vals: any[]) => {
          if (Array.isArray(lastResult)) {
            const strVals = vals.map(String);
            lastResult = lastResult.filter((x: any) => {
              if (!x) return false;
              const val1 = x[col];
              const val2 = x[col.replace(/([A-Z])/g, "_$1").toLowerCase()];
              return strVals.includes(String(val1 !== undefined ? val1 : val2));
            });
          }
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        range: (from: number, to: number) => {
          if (Array.isArray(lastResult)) {
            lastResult = lastResult.slice(from, to + 1);
          }
          return builder;
        },
        gte: (col: string, val: any) => {
          if (Array.isArray(lastResult)) {
            lastResult = lastResult.filter((x: any) => {
              if (!x) return false;
              const actualVal = x[col] ?? x[col.replace(/([A-Z])/g, "_$1").toLowerCase()];
              return actualVal >= val;
            });
          }
          return builder;
        },
        lte: (col: string, val: any) => {
          if (Array.isArray(lastResult)) {
            lastResult = lastResult.filter((x: any) => {
              if (!x) return false;
              const actualVal = x[col] ?? x[col.replace(/([A-Z])/g, "_$1").toLowerCase()];
              return actualVal <= val;
            });
          }
          return builder;
        },
        maybeSingle: () => {
          const originalThen = builder.then;
          builder.then = (onfulfilled: any) => {
            return originalThen((res: any) => {
              const item = Array.isArray(res.data) ? res.data[0] || null : res.data;
              return onfulfilled({ data: item, error: null });
            });
          };
          return builder;
        },
        single: () => {
          const originalThen = builder.then;
          builder.then = (onfulfilled: any) => {
            return originalThen((res: any) => {
              const item = Array.isArray(res.data) ? res.data[0] || null : res.data;
              return onfulfilled({ data: item, error: null });
            });
          };
          return builder;
        },
        insert: (rows: any) => {
          pendingOp = { type: 'insert', rows };
          return builder;
        },
        update: (fields: any) => {
          pendingOp = { type: 'update', fields };
          return builder;
        }
      };
      return builder;
    }
  };
}
