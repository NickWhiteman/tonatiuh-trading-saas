import { InstanceIdentityType, TableNameType } from 'repository/types/types';
import { AbstractRepository } from '../abstract.repository';
import { GenerateIdentity } from '../../plugins/GenerateIdentity/GenerateIdentity';

export class InstanceIdentityRepository extends AbstractRepository {
  private _tableName: TableNameType;
  private _columns: string[];
  private _GenerateIdentity: GenerateIdentity;

  constructor(_dbName: string) {
    super(_dbName);
    this._tableName = 'instance_identity';
    this._GenerateIdentity = new GenerateIdentity(45);

    this._columns = ['create_at as "createAt"', 'update_at as "updateAt"', 'client_id as "clientId"'];
  }

  async getInstance(): Promise<InstanceIdentityType> {
    const result = await this._selectQuery<InstanceIdentityType>({
      tableName: this._tableName,
      column: this._columns,
    });

    if (!result) {
      await this._createInstance();
      return await this.getInstance();
    }

    return result[0];
  }

  private async _createInstance(): Promise<boolean> {
    try {
      const clientId = this._GenerateIdentity.generateIdentity();
      await this._insertQuery({
        tableName: this._tableName,
        value: this._mappingValuesList({ clientId }),
      });

      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }
}
