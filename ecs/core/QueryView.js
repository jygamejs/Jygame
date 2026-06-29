export class QueryView {
  constructor(queryEngine, query) {
    this._queryEngine = queryEngine;
    this._query = query;
  }

  get query() {
    return this._query;
  }

  *tables() {
    const tables = this._queryEngine.getTables(this._query);
    for (let i = 0; i < tables.length; i++) {
      yield tables[i];
    }
  }

  *entities() {
    const tables = this._queryEngine.getTables(this._query);
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      const ids = table.entityIds;
      for (let r = 0; r < table.count; r++) {
        yield ids[r];
      }
    }
  }

  *rows() {
    const tables = this._queryEngine.getTables(this._query);
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      for (let r = 0; r < table.count; r++) {
        yield { table, row: r };
      }
    }
  }
}
