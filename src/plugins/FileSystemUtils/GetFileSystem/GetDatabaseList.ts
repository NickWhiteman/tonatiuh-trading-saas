import { FileSystemUtils } from '../FileSystemUtils';
import path from 'path';
import { ENV } from '../../Environment/const';

export class GetDatabaseList extends FileSystemUtils {
  constructor() {
    super(path.join(ENV.DATA_DIR, 'database.list.json'));
  }

  setDatabaseList(configId: number, dbName: string): void {
    this._writeToFile(configId, dbName);
  }

  getDatabaseList(): { [key: string]: string } {
    return this._readFromFile();
  }
}
