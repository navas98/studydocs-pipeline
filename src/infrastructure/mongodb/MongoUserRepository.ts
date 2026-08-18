import type { Collection, Db } from 'mongodb';
import type { UserRepository } from '../../application/auth/UserRepository.js';
import { User, type UserProps } from '../../domain/user/User.js';

type UserDbRecord = Omit<UserProps, 'id'> & { _id: string };

function toDbRecord(props: UserProps): UserDbRecord {
  const { id, ...rest } = props;
  return { _id: id, ...rest };
}

function toDomain(record: UserDbRecord): User {
  const { _id, ...rest } = record;
  return User.fromProps({ id: _id, ...rest });
}

export class MongoUserRepository implements UserRepository {
  private readonly collection: Collection<UserDbRecord>;

  constructor(db: Db) {
    this.collection = db.collection<UserDbRecord>('users');
  }

  async create(user: User): Promise<void> {
    await this.collection.insertOne(toDbRecord(user.toProps()));
  }

  async findById(id: string): Promise<User | null> {
    const record = await this.collection.findOne({ _id: id });
    return record ? toDomain(record) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const record = await this.collection.findOne({ email });
    return record ? toDomain(record) : null;
  }
}
