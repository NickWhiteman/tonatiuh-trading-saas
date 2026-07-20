import fs from 'fs';
import path from 'path';

export class FileSystemUtils {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = path.isAbsolute(filePath) ? filePath : path.join(__dirname, filePath);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  protected _writeToFile(configId: number, dbName: string): void {
    let data = {};
    if (fs.existsSync(this.filePath)) {
      try {
        const fileData = fs.readFileSync(this.filePath, 'utf8');
        data = JSON.parse(fileData);
      } catch (err) {
        console.error('Error reading JSON file:', err);
      }
    }

    data[configId] = dbName;

    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  protected _readFromFile(): { [key: string]: string } {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf8');
        return JSON.parse(data);
      }
      return {};
    } catch (err) {
      console.error('Error reading from file:', err);
      return {};
    }
  }
}
